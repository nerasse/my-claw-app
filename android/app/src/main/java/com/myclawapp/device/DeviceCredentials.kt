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

object DeviceCredentials {
  private const val PREFS = "claw_device"
  private const val KEY_DEVICE_ID = "device_id"
  private const val KEY_TOKEN = "device_token"
  private const val KEYSTORE_ALIAS = "claw_device_key"
  private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
  private const val GCM_IV_BYTES = 12
  private const val GCM_TAG_BITS = 128

  fun deviceId(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.getString(KEY_DEVICE_ID, null)?.let { return it }
    val id = "dev-" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 12)
    prefs.edit().putString(KEY_DEVICE_ID, id).apply()
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
    prefs.edit()
      .putString(KEY_DEVICE_ID, deviceId)
      .putString(KEY_TOKEN, encrypted)
      .apply()
    return true
  }

  fun token(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val stored = prefs.getString(KEY_TOKEN, null)
    if (stored != null) {
      val decrypted = decrypt(stored)
      if (decrypted != null) return decrypted
      prefs.edit().remove(KEY_TOKEN).apply()
    }
    val token = randomToken()
    encrypt(token)?.let { encrypted ->
      prefs.edit().putString(KEY_TOKEN, encrypted).apply()
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
