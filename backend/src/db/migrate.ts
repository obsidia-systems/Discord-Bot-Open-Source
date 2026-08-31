import "dotenv/config";
import { initDatabase } from "./client.js";
import { logger } from "../core/log.js";

async function run(): Promise<void> {
  await initDatabase();
  logger.info("Migraciones Drizzle aplicadas (Postgres)");
  process.exit(0);
}

run().catch((error: unknown) => {
  logger.error({ err: error }, "Migración falló:");
  process.exit(1);
});
