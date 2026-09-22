import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "static",
  site: "https://www.tobot.test",
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["www.tobot.test"],
    },
  },
});
