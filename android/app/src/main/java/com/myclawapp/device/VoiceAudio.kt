package com.myclawapp.device

import android.content.Context
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import androidx.core.content.ContextCompat
import java.io.File

/**
 * Recording and playback of voice notes.
 *
 * Kept out of DeviceBridgeModule because it is the only stateful part of the bridge: a recorder
 * and a player are open resources with an order of operations, and a leaked MediaRecorder holds
 * the microphone for the whole process.
 *
 * Levels and positions are pushed as events rather than polled. A waveform needs ~16 samples a
 * second; asking for them one promise at a time would put that traffic on the bridge and still
 * drift, because the timer would be JS's rather than the recorder's.
 */
class VoiceAudio(private val reactContext: ReactApplicationContext) {

  companion object {
    const val EVENT_LEVEL = "claw:voice:level"
    const val EVENT_STATUS = "claw:voice:status"
    const val EVENT_PLAYBACK = "claw:voice:playback"

    /**
     * AAC in MP4. Chosen over Ogg/Opus, which MediaRecorder only writes from API 29 while this
     * app supports 24: one format on every device beats a better codec on most of them. Groq and
     * faster-whisper both take .m4a as-is, so nothing transcodes on the way.
     *
     * 16 kHz mono is what Whisper resamples to anyway, and 32 kbps keeps a ten-minute note near
     * 2.4 MB -- well under the 10 MB upload cap that would otherwise reject it after the fact.
     */
    private const val SAMPLE_RATE = 16000
    private const val BIT_RATE = 32000
    private const val LEVEL_INTERVAL_MS = 60L
    private const val PLAYBACK_INTERVAL_MS = 100L
    /** A partial lock is a bounded reliability aid, never a process-wide or permanent lock. */
    private const val WAKE_LOCK_TIMEOUT_MS = 35 * 60 * 1000L
    /**
     * filesDir is never reclaimed by the system, unlike the cache these takes used to live in.
     * A week covers recovering an interrupted take; past it the server holds the sent copy.
     */
    private const val TAKE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000L

    /** getMaxAmplitude() is linear over 0..32767; speech lives in the top of a dB scale. */
    private const val MAX_AMPLITUDE = 32767.0

    @Volatile
    private var activeInstance: VoiceAudio? = null

    /** Called by the service action, without requiring a live JS call. */
    fun stopFromNotification() {
      activeInstance?.finishFromService(null, false)
    }

    /** Called if Android removes the service while the process itself remains alive. */
    fun onRecordingServiceDestroyed() {
      activeInstance?.finishFromService(
        "Recording was interrupted by Android; the take was kept if it could be finalized.",
        true,
      )
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val recordingLock = Any()

  private var recorder: MediaRecorder? = null
  private var recordingFile: File? = null
  private var startedAt = 0L
  private var recordingWarning: String? = null
  private var audioCallbackRegistered = false
  private var wakeLock: PowerManager.WakeLock? = null

  private val recordingCallback = object : AudioManager.AudioRecordingCallback() {
    override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
      val silenced = configs.any { it.isClientSilenced }
      var warning: String? = null
      synchronized(recordingLock) {
        if (recorder == null || !silenced || recordingWarning != null) return
        warning = "Android silenced the microphone; the take is still being kept."
        recordingWarning = warning
      }
      warning?.let {
        emitStatus("warning", it, null)
        VoiceRecordingService.updateStatus(it)
      }
    }
  }

  init {
    activeInstance = this
  }

  private var player: MediaPlayer? = null
  private var rate = 1f
  private var playingUri: String? = null

  private fun emit(event: String, payload: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }

  // --- recording ---------------------------------------------------------------------------

  private data class FinishedTake(
    val recording: WritableMap?,
    val warning: String?,
    val file: File?,
  )

  private val levelTick = object : Runnable {
    override fun run() {
      val active: MediaRecorder
      val started: Long
      synchronized(recordingLock) {
        active = recorder ?: return
        started = startedAt
      }
      val amplitude = try {
        active.maxAmplitude
      } catch (_: IllegalStateException) {
        0
      }
      synchronized(recordingLock) {
        // A stop can race the main-thread tick. The elapsed value is wall-clock duration only; it
        // is never used as proof that the microphone produced samples.
        if (recorder !== active) return
      }
      val payload = Arguments.createMap()
      // Normalised here rather than in JS: the raw scale is a property of MediaRecorder. A zero
      // sample is valid silence, so it never becomes a warning by itself.
      payload.putDouble("level", (amplitude / MAX_AMPLITUDE).coerceIn(0.0, 1.0))
      payload.putDouble("elapsedMs", (SystemClock.elapsedRealtime() - started).toDouble())
      emit(EVENT_LEVEL, payload)
      handler.postDelayed(this, LEVEL_INTERVAL_MS)
    }
  }

  private fun emitStatus(state: String, warning: String?, recording: WritableMap?) {
    val payload = Arguments.createMap()
    payload.putString("state", state)
    warning?.let { payload.putString("warning", it) }
    recording?.let { payload.putMap("recording", it) }
    emit(EVENT_STATUS, payload)
  }

  fun isRecording(): Boolean = synchronized(recordingLock) { recorder != null }

  /** Throws on a busy or missing microphone; the caller turns that into a rejected promise. */
  fun startRecording(): String {
    synchronized(recordingLock) {
      if (recorder != null) throw IllegalStateException("already recording")
    }

    // A filesDir take survives process death as bytes, unlike cacheDir. There is deliberately no
    // claim that an unfinalized MP4 can be recovered after a process crash.
    val directory = File(reactContext.filesDir, "voice-recordings")
    if (!directory.exists() && !directory.mkdirs()) {
      throw IllegalStateException("could not create voice recording directory")
    }
    val expired = System.currentTimeMillis() - TAKE_RETENTION_MS
    directory.listFiles()?.filter { it.lastModified() < expired }?.forEach { it.delete() }
    val target = File(directory, "voice_${System.currentTimeMillis()}.m4a")
    val created = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(reactContext)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }

    try {
      created.setAudioSource(MediaRecorder.AudioSource.MIC)
      created.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      created.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      created.setAudioChannels(1)
      created.setAudioSamplingRate(SAMPLE_RATE)
      created.setAudioEncodingBitRate(BIT_RATE)
      created.setOutputFile(target.absolutePath)
      created.setOnErrorListener { _, what, extra ->
        handleRecorderError("MediaRecorder error ($what/$extra); the take was kept if valid.")
      }
      created.prepare()
      synchronized(recordingLock) {
        if (recorder != null) throw IllegalStateException("already recording")
        recorder = created
        recordingFile = target
        startedAt = SystemClock.elapsedRealtime()
        recordingWarning = null
      }
      registerAudioCallback()
      created.start()
      acquireWakeLock()
    } catch (err: Exception) {
      synchronized(recordingLock) {
        if (recorder === created) {
          unregisterAudioCallbackLocked(created)
          recorder = null
          recordingFile = null
          releaseWakeLockLocked()
        }
      }
      try {
        created.release()
      } catch (_: Exception) {
      }
      target.delete()
      VoiceRecordingService.stop(reactContext)
      throw err
    }

    handler.post(levelTick)
    return Uri.fromFile(target).toString()
  }

