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
import java.util.concurrent.TimeUnit

class ClawConnectionService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private var webSocket: WebSocket? = null
  private var targetUrl: String? = null
  private var reconnectAttempts = 0
  private var stopping = false

  private val client = OkHttpClient.Builder()
    .pingInterval(20, TimeUnit.SECONDS)
    .connectTimeout(10, TimeUnit.SECONDS)
    .build()

  companion object {
    const val ACTION_CONNECT = "com.myclawapp.device.CONNECT"
    const val ACTION_DISCONNECT = "com.myclawapp.device.DISCONNECT"
    const val EXTRA_URL = "url"
    private const val CHANNEL_ID = "claw_connection"
    private const val NOTIFICATION_ID = 1001
    private const val MAX_RECONNECT_DELAY_MS = 30_000L
    private const val OUTBOX_CAPACITY = 200

    @Volatile
    private var state = "idle"

    @Volatile
    private var instance: ClawConnectionService? = null

    /**
     * Frames typed while the socket is down. Static so a frame queued before the service is
     * even started survives, and drained in order on the next onOpen. Bounded: a phone left
     * offline for a day must not grow the heap without limit.
     */
    private val outbox = ArrayDeque<String>()

    fun state(): String = state

    fun pendingCount(): Int = synchronized(outbox) { outbox.size }

    /** Returns false only when the frame could be neither sent nor queued: the caller must surface it. */
    fun send(text: String): Boolean {
      val ws = instance?.webSocket
      if (ws != null && state == "connected" && ws.send(text)) return true
      synchronized(outbox) {
        if (outbox.size >= OUTBOX_CAPACITY) return false
        outbox.addLast(text)
      }
      instance?.emitOutboxSize()
      return true
    }

    fun clearOutbox() {
      synchronized(outbox) { outbox.clear() }
      instance?.emitOutboxSize()
    }

    private fun drainOutbox(ws: WebSocket): Boolean {
      while (true) {
        val next = synchronized(outbox) { outbox.firstOrNull() } ?: return true
        if (!ws.send(next)) return false
        synchronized(outbox) { if (outbox.firstOrNull() === next) outbox.removeFirst() }
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    createChannel()
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
    state = "connecting"
    emitState(null, 0)
    val deviceId = DeviceCredentials.deviceId(this)
    val token = DeviceCredentials.token(this)
    val request = Request.Builder().url(DeviceCredentials.appendToUrl(url, deviceId, token)).build()
    webSocket = client.newWebSocket(
      request,
      object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
          reconnectAttempts = 0
          state = "connected"
          drainOutbox(ws)
          emitState(null, 0)
          emitOutboxSize()
        }

        override fun onMessage(ws: WebSocket, text: String) {
          emitMessage(text)
        }

        override fun onMessage(ws: WebSocket, bytes: ByteString) {
          emitMessage(bytes.utf8())
        }

        override fun onClosed(ws: WebSocket, code: Int, reason: String) {
          onDisconnected(reason)
        }

        override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
          onDisconnected(t.message ?: "failure")
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
    reconnectAttempts += 1
    handler.postDelayed({ if (!stopping) connect() }, delay)
  }

  private fun stopConnection() {
    handler.removeCallbacksAndMessages(null)
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
    val channel = NotificationChannel(CHANNEL_ID, getString(R.string.connection_channel_name), NotificationManager.IMPORTANCE_LOW)
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
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
      .build()
  }
}
