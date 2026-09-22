import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",
  site: "https://docs.tobot.test",
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["docs.tobot.test"],
    },
  },
});
