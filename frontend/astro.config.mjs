import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const backendUrl = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:3000";

/**
 * Salida estática (`dist/`). En Compose el servicio `frontend` hace de
 * puerta de entrada; el proxy same-origin apunta a INTERNAL_API_URL.
 */
export default defineConfig({
  output: "static",
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  server: {
    host: true,
    port: 4321,
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    resolve: {
      alias: {
        "@": path.join(rootDir, "src"),
      },
    },
    server: {
      host: true,
      watch: {
        usePolling: true,
        interval: 300,
      },
      hmr: {
        // El navegador entra por localhost:4321 (mapeo Docker), no por la IP del contenedor
        clientPort: 4321,
        host: "localhost",
        protocol: "ws",
      },
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          cookieDomainRewrite: "",
        },
        "/auth": {
          target: backendUrl,
          changeOrigin: true,
          cookieDomainRewrite: "",
        },
        "/uploads": {
          target: backendUrl,
          changeOrigin: true,
          cookieDomainRewrite: "",
        },
      },
    },
  },
});
