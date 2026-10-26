import { defineConfig, devices } from "@playwright/test";

const pnpm = process.platform === "win32" ? "npx.cmd --yes pnpm@10.26.0" : "pnpm";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "**/*.live.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    baseURL: "http://127.0.0.1:3000",
    locale: "en-CA",
    timezoneId: "America/Toronto",
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${pnpm} --filter @jesus-in-practice/website start`,
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `${pnpm} --filter @jesus-in-practice/dashboard start`,
      url: "http://127.0.0.1:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
