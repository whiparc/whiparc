import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// Smoke tests drive the web app only; no API is needed. Locally the dev server
// is reused if one is already running. In CI the app is built by the previous
// step and served with `next start`.
export default defineConfig({
  testDir: "./e2e",
  // The first request to each route compiles it in dev mode, which can be slow.
  timeout: process.env.CI ? 30_000 : 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Set PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome instead of
    // downloading Playwright's Chromium.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
