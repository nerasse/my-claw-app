module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The gesture engine and the zoom library ship untranspiled ESM; without them in the
  // allow-list babel-jest refuses to parse the import chain of the app. marked is a direct
  // parse target of the markdown safety tests (zero-dependency ESM).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-gesture-handler|react-native-reanimated|react-native-worklets|@likashefqet/react-native-image-zoom|marked)/)',
  ],
  // Rendering the whole app through react-test-renderer costs seconds on a cold transform
  // cache; the 5s default turned a slow CI runner into a red build.
  testTimeout: 30000,
};
