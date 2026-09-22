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
    server: {
      allowedHosts: ["admin.tobot.test"],
    },
  },
});
