import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node20",
    clean: true,
    sourcemap: true,
    external: [/^@opentui\//, "opentui-spinner", "cli-spinners"],
  },
  {
    entry: ["src/bin.ts"],
    format: ["esm"],
    target: "node20",
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
