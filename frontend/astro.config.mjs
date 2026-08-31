import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Salida estática (`dist/`) inyectada en el backend vía Dockerfile.
 * En desarrollo (Docker/OrbStack) HMR y proxy apuntan a localhost:3000.
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
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          cookieDomainRewrite: "",
        },
        "/auth": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          cookieDomainRewrite: "",
        },
        "/uploads": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          cookieDomainRewrite: "",
        },
      },
    },
  },
});
