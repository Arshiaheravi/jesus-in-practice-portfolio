import { defineConfig, devices } from "@playwright/test";

const pnpm = process.platform === "win32" ? "npx.cmd --yes pnpm@10.26.0" : "pnpm";

/** Local production build with mocked identity and browser API fixtures; no live providers. */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.live.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: "output/playwright/live-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "output/playwright/live-report" }]],
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    baseURL: "http://127.0.0.1:3002",
    locale: "en-CA",
    timezoneId: "America/Toronto",
    colorScheme: "light",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: [
    {
      command: `${pnpm} exec node scripts/mock-supabase-auth.mjs`,
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${pnpm} --filter @jesus-in-practice/dashboard exec next start -H 127.0.0.1 -p 3002`,
      url: "http://127.0.0.1:3002/signin",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NEXT_BUILD_DIR: ".next-live",
        NEXT_PUBLIC_APP_MODE: "live",
        APP_ORIGIN: "http://127.0.0.1:3002",
        SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_fixture",
        SUPPORT_EMAIL: "support@example.test",
        // Explicitly empty so an ambient developer secret cannot activate providers.
        DATABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: "",
        RESEND_API_KEY: "",
        RESEND_WEBHOOK_SECRET: "",
        TWILIO_API_KEY_SECRET: "",
        TWILIO_AUTH_TOKEN: "",
        ENABLE_PAYMENTS: "false",
        ENABLE_EMAIL_DELIVERY: "false",
        ENABLE_SMS_DELIVERY: "false",
      },
    },
  ],
});
