
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
// react-native-web replaces react-native wholesale on the web target. Metro resolves
// `file.web.tsx` over `file.tsx` on its own, which is what keeps the platform branches out of
// the 28k lines above the bridge.
const WEB_ALIASES = {
  'react-native': 'react-native-web',
};

const config = {
  resolver: {
    platforms: ['web', 'ios', 'android', 'native'],
    resolveRequest: (context, moduleName, platform) => {
      if (platform === 'web') {
        // Without this, a package that ships both sources and a web build resolves its
        // `react-native` entry, and its native TurboModule specs blow up at import time.
        const webContext = {
          ...context,
          unstable_conditionNames: ['browser', 'require', 'import'],
          mainFields: ['browser', 'module', 'main'],
        };
        const target = WEB_ALIASES[moduleName] ?? moduleName;
        return webContext.resolveRequest(webContext, target, platform);
      }
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
