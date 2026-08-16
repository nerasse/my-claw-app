/**
 * expo-camera is a native module: the tests render the screens that embed it, and the real
 * package pulls the expo winter runtime into the Jest process. What matters here is that the
 * scanner mounts and hands a code back, not that a camera opens.
 */
const React = require('react');

const CameraView = () => React.createElement('CameraView', null);

const useCameraPermissions = () => [
  { granted: true, canAskAgain: true, status: 'granted' },
  jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
];

module.exports = { CameraView, useCameraPermissions };
