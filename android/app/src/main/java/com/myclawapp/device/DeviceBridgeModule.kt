package com.myclawapp.device

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class DeviceBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule() {

  override fun getName(): String = "DeviceBridge"

  override fun initialize() {
    DeviceBus.attach(reactContext)
  }

  override fun invalidate() {
    DeviceBus.detach()
    super.invalidate()
  }

  @ReactMethod
  fun connect(url: String) {
    val intent = Intent(reactContext, ClawConnectionService::class.java)
      .setAction(ClawConnectionService.ACTION_CONNECT)
      .putExtra(ClawConnectionService.EXTRA_URL, url)
    ContextCompat.startForegroundService(reactContext, intent)
  }

  @ReactMethod
  fun disconnect() {
    val intent = Intent(reactContext, ClawConnectionService::class.java)
      .setAction(ClawConnectionService.ACTION_DISCONNECT)
    reactContext.startService(intent)
  }

  @ReactMethod
  fun sendMessage(text: String) {
    ClawConnectionService.send(text)
  }

  @ReactMethod
  fun getConnectionState(promise: Promise) {
    promise.resolve(ClawConnectionService.state())
  }

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    val caps = Arguments.createMap()
    caps.putBoolean("accessibility", ClawAccessibilityService.instance() != null)
    caps.putBoolean("notificationListener", ClawNotificationListener.isListening())
    caps.putBoolean("wssConnection", true)
    promise.resolve(caps)
  }

  @ReactMethod
  fun getAccessibilitySnapshot(promise: Promise) {
    promise.resolve(ClawAccessibilityService.instance()?.snapshot())
  }

  @ReactMethod
  fun performAccessibilityAction(action: ReadableMap, promise: Promise) {
    val service = ClawAccessibilityService.instance()
    if (service == null) {
      promise.reject("NO_ACCESSIBILITY_SERVICE", "Accessibility service is not enabled")
      return
    }
    promise.resolve(service.performAction(action))
  }
}
