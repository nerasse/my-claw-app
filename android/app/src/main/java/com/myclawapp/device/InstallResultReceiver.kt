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
    fun park(context: Context, status: String, message: String?) {
      if (DeviceBus.hasRuntime()) {
        emit(context, status, message)
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
      emit(null, status, message)
    }

    private fun emit(context: Context?, status: String, message: String?) {
      if (status == "success" && context != null) {
        // The JS listener that would drop the staged APK dies with the process being replaced:
        // this receiver is the one place that still runs before the swap. Clear it now, or the
        // next launch finds a staged APK for the version it already runs and offers to install
        // it again. This is synchronous on purpose: after the process is gone nothing runs.
        // (When the result was parked and is drained by a later process, the JS listener runs
        // and clears the staging file itself.)
        DeviceBridgeModule.dropStagedApk(context)
      }
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
        if (confirm == null) {
          park(context, "failure", "the system did not return a confirmation screen")
          return
        }
        // Starting an activity from a receiver is a background start, which Android 10+ drops
        // silently: the tap then "flashes" and no installer ever appears. Go through the live
        // activity when there is one, and only fall back to the receiver context.
        val activity = DeviceBus.currentActivity()
        if (activity != null) {
          activity.startActivity(confirm)
        } else {
          confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(confirm)
        }
      }
      PackageInstaller.STATUS_SUCCESS -> {
        park(context, "success", null)
      }
      else -> {
        // The user declined the dialog, or the package failed verification.
        park(
          context,
          "failure",
          intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "install failed",
        )
      }
    }
  }
}
