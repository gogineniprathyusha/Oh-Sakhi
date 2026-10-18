import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5183",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    {
      name: "mobile-webkit",
      testMatch: [
        "**/auth-navigation.spec.ts",
        "**/branding.spec.ts",
        "**/public-photos.spec.ts",
        "**/email-links.spec.ts",
      ],
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5183 --strictPort",
      url: "http://127.0.0.1:5183",
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5184 --strictPort",
      url: "http://127.0.0.1:5184",
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: "https://her-hour-test.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_tests_only",
      },
    },
  ],
});
