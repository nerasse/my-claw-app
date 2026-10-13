package com.myclawapp.device

import android.content.Context
import android.net.Uri
import dev.djara.expounifiedpush.NotificationContent
import dev.djara.expounifiedpush.PushPayloadRenderer
import org.json.JSONObject

/**
 * The module's own payload, with the server it came from added to the link (docs/servers.md).
 *
 * Each server profile registers its own UnifiedPush instance, named after the profile, so a
 * notification of a server the app is not on still arrives; the tap has to say which server, or
 * it would open a conversation id on the wrong one. The id stays the server's: it is how the app
 * dismisses a notification later, from the link without the parameter.
 */
class ClawPushRenderer : PushPayloadRenderer {
  override fun render(context: Context, instance: String, decrypted: String): NotificationContent? {
    val data = runCatching { JSONObject(decrypted) }.getOrNull() ?: return null
    if (!data.has("id")) return null
    val url = data.optString("url").takeIf { it.isNotEmpty() }
    return NotificationContent(
      id = data.getLong("id").toInt(),
      title = data.optString("title").takeIf { data.has("title") },
      body = data.optString("body").takeIf { data.has("body") },
      imageUrl = data.optString("imageUrl").takeIf { data.has("imageUrl") },
      number = if (data.has("number")) data.optInt("number") else null,
      silent = if (data.has("silent")) data.optBoolean("silent") else null,
      type = data.optString("type").takeIf { data.has("type") },
      url = url?.let { withServer(it, instance) },
    )
  }

  private fun withServer(url: String, instance: String): String {
    if (instance.isEmpty() || !url.startsWith("myclaw://")) return url
    return "$url${if (url.contains('?')) '&' else '?'}server=${Uri.encode(instance)}"
  }
}
