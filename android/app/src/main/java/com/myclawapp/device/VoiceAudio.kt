package com.myclawapp.device

import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
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

    /** getMaxAmplitude() is linear over 0..32767; speech lives in the top of a dB scale. */
    private const val MAX_AMPLITUDE = 32767.0
  }

  private val handler = Handler(Looper.getMainLooper())

  private var recorder: MediaRecorder? = null
  private var recordingFile: File? = null
  private var startedAt = 0L

  private var player: MediaPlayer? = null
  private var rate = 1f
  private var playingUri: String? = null

  private fun emit(event: String, payload: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }

  // --- recording ---------------------------------------------------------------------------

  private val levelTick = object : Runnable {
    override fun run() {
      val active = recorder ?: return
      val amplitude = try {
        active.maxAmplitude
      } catch (_: IllegalStateException) {
        0
      }
      val payload = Arguments.createMap()
      // Normalised here rather than in JS: the raw scale is a property of MediaRecorder.
      payload.putDouble("level", (amplitude / MAX_AMPLITUDE).coerceIn(0.0, 1.0))
      payload.putDouble("elapsedMs", (SystemClock.elapsedRealtime() - startedAt).toDouble())
      emit(EVENT_LEVEL, payload)
      handler.postDelayed(this, LEVEL_INTERVAL_MS)
    }
  }

  fun isRecording(): Boolean = recorder != null

  /** Throws on a busy or missing microphone; the caller turns that into a rejected promise. */
  fun startRecording(): String {
    if (recorder != null) throw IllegalStateException("already recording")

    val target = File(reactContext.cacheDir, "voice_${System.currentTimeMillis()}.m4a")
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
      created.prepare()
      created.start()
    } catch (err: Exception) {
      // A half-configured recorder still owns the mic until it is released.
      try {
        created.release()
      } catch (_: Exception) {
      }
      target.delete()
      throw err
    }

    recorder = created
    recordingFile = target
    startedAt = SystemClock.elapsedRealtime()
    handler.post(levelTick)
    return Uri.fromFile(target).toString()
  }

  /**
   * Returns null when the recording is too short to hold audio. MediaRecorder writes the MP4
   * container on stop, and stopping within a few dozen milliseconds of start throws instead,
   * leaving a zero-byte file that the server would reject as an empty upload.
   */
  fun stopRecording(): WritableMap? {
    val active = recorder ?: return null
    val file = recordingFile
    handler.removeCallbacks(levelTick)
    recorder = null
    recordingFile = null

    val elapsed = SystemClock.elapsedRealtime() - startedAt
    var usable = true
    try {
      active.stop()
    } catch (_: RuntimeException) {
      usable = false
    } finally {
      try {
        active.release()
      } catch (_: Exception) {
      }
    }

    if (file == null) return null
    if (!usable || !file.exists() || file.length() == 0L) {
      file.delete()
      return null
    }

    val result = Arguments.createMap()
    result.putString("uri", Uri.fromFile(file).toString())
    result.putDouble("durationMs", elapsed.toDouble())
    result.putDouble("sizeBytes", file.length().toDouble())
    return result
  }

  /** Discards the take. Used by slide-to-cancel, and on teardown so the mic is never held. */
  fun cancelRecording() {
    val active = recorder ?: return
    handler.removeCallbacks(levelTick)
    recorder = null
    val file = recordingFile
    recordingFile = null
    try {
      active.stop()
    } catch (_: RuntimeException) {
      // Nothing was written; releasing is all that matters.
    } finally {
      try {
        active.release()
      } catch (_: Exception) {
      }
    }
    file?.delete()
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

  /** Called when the JS context goes away: neither the mic nor the speaker may outlive it. */
  fun teardown() {
    cancelRecording()
    releasePlayer()
  }
}
