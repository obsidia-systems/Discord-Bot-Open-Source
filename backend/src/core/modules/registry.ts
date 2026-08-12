import type {
  ButtonInteraction,
  Client,
  ClientEvents,
} from "discord.js";
import type {
  AdobosModule,
  ButtonHandler,
  ChatInputCommandDefinition,
  ModuleContext,
  RegisteredRoute,
} from "./types.js";

export interface ModuleRegistry {
  modules: readonly AdobosModule[];
  routes: readonly RegisteredRoute[];
  commands: readonly ChatInputCommandDefinition[];
  buttonHandlers: ReadonlyMap<string, ButtonHandler>;
  intents: readonly number[];
  /** Enlaza eventos/comandos/botones de todos los módulos al Client. */
  bindClient: (client: Client) => void;
}

/**
 * Ejecuta `register` de cada módulo y recoge rutas, comandos, botones e intents.
 * Los eventos se encolan y se aplican en `bindClient`.
 */
export function createModuleRegistry(
  modules: readonly AdobosModule[],
): ModuleRegistry {
  const routes: RegisteredRoute[] = [];
  const commands: ChatInputCommandDefinition[] = [];
  const buttonHandlers = new Map<string, ButtonHandler>();
  const intentSet = new Set<number>();
  const pendingEvents: Array<{
    once: boolean;
    event: keyof ClientEvents;
    handler: (...args: never[]) => void;
  }> = [];

  const ids = new Set<string>();
  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(`[adobos] Módulo duplicado: ${mod.id}`);
    }
    ids.add(mod.id);
    for (const intent of mod.intents ?? []) {
      intentSet.add(intent);
    }
  }

  function bindClient(client: Client): void {
    const ctx: ModuleContext = {
      client,
      on(event, handler) {
        pendingEvents.push({
          once: false,
          event,
          handler: handler as (...args: never[]) => void,
        });
      },
      once(event, handler) {
        pendingEvents.push({
          once: true,
          event,
          handler: handler as (...args: never[]) => void,
        });
      },
      route(basePath, router) {
        const normalized = basePath.startsWith("/")
          ? basePath
          : `/${basePath}`;
        routes.push({ basePath: normalized, router });
      },
      command(def) {
        if (commands.some((c) => c.name === def.name)) {
          throw new Error(`[adobos] Comando duplicado: /${def.name}`);
        }
        commands.push(def);
      },
      button(prefixOrId, handler) {
        if (buttonHandlers.has(prefixOrId)) {
          throw new Error(`[adobos] Button handler duplicado: ${prefixOrId}`);
        }
        buttonHandlers.set(prefixOrId, handler);
      },
    };

    // Primera pasada: register (puede encolar eventos y rutas)
    pendingEvents.length = 0;
    routes.length = 0;
    commands.length = 0;
    buttonHandlers.clear();

    for (const mod of modules) {
      mod.register(ctx);
    }

    for (const entry of pendingEvents) {
      if (entry.once) {
        client.once(entry.event, entry.handler as never);
      } else {
        client.on(entry.event, entry.handler as never);
      }
    }
  }

  return {
    modules,
    get routes() {
      return routes;
    },
    get commands() {
      return commands;
    },
    get buttonHandlers() {
      return buttonHandlers;
    },
    intents: [...intentSet],
    bindClient,
  };
}

/** Resuelve un handler de botón por customId (exacto o prefijo). */
export function resolveButtonHandler(
  registry: ModuleRegistry,
  customId: string,
): ButtonHandler | undefined {
  const exact = registry.buttonHandlers.get(customId);
  if (exact) return exact;

  for (const [key, handler] of registry.buttonHandlers) {
    if (key.endsWith("_") && customId.startsWith(key)) {
      return handler;
    }
  }
  return undefined;
}

export async function dispatchButton(
  registry: ModuleRegistry,
  interaction: ButtonInteraction,
): Promise<boolean> {
  const handler = resolveButtonHandler(registry, interaction.customId);
  if (!handler) return false;
  await handler(interaction);
  return true;
}
