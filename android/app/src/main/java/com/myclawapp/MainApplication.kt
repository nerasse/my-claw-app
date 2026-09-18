package com.myclawapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(com.myclawapp.device.DevicePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // The UnifiedPush renderer (expo-unified-push) creates its notification channel with
    // IMPORTANCE_DEFAULT, which plays a sound but never shows a heads-up banner at the top of
    // the screen. Channel settings are fixed at first creation, so pre-create the exact
    // channel id the renderer will use (payload type "runs") with IMPORTANCE_HIGH: the renderer
    // cannot downgrade it afterwards, and the banner shows.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(
        NotificationChannel(
          "$packageName:unified_push_channel:runs",
          "Runs",
          NotificationManager.IMPORTANCE_HIGH,
        ),
      )
      // The ring channel: louder and longer than the ordinary one, but on the notification stream
      // like any other notification, so the phone's own mode decides. A ring is heard in normal,
      // vibrates in vibrate, and stays quiet in silent -- the owner was explicit that no
      // notification of his gets to override the mode he chose. The alarm ringtone is only the
      // tone: USAGE_NOTIFICATION is what keeps it on the stream the mode governs.
      //
      // The name is half the wire contract (payload type "ring", server side
      // notifications/push.ts). A channel's settings are frozen at first creation, so a change of
      // behaviour needs a new name; "urgent" was the alarm-stream one and is deleted below so it
      // does not linger in the system settings.
      manager.deleteNotificationChannel("$packageName:unified_push_channel:urgent")
      manager.createNotificationChannel(
        NotificationChannel(
          "$packageName:unified_push_channel:ring",
          "Ring",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
        },
      )
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
