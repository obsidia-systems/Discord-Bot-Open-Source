import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBotClient } from "./bot/client.js";
import { createApp } from "./api/server.js";
import { initDatabase } from "./db/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  initDatabase();

  const bot = createBotClient();
  const app = createApp({
    bot,
    // En Docker: ./public (inyectado). En monorepo: frontend/dist vía env o default.
    staticDir:
      process.env.STATIC_DIR ??
      path.resolve(__dirname, "../public"),
  });

  if (process.env.DISCORD_TOKEN) {
    await bot.login(process.env.DISCORD_TOKEN);
  } else {
    console.warn(
      "[adobos] DISCORD_TOKEN no definido — el panel web arranca sin bot conectado.",
    );
  }

  app.listen(PORT, HOST, () => {
    console.log(`[adobos] Panel + API en http://${HOST}:${PORT}`);
  });
}

main().catch((error: unknown) => {
  console.error("[adobos] Fallo al iniciar:", error);
  process.exit(1);
});
