/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    // `cookie` (used by fastify.inject via light-my-request) ships ESM-only; transpile it for Jest's CJS runtime.
    '^.+/node_modules/cookie/.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true }, isolatedModules: true }],
  },
  transformIgnorePatterns: ['/node_modules/(?!cookie/)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/worker.ts', '!src/workflows/index.ts'],
  clearMocks: true,
};
