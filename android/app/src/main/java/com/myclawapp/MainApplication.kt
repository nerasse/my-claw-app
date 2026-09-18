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
      // The urgent channel, on the alarm stream: an agent that sends `ring` is asking to be heard
      // with the phone on vibrate or silent, which is the one thing a notification stream cannot
      // do (the system keeps silent silent). Payload type "urgent", server side
      // notifications/push.ts; the name is a contract, since a channel's settings are frozen at
      // first creation and a rename would silently downgrade every ring to a banner.
      manager.createNotificationChannel(
        NotificationChannel(
          "$packageName:unified_push_channel:urgent",
          "Urgent",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
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