  /**
   * Stops a user-ended take. A non-empty file is retained even if MediaRecorder reports a stop
   * error: an interruption must not silently throw away bytes that may still be a valid MP4.
   */
  fun stopRecording(): WritableMap? {
    val finished = synchronized(recordingLock) { finishRecordingLocked(null) }
    VoiceRecordingService.stop(reactContext)
    if (finished.recording == null && finished.warning != null) {
      emitStatus("interrupted", finished.warning, null)
    }
    return finished.recording
  }

  /** Explicit slide-to-delete. This is the one path allowed to remove the local take. */
  fun cancelRecording() {
    val file = synchronized(recordingLock) {
      finishRecordingLocked(null).file
    }
    file?.delete()
    VoiceRecordingService.stop(reactContext)
  }

  /** Finalizes a stop initiated by the foreground notification or by the service lifecycle. */
  private fun finishFromService(message: String?, interrupted: Boolean) {
    val finished = synchronized(recordingLock) { finishRecordingLocked(message) }
    if (finished.recording != null || finished.warning != null) {
      emitStatus(
        if (interrupted) "interrupted" else "stopped",
        finished.warning,
        finished.recording,
      )
    }
  }

  private fun handleRecorderError(message: String) {
    val finished = synchronized(recordingLock) {
      if (recorder == null) return
      finishRecordingLocked(message)
    }
    emitStatus("interrupted", finished.warning ?: message, finished.recording)
    VoiceRecordingService.updateStatus(finished.warning ?: message)
    VoiceRecordingService.stop(reactContext)
  }

  /** Called only while [recordingLock] is held. */
  private fun finishRecordingLocked(message: String?): FinishedTake {
    val active = recorder ?: return FinishedTake(null, null, null)
    val file = recordingFile
    val elapsed = SystemClock.elapsedRealtime() - startedAt
    val previousWarning = recordingWarning
    unregisterAudioCallbackLocked(active)
    recorder = null
    recordingFile = null
    recordingWarning = null
    handler.removeCallbacks(levelTick)

    var stopped = true
    try {
      active.stop()
    } catch (_: RuntimeException) {
      stopped = false
    } finally {
      try {
        active.release()
      } catch (_: Exception) {
      }
      releaseWakeLockLocked()
    }

    if (file == null) return FinishedTake(null, message ?: previousWarning, null)
    val hasBytes = file.exists() && file.length() > 0L
    val warning = message
      ?: previousWarning
      ?: if (!stopped) "Recording was interrupted; the take was kept if valid." else null
    if (!hasBytes) return FinishedTake(null, warning, file)

    val result = Arguments.createMap()
    result.putString("uri", Uri.fromFile(file).toString())
    result.putDouble("durationMs", elapsed.toDouble())
    result.putDouble("sizeBytes", file.length().toDouble())
    warning?.let { result.putString("warning", it) }
    if (!stopped) result.putBoolean("interrupted", true)
    return FinishedTake(result, warning, file)
  }

