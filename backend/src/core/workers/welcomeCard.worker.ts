import { parentPort } from "node:worker_threads";
import type { BuildWelcomeCardOptions } from "#modules/welcome/card/WelcomeCardBuilder.js";
import { buildWelcomeCard } from "#modules/welcome/card/WelcomeCardBuilder.js";

interface JobMessage {
  id: number;
  options: BuildWelcomeCardOptions;
}

if (!parentPort) {
  throw new Error(
    "welcomeCard.worker: sin parentPort (no es un worker_thread)",
  );
}

const port = parentPort;

port.on("message", (msg: JobMessage) => {
  void (async () => {
    try {
      const png = await buildWelcomeCard(msg.options);
      port.postMessage({ id: msg.id, ok: true, png });
    } catch (error) {
      port.postMessage({
        id: msg.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
