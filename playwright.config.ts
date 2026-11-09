import { defineConfig } from "@playwright/test";

const PORT = 3101;

/** Everything runs against a real server, a real database and real files, in a test database of their own. */
const env = {
  DATABASE_URL: "postgres://localhost:5432/creator_studio_test",
  APP_URL: `http://localhost:${PORT}`,
  APP_SECRET: "test-only-secret-not-used-anywhere-else",
  STORAGE_DRIVER: process.env.E2E_STORAGE ?? "local",
  STORAGE_DIR: "./storage-test",
  /* Only used when E2E_STORAGE=s3, against a local S3 server. See README. */
  S3_ENDPOINT: "http://localhost:4568",
  S3_REGION: "us-east-1",
  S3_BUCKET: "studio",
  S3_ACCESS_KEY_ID: "S3RVER",
  S3_SECRET_ACCESS_KEY: "S3RVER",
  ANTHROPIC_API_KEY: "test-key",
  ANTHROPIC_BASE_URL: "http://localhost:3102",
};
Object.assign(process.env, env);

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1360, height: 900 },
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env,
  },
});
