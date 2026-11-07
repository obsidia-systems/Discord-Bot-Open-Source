import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  site: "https://admin.tobot.test",
  vite: {
    plugins: [tailwindcss()],
    // El servidor en Compose no comparte el runtime JSX con checks/builds del host.
    cacheDir: process.env.TOBOT_ADMIN_VITE_CACHE_DIR,
    optimizeDeps: { force: true },
    server: {
      allowedHosts: ["admin.tobot.test"],
    },
  },
});
