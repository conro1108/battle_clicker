import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/sim/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
  },
});
