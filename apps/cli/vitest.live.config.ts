import { defineConfig } from "vitest/config";

if (process.env.CI) {
  throw new Error("Live tests are disabled in CI/CD. Run them manually in a local environment.");
}

export default defineConfig({
  test: {
    include: ["tests/live/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
