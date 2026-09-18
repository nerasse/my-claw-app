package com.myclawapp.device

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.IOException
import java.util.Locale

/** Which of the two notification sounds a choice belongs to: the ordinary one or the ring. */
enum class SoundUsage(val key: String, val prefix: String, val title: String, val label: String) {
  ORDINARY("ordinary", "runs", "Runs", "Notification sound"),
  RING("ring", "ring", "Ring", "Ring sound");

  companion object {
    fun from(key: String?): SoundUsage? = entries.firstOrNull { it.key == key }
  }
}

/** One usage's chosen sound: the system default, silent (ordinary only), or a specific uri. */
data class SoundChoice(val kind: String, val uri: Uri?, val name: String) {
  companion object {
    val Default = SoundChoice("default", null, "")
    val Silent = SoundChoice("silent", null, "")
    fun of(uri: Uri, name: String) = SoundChoice("uri", uri, name)
  }
}

/** An imported audio file, as the settings list shows it. */
data class ImportedSound(val uri: Uri, val name: String, val size: Long)

/**
 * The sounds the owner picked for the two notification usages, and the Android channels derived
 * from them.
 *
 * Android freezes a channel at the first creation and resurrects a deleted one with its old
 * settings, so a sound change cannot be an update: it is a new channel, named from the choice,
 * with the old one deleted. The name is therefore a wire contract -- the server publishes on the
 * name the device reports (docs/notifications.md) -- and it has to be stable across boots, which
 * is why this object is the only place that reads the stored choice and derives anything.
 *
 * It is called from both sides that must agree: `MainApplication` at boot, where the channels
 * have to exist before the push renderer can post to them, and `DeviceBridgeModule` after every
 * change. Preferences, not JS: the boot half runs with no JS runtime at all.
 */
object NotificationSounds {
  private const val PREFS = "claw_notification_sounds"
  private const val DIR = "notification-sounds"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // --- choices -----------------------------------------------------------------------------

  fun choice(context: Context, usage: SoundUsage): SoundChoice {
    val store = prefs(context)
    val raw = store.getString(usage.key, "default") ?: "default"
    return when (raw) {
      "default" -> SoundChoice.Default
      "silent" -> SoundChoice.Silent
      else -> SoundChoice("uri", Uri.parse(raw), store.getString("${usage.key}.name", "") ?: "")
    }
  }

  fun setChoice(context: Context, usage: SoundUsage, choice: SoundChoice) {
    val editor = prefs(context).edit()
    if (choice.kind == "uri") {
      editor.putString(usage.key, choice.uri.toString())
      editor.putString("${usage.key}.name", choice.name)
    } else {
      editor.putString(usage.key, choice.kind)
      editor.remove("${usage.key}.name")
    }
    editor.apply()
  }

  // --- derivation --------------------------------------------------------------------------

  /**
   * The channel name a choice publishes on. The default keeps the names every device had before
   * it could choose (`runs` / `ring`), so a boot with no choice creates exactly what exists. Any
   * other choice appends eight hex digits of the choice itself.
   *
   * The hash covers the usage as well as the uri: the same file picked for both usages plays in
   * two channels that freeze different behaviour (the ring vibrates long), and one name cannot
   * hold both. FNV-1a over UTF-16 code units, like the notification ids, folded to 8 lowercase
   * hex digits -- which keeps the name inside the grammar the server enforces
   * (`^[a-z][a-z0-9_-]{0,40}$`, validChannelName in the server's notifications/push.ts).
   */
  fun channelName(context: Context, usage: SoundUsage): String {
    val choice = choice(context, usage)
    if (choice.kind == "default") return usage.prefix
    val spec = if (choice.kind == "silent") "${usage.key}|silent" else "${usage.key}|${choice.uri}"
    return "${usage.prefix}-${hash8(spec)}"
  }

  private fun hash8(input: String): String {
    var hash = 0x811c9dc5.toInt()
    for (ch in input) {
      hash = hash xor ch.code
      hash *= 0x01000193
    }
    return String.format(Locale.US, "%08x", hash)
  }

  /** The id the UnifiedPush renderer computes from the payload's `type`. */
  private fun channelId(context: Context, name: String): String =
    "${context.packageName}:unified_push_channel:$name"

  // --- applying ----------------------------------------------------------------------------

