package com.myclawapp.device

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext

/**
 * Reports the outcome of a PackageInstaller session back to JS. The session was committed with a
 * broadcast PendingIntent (DeviceBridgeModule.commitApk), so Android answers here, possibly on
 * the main thread, possibly after a process kill — the receiver is registered per install, on
 * demand, through [register].
 *
 * The dialog itself is Android's own ("install this update?"): PackageInstaller returns
 * STATUS_PENDING_USER_ACTION with an activity intent, which the module launches. Installation is
 * never silent; this receiver only turns the answer into an event the UI can read.
 */
class InstallResultReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_INSTALL_RESULT = "com.myclawapp.device.INSTALL_RESULT"

    fun register(context: ReactApplicationContext) {
      val filter = IntentFilter(ACTION_INSTALL_RESULT)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(InstallResultReceiver(), filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(InstallResultReceiver(), filter)
      }
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
          DeviceBus.emit("claw:update:install", Arguments.createMap().apply {
            putString("status", "pending")
          })
        }
      }
      PackageInstaller.STATUS_SUCCESS -> {
        DeviceBus.emit("claw:update:install", Arguments.createMap().apply {
          putString("status", "success")
        })
      }
      else -> {
        // The user declined the dialog, or the package failed verification.
        DeviceBus.emit("claw:update:install", Arguments.createMap().apply {
          putString("status", "failure")
          putString(
            "message",
            intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "install failed",
          )
        })
      }
    }
  }
}
