// Web-only Metro config. The Android build keeps metro.config.js untouched: Expo's default
// config is the one that knows how to resolve package exports per platform (a package that
// ships both native sources and a .web build needs the browser conditions AND the platform
// extensions, and getting one without the other pulls react-native's TurboModule specs into
// the browser bundle).
const { getDefaultConfig } = require('@expo/metro-config');

const expoPackageJson = require.resolve('expo/package.json');

const config = getDefaultConfig(__dirname);

const previousResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Metro prefers `file.native.ts` over `file.ts` on every platform, web included, and a
  // package that ships an unsuffixed web implementation next to a native one therefore
  // resolves the native path and drags react-native's TurboModules into the browser bundle.
  const webContext = platform === 'web' ? { ...context, preferNativePlatform: false } : context;
  // Running metro directly skips the alias that `expo export` injects for the web target.
  if (platform === 'web' && moduleName === 'react-native') {
    return webContext.resolveRequest(webContext, 'react-native-web', platform);
  }
  // Native-only: the alias keeps Expo.fx out of the app bundle, but on web the umbrella is
  // what installs the expo runtime globals (SharedObject and friends) the modules read.
  if (moduleName === 'expo' && platform !== 'web') {
    return webContext.resolveRequest(
      { ...webContext, originModulePath: expoPackageJson },
      'expo-modules-core',
      platform,
    );
  }
  return previousResolveRequest
    ? previousResolveRequest(webContext, moduleName, platform)
    : webContext.resolveRequest(webContext, moduleName, platform);
};

module.exports = config;
