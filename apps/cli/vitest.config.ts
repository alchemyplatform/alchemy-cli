import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@alchemy\/sdk$/, replacement: new URL("../../packages/sdk/src/index.ts", import.meta.url).pathname },
      { find: "@alchemy/sdk/admin", replacement: new URL("../../packages/sdk/src/admin/index.ts", import.meta.url).pathname },
      { find: "@alchemy/sdk/data", replacement: new URL("../../packages/sdk/src/data/index.ts", import.meta.url).pathname },
      { find: "@alchemy/sdk/evm", replacement: new URL("../../packages/sdk/src/evm/index.ts", import.meta.url).pathname },
      { find: "@alchemy/sdk/surfaces", replacement: new URL("../../packages/sdk/src/surfaces/index.ts", import.meta.url).pathname },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**", "tests/live/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        lines: 35,
        functions: 40,
        branches: 30,
        statements: 35,
      },
    },
  },
});
