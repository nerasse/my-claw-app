package com.myclawapp.device

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.myclawapp.MainActivity
import com.myclawapp.R
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONException
import java.util.concurrent.TimeUnit

class ClawConnectionService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private var webSocket: WebSocket? = null
  private var targetUrl: String? = null
  private var reconnectAttempts = 0
  private var stopping = false

  /**
   * Bumped on every connect attempt. OkHttp callbacks arrive on their own thread and keep
   * firing after a socket has been replaced, so a listener that no longer matches would report
   * the state of a dead connection and schedule a competing reconnect loop.
   */
  @Volatile
  private var generation = 0

  private val client = OkHttpClient.Builder()
    .pingInterval(20, TimeUnit.SECONDS)
    .connectTimeout(10, TimeUnit.SECONDS)
    .build()

  companion object {
    const val ACTION_CONNECT = "com.myclawapp.device.CONNECT"
    const val ACTION_DISCONNECT = "com.myclawapp.device.DISCONNECT"
    const val EXTRA_URL = "url"
    /** One tag for the whole socket lifecycle: `adb logcat -s ClawConnection` and nothing else. */
    private const val TAG = "ClawConnection"
    /**
     * A channel's settings are frozen at its first creation, and deleting one does not reset them:
     * `createNotificationChannel` with a deleted id un-deletes it with the settings it had. So
     * `setShowBadge(false)` could only ever reach an existing install under a new id. Named after
     * what the channel is -- a connection status, not an event -- rather than a version number.
     */
    private const val CHANNEL_ID = "claw_connection_status"

    /** The badge-carrying channel this replaces. Deleted once, never recreated under this id. */
    private const val LEGACY_CHANNEL_ID = "claw_connection"
    private const val NOTIFICATION_ID = 1001
    private const val MAX_RECONNECT_DELAY_MS = 30_000L
    private const val OUTBOX_CAPACITY = 200
    private const val OUTBOX_KEY = "outbox"
    /**
     * How often the transport proves the link is still two-way.
     *
     * OkHttp's own ping keeps the TCP frame layer honest, but its pong never reaches this class,
     * so it cannot confirm that an application frame was received. The server answers an
     * application `ping` with `pong` (the web client relies on the same pair), and TCP preserves
     * order on one socket: a frame sent before the ping is received if the pong is. That is what
     * makes an accepted-but-lost frame detectable at all.
     */
    private const val PING_INTERVAL_MS = 15_000L
    private const val PING_FRAME = "{\"type\":\"ping\"}"
    private const val PONG_FRAME = "{\"type\":\"pong\"}"

    @Volatile
    private var state = "idle"

    @Volatile
    private var instance: ClawConnectionService? = null

    /**
     * Frames typed while the socket is down. Static so a frame queued before the service is
     * even started survives, and drained in order on the next onOpen. Bounded: a phone left
     * offline for a day must not grow the heap without limit.
     *
     * Mirrored to disk on every change. The queue used to live in memory only, so a message
     * written in the metro and killed with the process (LOW_MEMORY, battery) vanished without
     * a trace: `send()` had already returned true, the bubble showed no error, and the server
     * history that replaced it on reconnect had never heard of it.
     */
    private val outbox = ArrayDeque<String>()

    /**
     * A frame handed to the socket but not yet proven received.
     *
     * `ws.send` answers whether the frame reached the *kernel*, not the server: a socket that died
     * a moment earlier accepts anything and delivers nothing. Until this buffer existed, such a
     * frame was removed from the outbox on the spot and lost for good -- a `question.reply` the
     * owner had tapped never reached the server, and nothing said so (2026-09-11).
     */
    private class InFlight(val text: String, val sentAt: Long)

    private val inFlight = mutableListOf<InFlight>()

    /** When the last application ping left, so a pong can tell which sends it covers. */
    @Volatile
    private var pingSentAt = 0L

    fun state(): String = state

    fun pendingCount(): Int = synchronized(outbox) { outbox.size + inFlight.size }

    /** Returns false only when the frame could be neither sent nor queued: the caller must surface it. */
    fun send(text: String): Boolean {
      val ws = instance?.webSocket
      if (ws != null && state == "connected" && ws.send(text)) {
        // Held, not dropped: only the pong that follows proves the server got it.
        synchronized(outbox) { inFlight.add(InFlight(text, System.currentTimeMillis())) }
        instance?.emitOutboxSize()
        return true
      }
      synchronized(outbox) {
        if (outbox.size >= OUTBOX_CAPACITY) return false
        outbox.addLast(text)
      }
      instance?.persistOutbox()
      instance?.emitOutboxSize()
      return true
    }

    fun clearOutbox() {
      synchronized(outbox) { outbox.clear() }
      instance?.persistOutbox()
      instance?.emitOutboxSize()
    }

    private fun drainOutbox(ws: WebSocket): Boolean {
      // Anything still in flight crosses the reconnect unsettled: this socket knows nothing of
      // what the previous one was handed, so it all goes back to the head of the queue.
      synchronized(outbox) {
        for (frame in inFlight.asReversed()) {
          if (outbox.size >= OUTBOX_CAPACITY) break
          outbox.addFirst(frame.text)
        }
        inFlight.clear()
      }
      var sent = false
      while (true) {
        val next = synchronized(outbox) { outbox.firstOrNull() }
        if (next == null) {
          if (sent) instance?.persistOutbox()
          return true
        }
        if (!ws.send(next)) {
          if (sent) instance?.persistOutbox()
          return false
        }
        synchronized(outbox) {
          if (outbox.firstOrNull() === next) outbox.removeFirst()
          // Sent, not yet proven: the same hold as a direct send, so the next pong settles it or
          // the next reconnect puts it back in the queue.
          inFlight.add(InFlight(next, System.currentTimeMillis()))
        }
        sent = true
      }
    }

    /**
     * A frame arrived: if it is a pong, everything sent before the ping it answers is received,
     * because TCP delivers one socket's data in order.
     */
    private fun acknowledgePong() {
      val at = pingSentAt
      if (at == 0L) return
      var removed = 0
      synchronized(outbox) {
        val iterator = inFlight.iterator()
        while (iterator.hasNext()) {
          if (iterator.next().sentAt <= at) {
            iterator.remove()
            removed += 1
          }
        }
      }
      if (removed > 0) instance?.emitOutboxSize()
    }
  }

  /** One application ping per interval, so a send is never left unconfirmed for long. */
  private fun schedulePing() {
    if (stopping) return
    handler.postDelayed({
      if (stopping || state != "connected") return@postDelayed
      val ws = webSocket
      if (ws != null) {
        pingSentAt = System.currentTimeMillis()
        ws.send(PING_FRAME)
      }
      schedulePing()
    }, PING_INTERVAL_MS)
  }

  /**
   * The queue, as JSON, in the same store the crash reports use: whatever kills this process is
   * the exact case the queue exists for, so it cannot only live in the heap.
   */
  private fun persistOutbox() {
    val snapshot = synchronized(outbox) { JSONArray(outbox.toList()).toString() }
    getSharedPreferences("claw_connection", Context.MODE_PRIVATE)
      .edit().putString(OUTBOX_KEY, snapshot).apply()
  }

  private fun restoreOutbox() {
    val stored = getSharedPreferences("claw_connection", Context.MODE_PRIVATE).getString(OUTBOX_KEY, null)
      ?: return
    val restored = try {
      val array = JSONArray(stored)
      (0 until array.length()).mapNotNull { array.optString(it, null) }
    } catch (e: JSONException) {
      Log.w(TAG, "unreadable outbox, dropped", e)
      emptyList()
    }
    if (restored.isEmpty()) return
    synchronized(outbox) {
      // Ahead of anything queued since this process started: they were typed first.
      for (frame in restored.asReversed()) {
        if (outbox.size >= OUTBOX_CAPACITY) break
        outbox.addFirst(frame)
      }
    }
    Log.i(TAG, "outbox restored (pending=${pendingCount()})")
    emitOutboxSize()
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    createChannel()
    restoreOutbox()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CONNECT -> {
        val url = intent.getStringExtra(EXTRA_URL)
        if (url != null) {
          targetUrl = url
          getSharedPreferences("claw_connection", Context.MODE_PRIVATE)
            .edit().putString(EXTRA_URL, url).apply()
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        stopping = false
        connect()
      }
      ACTION_DISCONNECT -> {
        stopConnection()
      }
      else -> {
        if (stopping) return START_NOT_STICKY
        startForeground(NOTIFICATION_ID, buildNotification())
        connect()
      }
    }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    stopping = true
    handler.removeCallbacksAndMessages(null)
    webSocket?.close(1000, "service stopped")
    webSocket = null
    instance = null
    super.onDestroy()
  }

  private fun connect() {
    val url = targetUrl ?: getSharedPreferences("claw_connection", Context.MODE_PRIVATE).getString(EXTRA_URL, null) ?: return
    // Remembered here too: after the system restarts the service, targetUrl is null and the
    // reported state would carry no address at all.
    targetUrl = url
    // A connect while one is already live replaces it. Without this the old socket stayed
    // open on the old server, kept delivering frames, and its retry loop fought the new one.
    handler.removeCallbacksAndMessages(null)
    val gen = ++generation
    webSocket?.close(1000, "reconnecting")
    webSocket = null
    state = "connecting"
    Log.i(TAG, "connecting to $url")
    emitState(null, 0)
    // OkHttp accepts http/https/ws/wss and throws on anything else, here, on the main thread,
    // inside onStartCommand. An address typed without its scheme killed the process, and it had
    // already been stored, so it killed it again at every launch. The JS side checks too; this
    // is the layer that cannot be bypassed by a stale preference.
    val request = try {
      DeviceCredentials.applyTo(Request.Builder().url(url), this).build()
    } catch (e: IllegalArgumentException) {
      Log.w(TAG, "refusing an unusable server address", e)
      state = "disconnected"
      emitState("invalid server address", 0)
      return
    }
    webSocket = client.newWebSocket(
      request,
      object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
          if (gen != generation) {
            ws.close(1000, "superseded")
            return
          }
          Log.i(TAG, "open (gen=$gen, pending=${pendingCount()})")
          webSocket = ws
          reconnectAttempts = 0
          state = "connected"
          drainOutbox(ws)
          emitState(null, 0)
          emitOutboxSize()
          schedulePing()
        }

        override fun onMessage(ws: WebSocket, text: String) {
          if (gen != generation) return
          if (text == PONG_FRAME) {
            acknowledgePong()
            return
          }
          emitMessage(text)
        }

        override fun onMessage(ws: WebSocket, bytes: ByteString) {
          if (gen != generation) return
          emitMessage(bytes.utf8())
        }

        override fun onClosed(ws: WebSocket, code: Int, reason: String) {
          if (gen != generation) return
          // The close code is what distinguishes a server-side reap from a network drop.
          Log.i(TAG, "closed by peer (code=$code, reason=$reason)")
          onDisconnected(reason)
        }

        override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
          if (gen != generation) return
          Log.w(TAG, "failure (http=${response?.code ?: 0})", t)
          // A 401 from the channel means these credentials are not in config.json: the device is
          // unpaired. Say so, so the UI can offer pairing instead of looping on a dead address.
          if (response?.code == 401) {
            onDisconnected("unauthorized")
          } else {
            onDisconnected(t.message ?: "failure")
          }
        }
      },
    )
  }

  private fun onDisconnected(reason: String) {
    if (stopping) return
    webSocket = null
    state = "disconnected"
    emitState(reason, reconnectAttempts)
    scheduleReconnect()
  }

  private fun scheduleReconnect() {
    if (stopping) return
    val delay = minOf(MAX_RECONNECT_DELAY_MS, 1_000L shl minOf(reconnectAttempts, 5))
    Log.i(TAG, "reconnect in ${delay}ms (attempt=${reconnectAttempts + 1})")
    reconnectAttempts += 1
    handler.postDelayed({ if (!stopping) connect() }, delay)
  }

  private fun stopConnection() {
    handler.removeCallbacksAndMessages(null)
    generation++
    webSocket?.close(1000, "user disconnect")
    webSocket = null
    state = "idle"
    emitState("user disconnect", 0)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun emitMessage(text: String) {
    val payload = Arguments.createMap()
    payload.putString("text", text)
    DeviceBus.emit("claw:ws:message", payload)
  }

  private fun emitState(reason: String?, attempts: Int) {
    val payload = Arguments.createMap()
    payload.putString("state", state)
    targetUrl?.let { payload.putString("url", it) }
    reason?.let { payload.putString("reason", it) }
    if (attempts > 0) payload.putInt("attempts", attempts)
    payload.putInt("pending", pendingCount())
    DeviceBus.emit("claw:ws:state", payload)
  }

  private fun emitOutboxSize() {
    val payload = Arguments.createMap()
    payload.putInt("pending", pendingCount())
    DeviceBus.emit("claw:ws:outbox", payload)
  }

  private fun createChannel() {
    val manager = getSystemService(NotificationManager::class.java)
    // Safe precisely because CHANNEL_ID moved: the un-delete trap only fires if the same id is
    // recreated, and nothing creates the legacy one any more. Without this it lingers, empty,
    // in the system settings.
    manager.deleteNotificationChannel(LEGACY_CHANNEL_ID)
    val channel = NotificationChannel(CHANNEL_ID, getString(R.string.connection_channel_name), NotificationManager.IMPORTANCE_LOW)
    // A channel shows a launcher badge by default, so a permanent status notification put a
    // permanent "1" on the app icon. This is a status, not an unread item: nothing to count.
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): android.app.Notification {
    val openIntent = Intent(this, MainActivity::class.java)
    val pending = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(getString(R.string.connection_notification_title))
      .setContentText(getString(R.string.connection_notification_text))
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(pending)
      .setOngoing(true)
      // A status, not an event: the service may restart several times a day (network drops,
      // the system reclaiming the process) and each startForeground would otherwise re-alert.
      .setOnlyAlertOnce(true)
      .setSilent(true)
      // Belt and braces with the channel: some launchers read the notification, not the channel.
      .setBadgeIconType(NotificationCompat.BADGE_ICON_NONE)
      .setNumber(0)
      .build()
  }
}
