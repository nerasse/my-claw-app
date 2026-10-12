// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "MyClawNativeCore",
  platforms: [.iOS("16.4"), .macOS(.v13)],
  products: [
    .library(name: "MyClawNativeCore", targets: ["MyClawNativeCore"]),
    .library(name: "MyClawNativeAdapters", targets: ["MyClawNativeAdapters"])
  ],
  targets: [
    .target(name: "MyClawNativeCore"),
    .target(name: "MyClawNativeAdapters", dependencies: ["MyClawNativeCore"]),
    .testTarget(name: "MyClawNativeCoreTests", dependencies: ["MyClawNativeCore"]),
    .testTarget(name: "MyClawNativeAdaptersTests", dependencies: ["MyClawNativeCore", "MyClawNativeAdapters"])
  ]
)
