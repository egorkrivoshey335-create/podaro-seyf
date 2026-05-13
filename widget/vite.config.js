import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  build: {
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: "src/index.js",
      name: "GiftSafeWidget",
      fileName: () => "widget.js",
      formats: ["iife"],
    },
  },
});
