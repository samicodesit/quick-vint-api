import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/ops/e2e",
  use: { baseURL: "http://127.0.0.1:4328", browserName: "chromium" },
  webServer: {
    command: "npm run ops:dev -- --host 127.0.0.1 --port 4328",
    url: "http://127.0.0.1:4328/app",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
