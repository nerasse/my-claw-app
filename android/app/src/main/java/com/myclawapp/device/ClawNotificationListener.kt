package com.myclawapp.device

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments

class ClawNotificationListener : NotificationListenerService() {

  companion object {
    @Volatile
    private var listening = false

    fun isListening(): Boolean = listening
  }

  override fun onListenerConnected() {
    listening = true
    emitStatus(true)
  }

  override fun onListenerDisconnected() {
    listening = false
    emitStatus(false)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val extras = sbn.notification.extras
    val payload = Arguments.createMap()
    payload.putString("packageName", sbn.packageName)
    payload.putString("key", sbn.key)
    payload.putLong("postTime", sbn.postTime)
    extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.let { payload.putString("title", it) }
    extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.let { payload.putString("text", it) }
    DeviceBus.emit("claw:notification:posted", payload)
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    val payload = Arguments.createMap()
    payload.putString("packageName", sbn.packageName)
    payload.putString("key", sbn.key)
    DeviceBus.emit("claw:notification:removed", payload)
  }

  private fun emitStatus(connected: Boolean) {
    val payload = Arguments.createMap()
    payload.putBoolean("connected", connected)
    DeviceBus.emit("claw:notifications:status", payload)
  }
}
