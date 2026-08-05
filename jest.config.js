module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Rendering the whole app through react-test-renderer costs seconds on a cold transform
  // cache; the 5s default turned a slow CI runner into a red build.
  testTimeout: 30000,
};
