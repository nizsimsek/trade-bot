import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3500,
    strictPort: true,
    allowedHosts: ["tradebot.nizsimsek.dev"],
    proxy: {
      "/api": "http://127.0.0.1:3501",
      "/ws": {
        target: "ws://127.0.0.1:3501",
        ws: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3500,
    strictPort: true,
    allowedHosts: ["tradebot.nizsimsek.dev"],
    proxy: {
      "/api": "http://127.0.0.1:3501",
      "/ws": {
        target: "ws://127.0.0.1:3501",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  }
});
