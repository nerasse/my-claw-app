package com.myclawapp.device

import android.app.Activity
import android.view.KeyEvent
import android.view.View
import android.widget.EditText
import com.facebook.react.bridge.Arguments

/**
 * A physical keyboard (Bluetooth, DeX) on Android -- docs/keyboard.md.
 *
 * React Native hands a page no key events, so the shortcuts the shell binds (`useHotkeys`) are
 * caught here, in the activity, and sent to JS as `claw:hotkey`. The decision to take a key has to
 * be made now, while Android waits for the answer, so JS registers the combos it binds and this
 * takes exactly those; everything else (arrows, Tab, Enter) goes on to Android's own focus.
 *
 * The rule is the web's: a Shift letter, `/` and `?` type while a text field has the keyboard,
 * only Ctrl combos and Escape are taken there.
 */
object HardwareKeys {
  @Volatile
  private var combos: Set<String> = emptySet()

  /** Key codes whose down was taken: their up is taken too, or Escape's up would also go back. */
  private val taken = mutableSetOf<Int>()

  fun register(list: List<String>) {
    combos = list.toSet()
  }

  /**
   * The last thing the owner did was a physical key, not a touch. Android's touch mode says the
   * same thing too late: a shortcut letter does not leave it (only the arrows and Tab do), so a menu
   * opened with ⇧? right after a tap would not take the focus.
   */
  @Volatile
  private var keyboardLast = false

  fun touched() {
    keyboardLast = false
  }

  /** True when the key was a shortcut, and went to JS. */
  fun dispatch(activity: Activity, event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_UP) return taken.remove(event.keyCode)
    if (event.action != KeyEvent.ACTION_DOWN) return false
    // The soft keyboard commits text; its rare key events are not shortcuts.
    val device = event.device ?: return false
    if (device.isVirtual) return false
    keyboardLast = true
    val combo = comboOf(event) ?: return false
    if (combo !in combos) return false
    val typing = activity.currentFocus is EditText
    if (typing && !combo.startsWith("mod+") && combo != "escape" && combo != "shift+escape") return false
    taken.add(event.keyCode)
    if (event.repeatCount == 0) {
      DeviceBus.emit("claw:hotkey", Arguments.createMap().apply { putString("combo", combo) })
    }
    return true
  }

  /** What had the focus before a menu took it, so closing the menu gives it back. */
  private val returnTo = ArrayDeque<java.lang.ref.WeakReference<View?>>()

  /**
   * A menu opened from the keyboard takes the focus (its first row, or the option in effect), the
   * web's rule. Opened by a tap, nothing moves.
   */
  fun focusIfKeyboard(view: View) {
    if (!keyboardLast) return
    // FromTouch: leaves touch mode first, which a plain requestFocus cannot do.
    view.requestFocusFromTouch()
  }

  /** Called once per menu opened, whatever the mode, so every close pops its own opener. */
  fun rememberOpener(activity: Activity) {
    returnTo.addLast(java.lang.ref.WeakReference(activity.currentFocus))
  }

  /** The menu is gone: the focus goes back to what opened it, when that is still on screen. */
  fun restoreFocus() {
    val opener = returnTo.removeLastOrNull()?.get() ?: return
    if (keyboardLast && opener.isAttachedToWindow) opener.requestFocus()
  }

  /** The web's spelling (`hotkeys.web.ts`): `mod+`, `alt+`, `shift+`, then the key, lower case. */
  fun comboOf(event: KeyEvent): String? {
    val key = when (event.keyCode) {
      KeyEvent.KEYCODE_ESCAPE -> "escape"
      KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "enter"
      KeyEvent.KEYCODE_TAB -> "tab"
      else -> {
        // The character the layout gives with Shift alone, as `KeyboardEvent.key` does: Ctrl+K
        // is `k`, and Shift+/ is `?` on QWERTY.
        val char = event.getUnicodeChar(event.metaState and (KeyEvent.META_SHIFT_MASK or KeyEvent.META_CAPS_LOCK_ON))
        if (char == 0 || Character.isISOControl(char)) return null
        String(Character.toChars(char)).lowercase()
      }
    }
    val mod = if (event.isCtrlPressed || event.isMetaPressed) "mod+" else ""
    val alt = if (event.isAltPressed) "alt+" else ""
    val shift = if (event.isShiftPressed) "shift+" else ""
    return "$mod$alt$shift$key"
  }
}
