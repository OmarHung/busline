import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**", "src/features/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "src/lib/types.ts",
        "src/features/**/hooks.ts",
        "src/features/**/ui/scroll.ts",
        "src/features/**/map/layers.ts",
        "src/server/route-index/data.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
