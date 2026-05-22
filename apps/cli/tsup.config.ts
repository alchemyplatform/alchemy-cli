import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'if(process.argv.includes("--no-color"))process.env.NO_COLOR="1";',
    ].join("\n"),
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
