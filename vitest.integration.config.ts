import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Tests that need Postgres. They create and use a separate `<db>_test` database. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    env: { NODE_ENV: "test" },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["tests/integration/setup.ts"],
  },
});
