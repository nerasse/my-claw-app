package com.myclawapp.device

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.io.IOException
import java.util.concurrent.ThreadLocalRandom
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink
import okio.source

class DeviceBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule() {

  override fun getName(): String = "DeviceBridge"

  companion object {
    // App settings only (theme, server url, last thread). Credentials stay in the Keystore.
    private const val PREFS_NAME = "claw_prefs"
    private const val FILE_PICK_REQUEST_CODE = 4201
  }

  private var pendingFilePromise: Promise? = null

  // Uploads can be slow on mobile data; only the connect timeout stays short.
  private val uploadClient: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(5, TimeUnit.MINUTES)
      .readTimeout(60, TimeUnit.SECONDS)
      .build()
  }

  // Storage Access Framework picker, wired like the (removed from RN) GuardedResultAsyncTask
  // flow: launch ACTION_GET_CONTENT, copy the results to the cache, resolve the promise.
  private val filePickListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != FILE_PICK_REQUEST_CODE) return
      val promise = pendingFilePromise ?: return
      pendingFilePromise = null
      if (resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(Arguments.createArray())
        return
      }
      val uris = ArrayList<Uri>()
      val clip = data.clipData
      if (clip != null) {
        for (i in 0 until clip.itemCount) {
          clip.getItemAt(i).uri?.let(uris::add)
        }
      } else {
        data.data?.let(uris::add)
      }
      val result = Arguments.createArray()
      for (uri in uris) {
        copyToCache(uri)?.let(result::pushMap)
      }
      promise.resolve(result)
    }
  }

  override fun initialize() {
    DeviceBus.attach(reactContext)
    reactContext.addActivityEventListener(filePickListener)
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(filePickListener)
    DeviceBus.detach()
    super.invalidate()
  }

  /** Multi-file picker through the system document picker (Storage Access Framework). */
  @ReactMethod
  fun pickFile(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "no current activity")
      return
    }
    if (pendingFilePromise != null) {
      promise.reject("PICK_IN_PROGRESS", "a pick is already in progress")
      return
    }
    pendingFilePromise = promise
    val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
      type = "*/*"
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      addCategory(Intent.CATEGORY_OPENABLE)
    }
    activity.startActivityForResult(Intent.createChooser(intent, "Choose files"), FILE_PICK_REQUEST_CODE)
  }

  private fun copyToCache(uri: Uri): ReadableMap? {
    return try {
      val resolver = reactContext.contentResolver
      var name = "file"
      var size = 0L
      resolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (nameIdx >= 0) cursor.getString(nameIdx)?.let { name = it }
          val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) size = cursor.getLong(sizeIdx)
        }
      }
      val mime = resolver.getType(uri) ?: "application/octet-stream"
      val input = resolver.openInputStream(uri) ?: return null
      val cached = File(reactContext.cacheDir, "pick_${System.currentTimeMillis()}_${ThreadLocalRandom.current().nextLong().toString(16)}")
      cached.outputStream().use { out -> input.copyTo(out) }
      input.close()
      val map = Arguments.createMap()
      map.putString("uri", Uri.fromFile(cached).toString())
      map.putString("name", name)
      map.putString("type", mime)
      map.putDouble("size", size.toDouble())
      map
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Copies a picked file (content:// from the gallery or Photo Picker, or file://) into the
   * cache and returns a file:// uri. RN's fetch cannot read content:// uris, so every
   * attachment goes through here before the upload reads it.
   */
  @ReactMethod
  fun prepareFile(uri: String, promise: Promise) {
    try {
      val parsed = Uri.parse(uri)
      if (parsed.scheme == "file") {
        val map = Arguments.createMap()
        map.putString("uri", parsed.toString())
        map.putDouble("size", File(parsed.path ?: "").length().toDouble())
        promise.resolve(map)
        return
      }
      val resolver = reactContext.contentResolver
      var name = "file"
      var size = 0L
      resolver.query(parsed, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (nameIdx >= 0) cursor.getString(nameIdx)?.let { name = it }
          val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) size = cursor.getLong(sizeIdx)
        }
      }
      val input = resolver.openInputStream(parsed)
        ?: run {
          promise.reject("OPEN_FAILED", "cannot open uri")
          return
        }
      val cached = File(reactContext.cacheDir, "prep_${System.currentTimeMillis()}_${ThreadLocalRandom.current().nextLong().toString(16)}")
      cached.outputStream().use { out -> input.copyTo(out) }
      input.close()
      val map = Arguments.createMap()
      map.putString("uri", Uri.fromFile(cached).toString())
      map.putString("name", name)
      map.putDouble("size", size.toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("PREPARE_FAILED", e.message ?: "prepare failed")
    }
  }

  /**
   * Uploads a local file as a raw request body. This has to happen natively: RN's fetch goes
   * through OkHttp, which only accepts http(s) urls, so reading a file:// or content:// uri from
   * JS always fails with "Network request failed". Streams from the resolver so a large file is
   * never held in memory, and sets Content-Length so the server can reject it before buffering.
   */
  @ReactMethod
  fun uploadFile(
    uri: String,
    url: String,
    filename: String,
    type: String,
    threadId: String,
    promise: Promise,
  ) {
    val parsed = try {
      Uri.parse(uri)
    } catch (e: Exception) {
      promise.reject("BAD_URI", e.message ?: "bad uri")
      return
    }
    val length = fileLength(parsed)
    if (length < 0) {
      promise.reject("OPEN_FAILED", "cannot read $uri")
      return
    }
    val mime = reactContext.contentResolver.getType(parsed) ?: "application/octet-stream"
    val body = object : RequestBody() {
      override fun contentType(): MediaType? = mime.toMediaTypeOrNull()

      override fun contentLength(): Long = length

      override fun writeTo(sink: BufferedSink) {
        val input = reactContext.contentResolver.openInputStream(parsed)
          ?: throw IOException("cannot open $parsed")
        input.use { stream -> sink.writeAll(stream.source()) }
      }
    }
    val request = Request.Builder()
      .url(url)
      .post(body)
      .header("x-filename", filename)
      .header("x-type", type)
      .header("x-thread-id", threadId)
      .build()
    uploadClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        promise.reject("UPLOAD_FAILED", e.message ?: "upload failed")
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          val map = Arguments.createMap()
          map.putInt("status", it.code)
          map.putString("body", it.body?.string() ?: "")
          promise.resolve(map)
        }
      }
    })
  }

  /** Byte size of a file:// or content:// uri, or -1 when it cannot be read. */
  private fun fileLength(uri: Uri): Long {
    if (uri.scheme == "file") {
      val file = File(uri.path ?: return -1)
      return if (file.isFile) file.length() else -1
    }
    return try {
      reactContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (cursor.moveToFirst() && idx >= 0 && !cursor.isNull(idx)) return cursor.getLong(idx)
      }
      // No SIZE column (some providers): fall back to counting the stream.
      reactContext.contentResolver.openInputStream(uri)?.use { stream ->
        var total = 0L
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = stream.read(buffer)
          if (read < 0) break
          total += read
        }
        total
      } ?: -1
    } catch (_: Exception) {
      -1
    }
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
  fun sendMessage(text: String, promise: Promise) {
    promise.resolve(ClawConnectionService.send(text))
  }

  @ReactMethod
  fun pendingCount(promise: Promise) {
    promise.resolve(ClawConnectionService.pendingCount())
  }

  @ReactMethod
  fun clearOutbox(promise: Promise) {
    ClawConnectionService.clearOutbox()
    promise.resolve(null)
  }

  @ReactMethod
  fun getConnectionState(promise: Promise) {
    promise.resolve(ClawConnectionService.state())
  }

  @ReactMethod
  fun getDeviceInfo(promise: Promise) {
    val (deviceId, token) = DeviceCredentials.info(reactContext)
    val map = Arguments.createMap()
    map.putString("deviceId", deviceId)
    map.putString("token", token)
    promise.resolve(map)
  }

  @ReactMethod
  fun prefsGetAll(promise: Promise) {
    val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val map = Arguments.createMap()
    for ((key, value) in prefs.all) {
      if (value is String) map.putString(key, value)
    }
    promise.resolve(map)
  }

  @ReactMethod
  fun prefsSet(key: String, value: String?, promise: Promise) {
    val editor = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
    if (value == null) editor.remove(key) else editor.putString(key, value)
    editor.apply()
    promise.resolve(null)
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
