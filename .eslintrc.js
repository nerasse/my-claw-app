module.exports = {
  root: true,
  // Build output: bundled code is not source, and linting 3 MB of it says nothing.
  // The three harness folders are previews, not the app: a comparison screen sizes its boxes with
  // inline styles on purpose and imports the icons it draws, and they are neither bundled nor
  // shipped. `npm run lint` runs `eslint .`, so covering them made CI red for eight runs over
  // inline heights in a throwaway file while every real suite was green (found 2026-11-05).
  ignorePatterns: [
    'dist-web/',
    'android/',
    'ios/',
    'scripts/compare/',
    'scripts/chrome-sheet/',
    'scripts/voice-recorder-e2e/',
  ],
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
