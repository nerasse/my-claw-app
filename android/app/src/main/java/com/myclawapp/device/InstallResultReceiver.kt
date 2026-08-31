package com.myclawapp.device

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import com.facebook.react.bridge.Arguments

/**
 * Reports the outcome of a PackageInstaller session back to JS. The session is committed with a
 * broadcast PendingIntent (DeviceBridgeModule.installStagedApk), so Android answers here. It is
 * declared in the manifest (not registered at runtime) because the answer can arrive after the
 * process has been killed and restarted by the install flow; a runtime registration would be
 * gone by then.
 *
 * The confirmation dialog itself is Android's own ("install this update?"): PackageInstaller
 * returns STATUS_PENDING_USER_ACTION with an activity intent, which the receiver forwards.
 * Installation is never silent; this receiver only turns the answer into an event the UI reads.
 *
 * A broadcast from PackageInstaller can land while the JS runtime is still starting (the install
 * flow kills the process and the user returns). DeviceBus.emit is a no-op then, and losing the
 * answer would strand the UI on "installing…". The result is therefore buffered and flushed by
 * [drainPending] once the JS side subscribes (DeviceBridgeModule.initialize).
 */
class InstallResultReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_INSTALL_RESULT = "com.myclawapp.device.INSTALL_RESULT"

    @Volatile
    private var pendingStatus: String? = null
    @Volatile
    private var pendingMessage: String? = null

    /** Emits an install result immediately when the JS runtime is up, otherwise parks it for
     * `drainInstallResult` (the answer can arrive before the runtime exists at cold start, or
     * before the JS listener is subscribed — the drain is issued right after the subscribe). */
    fun park(status: String, message: String?) {
      if (DeviceBus.hasRuntime()) {
        emit(status, message)
      } else {
        pendingStatus = status
        pendingMessage = message
      }
    }

    /** Flushes a parked result, called from JS after it has subscribed to the event channel. */
    fun drainPending() {
      val status = pendingStatus ?: return
      pendingStatus = null
      val message = pendingMessage
      pendingMessage = null
      emit(status, message)
    }

    private fun emit(status: String, message: String?) {
      DeviceBus.emit("claw:update:install", Arguments.createMap().apply {
        putString("status", status)
        if (message != null) putString("message", message)
      })
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    when (status) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
        if (confirm != null) {
          confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(confirm)
        } else {
          park("pending", null)
        }
      }
      PackageInstaller.STATUS_SUCCESS -> {
        park("success", null)
      }
      else -> {
        // The user declined the dialog, or the package failed verification.
        park(
          "failure",
          intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "install failed",
        )
      }
    }
  }
}
