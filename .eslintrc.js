module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Jest globals live only in the test runner, not in the bundle.
      files: ['jest.setup.js', '__tests__/**/*.{js,ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
      env: { jest: true },
    },
  ],
};
