package com.myclawapp.device

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.myclawapp.MainActivity
import com.myclawapp.R
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The small foreground-service shell around [VoiceAudio].
 *
 * MediaRecorder remains owned by the React Native module. The service exists to give Android an
 * explicit microphone foreground operation while the screen is locked; moving the recorder here
 * would add a second owner for the same file and lifecycle. It is started and promoted before the
 * module opens MediaRecorder, and it is never sticky: a process or service death does not restart a
 * microphone capture with no user gesture.
 */
class VoiceRecordingService : Service() {

  companion object {
    const val ACTION_START = "com.myclawapp.device.VOICE_RECORDING_START"
    const val ACTION_STOP = "com.myclawapp.device.VOICE_RECORDING_STOP"

    private const val CHANNEL_ID = "claw_voice_recording"
    private const val NOTIFICATION_ID = 1002
    private const val STOP_REQUEST_CODE = 10021
    private const val START_TIMEOUT_SECONDS = 3L

    private val lifecycleLock = Any()
    private val readyWaiters = mutableListOf<CountDownLatch>()

    @Volatile
    private var instance: VoiceRecordingService? = null

    @Volatile
    private var foregroundReady = false

    /**
     * Starts the service and waits until startForeground() has completed. DeviceBridge calls this
     * from React Native's native-module queue, never from the main thread, so the recorder cannot
     * be opened before the microphone foreground service is actually promoted.
     */
    fun startForRecording(context: Context): Boolean {
      val ready = CountDownLatch(1)
      synchronized(lifecycleLock) {
        if (foregroundReady) return true
        readyWaiters += ready
      }

      try {
        val intent = Intent(context, VoiceRecordingService::class.java).setAction(ACTION_START)
        ContextCompat.startForegroundService(context, intent)
      } catch (_: Exception) {
        synchronized(lifecycleLock) { readyWaiters.remove(ready) }
        return false
      }

      val signalled = try {
        ready.await(START_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        false
      }
      synchronized(lifecycleLock) { readyWaiters.remove(ready) }
      return signalled && foregroundReady
    }

    /** Stops only this recording service. VoiceAudio has already finalized or cancelled the take. */
    fun stop(context: Context) {
      context.stopService(Intent(context, VoiceRecordingService::class.java))
    }

    /** Updates the ongoing notification without requiring the JS runtime. */
    fun updateStatus(text: String) {
      instance?.showStatus(text)
    }

    private fun signalForeground(success: Boolean) {
      val waiters: List<CountDownLatch>
      synchronized(lifecycleLock) {
        foregroundReady = success
        waiters = readyWaiters.toList()
        readyWaiters.clear()
      }
      waiters.forEach(CountDownLatch::countDown)
    }
  }

  private lateinit var notificationManager: NotificationManager
  private var stopping = false

  override fun onCreate() {
    super.onCreate()
    instance = this
    notificationManager = getSystemService(NotificationManager::class.java)
    createChannel()
    promoteToForeground()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopping = true
      // A notification action is a real stop, not a cancel: finalize the file and let JS stage it
      // when the runtime is alive. VoiceAudio also keeps the file when it can be finalized.
      VoiceAudio.stopFromNotification()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelfResult(startId)
      return START_NOT_STICKY
    }

    if (!foregroundReady) promoteToForeground()
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    stopping = true
    // If Android removes only the service while the process survives, do not leave MediaRecorder
    // holding the microphone. The active take is finalized and retained when it contains bytes.
    VoiceAudio.onRecordingServiceDestroyed()
    synchronized(lifecycleLock) {
      foregroundReady = false
      readyWaiters.forEach(CountDownLatch::countDown)
      readyWaiters.clear()
    }
    if (instance === this) instance = null
    super.onDestroy()
  }

  private fun promoteToForeground() {
    if (foregroundReady) return
    try {
      val notification = buildNotification(getString(R.string.voice_notification_text))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
        )
      } else {
        @Suppress("DEPRECATION")
        startForeground(NOTIFICATION_ID, notification)
      }
      signalForeground(true)
    } catch (_: Exception) {
      signalForeground(false)
      stopSelf()
    }
  }

  private fun showStatus(text: String) {
    if (stopping || !foregroundReady) return
    // MediaRecorder callbacks can run off the main thread; NotificationManager accepts calls from
    // either thread, but posting keeps the service's state transitions ordered with stopForeground.
    android.os.Handler(mainLooper).post {
      if (!stopping && foregroundReady) {
        notificationManager.notify(NOTIFICATION_ID, buildNotification(text))
      }
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.voice_notification_channel),
      NotificationManager.IMPORTANCE_LOW,
    )
    channel.setShowBadge(false)
    notificationManager.createNotificationChannel(channel)
  }

  private fun buildNotification(text: String): Notification {
    val openIntent = PendingIntent.getActivity(
      this,
      NOTIFICATION_ID,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val stopIntent = PendingIntent.getService(
      this,
      STOP_REQUEST_CODE,
      Intent(this, VoiceRecordingService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(getString(R.string.voice_notification_title))
      .setContentText(text)
      .setContentIntent(openIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .addAction(
        NotificationCompat.Action(
          0,
          getString(R.string.voice_notification_stop),
          stopIntent,
        ),
      )
      .build()
  }
}
