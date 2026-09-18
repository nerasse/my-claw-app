package com.myclawapp

import android.app.Application
import android.app.NotificationManager
import android.content.res.Configuration
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.myclawapp.device.NotificationSounds
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
    // The channels the push renderer posts on are pre-created here, before it can create them
    // itself: the renderer's own creation is IMPORTANCE_DEFAULT, which plays a sound but never
    // shows a heads-up banner, and a channel's settings are fixed at first creation. The ring
    // channel adds the alarm tone on the notification stream and a long vibration; the ordinary
    // one keeps the system's own sound. Which channel a choice names is decided by
    // NotificationSounds, which also deletes the one a new choice replaced -- it is one function,
    // so this boot half and the settings half (DeviceBridgeModule) can never disagree.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      // "urgent" was the alarm-stream ring channel before the notification-stream one; the
      // owner asked for no channel that overrides the phone's mode, so it is deleted here so it
      // does not linger in the system settings.
      manager.deleteNotificationChannel("$packageName:unified_push_channel:urgent")
      NotificationSounds.applyChannels(this)
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
