package com.myclawapp.device

import android.app.Activity
import android.app.DownloadManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.content.pm.SigningInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.app.NotificationManagerCompat
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
    /**
     * How much of a death trace travels. A tombstone's backtrace is the first screen; past that
     * it is memory maps and register dumps, which is more than a diagnostic report can carry and
     * more than anyone reads. The report clips again on the JS side.
     */
    private const val TRACE_LIMIT = 16 * 1024

    /** The staged APK's transitions, kept on disk: a process death is half of what they explain. */
    private const val JOURNAL_NAME = "update-journal.txt"
    private const val JOURNAL_LIMIT = 4000

    /**
     * One owner of the staged file at a time. Three actors touch that path -- the download (an
     * OkHttp thread that deletes then writes), the installer (installWorker, which copies) and
     * clearStagedApk (the JS bridge, which deletes) -- and nothing serialized them: the ENOENT of
     * 2026-09-15 landed between the installer's entry check and its copy, with one file and no
     * lock. A Semaphore rather than a ReentrantLock, because the installer acquires it on the
     * module thread and releases it inside the worker.
     */
    private val stagedGate = java.util.concurrent.Semaphore(1)

    /**
     * Appends one transition of the staged file to its journal, bounded. Each line answers "who
     * touched it, when, and what was there": an update failure otherwise arrives as a raw Java
     * message with no history, which is exactly why that ENOENT could not be attributed. Owner's
     * call (2026-09-15): the detail goes to the diagnostics, never into the dialog.
     */
    fun noteStaged(context: Context, line: String) {
      try {
        val file = java.io.File(context.filesDir, JOURNAL_NAME)
        val at = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
          .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
          .format(java.util.Date())
        file.appendText("$at $line\n")
        if (file.length() > JOURNAL_LIMIT) {
          file.writeText(file.readLines().takeLast(20).joinToString("\n") + "\n")
        }
      } catch (_: Exception) {
        // A journal that cannot be written must never cost the update itself.
      }
    }

    /**
     * Deletes the staged APK-plus-marker. Called by the JS bridge and by [InstallResultReceiver]
     * on an install success, where the JS half of the flow is already dead: the process being
     * replaced cannot run a promise, so the receiver does it itself. Pure file deletion, safe to
     * call whenever: a superseded APK the next download overwrites in place anyway.
     */
    fun dropStagedApk(context: Context) {
      try {
        val apk = File(context.filesDir, "update-staged.apk")
        if (apk.exists()) noteStaged(context, "staged apk deleted (${apk.length()} bytes)")
        apk.delete()
        File(context.filesDir, "update-staged.version").delete()
      } catch (_: Exception) {
        // Nothing to do: the next download overwrites in place anyway.
      }
    }
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

  /**
   * Where an update is verified and committed. PackageInstaller accepts a call from any thread;
   * the UI thread does not, and both halves are expensive: verifying parses the whole 45 MB
   * archive, committing copies it into a session and fsyncs it. Run here, the app froze on
   * "100% of 45.7 MB" and only proposed the install once the owner had left and come back
   * (2026-09-12). One worker, because two installs at once is not a thing.
   */
  private val installWorker: java.util.concurrent.ExecutorService =
    java.util.concurrent.Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "claw-apk-install") }
  private val locationTimeout = Runnable { finishLocation() }

  // Uploads can be slow on mobile data; only the connect timeout stays short.
  private val uploadClient: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(5, TimeUnit.MINUTES)
      .readTimeout(60, TimeUnit.SECONDS)
      .build()
  }

  // The app-update relay streams a 45 MB APK through the server and Forgejo; a read window of a
  // minute is a timeout on any network that is not instant, and a dead download with no error
  // message on screen is the worst kind. Ten minutes of no bytes is a real stall.
  private val apkClient: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(10, TimeUnit.MINUTES)
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
   * Whether the clipboard holds an image, and the image itself.
   *
   * React Native exposes no paste event and its EditText implements neither commitContent nor
   * setContentMimeTypes, so a pasted screenshot cannot reach the JS side through the text field.
   * The clipboard is read on demand instead. The two calls are split because reading the clip
   * description is silent while reading the clip itself raises the Android 12 "pasted from"
   * toast: an attachment menu that toasts every time it opens is worse than no entry at all.
   */
  @ReactMethod
  fun clipboardHasImage(promise: Promise) {
    try {
      val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
      val description = clipboard?.primaryClipDescription
      if (description == null) {
        promise.resolve(false)
        return
      }
      val types = (0 until description.mimeTypeCount).map { description.getMimeType(it) }
      promise.resolve(types.any { it != null && it.startsWith("image/") })
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun clipboardImage(promise: Promise) {
    try {
      val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
      // Reading the clip is refused while the app does not hold focus (Android 10+), and that
      // shows up as a null clip rather than as an exception.
      val clip = clipboard?.primaryClip
      val uri = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).uri else null
      if (uri == null) {
        promise.resolve(null)
        return
      }
      val resolver = reactContext.contentResolver
      val type = resolver.getType(uri)
      if (type == null || !type.startsWith("image/")) {
        promise.resolve(null)
        return
      }
      // Copied to the cache here rather than by prepareFile later: the permission Android grants
      // over a clipboard uri belongs to this read, and a second one can land after it is gone.
      val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(type) ?: "png"
      var name = "pasted-${System.currentTimeMillis()}.$extension"
      resolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (nameIdx >= 0) cursor.getString(nameIdx)?.let { if (it.isNotBlank()) name = it }
        }
      }
      val input = resolver.openInputStream(uri)
        ?: run {
          promise.resolve(null)
          return
        }
      val cached = File(reactContext.cacheDir, "clip_${System.currentTimeMillis()}_${ThreadLocalRandom.current().nextLong().toString(16)}")
      input.use { stream -> cached.outputStream().use { out -> stream.copyTo(out) } }
      val map = Arguments.createMap()
      map.putString("uri", Uri.fromFile(cached).toString())
      map.putString("name", name)
      map.putString("type", type)
      map.putDouble("size", cached.length().toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("CLIPBOARD_FAILED", e.message ?: "clipboard read failed")
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
      // Percent-encoded, like the web client: an OkHttp header value must be ISO-8859-1 and a
      // name such as "resume.pdf" with accents throws before the request leaves. The server
      // decodes it back (files-http.ts, decodeUploadName).
      .header("x-filename", Uri.encode(filename))
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

  /** Replaces the locally generated credentials with the pair the server minted (CLI pairing). */
  @ReactMethod
  fun adoptCredentials(deviceId: String, token: String, promise: Promise) {
    promise.resolve(DeviceCredentials.adopt(reactContext, deviceId, token))
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
   * Whether the IME is on screen, read from the live window insets rather than remembered.
   *
   * Every keyboard state in this app used to be a memory of an event: RN keeps `_currentlyShowing`
   * for `Keyboard.isVisible()`, its `KeyboardAvoidingView` keeps `_keyboardEvent`, and
   * `ReactRootView` keeps `mKeyboardIsVisible` -- and the native one only re-decides on a layout
   * pass, because `checkForKeyboardEvents()` runs from `onGlobalLayout`. Background the app with
   * the keyboard up and Android hides the IME as part of the window losing focus; if no layout
   * pass happens while the app can still see it, all three keep believing the keyboard is there,
   * and the app comes back with the shell still padded by it (owner: "quand on reviens sur l'app
   * ca garde comme si le clavier est ouvert", 2026-09-15).
   *
   * This is the same source `checkForKeyboardEvents` reads (`imeInsets`), asked on demand: an
   * answer that cannot be out of date, because there is no date to it. It carries the geometry
   * too, in the same arithmetic RN uses for `endCoordinates.height` (the IME inset minus the bar
   * inset it shares with the navigation bar), so a caller that learns the keyboard is up does not
   * have to wait for an event to learn how tall it is.
   */
  @ReactMethod
  fun keyboardVisible(promise: Promise) {
    val out = Arguments.createMap()
    out.putBoolean("visible", false)
    out.putDouble("height", 0.0)
    try {
      val activity = reactContext.currentActivity
      val decor = activity?.window?.decorView
      val insets = if (decor != null) androidx.core.view.ViewCompat.getRootWindowInsets(decor) else null
      if (insets != null) {
        val ime = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime())
        val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
        val density = reactContext.resources.displayMetrics.density.toDouble().coerceAtLeast(0.1)
        out.putBoolean("visible", insets.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime()))
        out.putDouble("height", (ime.bottom - bars.bottom).coerceAtLeast(0) / density)
      } else {
        // Nothing resumed to read insets from (no window, no decor): the IME service is the only
        // thing left to ask, and it answers for the whole system rather than for this app.
        val imm = reactContext.getSystemService(Context.INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager
        out.putBoolean("visible", imm?.isAcceptingText ?: false)
      }
    } catch (_: Exception) {
      // Answered false above: a keyboard question that cannot be answered is not one to guess at.
    }
    promise.resolve(out)
  }

  /** "wifi" | "mobile" | "other". Drives the auto-download policy: 45 MB on mobile data is a choice, not a default. */
  @ReactMethod
  fun getNetworkType(promise: Promise) {
    try {
      val cm = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val caps = cm.getNetworkCapabilities(cm.activeNetwork)
      val networkType = if (caps == null) "other" else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) "wifi" else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) "mobile" else "other"
      promise.resolve(networkType)
    } catch (e: Exception) {
      promise.resolve("other")
    }
  }

  /**
   * Android 8+ requires the "install unknown apps" opt-in before a PackageInstaller session can
   * commit. The caller checks before showing Install; this also lets the settings card show the
   * right hint (and skip straight to the permission screen).
   */
  @ReactMethod
  fun canInstallApk(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.resolve(true)
      return
    }
    promise.resolve(reactContext.packageManager.canRequestPackageInstalls())
  }

  /** Opens the system screen that grants the app the right to install packages. */
  @ReactMethod
  fun openUnknownSourcesSettings() {
    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${reactContext.packageName}"))
    reactContext.currentActivity?.startActivity(intent)
  }

  /**
   * Downloads the APK through the server relay into a fixed staging file. The phone never sees
   * the Forgejo token; the file at findStagedApk() is what installStagedApk() commits. Progress
   * events flow to JS through the same transfer channel as media.
   */
  @ReactMethod
  fun downloadApk(url: String, transferId: String, version: String, expectedSize: Double, promise: Promise) {
    val request = Request.Builder().url(url).get().build()
    apkClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        promise.reject("APK_DOWNLOAD_FAILED", e.message ?: "apk download failed")
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (!it.isSuccessful) {
            promise.reject("APK_DOWNLOAD_FAILED", "server answered ${it.code}")
            return
          }
          val body = it.body ?: run {
            promise.reject("APK_DOWNLOAD_FAILED", "empty response")
            return
          }
          try {
            val target = stagedApk()
            // The same gate the installer takes: a transfer rewrites this exact path, and letting
            // it run while an install copies what is there is how a verified APK becomes a
            // truncated one (2026-09-15).
            if (!stagedGate.tryAcquire()) {
              promise.reject("APK_BUSY", "the staged apk is being installed right now, download again in a moment")
              return
            }
            try {
              if (target.exists()) {
                noteStaged(reactContext, "download start deleted ${target.length()} bytes")
                target.delete()
              }
              // The relay streams the APK, so the response is chunked and carries no
              // Content-Length: contentLength() is -1 and a percentage cannot be computed from it.
              // The size the check already reported is the authority when that happens.
              val declared = body.contentLength()
              val total = if (declared > 0) declared else expectedSize.toLong()
              target.outputStream().use { out ->
                copyWithProgress(body.byteStream(), out, total, transferId)
              }
              // A truncated download installs as a corrupt package and fails with a message that
              // explains nothing. Two cheap checks: the APK magic, and the size we were promised.
              val magic = ByteArray(2)
              target.inputStream().use { it.read(magic) }
              if (magic[0] != 'P'.code.toByte() || magic[1] != 'K'.code.toByte()) {
                noteStaged(reactContext, "download rejected: not an apk (${target.length()} bytes)")
                target.delete()
                promise.reject("APK_CORRUPT", "the downloaded file is not an apk")
                return
              }
              if (total > 0 && target.length() != total) {
                noteStaged(reactContext, "download rejected: stopped at ${target.length()} of $total bytes")
                target.delete()
                promise.reject("APK_TRUNCATED", "download stopped at ${target.length()} of $total bytes")
                return
              }
              // The version travels with the file: a staged APK that cannot say what it carries
              // is a staged APK the UI has to guess about, and guessing is what looped here.
              try {
                versionMarker().writeText(version)
              } catch (_: Exception) {
                // A missing marker only costs the version label, never the install itself.
              }
              noteStaged(reactContext, "staged $version (${target.length()} bytes)")
            } finally {
              stagedGate.release()
            }
            val map = Arguments.createMap()
            map.putString("path", target.absolutePath)
            map.putDouble("size", target.length().toDouble())
            promise.resolve(map)
          } catch (e: Exception) {
            promise.reject("APK_SAVE_FAILED", e.message ?: "apk save failed")
          }
        }
      }
    })
  }

  /**
   * Where the staged APK lives. Not in cacheDir: the system reclaims that directory under disk
   * pressure, and a download that vanishes between "ready" and the install tap is exactly what
   * turned Install into a button that flashes and does nothing. filesDir is ours until we delete it.
   */
  private fun stagedApk(): File = File(reactContext.filesDir, "update-staged.apk")

  /**
   * What is actually on disk, asked rather than remembered: the UI must never offer Install for
   * a file the system has since reclaimed. `version` is what the download recorded next to it.
   */
  @ReactMethod
  fun stagedApkInfo(promise: Promise) {
    val file = stagedApk()
    val map = Arguments.createMap()
    val staged = file.exists() && file.length() > 0L
    map.putBoolean("staged", staged)
    map.putDouble("size", if (staged) file.length().toDouble() else 0.0)
    map.putString("version", if (staged) stagedVersion() else "")
    promise.resolve(map)
  }

  /** The version marker written beside the APK, so a staged file always knows what it carries. */
  private fun versionMarker(): File = File(reactContext.filesDir, "update-staged.version")

  private fun stagedVersion(): String =
    try {
      if (versionMarker().exists()) versionMarker().readText().trim() else ""
    } catch (e: Exception) {
      ""
    }

  /**
   * Drops the staged APK and its marker: a failed or superseded download must not linger. Queued
   * behind the installer on the same worker and gated like it: a clear that lands mid-transfer
   * would delete the file the transfer is writing and leave the marker pointing at nothing.
   */
  @ReactMethod
  fun clearStagedApk(promise: Promise) {
    installWorker.execute {
      if (!stagedGate.tryAcquire()) {
        promise.reject("APK_BUSY", "the staged apk is being written or installed right now")
        return@execute
      }
      try {
        dropStagedApk(reactContext)
        promise.resolve(null)
      } finally {
        stagedGate.release()
      }
    }
  }

  /**
   * The staged file's own history, newest last. Read by the JS side whenever an update fails and
   * shipped as a diagnostic: it is the only record of who deleted what, and the dialog has no
   * room for it (owner's call, 2026-09-15). Never rejects: an unreadable journal reads empty.
   */
  @ReactMethod
  fun stagedApkJournal(promise: Promise) {
    val text = try {
      val file = File(reactContext.filesDir, JOURNAL_NAME)
      if (file.exists()) file.readText().takeLast(JOURNAL_LIMIT) else ""
    } catch (_: Exception) {
      ""
    }
    promise.resolve(text)
  }

  private fun certDigests(certs: Array<android.content.pm.Signature>?): Set<String> {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    return certs.orEmpty().map { cert ->
      digest.digest(cert.toByteArray()).joinToString("") { byte -> "%02x".format(byte) }
    }.toSet()
  }

  /** Who signed this package right now. */
  private fun currentSigners(info: SigningInfo?): Set<String> =
    if (info == null) emptySet() else certDigests(info.apkContentsSigners)

  /**
   * Every certificate a package can prove it descends from: the current signer plus, when the
   * APK carries a v3 rotation lineage, its ancestors. This is what makes the key rotation
   * installable -- the archive is signed by the release key and the phone still holds the old
   * debug one, and the lineage is the proof that links the two.
   */
  private fun provenSigners(info: SigningInfo?): Set<String> {
    if (info == null) return emptySet()
    val history = if (info.hasMultipleSigners()) emptySet() else certDigests(info.signingCertificateHistory)
    return currentSigners(info) + history
  }

  /**
   * What the staged file has to prove before it is handed to PackageInstaller: that it is this
   * app, that it moves forward, and that it was signed by a key this install already trusts.
   *
   * Until this existed the only checks were the `PK` magic and a size the same server announced,
   * so whoever answered the update relay -- a compromised server, a hostile network, anyone who
   * reached the release registry -- got their APK past a system dialog that says nothing alarming
   * when the signature matches. Returns null when the archive is acceptable, a reason otherwise.
   */
  private fun rejectionReason(file: java.io.File): String? {
    val pm = reactContext.packageManager
    val self = reactContext.packageName
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      // No signing-certificate API below P. Those devices are served by the original key
      // (see the rotation range in scripts/release.sh) and the platform enforces the match.
      val archive = pm.getPackageArchiveInfo(file.absolutePath, 0)
        ?: return "the staged file is not a readable package"
      if (archive.packageName != self) return "the staged package is ${archive.packageName}, not $self"
      return null
    }
    val flags = PackageManager.GET_SIGNING_CERTIFICATES
    val archive: PackageInfo = pm.getPackageArchiveInfo(file.absolutePath, flags)
      ?: return "the staged file is not a readable package"
    if (archive.packageName != self) return "the staged package is ${archive.packageName}, not $self"
    val installed: PackageInfo = pm.getPackageInfo(self, flags)
    if (archive.longVersionCode <= installed.longVersionCode) {
      return "the staged build is ${archive.longVersionCode}, not newer than ${installed.longVersionCode}"
    }
    val trusted = currentSigners(installed.signingInfo)
    val proven = provenSigners(archive.signingInfo)
    if (trusted.isEmpty()) return "this install has no signer to compare against"
    if (proven.isEmpty()) return "the staged package is not signed"
    if (!proven.containsAll(trusted)) return "the staged package was signed by an unknown key"
    return null
  }

  /**
   * Commits the staged APK through PackageInstaller. The confirmation is Android's own (one
   * system screen); the outcome is emitted on claw:update:install by InstallResultReceiver.
   * This promise resolves once the session is committed, not when the install finishes: the
   * app is being replaced, so after success the process dies and only the reopen matters.
   *
   * All of it runs on installWorker, never on the UI thread -- see that field for why.
   */
  @ReactMethod
  fun installStagedApk(promise: Promise) {
    // Everything runs on the worker, entry checks included: the whole point of 2026-09-15 is that
    // a check on one thread and a copy on another, with a file anyone can delete between them, is
    // what turned a verified install into an ENOENT.
    installWorker.execute {
      // One owner of the staged file at a time, and a refusal that says why rather than a race.
      if (!stagedGate.tryAcquire()) {
        promise.reject("APK_BUSY", "a download is writing the staged apk, try again in a moment")
        return@execute
      }
      try {
        val file = stagedApk()
        if (!file.exists() || file.length() == 0L) {
          noteStaged(reactContext, "install found nothing staged")
          promise.reject("APK_NOT_STAGED", "no staged apk, download first")
          return@execute
        }
        // Opened before anything is verified, and kept open across the copy: from here the bytes
        // are ours whatever happens to the directory entry, because POSIX keeps an unlinked file
        // readable through its descriptor. `file.inputStream()` here threw the ENOENT that started
        // this; a stream that cannot be opened now is answered at the door, by name.
        val input = try {
          file.inputStream()
        } catch (e: Exception) {
          noteStaged(reactContext, "install could not open the staged apk: ${e.message}")
          promise.reject("APK_NOT_STAGED", "the staged apk is not readable any more, download it again")
          return@execute
        }
        try {
          val size = try {
            input.channel.size()
          } catch (e: Exception) {
            file.length()
          }
          val refusal = try {
            rejectionReason(file)
          } catch (e: Exception) {
            e.message ?: "the staged package could not be verified"
          }
          if (refusal != null) {
            // A file that failed this check is never worth keeping: leaving it staged would offer
            // the same Install button again on the next screen.
            noteStaged(reactContext, "refused before install: $refusal")
            dropStagedApk(reactContext)
            promise.reject("APK_UNTRUSTED", refusal)
            return@execute
          }
          // Deliberately no canRequestPackageInstalls() gate here. That value is cached per
          // process, so after the owner grants the permission and comes back it can still read
          // false, and the install we refuse is one the system would have accepted. Android
          // documents the real behaviour: when the permission is missing, the package installer
          // shows its own dialog with a link to the settings. So commit, and only treat a
          // SecurityException as a refusal.
          try {
            val pkg = reactContext.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            // MUTABLE is not a choice: commit() rejects an immutable status receiver outright
            // ("The commit() status receiver should come from a mutable PendingIntent") because
            // the system fills EXTRA_STATUS and, for the confirmation screen, EXTRA_INTENT into it.
            // The flag only exists from S; before that a PendingIntent is mutable by default.
            // Keeping the intent explicit (component + package) also satisfies Android 14, which
            // refuses a mutable PendingIntent built on an implicit intent.
            val mutability =
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val sender = PendingIntent.getBroadcast(
              reactContext,
              4242,
              Intent(reactContext, InstallResultReceiver::class.java)
                .setAction(InstallResultReceiver.ACTION_INSTALL_RESULT)
                .setPackage(reactContext.packageName),
              PendingIntent.FLAG_UPDATE_CURRENT or mutability,
            )
            val sessionId = pkg.createSession(params)
            val session = pkg.openSession(sessionId)
            try {
              session.openWrite("base.apk", 0, size).use { out ->
                input.copyTo(out)
                // Documented requirement: without fsync the bytes are not guaranteed to have
                // reached the session, and the commit fails on a package it considers truncated.
                session.fsync(out)
              }
              session.commit(sender.intentSender)
              noteStaged(reactContext, "install committed ($size bytes)")
              promise.resolve(null)
            } finally {
              session.close()
            }
          } catch (e: SecurityException) {
            noteStaged(reactContext, "install refused by the system: ${e.message}")
            promise.reject("UNKNOWN_SOURCES_DISABLED", "allow this app to install updates first")
          } catch (e: Exception) {
            noteStaged(reactContext, "install failed: ${e.message}")
            promise.reject("APK_INSTALL_FAILED", e.message ?: "apk install failed")
          }
        } finally {
          // A deletion from another actor can no longer break the copy, but the descriptor has to
          // be let go before the gate is: this is the last reader of that inode.
          try {
            input.close()
          } catch (_: Exception) {
            // Nothing to do: the session already has the bytes, or the failure is already reported.
          }
        }
      } finally {
        stagedGate.release()
      }
    }
  }

  /** If an install result was parked at cold start, delivers it now that JS is subscribed. */
  @ReactMethod
  fun drainInstallResult() {
    InstallResultReceiver.drainPending()
  }

  /** Android's own record of why our previous processes died. It is the only source that can tell
   * a crash from an ANR, an OOM kill, or the battery optimiser stopping the foreground service —
   * four causes that produce the same visible symptom. It survives reboots, unlike logcat's ring
   * buffer, and needs no adb, which is the point: the phone is not always on a network where adb
   * can reach it. Empty below API 30, where the API does not exist.
   */
  @ReactMethod
  fun getAppVersion(promise: Promise) {
    promise.resolve(versionName())
  }

  /**
   * Dismisses one notification by the id it was posted with. The push renderer runs in its own
   * service, often with no JS context alive, so the id is derived from the deep link on both
   * sides (docs/notifications.md) rather than remembered here. Cancelling an id that was never
   * posted, or was already swiped away, is a no-op on the platform side.
   */
  @ReactMethod
  fun cancelNotification(id: Double, promise: Promise) {
    try {
      NotificationManagerCompat.from(reactContext).cancel(id.toInt())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CANCEL_NOTIFICATION_FAILED", e.message, e)
    }
  }

  /**
   * One notification-ding for an incoming question sheet, played by the system's own sound so
   * no asset ships in the APK. The sheet on screen is the surface; a device that is not looking
   * at the thread gets the tray through the push instead (server-side skipDevice), never this.
   *
   * A MediaPlayer follows neither the ringer mode nor the notification volume: it played the
   * notification sound at media volume, in vibrate and in silent alike, which is how the app came
   * to ding through a silenced phone. The mode is read first, the way the system itself treats one
   * of its own notifications -- nothing when silent, a short buzz when vibrating, the sound
   * otherwise -- and the sound goes out on the notification stream rather than the media one.
   */
  @ReactMethod
  fun playAlertSound(promise: Promise) {
    try {
      val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      when (audio.ringerMode) {
        AudioManager.RINGER_MODE_SILENT -> Unit
        AudioManager.RINGER_MODE_VIBRATE -> vibrateOnce()
        else -> {
          // One shot, released on completion so a second question is not silenced by a leaked
          // player, and set up by hand to carry the notification attributes MediaPlayer.create
          // would leave out.
          val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
          val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
          val player = MediaPlayer()
          player.setAudioAttributes(attributes)
          player.setDataSource(reactContext, uri)
          player.setOnCompletionListener { it.release() }
          player.prepare()
          player.start()
        }
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ALERT_SOUND_FAILED", e.message, e)
    }
  }

  /** A short buzz in the system's own notification shape, since the app ships no sound asset. */
  private fun vibrateOnce() {
    @Suppress("DEPRECATION")
    val vibrator = reactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
    if (!vibrator.hasVibrator()) return
    val pattern = longArrayOf(0, 120, 100, 120)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(pattern, -1)
    }
  }

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
          // The trace Android kept of the death. For an uncaught exception it is a tombstone whose
          // backtrace names the thrower and the stack it came from -- the one thing a report says
          // today is missing ("process exit: CRASH (crash)", 2026-09-15). Without it the only way
          // to attribute a crash is a cable, and the phone is not always on the same network as
          // the machine that would read it. Best effort, clipped, never fatal: a refused or empty
          // stream must not keep the report itself from being sent.
          val trace = info.traceInputStream
          if (trace != null) {
            val text = try {
              trace.use { stream ->
                val buffer = ByteArray(TRACE_LIMIT)
                val read = stream.read(buffer)
                if (read > 0) String(buffer, 0, read, Charsets.UTF_8) else ""
              }
            } catch (_: Exception) {
              ""
            }
            if (text.isNotEmpty()) map.putString("trace", text)
          }
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
    caps.putBoolean("wssConnection", true)
    promise.resolve(caps)
  }
}
