import { defineConfig, devices } from "@playwright/test";

// Showcase checks. Runs against SHOWCASE_URL (for example a Vercel preview) or, without it, a
// local `next start` of a build made with NEXT_PUBLIC_SHOWCASE=1. Needs no database or .env.
const PORT = Number(process.env.PORT ?? 3202);
const external = process.env.SHOWCASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "showcase-*.spec.ts",
  forbidOnly: !!process.env.CI,
  // A cold production server renders the first hit of each route slowly.
  timeout: 60_000,
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "showcase-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "showcase-phone-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `pnpm start -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NEXT_PUBLIC_SHOWCASE: "1" },
      },
});
