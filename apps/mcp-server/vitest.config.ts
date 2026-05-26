import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@alchemy/sdk/admin": new URL("../../packages/sdk/src/admin/index.ts", import.meta.url).pathname,
      "@alchemy/sdk/data": new URL("../../packages/sdk/src/data/index.ts", import.meta.url).pathname,
      "@alchemy/sdk/evm": new URL("../../packages/sdk/src/evm/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
