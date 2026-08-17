module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Runs once the test framework exists, which is what a global beforeEach needs.
  setupFilesAfterEnv: ['<rootDir>/jest.after.js'],
  // The worklets babel plugin compiles in a native unpacker at build time; under Jest its
  // `.native` implementations are redirected to the plain ones, which is what the official
  // resolver does (reanimated 4 + worklets render through the worklets-native path).
  resolver: 'react-native-worklets/jest/resolver',
  // The gesture engine and the zoom library ship untranspiled ESM; without them in the
  // allow-list babel-jest refuses to parse the import chain of the app. marked is a direct
  // parse target of the markdown safety tests (zero-dependency ESM).
  //
  // expo-camera is deliberately NOT here: transforming the expo sources drags the native winter
  // runtime into the test process and breaks every suite. It is mocked instead (__mocks__/).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-sortables|@likashefqet/react-native-image-zoom|marked)/)',
  ],
  // Rendering the whole app through react-test-renderer costs seconds on a cold transform
  // cache; the 5s default turned a slow CI runner into a red build.
  testTimeout: 30000,
};
