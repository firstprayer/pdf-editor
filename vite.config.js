import { defineConfig } from "vite";

// GitHub Pages serves this project from /<repo>/. The deploy workflow sets
// BASE_PATH; local development keeps the site at the server root.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  server: { host: "127.0.0.1", port: 5184, strictPort: true },
  preview: { host: "127.0.0.1", port: 5184, strictPort: true },
  build: { target: "es2022" },
});
