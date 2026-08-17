module.exports = {
  root: true,
  // Build output: bundled code is not source, and linting 3 MB of it says nothing.
  ignorePatterns: ['dist-web/', 'android/', 'ios/'],
  extends: '@react-native',
  overrides: [
    {
      // The service worker runs in a worker scope: `self` is its global, and it is never
      // bundled with the app.
      files: ['web/sw.js'],
      env: { serviceworker: true, browser: true },
      parserOptions: { sourceType: 'script' },
    },
    {
      // Jest globals live only in the test runner, not in the bundle.
      files: ['jest.setup.js', 'jest.after.js', '__tests__/**/*.{js,ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
      env: { jest: true },
    },
  ],
};