  /**
   * Creates the channel the current choice names and deletes the one it replaced, for both
   * usages. The single create/delete path, called at boot and after every change: the previous
   * name is remembered in the same preferences, so a boot with an unchanged choice is a create
   * that is a no-op plus a delete that never fires.
   */
  fun applyChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val store = prefs(context)
    for (usage in SoundUsage.entries) {
      val name = channelName(context, usage)
      ensureChannel(context, manager, usage, name)
      val previous = store.getString("${usage.key}.channel", null)
      if (previous != null && previous != name) {
        manager.deleteNotificationChannel(channelId(context, previous))
      }
      store.edit().putString("${usage.key}.channel", name).apply()
    }
  }

  private fun ensureChannel(
    context: Context,
    manager: NotificationManager,
    usage: SoundUsage,
    name: String,
  ) {
    val choice = choice(context, usage)
    // IMPORTANCE_HIGH is the whole reason the channels are pre-created (docs/notifications.md):
    // the renderer's own creation is IMPORTANCE_DEFAULT, which never shows a banner, and the
    // first creation is the only one that counts.
    val channel = NotificationChannel(channelId(context, name), usage.title, NotificationManager.IMPORTANCE_HIGH)
    when (choice.kind) {
      "silent" -> channel.setSound(null, null)
      "uri" -> {
        val uri = choice.uri
        if (uri != null) {
          if (isImported(context, uri)) grantToPlayer(context, uri)
          channel.setSound(uri, attributes())
        }
      }
      // The default: nothing set, so the system's own notification sound plays. The ring's
      // default is the alarm tone, on the notification stream like any other notification sound
      // -- the phone's mode decides what it does (the owner was explicit).
      else -> if (usage == SoundUsage.RING) {
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), attributes())
      }
    }
    if (usage == SoundUsage.RING) {
      channel.enableVibration(true)
      channel.vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
    }
    manager.createNotificationChannel(channel)
  }

  private fun attributes(): AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  /**
   * The system plays a channel's sound from another process -- SystemUI on current releases,
   * system_server on the older ones this app still supports -- which holds no permission over
   * this app's provider. Without a grant the player logs "error loading sound" and the
   * notification arrives silently, which is invisible to everyone. A grant does not survive a
   * reboot, so every apply re-grants for the current choice; the renderer starts this process
   * before it plays anything, so the boot half covers a notification that wakes a killed app.
   */
  private fun grantToPlayer(context: Context, uri: Uri) {
    for (pkg in listOf("com.android.systemui", "android")) {
      try {
        context.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      } catch (_: Exception) {
        // A package that does not exist on this build has nothing to receive the grant.
      }
    }
  }

  // --- picker ------------------------------------------------------------------------------

  fun defaultUri(usage: SoundUsage): Uri = RingtoneManager.getDefaultUri(
    if (usage == SoundUsage.RING) RingtoneManager.TYPE_ALARM else RingtoneManager.TYPE_NOTIFICATION,
  )

  /**
   * The system picker for one usage. "Silent" is offered to the ordinary sound only: the ring
   * exists to be heard, and a silent ring is a contradiction the owner asked us to refuse.
   * The default URI is passed explicitly so the picker previews the real default and hands back
   * exactly the constant we recognize.
   */
  fun pickerIntent(context: Context, usage: SoundUsage): Intent {
    val intent = Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, if (usage == SoundUsage.RING) RingtoneManager.TYPE_ALARM else RingtoneManager.TYPE_NOTIFICATION)
    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, usage == SoundUsage.ORDINARY)
    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, defaultUri(usage))
    intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, usage.label)
    val existing = choice(context, usage)
    when (existing.kind) {
      "default" -> intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, defaultUri(usage))
      "uri" -> intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, existing.uri)
      // Silent: no existing uri, which is what pre-checks the Silent item.
    }
    return intent
  }

  /**
   * The picker's answer. Null is "Silent" (only offered for the ordinary sound, where it is the
   * legitimate answer); the usage's own default URI is "Default"; anything else is a specific
   * sound. Comparison ignores a user id a picker may append, which would otherwise turn a
   * picked default into a specific choice.
   */
  fun fromPicker(context: Context, usage: SoundUsage, picked: Uri?): SoundChoice = when {
    picked == null -> if (usage == SoundUsage.ORDINARY) SoundChoice.Silent else SoundChoice.Default
    sameUri(picked, defaultUri(usage)) -> SoundChoice.Default
    else -> SoundChoice.of(picked, title(context, picked))
  }

  private fun title(context: Context, uri: Uri): String = try {
    RingtoneManager.getRingtone(context, uri)?.getTitle(context)?.takeIf { it.isNotBlank() }
      ?: uri.lastPathSegment ?: uri.toString()
  } catch (_: Exception) {
    uri.lastPathSegment ?: uri.toString()
  }

  private fun sameUri(a: Uri?, b: Uri?): Boolean {
    if (a == null || b == null) return a == b
    return withoutUserId(a) == withoutUserId(b)
  }

  /**
   * The uri as written, with any `@<userId>` a picker may have attached to the authority removed,
   * so a default handed back with the user on it still reads as the default. The platform's own
   * helper for this (ContentProvider.getUriWithoutUserId) is hidden from the SDK.
   */
  private fun withoutUserId(uri: Uri): String {
    val authority = uri.authority ?: return uri.toString()
    val cutoff = authority.lastIndexOf('@')
    if (cutoff < 0) return uri.toString()
    return uri.buildUpon().authority(authority.substring(cutoff + 1)).build().toString()
  }

  /** What the preview button plays: null is the silent choice, where there is nothing to play. */
  fun previewUri(context: Context, usage: SoundUsage): Uri? {
    val choice = choice(context, usage)
    return when (choice.kind) {
      "silent" -> null
      "uri" -> choice.uri
      else -> defaultUri(usage)
    }
  }

  // --- imported files ----------------------------------------------------------------------

  private fun folder(context: Context): File = File(context.filesDir, DIR)

  /**
   * Copies the picked document into the app's own folder. The copy is the point: the document
   * uri belongs to another provider and may be a one-shot grant, while the sound has to be
   * readable by the player long after -- hence the FileProvider the copy is served through.
   * The display name rides along for the settings list and the row labels; the file on disk gets
   * a sanitised name (uniqueness included) because it becomes a path.
   */
  fun importSound(context: Context, source: Uri): ImportedSound {
    var display = "sound"
    context.contentResolver.query(source, null, null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0) cursor.getString(index)?.let { if (it.isNotBlank()) display = it }
      }
    }
    val target = uniqueTarget(folder(context), sanitize(display))
    context.contentResolver.openInputStream(source)?.use { input ->
      target.outputStream().use { output -> input.copyTo(output) }
    } ?: throw IOException("cannot open the picked file")
    return ImportedSound(providerUri(context, target), display, target.length())
  }

  fun listImported(context: Context): List<ImportedSound> =
    folder(context).listFiles()
      ?.filter { it.isFile }
      ?.sortedBy { it.name.lowercase(Locale.US) }
      ?.map { ImportedSound(providerUri(context, it), it.name, it.length()) }
      ?: emptyList()

  /**
   * Deletes one imported file. A usage currently pointing at it falls back to the default: a
   * choice can only survive while the file it names does. Returns false for a uri that is not
   * one of ours -- the caller answers that as an error rather than deleting something else.
   */
  fun deleteImported(context: Context, uri: Uri): Boolean {
    val name = importedName(context, uri) ?: return false
    val root = folder(context)
    val file = File(root, name)
    if (file.canonicalFile.parentFile != root.canonicalFile) return false
    file.delete()
    for (usage in SoundUsage.entries) {
      val choice = choice(context, usage)
      if (choice.kind == "uri" && sameUri(choice.uri, uri)) {
        setChoice(context, usage, SoundChoice.Default)
      }
    }
    return true
  }

  private fun importedName(context: Context, uri: Uri): String? {
    if (uri.scheme != "content") return null
    if (uri.authority != providerAuthority(context)) return null
    if (uri.pathSegments.firstOrNull() != DIR) return null
    return uri.lastPathSegment?.takeIf { it.isNotEmpty() }
  }

  private fun providerAuthority(context: Context): String = "${context.packageName}.fileprovider"

  private fun providerUri(context: Context, file: File): Uri =
    FileProvider.getUriForFile(context, providerAuthority(context), file)

  private fun isImported(context: Context, uri: Uri): Boolean = importedName(context, uri) != null

  private fun sanitize(name: String): String {
    val base = name.substringAfterLast('/').substringAfterLast('\\').trim()
    val cleaned = base.replace(Regex("[^A-Za-z0-9._ -]"), "_").trim('.', ' ')
    return cleaned.ifBlank { "sound" }.take(80)
  }

  private fun uniqueTarget(root: File, name: String): File {
    if (!root.exists() && !root.mkdirs()) throw IOException("cannot create ${root.name}")
    val dot = name.lastIndexOf('.')
    val stem = if (dot > 0) name.substring(0, dot) else name
    val extension = if (dot > 0) name.substring(dot) else ""
    var candidate = File(root, name)
    var index = 1
    while (candidate.exists()) {
      candidate = File(root, "$stem-$index$extension")
      index += 1
    }
    return candidate
  }

  // --- state -------------------------------------------------------------------------------

  /** The whole selection plus the derived channel names, as the settings page and the wire see it. */
  fun state(context: Context): WritableMap {
    val map = Arguments.createMap()
    for (usage in SoundUsage.entries) map.putMap(usage.key, choiceMap(choice(context, usage)))
    val channels = Arguments.createMap()
    channels.putString(SoundUsage.ORDINARY.key, channelName(context, SoundUsage.ORDINARY))
    channels.putString(SoundUsage.RING.key, channelName(context, SoundUsage.RING))
    map.putMap("channels", channels)
    return map
  }

  private fun choiceMap(choice: SoundChoice): WritableMap {
    val map = Arguments.createMap()
    map.putString("kind", choice.kind)
    if (choice.kind == "uri") {
      map.putString("uri", choice.uri?.toString() ?: "")
      map.putString("name", choice.name)
    }
    return map
  }
}
