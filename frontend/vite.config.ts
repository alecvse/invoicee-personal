import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const buildTime = new Date().toISOString();

export default defineConfig({
  base: "./",
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173
  }
});
