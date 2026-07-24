import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point straight at the source so the sim stays a single compiled unit
      // with the app — no build step between editing economy logic and seeing it.
      "@battle/sim": fileURLToPath(new URL("../../packages/sim/src/index.ts", import.meta.url)),
    },
  },
  optimizeDeps: { exclude: ["@battle/sim"] },
  server: { port: 5173 },
});
