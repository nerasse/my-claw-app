const common = require('./jest.config');

module.exports = {
  ...common,
  resolver: 'react-native-worklets/jest/resolver',
  haste: { defaultPlatform: 'ios', platforms: ['android', 'ios', 'native'] },
  testMatch: ['<rootDir>/src/**/__tests__/*.ios.test.ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/'],
};
