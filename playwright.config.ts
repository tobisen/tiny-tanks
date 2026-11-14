import { defineConfig } from "@playwright/test";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_ACTIONS && repo && !repo.endsWith(".github.io")
    ? `/${repo}/`
    : "/");
const previewURL = `http://127.0.0.1:4173${base}`;
export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.TEST_URL ?? previewURL,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions:
      process.env.PLAYWRIGHT_CHROME === "1" ? { channel: "chrome" } : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.TEST_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4173",
        url: previewURL,
        reuseExistingServer: !process.env.CI,
      },
});
