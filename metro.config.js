
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// The locked camera/video/push modules use Expo's renamed requireNativeView export.
// Keep this native contract while excluding Expo.fx and its optional autolinked modules.
const expoNative = require('path').resolve(__dirname, 'src/core/expoNative.ts');

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
        return { type: 'sourceFile', filePath: expoNative };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
