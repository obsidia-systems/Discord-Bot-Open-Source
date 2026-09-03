import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Las columnas del schema no llevan nombre explícito; se derivan del key JS.
  // DEBE coincidir con el `casing` de `drizzle()` en src/db/client.ts.
  casing: "snake_case",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://adobos:adobos@127.0.0.1:5432/adobos",
  },
});
