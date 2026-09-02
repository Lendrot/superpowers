import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Simulations- und Golden-Tests fahren hunderte Runden; 30 s ist grosszuegig
    // genug, damit ein langsamer CI-Runner keinen falschen Fehlschlag erzeugt.
    testTimeout: 30_000,
  },
});
