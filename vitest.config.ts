import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: [
      // `server-only` throws unless the bundler resolves the `react-server`
      // condition, which plain Vitest does not. Tests import server modules
      // directly, so map it to the package's own no-op entry point.
      { find: /^server-only$/, replacement: new URL('./tests/stubs/server-only.ts', import.meta.url).pathname },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
