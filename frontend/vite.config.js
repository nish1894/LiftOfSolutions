import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // No `base` override: the app is served from the origin root in both dev and
  // production. The API mounts only dist/assets (at "/assets"), so the default
  // asset URLs already line up.
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
