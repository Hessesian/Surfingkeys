module.exports = {
    testEnvironment: 'jsdom',
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/e2e/'],
    clearMocks: true,
    collectCoverage: true,
    collectCoverageFrom: ['src/**/*.{ts,js}'],
    setupFilesAfterEnv: ['<rootDir>/config/jest/afterEnv.js'],
    globalSetup: '<rootDir>/config/jest/globalSetup.js',
    globalTeardown: '<rootDir>/config/jest/globalTeardown.js',
};
