import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests against Co-farer on plain workerd (docs/MIGRATION.md,
 * Phase 2e), no DeepSpace servers. Playwright builds the app and starts its
 * own workerd on port 8791 (so it never touches a dev server on 8080), with a
 * fresh data folder (.workerd-data/e2e) every run and the test-only sign-in
 * turned on (ALLOW_TEST_AUTH=true, set by scripts/workerd-run.mjs locally;
 * never on the server).
 *
 *   npm test                  all specs
 *   npm test -- core.spec     one file
 */
const PORT = Number(process.env.E2E_PORT ?? 8791)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    command: `npm run build && node scripts/workerd-run.mjs --port=${PORT} --data=e2e --fresh`,
    cwd: '..',
    // Ready once the worker answers its own auth route (not just the socket).
    url: `${BASE_URL}/api/auth/get-session`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
