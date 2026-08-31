import "dotenv/config";
import { initDatabase } from "./client.js";

async function run(): Promise<void> {
  await initDatabase();
  console.log("[adobos] Migraciones Drizzle aplicadas (Postgres)");
  process.exit(0);
}

run().catch((error: unknown) => {
  console.error("[adobos] Migración falló:", error);
  process.exit(1);
});
