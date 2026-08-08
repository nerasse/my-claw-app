
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// expo-unified-push imports { NativeModule, requireNativeModule } from 'expo'. Both live in
// expo-modules-core; the 'expo' umbrella only adds side effects we do not use (Expo.fx pulls
// expo-asset, log-box, dom-webview...). Resolving 'expo' straight to expo-modules-core keeps
// those out of the bundle, which is what lets package.json exclude them from autolinking too.
const expoPackageJson = require.resolve('expo/package.json');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'expo') {
        // Resolved from inside the expo package so node resolution finds its nested copy.
        return context.resolveRequest(
          { ...context, originModulePath: expoPackageJson },
          'expo-modules-core',
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
