import { defineConfig, devices } from "@playwright/test";

const includeWebkit = process.env.CI === "true" || process.env.PLAYWRIGHT_INCLUDE_WEBKIT === "1";

const projects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] }
  }
];

if (includeWebkit) {
  projects.push({
    name: "webkit",
    use: { ...devices["Desktop Safari"] }
  });
}

export default defineConfig({
  testDir: "frontend/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev --workspace frontend -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects
});
