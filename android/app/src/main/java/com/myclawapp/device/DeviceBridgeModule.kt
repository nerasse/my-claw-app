package com.myclawapp.device

import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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

class DeviceBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule() {

  override fun getName(): String = "DeviceBridge"

  companion object {
    // App settings only (theme, server url, last thread). Credentials stay in the Keystore.
    private const val PREFS_NAME = "claw_prefs"
    private const val FILE_PICK_REQUEST_CODE = 4201
    private const val FILE_SAVE_REQUEST_CODE = 4202
  }

  private var pendingFilePromise: Promise? = null
  private var pendingSavePromise: Promise? = null
  private var pendingSaveUrl: String? = null
  private var pendingSaveName: String? = null
  private var pendingSaveTransferId: String? = null
  private var pendingLocationPromise: Promise? = null
  private var locationListener: LocationListener? = null
  private var bestLocation: Location? = null
  private val locationHandler = Handler(Looper.getMainLooper())
  private val locationTimeout = Runnable { finishLocation() }

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
      if (requestCode == FILE_SAVE_REQUEST_CODE) {
        val promise = pendingSavePromise ?: return
        val url = pendingSaveUrl ?: return
        val transferId = pendingSaveTransferId ?: ""
        pendingSavePromise = null
        pendingSaveUrl = null
        pendingSaveName = null
        pendingSaveTransferId = null
        if (resultCode != Activity.RESULT_OK || data == null || data.data == null) {
          // The user walked away from the picker: not an error, just nothing saved.
          promise.resolve(null)
          return
        }
        downloadInto(reactContext.contentResolver.openOutputStream(data.data!!), url, transferId, promise)
        return
      }

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
    cancelLocation("BRIDGE_INVALIDATED", "location bridge stopped")
    voiceAudio.teardown()
    DeviceBus.detach()
    super.invalidate()
  }

  private val voiceAudio by lazy { VoiceAudio(reactContext) }

  @ReactMethod
  fun getCurrentLocation(promise: Promise) {
    if (pendingLocationPromise != null) {
      promise.reject("LOCATION_IN_PROGRESS", "a location request is already in progress")
      return
    }
    val coarse = ContextCompat.checkSelfPermission(
      reactContext,
      android.Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    val fine = ContextCompat.checkSelfPermission(
      reactContext,
      android.Manifest.permission.ACCESS_FINE_LOCATION,
    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
    if (!coarse && !fine) {
      promise.reject("NO_LOCATION_PERMISSION", "location permission not granted")
      return
    }

    val manager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = buildList {
      if (fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) add(LocationManager.GPS_PROVIDER)
      if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) add(LocationManager.NETWORK_PROVIDER)
    }
    if (providers.isEmpty()) {
      promise.reject("LOCATION_DISABLED", "no location provider is enabled")
      return
    }

    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        val current = bestLocation
        if (current == null || location.accuracy < current.accuracy) bestLocation = location
        if (location.accuracy <= 25f) finishLocation()
      }
    }
    pendingLocationPromise = promise
    locationListener = listener
    bestLocation = null
    try {
      for (provider in providers) {
        manager.requestLocationUpdates(provider, 1_000L, 0f, listener, Looper.getMainLooper())
      }
      locationHandler.postDelayed(locationTimeout, 12_000L)
    } catch (err: SecurityException) {
      cancelLocation("NO_LOCATION_PERMISSION", "location permission not granted", err)
    } catch (err: Exception) {
      cancelLocation("LOCATION_FAILED", err.message ?: "could not read location", err)
    }
  }

  private fun finishLocation() {
    val promise = pendingLocationPromise ?: return
    val location = bestLocation
    cleanupLocation()
    if (location == null) {
      promise.reject("LOCATION_UNAVAILABLE", "no location fix received")
      return
    }
    val map = Arguments.createMap()
    map.putDouble("latitude", location.latitude)
    map.putDouble("longitude", location.longitude)
    map.putDouble("accuracyMeters", location.accuracy.toDouble())
    map.putString("capturedAt", isoTime(location.time.takeIf { it > 0 } ?: System.currentTimeMillis()))
    if (Build.VERSION.SDK_INT >= 26 && location.hasAltitude()) map.putDouble("altitudeMeters", location.altitude)
    if (location.hasBearing()) map.putDouble("headingDegrees", location.bearing.toDouble())
    if (location.hasSpeed()) map.putDouble("speedMetersPerSecond", location.speed.toDouble())
    promise.resolve(map)
  }

  private fun cancelLocation(code: String, message: String, cause: Throwable? = null) {
    val promise = pendingLocationPromise ?: return
    cleanupLocation()
    promise.reject(code, message, cause)
  }

  private fun cleanupLocation() {
    val listener = locationListener
    if (listener != null) {
      val manager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      try {
        manager.removeUpdates(listener)
      } catch (_: SecurityException) {
        // Permission can be revoked while the request is being cleaned up.
      }
    }
    locationHandler.removeCallbacks(locationTimeout)
    locationListener = null
    bestLocation = null
    pendingLocationPromise = null
  }

  private fun isoTime(timeMs: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(Date(timeMs))

  /**
   * Starts capture and returns the destination immediately. The caller needs the uri before the
   * take ends: a cancelled recording still has to be deleted, and a crash mid-take leaves a file
   * whose name the JS side already knows.
   */
  @ReactMethod
  fun startRecording(promise: Promise) {
    if (ContextCompat.checkSelfPermission(reactContext, android.Manifest.permission.RECORD_AUDIO)
      != android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("NO_MIC_PERMISSION", "Microphone permission not granted")
      return
    }
    try {
      promise.resolve(voiceAudio.startRecording())
    } catch (err: Exception) {
      promise.reject("RECORD_FAILED", err.message ?: "could not start recording", err)
    }
  }

  /** Resolves null when the take was too short to contain audio, rather than a 0-byte file. */
  @ReactMethod
  fun stopRecording(promise: Promise) {
    try {
      promise.resolve(voiceAudio.stopRecording())
    } catch (err: Exception) {
      promise.reject("RECORD_FAILED", err.message ?: "could not stop recording", err)
    }
  }

  @ReactMethod
  fun cancelRecording(promise: Promise) {
    voiceAudio.cancelRecording()
    promise.resolve(null)
  }

  @ReactMethod
  fun playAudio(uri: String, promise: Promise) {
    try {
      voiceAudio.play(uri)
      promise.resolve(null)
    } catch (err: Exception) {
      promise.reject("PLAYBACK_FAILED", err.message ?: "could not play audio", err)
    }
  }

  @ReactMethod
  fun pausePlayback(promise: Promise) {
    voiceAudio.pause()
    promise.resolve(null)
  }

  @ReactMethod
  fun seekPlayback(positionMs: Double, promise: Promise) {
    voiceAudio.seek(positionMs.toInt())
    promise.resolve(null)
  }

  @ReactMethod
  fun stopPlayback(promise: Promise) {
    voiceAudio.stopPlayback()
    promise.resolve(null)
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

  /** Throttled transfer progress: at most one event per 256 KB, plus one at the end. */
  private fun emitTransferProgress(id: String, bytes: Long, total: Long) {
    val map = Arguments.createMap()
    map.putString("id", id)
    map.putDouble("bytes", bytes.toDouble())
    map.putDouble("total", total.toDouble())
    DeviceBus.emit("claw:transfer:progress", map)
  }

  private fun copyWithProgress(
    input: java.io.InputStream,
    output: java.io.OutputStream,
    total: Long,
    transferId: String,
  ) {
    val buffer = ByteArray(64 * 1024)
    var written = 0L
    var lastEmit = 0L
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
      written += read
      if (written - lastEmit >= 256L * 1024 || (total > 0 && written == total)) {
        lastEmit = written
        emitTransferProgress(transferId, written, total)
      }
    }
  }

  /**
   * Uploads a local file as a raw request body. This has to happen natively: RN's fetch goes
   * through OkHttp, which only accepts http(s) urls, so reading a file:// or content:// uri from
   * JS always fails with "Network request failed". Streams from the resolver so a large file is
   * never held in memory, sets Content-Length so the server can reject it before buffering, and
   * emits progress events so the composer can show how far a big file has gone.
   */
  @ReactMethod
  fun uploadFile(
    uri: String,
    url: String,
    filename: String,
    type: String,
    threadId: String,
    transferId: String,
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
        input.use { stream ->
          val buffer = ByteArray(64 * 1024)
          var written = 0L
          var lastEmit = 0L
          while (true) {
            val read = stream.read(buffer)
            if (read < 0) break
            sink.write(buffer, 0, read)
            written += read
            if (written - lastEmit >= 256L * 1024 || written == length) {
              lastEmit = written
              emitTransferProgress(transferId, written, length)
            }
          }
        }
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

  /**
   * GETs a media url (the agent's /media/<id>, which carries the auth in the query) and stores
   * the bytes on the device. `toGallery` saves into Pictures (and MediaStore on modern
   * Android, so the photo app sees it); anything else lands in Downloads. No permission is
   * needed: MediaStore inserts are allowed on API 29+, and below that the system
   * DownloadManager writes on our behalf.
   */
  @ReactMethod
  fun downloadFile(url: String, filename: String, toGallery: Boolean, transferId: String, promise: Promise) {
    val safeName = filename.replace(Regex("[/\\\\]"), "_").ifBlank { "file" }
    val request = Request.Builder().url(url).get().build()
    uploadClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        promise.reject("DOWNLOAD_FAILED", e.message ?: "download failed")
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (!it.isSuccessful) {
            promise.reject("DOWNLOAD_FAILED", "server answered ${it.code}")
            return
          }
          val body = it.body
          if (body == null) {
            promise.reject("DOWNLOAD_FAILED", "empty response")
            return
          }
          try {
            val path = storeStream(body.byteStream(), body.contentLength(), safeName, toGallery, transferId)
            val map = Arguments.createMap()
            map.putString("path", path)
            promise.resolve(map)
          } catch (e: Exception) {
            promise.reject("SAVE_FAILED", e.message ?: "save failed")
          }
        }
      }
    })
  }

  /**
   * Downloads a media url into a cache file (no user-visible folder) and resolves its file://
   * uri. The viewer path for big media: a progress-bearing download first, then display from
   * the local copy instead of an unknowable network fetch.
   */
  @ReactMethod
  fun cacheFile(url: String, filename: String, transferId: String, promise: Promise) {
    val safeName = filename.replace(Regex("[/\\\\]"), "_").ifBlank { "file" }
    val request = Request.Builder().url(url).get().build()
    uploadClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        promise.reject("CACHE_FAILED", e.message ?: "download failed")
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (!it.isSuccessful) {
            promise.reject("CACHE_FAILED", "server answered ${it.code}")
            return
          }
          val body = it.body
          if (body == null) {
            promise.reject("CACHE_FAILED", "empty response")
            return
          }
          val target = File(
            reactContext.cacheDir,
            "media_${System.currentTimeMillis()}_${ThreadLocalRandom.current().nextLong().toString(16)}",
          )
          try {
            target.outputStream().use { out -> copyWithProgress(body.byteStream(), out, body.contentLength(), transferId) }
            val map = Arguments.createMap()
            map.putString("uri", Uri.fromFile(target).toString())
            map.putString("name", safeName)
            map.putDouble("size", target.length().toDouble())
            promise.resolve(map)
          } catch (e: Exception) {
            target.delete()
            promise.reject("CACHE_FAILED", e.message ?: "cache failed")
          }
        }
      }
    })
  }

  /**
   * Asks the user where to save first: opens the system "Save as" dialog (Storage Access
   * Framework) pre-filled with the filename, then downloads the media url into the chosen
   * location. Resolves null when the picker is dismissed — that is a cancel, not an error.
   */
  @ReactMethod
  fun saveFile(url: String, filename: String, transferId: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "no current activity")
      return
    }
    if (pendingSavePromise != null) {
      promise.reject("SAVE_IN_PROGRESS", "a save is already in progress")
      return
    }
    pendingSavePromise = promise
    pendingSaveUrl = url
    pendingSaveName = filename
    pendingSaveTransferId = transferId
    val safeName = filename.replace(Regex("[/\\\\]"), "_").ifBlank { "file" }
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(Intent.EXTRA_TITLE, safeName)
    }
    activity.startActivityForResult(intent, FILE_SAVE_REQUEST_CODE)
  }

  private fun downloadInto(output: java.io.OutputStream?, url: String, transferId: String, promise: Promise) {
    if (output == null) {
      promise.reject("SAVE_FAILED", "cannot open chosen location")
      return
    }
    val request = Request.Builder().url(url).get().build()
    uploadClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        promise.reject("DOWNLOAD_FAILED", e.message ?: "download failed")
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (!it.isSuccessful) {
            promise.reject("DOWNLOAD_FAILED", "server answered ${it.code}")
            return
          }
          try {
            val body = it.body
            output.use { out ->
              body?.byteStream()?.use { input -> copyWithProgress(input, out, body.contentLength(), transferId) }
            }
            val map = Arguments.createMap()
            map.putString("path", url)
            promise.resolve(map)
          } catch (e: Exception) {
            promise.reject("SAVE_FAILED", e.message ?: "save failed")
          }
        }
      }
    })
  }

  private fun storeStream(input: java.io.InputStream, total: Long, filename: String, toGallery: Boolean, transferId: String): String {
    val safe = uniqueDownloadName(filename, toGallery)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
        put(
          MediaStore.MediaColumns.RELATIVE_PATH,
          (if (toGallery) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_DOWNLOADS) + "/my-claw",
        )
      }
      val collection =
        if (toGallery) {
          values.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
          MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
          MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        }
      val uri = reactContext.contentResolver.insert(collection, values)
        ?: throw IOException("media store insert failed")
      val out = reactContext.contentResolver.openOutputStream(uri)
        ?: throw IOException("cannot open output stream")
      out.use { output -> copyWithProgress(input, output, total, transferId) }
      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      reactContext.contentResolver.update(uri, values, null, null)
      return uri.toString()
    }
    // API 24-28: the DownloadManager is the system's scoped-storage helper, no permission needed.
    val cache = File(reactContext.cacheDir, safe)
    cache.outputStream().use { out -> copyWithProgress(input, out, total, transferId) }
    val manager = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val request = DownloadManager.Request(Uri.fromFile(cache))
      .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safe)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
    manager.enqueue(request)
    return Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).path + "/" + safe
  }

  /**
   * The device keeps what the server gives it, so the name has to survive both a hostile
   * filename (path separators, control chars, length) and a name clash: the same report saved
   * twice must land as "report (1).pdf", not silently replace the first copy.
   */
  private fun uniqueDownloadName(raw: String, toGallery: Boolean): String {
    var name = raw
      .replace(Regex("[/\\\\\\x00-\\x1f]"), "_")
      .trim()
      .replace(Regex("\\s+"), " ")
      .trimEnd('.', ' ')
    if (name.isEmpty()) name = "file"
    val dot = name.lastIndexOf('.')
    val ext = if (dot > 0) name.substring(dot).take(10) else ""
    val base = (if (dot > 0) name.substring(0, dot) else name).take(100 - ext.length).trimEnd(' ', '.')
    val candidate = base + ext

    val taken = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val collection =
        if (toGallery) MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        else MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      val relativePath =
        (if (toGallery) Environment.DIRECTORY_PICTURES else Environment.DIRECTORY_DOWNLOADS) + "/my-claw"
      val names = mutableSetOf<String>()
      reactContext.contentResolver.query(
        collection,
        arrayOf(MediaStore.MediaColumns.DISPLAY_NAME),
        "${MediaStore.MediaColumns.RELATIVE_PATH} = ?",
        arrayOf(relativePath),
        null,
      )?.use { cursor ->
        while (cursor.moveToNext()) cursor.getString(0)?.let(names::add)
      }
      names
    } else {
      val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      dir.listFiles()?.mapTo(mutableSetOf()) { it.name } ?: emptySet()
    }

    if (candidate !in taken) return candidate
    var n = 1
    while (true) {
      val tried = "$base ($n)$ext"
      if (tried !in taken) return tried
      n++
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

  /**
   * Android's own record of why our previous processes died. It is the only source that can tell
   * a crash from an ANR, an OOM kill, or the battery optimiser stopping the foreground service —
   * four causes that produce the same visible symptom. It survives reboots, unlike logcat's ring
   * buffer, and needs no adb, which is the point: the phone is not always on a network where adb
   * can reach it. Empty below API 30, where the API does not exist.
   */
  @ReactMethod
  fun getExitInfo(promise: Promise) {
    val exits = Arguments.createArray()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      try {
        val manager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        for (info in manager.getHistoricalProcessExitReasons(reactContext.packageName, 0, 10)) {
          val map = Arguments.createMap()
          map.putString("reason", exitReasonName(info.reason))
          map.putDouble("at", info.timestamp.toDouble())
          map.putInt("status", info.status)
          map.putString("description", info.description ?: "")
          exits.pushMap(map)
        }
      } catch (_: Exception) {
        // A refused query must not keep the app from booting.
      }
    }
    val result = Arguments.createMap()
    result.putString("versionName", versionName())
    result.putArray("exits", exits)
    promise.resolve(result)
  }

  private fun versionName(): String {
    return try {
      reactContext.packageManager.getPackageInfo(reactContext.packageName, 0).versionName ?: ""
    } catch (_: Exception) {
      ""
    }
  }

  /** The names, not the ints: a log line has to be readable a month later without a lookup table. */
  private fun exitReasonName(reason: Int): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return "UNKNOWN"
    return when (reason) {
      android.app.ApplicationExitInfo.REASON_ANR -> "ANR"
      android.app.ApplicationExitInfo.REASON_CRASH -> "CRASH"
      android.app.ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
      android.app.ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
      android.app.ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
      android.app.ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
      android.app.ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
      android.app.ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
      android.app.ApplicationExitInfo.REASON_OTHER -> "OTHER"
      android.app.ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERMISSION_CHANGE"
      android.app.ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
      android.app.ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
      android.app.ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
      else -> "UNKNOWN"
    }
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
