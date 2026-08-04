package com.myclawapp.device

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap

class ClawAccessibilityService : AccessibilityService() {

  companion object {
    private const val MAX_DEPTH = 8
    private const val MAX_CHILDREN = 32

    @Volatile
    private var instance: ClawAccessibilityService? = null

    fun instance(): ClawAccessibilityService? = instance
  }

  override fun onServiceConnected() {
    instance = this
    emitStatus(true)
  }

  override fun onDestroy() {
    instance = null
    emitStatus(false)
    super.onDestroy()
  }

  override fun onInterrupt() {
    // No-op: nothing to clean between events.
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent) {
    when (event.eventType) {
      AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
      AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
        val payload = Arguments.createMap()
        payload.putString("packageName", event.packageName?.toString())
        payload.putInt("eventType", event.eventType)
        DeviceBus.emit("claw:accessibility:event", payload)
      }
    }
  }

  fun snapshot(): WritableMap? {
    val root = rootInActiveWindow ?: return null
    return nodeToMap(root, 0)
  }

  fun performAction(action: ReadableMap): Boolean {
    val root = rootInActiveWindow ?: return false
    val resourceId = action.getString("resourceId")
    val text = action.getString("text")
    val description = action.getString("contentDescription")
    val target = findNode(root, resourceId, text, description, 0)
    return target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
  }

  private fun emitStatus(connected: Boolean) {
    val payload = Arguments.createMap()
    payload.putBoolean("connected", connected)
    DeviceBus.emit("claw:accessibility:status", payload)
  }

  private fun nodeToMap(node: AccessibilityNodeInfo, depth: Int): WritableMap? {
    if (depth > MAX_DEPTH) return null
    val map = Arguments.createMap()
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    map.putString("resourceId", node.viewIdResourceName)
    map.putString("className", node.className?.toString())
    map.putString("text", node.text?.toString())
    map.putString("contentDescription", node.contentDescription?.toString())
    map.putBoolean("clickable", node.isClickable)
    map.putBoolean("scrollable", node.isScrollable)
    map.putBoolean("checked", node.isChecked)
    map.putMap(
      "bounds",
      Arguments.createMap().apply {
        putInt("left", bounds.left)
        putInt("top", bounds.top)
        putInt("right", bounds.right)
        putInt("bottom", bounds.bottom)
      },
    )
    val children = Arguments.createArray()
    for (i in 0 until minOf(node.childCount, MAX_CHILDREN)) {
      node.getChild(i)?.let { child ->
        nodeToMap(child, depth + 1)?.let { children.pushMap(it) }
      }
    }
    map.putArray("children", children)
    return map
  }

  private fun findNode(
    node: AccessibilityNodeInfo,
    resourceId: String?,
    text: String?,
    description: String?,
    depth: Int,
  ): AccessibilityNodeInfo? {
    if (resourceId != null && node.viewIdResourceName == resourceId) return node
    if (text != null && node.text?.toString() == text) return node
    if (description != null && node.contentDescription?.toString() == description) return node
    if (depth >= MAX_DEPTH) return null
    for (i in 0 until node.childCount) {
      val found = node.getChild(i)?.let { findNode(it, resourceId, text, description, depth + 1) }
      if (found != null) return found
    }
    return null
  }
}
