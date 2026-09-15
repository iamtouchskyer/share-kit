import { defineConfig } from '@playwright/test';
import path from 'node:path';

// The config lives in tests/, so the webServer must be told to run from the repo
// root — otherwise `node tests/server.js` resolves to tests/tests/server.js.
const ROOT = path.resolve(import.meta.dirname, '..');

const PORT = Number(process.env.SK_TEST_PORT || 8817);

export default defineConfig({
  testDir: import.meta.dirname,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `node tests/server.js ${PORT}`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/tests/harness.html`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
