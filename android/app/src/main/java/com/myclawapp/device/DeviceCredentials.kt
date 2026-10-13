package com.myclawapp.device

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * This device's credential on each server it uses (docs/servers.md). A credential belongs to a
 * server profile, not to an address: the same server reached on the LAN and over the VPN is one
 * profile, two servers are two. The active profile is the one every request presents.
 *
 * The first profile is `default`, which is also the UnifiedPush instance name of the registration
 * made before there were profiles: a phone updated from a single-server build keeps its pair and
 * its notifications without being asked anything.
 */
object DeviceCredentials {
  private const val PREFS = "claw_device"
  private const val KEY_DEVICE_ID = "device_id"
  private const val KEY_TOKEN = "device_token"
  private const val KEY_ACTIVE = "active_server"
  const val DEFAULT_SERVER = "default"
  private const val KEYSTORE_ALIAS = "claw_device_key"
  private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
  private const val GCM_IV_BYTES = 12
  private const val GCM_TAG_BITS = 128

  fun active(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ACTIVE, null) ?: DEFAULT_SERVER

  /** Which profile the next request presents. The connection service swaps its send queue with it. */
  fun setActive(context: Context, server: String) {
    if (server.isBlank()) return
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_ACTIVE, server).commit()
  }

  /** The default profile keeps the keys a single-server build wrote: nothing to migrate. */
  private fun idKey(server: String) = if (server == DEFAULT_SERVER) KEY_DEVICE_ID else "$KEY_DEVICE_ID@$server"
  private fun tokenKey(server: String) = if (server == DEFAULT_SERVER) KEY_TOKEN else "$KEY_TOKEN@$server"

  /** A server forgotten: its credential goes, so a later profile of the same name starts clean. */
  fun forget(context: Context, server: String) {
    if (server.isBlank() || server == active(context)) return
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .remove(idKey(server))
      .remove(tokenKey(server))
      .apply()
  }

  fun deviceId(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val key = idKey(active(context))
    prefs.getString(key, null)?.let { return it }
    val id = "dev-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12)
    prefs.edit().putString(key, id).apply()
    return id
  }

  /**
   * Adopts a device minted server-side (a CLI ticket claimed through the pairing socket). The
   * server is the source of truth for the pair, so an id minted here is replaced: the app must
   * present exactly what config.json holds. The token is encrypted exactly like a generated one.
   */
  fun adopt(context: Context, deviceId: String, token: String): Boolean {
    if (deviceId.isBlank() || token.isBlank()) return false
    val encrypted = encrypt(token) ?: return false
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val server = active(context)
    prefs.edit()
      .putString(idKey(server), deviceId)
      .putString(tokenKey(server), encrypted)
      .commit()
    return true
  }

  fun token(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val key = tokenKey(active(context))
    val stored = prefs.getString(key, null)
    if (stored != null) {
      val decrypted = decrypt(stored)
      if (decrypted != null) return decrypted
      prefs.edit().remove(key).apply()
    }
    val token = randomToken()
    encrypt(token)?.let { encrypted ->
      prefs.edit().putString(key, encrypted).apply()
    }
    return token
  }

  fun info(context: Context): Pair<String, String> = deviceId(context) to token(context)

  /**
   * The device credential, in headers: a URL is logged by every proxy on its way, and this token
   * opens everything. What must sit in a URL carries the server's media ticket instead.
   */
  fun applyTo(builder: okhttp3.Request.Builder, context: Context): okhttp3.Request.Builder {
    val (deviceId, token) = info(context)
    return builder.header("X-My-Claw-Device", deviceId).header("Authorization", "Bearer $token")
  }

  private fun randomToken(): String {
    val bytes = ByteArray(24)
    SecureRandom().nextBytes(bytes)
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  }

  private fun getKey(): SecretKey? {
    return try {
      val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
      (keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey) ?: run {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        generator.init(
          KeyGenParameterSpec.Builder(KEYSTORE_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build()
        )
        generator.generateKey()
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun encrypt(plain: String): String? {
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, getKey() ?: return null)
      val iv = cipher.iv
      val ciphertext = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(iv + ciphertext, Base64.NO_WRAP)
    } catch (e: Exception) {
      null
    }
  }

  private fun decrypt(encoded: String): String? {
    return try {
      val combined = Base64.decode(encoded, Base64.NO_WRAP)
      if (combined.size <= GCM_IV_BYTES) return null
      val iv = combined.copyOfRange(0, GCM_IV_BYTES)
      val ciphertext = combined.copyOfRange(GCM_IV_BYTES, combined.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, getKey() ?: return null, GCMParameterSpec(GCM_TAG_BITS, iv))
      String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    } catch (e: Exception) {
      null
    }
  }
}