  private fun registerAudioCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    synchronized(recordingLock) {
      val active = recorder ?: return
      if (audioCallbackRegistered) return
      try {
        // MediaRecorder's monitor is scoped to this recorder. AudioManager's global callback would
        // also report another app's capture and turn its silencing into our warning.
        active.registerAudioRecordingCallback(
          ContextCompat.getMainExecutor(reactContext),
          recordingCallback,
        )
        audioCallbackRegistered = true
      } catch (_: Exception) {
        // Recording remains usable; the level stream must not invent a silencing warning.
      }
    }
  }

  /** Called only while [recordingLock] is held. */
  private fun unregisterAudioCallbackLocked(active: MediaRecorder? = recorder) {
    if (!audioCallbackRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    try {
      active?.unregisterAudioRecordingCallback(recordingCallback)
    } catch (_: Exception) {
    }
    audioCallbackRegistered = false
  }

  private fun acquireWakeLock() {
    val manager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
    val candidate = manager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "${reactContext.packageName}:voice-recording",
    )
    candidate.setReferenceCounted(false)
    try {
      candidate.acquire(WAKE_LOCK_TIMEOUT_MS)
      synchronized(recordingLock) {
        if (recorder == null) {
          if (candidate.isHeld) candidate.release()
        } else {
          wakeLock = candidate
        }
      }
    } catch (_: Exception) {
      // The foreground service remains the primary protection. Failure to acquire an optional
      // bounded CPU lock must not turn a valid microphone session into a start error.
      try {
        if (candidate.isHeld) candidate.release()
      } catch (_: Exception) {
      }
    }
  }

  /** Called only while [recordingLock] is held. */
  private fun releaseWakeLockLocked() {
    val held = wakeLock
    wakeLock = null
    try {
      if (held?.isHeld == true) held.release()
    } catch (_: Exception) {
    }
  }

  // --- playback ----------------------------------------------------------------------------

  private val playbackTick = object : Runnable {
    override fun run() {
      val active = player ?: return
      emitPlayback(active.isPlaying, active.currentPosition, active.duration)
      if (active.isPlaying) handler.postDelayed(this, PLAYBACK_INTERVAL_MS)
    }
  }

  private fun emitPlayback(playing: Boolean, positionMs: Int, durationMs: Int) {
    val payload = Arguments.createMap()
    payload.putString("uri", playingUri)
    payload.putBoolean("playing", playing)
    payload.putDouble("positionMs", positionMs.toDouble())
    payload.putDouble("durationMs", durationMs.toDouble())
    emit(EVENT_PLAYBACK, payload)
  }

  /**
   * One note plays at a time: starting a second stops the first. Two voices over each other is
   * never what was meant, and a paused player left behind keeps an audio focus nobody owns.
   */
  fun play(uri: String, speed: Float) {
    rate = speed
    val resumingSame = playingUri == uri && player != null
    if (resumingSame) {
      val active = player!!
      active.start()
      applyRate(active)
      handler.post(playbackTick)
      return
    }

    releasePlayer()
    val created = MediaPlayer()
    created.setDataSource(reactContext, Uri.parse(uri))
    created.prepare()
    created.setOnCompletionListener {
      emitPlayback(false, 0, created.duration)
      handler.removeCallbacks(playbackTick)
      // Kept loaded so the next tap replays instantly instead of re-decoding.
      created.seekTo(0)
    }
    created.start()
    applyRate(created)
    player = created
    playingUri = uri
    handler.post(playbackTick)
  }

  /** A paused player keeps the new speed for its resume: setting it now would start it again. */
  fun setRate(speed: Float) {
    rate = speed
    val active = player ?: return
    if (active.isPlaying) applyRate(active)
  }

  private fun applyRate(active: MediaPlayer) {
    try {
      active.playbackParams = active.playbackParams.setSpeed(rate)
    } catch (_: Exception) {
      // A decoder that cannot stretch time plays at normal speed rather than not at all.
    }
  }

  fun pause() {
    val active = player ?: return
    if (active.isPlaying) active.pause()
    handler.removeCallbacks(playbackTick)
    emitPlayback(false, active.currentPosition, active.duration)
  }

  fun seek(positionMs: Int) {
    val active = player ?: return
    active.seekTo(positionMs.coerceIn(0, active.duration))
    emitPlayback(active.isPlaying, active.currentPosition, active.duration)
  }

  fun stopPlayback() {
    val active = player ?: return
    emitPlayback(false, 0, active.duration)
    releasePlayer()
  }

  private fun releasePlayer() {
    handler.removeCallbacks(playbackTick)
    player?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {
      }
      it.release()
    }
    player = null
    playingUri = null
  }

  /**
   * The bridge can be invalidated by navigation or a JS reload while the foreground service is
   * still alive. Finalize rather than cancel so a valid take is not silently discarded; a process
   * crash is different and cannot be promised to recover an unfinalized MP4.
   */
  fun teardown() {
    stopRecording()
    releasePlayer()
    if (activeInstance === this) activeInstance = null
  }
}
