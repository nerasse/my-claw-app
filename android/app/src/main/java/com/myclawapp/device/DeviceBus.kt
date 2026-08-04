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

  fun emit(event: String, payload: WritableMap? = null) {
    val context = reactContext ?: return
    val emitter = context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java) ?: return
    emitter.emit(event, payload)
  }
}
