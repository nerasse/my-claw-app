const path = require('path');
const worklets = require('react-native-worklets/jest/resolver');

const commonNative = new Set(['notifications', 'serverUrl', 'apns'].map(name => path.resolve(__dirname, '..', 'src/core', name)));

commonNative.add(path.resolve(__dirname, '..', 'src/app/NotificationsScreen'));

module.exports = (request, options) => {
  const target = path.resolve(options.basedir, request);
  if (commonNative.has(target)) return `${target}.${target.endsWith('NotificationsScreen') ? 'tsx' : 'ts'}`;
  return worklets(request, options);
};
