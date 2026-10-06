package com.myclawapp

import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.myclawapp.device.HardwareKeys
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    setTheme(R.style.AppTheme)
    super.onCreate(null)
  }

  /** A physical keyboard's shortcuts, before the views see the keys -- HardwareKeys. */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
      HardwareKeys.dispatch(this, event) || super.dispatchKeyEvent(event)

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    HardwareKeys.touched()
    return super.dispatchTouchEvent(event)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MyClawApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
      )
}
