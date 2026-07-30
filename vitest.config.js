import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for browser-like environment
    environment: 'jsdom',

    // Setup files run before each test file
    setupFiles: ['./src/test/setup.js'],

    // Global test timeout
    testTimeout: 10000,

    // Include patterns
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist'
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/index.{js,jsx,ts,tsx}'
      ]
    },

    // Global variables available in tests
    globals: true,

    // Reporter for test output
    reporters: ['verbose'],

    // Pool options for parallel test execution
    pool: 'forks',

    // Mock CSS imports
    css: false
  },

  // Resolve aliases (match vite.config if needed)
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
