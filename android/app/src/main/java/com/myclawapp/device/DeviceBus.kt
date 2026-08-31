package com.myclawapp.device

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object DeviceBus {
  @Volatile
  private var reactContext: ReactApplicationContext? = null

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun detach() {
    reactContext = null
  }

  /** True when a JS runtime is attached; guards the cold-start buffer in InstallResultReceiver. */
  fun hasRuntime(): Boolean = reactContext != null

  /**
   * The activity on screen, when there is one. A receiver cannot start an activity from the
   * background on Android 10+, so the install confirmation has to be launched from here.
   */
  fun currentActivity(): android.app.Activity? = reactContext?.currentActivity

  fun emit(event: String, payload: WritableMap? = null) {
    val context = reactContext ?: return
    val emitter = context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java) ?: return
    emitter.emit(event, payload)
  }
}
