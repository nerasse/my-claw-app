import UIKit
import MyClawNativeAdapters
internal import Expo
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  private var launchOptions: [UIApplication.LaunchOptionsKey: Any]?
#if DEBUG
  private var fixtureProxy: DebugFixtureProxy?
#endif

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if DEBUG
    fixtureProxy = DebugFixtureProxy.startIfRequested()
#endif
    IOSNotifications.shared.prepare()
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    self.launchOptions = launchOptions

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func attach(_ window: UIWindow, options: UIScene.ConnectionOptions) {
    guard let factory = reactNativeFactory else {
      preconditionFailure("React Native must be prepared before the window scene connects")
    }
    self.window = window
    var initialOptions = launchOptions ?? [:]
    if let context = options.urlContexts.first { initialOptions[.url] = context.url }
    if let activity = options.userActivities.first {
      initialOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityKey": activity,
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
      ]
    }
    if let response = options.notificationResponse {
      IOSNotifications.shared.handleSceneResponse(response)
    }
    factory.startReactNative(withModuleName: "MyClawApp", in: window, launchOptions: initialOptions)
  }
  override func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    IOSNotifications.shared.registered(deviceToken)
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }
  override func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    IOSNotifications.shared.failed()
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene,
      let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
    let window = UIWindow(windowScene: scene)
    self.window = window
    delegate.attach(window, options: options)
    window.makeKeyAndVisible()
  }

  // Expo's locked version exposes app delegate subscribers; forward the single window's
  // scene callbacks because UIKit no longer invokes these app delegate callbacks.
  func sceneDidBecomeActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidBecomeActive(UIApplication.shared)
  }
  func sceneWillResignActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillResignActive(UIApplication.shared)
  }
  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidEnterBackground(UIApplication.shared)
  }
  func sceneWillEnterForeground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillEnterForeground(UIApplication.shared)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
