import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 4318,
    strictPort: true,
    watch: {
      ignored: ["**/.freshcheckout/**", "**/dist/**", "**/playwright-report/**", "**/test-results/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:4317",
    },
  },
});
