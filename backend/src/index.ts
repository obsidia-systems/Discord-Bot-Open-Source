import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDatabase } from "./db/client.js";
import { loadModules } from "./core/modules/index.js";
import { createBotClient } from "./core/bot/createClient.js";
import { createApp } from "./core/http/createApp.js";
import { ENABLED_MODULES } from "./modules/index.js";
import { wireCustomCommandsBuiltinSync } from "./modules/custom-commands/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
    await initDatabase();

  const registry = loadModules(ENABLED_MODULES);
  // Reserva nombres del catálogo nativo para custom-commands.
  wireCustomCommandsBuiltinSync();
  const bot = createBotClient(registry);
  const app = createApp({
    bot,
    registry,
    staticDir:
      process.env.STATIC_DIR ?? path.resolve(__dirname, "../public"),
  });

  if (process.env.DISCORD_TOKEN) {
    await bot.login(process.env.DISCORD_TOKEN);
  } else {
    console.warn(
      "[adobos] DISCORD_TOKEN no definido — el panel web arranca sin bot conectado.",
    );
  }

  const servingPanel =
    process.env.SERVE_STATIC !== "false" && process.env.SERVE_STATIC !== "0";
  app.listen(PORT, HOST, () => {
    const kind = servingPanel ? "Panel + API" : "API";
    console.log(`[adobos] ${kind} en http://${HOST}:${PORT}`);
  });
}

main().catch((error: unknown) => {
  console.error("[adobos] Fallo al iniciar:", error);
  process.exit(1);
});
