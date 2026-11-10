import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The WASM AAC encoder is only reached through a dynamic import; pre-bundle it with mediabunny up front so the
  // dev server does not re-optimise (and reload the page) on first use, and both share one mediabunny instance.
  optimizeDeps: { include: ['mediabunny', '@mediabunny/aac-encoder'] },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
