/**
 * @format
 */

// The web entry, unlike index.js, boots the Expo runtime first: `expo` installs the globals
// (SharedObject and the module registry) that expo-video and friends read at import time. On
// native those come from the native runtime, which is why index.js does not need this.
import '@expo/metro-runtime';
import 'expo';

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

// The service worker carries the installable shell and the push notifications. It only exists
// in a secure context, so registration is attempted rather than assumed: on a plain-HTTP origin
// `serviceWorker` is undefined and the app runs without either.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  rootTag: document.getElementById('root'),
});
