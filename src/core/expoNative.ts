// Expo's native view export is renamed in its umbrella entry point. Preserve that
// contract without importing Expo.fx and its unlinked optional native modules.
export * from 'expo-modules-core';
export { requireNativeViewManager as requireNativeView } from 'expo-modules-core';
