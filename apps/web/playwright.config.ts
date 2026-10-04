import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the REAL app against a REAL local chain with the REAL contracts.
 * Prereq (once per run):  powershell -File scripts/dev-chain.ps1     (fresh Anvil + deploy)
 * Then:                   pnpm --filter @mohar/web e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile.spec.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm build && pnpm exec next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 240_000,
    env: { NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3100", NEXT_DIST_DIR: ".next-e2e" },
  },
});
