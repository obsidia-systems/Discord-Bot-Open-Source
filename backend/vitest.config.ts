import { defineConfig } from "vitest/config";

// El `imports` map de package.json (#core/*, #modules/*, …) usa la condición
// `adobos-src` para apuntar a `src/`. Vitest/Vite deben incluirla al resolver.
const conditions = ["adobos-src", "import", "module", "node", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
