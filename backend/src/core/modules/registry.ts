import type {
  AutocompleteInteraction,
  ButtonInteraction,
  Client,
  ClientEvents,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { logger } from "../log.js";
import type {
  AdobosModule,
  AutocompleteHandler,
  ButtonHandler,
  ChatInputCommandDefinition,
  FallbackChatHandler,
  ModalHandler,
  ModuleContext,
  RawRoute,
  RegisteredRoute,
  SelectHandler,
} from "./types.js";

export interface ModuleRegistry {
  modules: readonly AdobosModule[];
  routes: readonly RegisteredRoute[];
  rawRoutes: readonly RawRoute[];
  commands: readonly ChatInputCommandDefinition[];
  fallbackChat: FallbackChatHandler | null;
  autocompleteHandlers: ReadonlyMap<string, AutocompleteHandler>;
  buttonHandlers: ReadonlyMap<string, ButtonHandler>;
  selectHandlers: ReadonlyMap<string, SelectHandler>;
  modalHandlers: ReadonlyMap<string, ModalHandler>;
  intents: readonly number[];
  /**
   * Ejecuta `register()` de cada módulo: recoge rutas, comandos y handlers de
   * interacción, y encola (sin atar todavía) los listeners de gateway.
   * Idempotente: una segunda llamada es no-op y avisa.
   */
  collect: (client: Client) => void;
  /**
   * Ata al Client los listeners de gateway recogidos en `collect()`.
   * Requiere `collect()` previo. Idempotente.
   */
  attach: () => void;
}

/**
 * Envuelve el handler de evento de un módulo: una excepción síncrona o una
 * promesa rechazada se registran y se contienen, nunca escalan al Client
 * (un throw sin capturar puede cerrar la conexión WebSocket del gateway).
 */
function wrapEventHandler(
  moduleId: string,
  event: keyof ClientEvents,
  handler: (...args: never[]) => unknown,
): (...args: never[]) => void {
  return (...args: never[]) => {
    try {
      const out = handler(...args);
      if (out instanceof Promise) {
        out.catch((err: unknown) => {
          logger.error(
            { err, moduleId, event },
            "handler de evento de módulo: promesa rechazada",
          );
        });
      }
    } catch (err: unknown) {
      logger.error(
        { err, moduleId, event },
        "handler de evento de módulo: excepción",
      );
    }
  };
}

/**
 * Ejecuta `register` de cada módulo y recoge rutas, comandos, botones e intents.
 * `collect(client)` corre `register()`; `attach()` ata los listeners de gateway.
 */
export function createModuleRegistry(
  modules: readonly AdobosModule[],
): ModuleRegistry {
  const routes: RegisteredRoute[] = [];
  const rawRoutes: RawRoute[] = [];
  const commands: ChatInputCommandDefinition[] = [];
  let fallbackChat: FallbackChatHandler | null = null;
  const autocompleteHandlers = new Map<string, AutocompleteHandler>();
  const buttonHandlers = new Map<string, ButtonHandler>();
  const selectHandlers = new Map<string, SelectHandler>();
  const modalHandlers = new Map<string, ModalHandler>();
  const intentSet = new Set<number>();
  const pendingEvents: Array<{
    once: boolean;
    event: keyof ClientEvents;
    moduleId: string;
    handler: (...args: never[]) => void;
  }> = [];

  const ids = new Set<string>();
  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(`[adobos] Duplicate module: ${mod.id}`);
    }
    ids.add(mod.id);
    for (const intent of mod.intents ?? []) {
      intentSet.add(intent);
    }
  }

  let collectClient: Client | null = null;
  let collected = false;
  let attached = false;

  function collect(client: Client): void {
    if (collected) {
      logger.warn("[adobos] ModuleRegistry.collect() dos veces — ignorado");
      return;
    }
    collected = true;
    collectClient = client;

    let currentModuleId = "?";
    const ctx: ModuleContext = {
      client,
      on(event, handler) {
        pendingEvents.push({
          once: false,
          event,
          moduleId: currentModuleId,
          handler: handler as (...args: never[]) => void,
        });
      },
      once(event, handler) {
        pendingEvents.push({
          once: true,
          event,
          moduleId: currentModuleId,
          handler: handler as (...args: never[]) => void,
        });
      },
      route(basePath, router, opts) {
        const normalized = basePath.startsWith("/") ? basePath : `/${basePath}`;
        routes.push({ basePath: normalized, router, feature: opts?.feature });
      },
      rawRoute(method, path, handler) {
        const normalized = path.startsWith("/") ? path : `/${path}`;
        if (
          rawRoutes.some((r) => r.method === method && r.path === normalized)
        ) {
          throw new Error(
            `[adobos] rawRoute duplicada: ${method} ${normalized}`,
          );
        }
        rawRoutes.push({ method, path: normalized, handler });
      },
      command(def) {
        if (commands.some((c) => c.name === def.name)) {
          throw new Error(`[adobos] Duplicate command: /${def.name}`);
        }
        commands.push(def);
      },
      fallbackChat(handler) {
        if (fallbackChat) {
          throw new Error("[adobos] fallbackChat ya registrado");
        }
        fallbackChat = handler;
      },
      autocomplete(commandName, handler) {
        if (autocompleteHandlers.has(commandName)) {
          throw new Error(`[adobos] Autocomplete duplicado: /${commandName}`);
        }
        autocompleteHandlers.set(commandName, handler);
      },
      button(prefixOrId, handler) {
        if (buttonHandlers.has(prefixOrId)) {
          throw new Error(`[adobos] Button handler duplicado: ${prefixOrId}`);
        }
        buttonHandlers.set(prefixOrId, handler);
      },
      select(prefixOrId, handler) {
        if (selectHandlers.has(prefixOrId)) {
          throw new Error(`[adobos] Select handler duplicado: ${prefixOrId}`);
        }
        selectHandlers.set(prefixOrId, handler);
      },
      modal(prefixOrId, handler) {
        if (modalHandlers.has(prefixOrId)) {
          throw new Error(`[adobos] Modal handler duplicado: ${prefixOrId}`);
        }
        modalHandlers.set(prefixOrId, handler);
      },
    };

    for (const mod of modules) {
      currentModuleId = mod.id;
      mod.register(ctx);
    }
    currentModuleId = "?";
  }

  function attach(): void {
    if (attached) {
      logger.warn("[adobos] ModuleRegistry.attach() dos veces — ignorado");
      return;
    }
    if (!collected || !collectClient) {
      throw new Error("[adobos] attach() llamado antes de collect()");
    }
    attached = true;
    const client = collectClient;

    for (const entry of pendingEvents) {
      const wrapped = wrapEventHandler(
        entry.moduleId,
        entry.event,
        entry.handler,
      );
      if (entry.once) {
        client.once(entry.event, wrapped as never);
      } else {
        client.on(entry.event, wrapped as never);
      }
    }
  }

  return {
    modules,
    get routes() {
      return routes;
    },
    get rawRoutes() {
      return rawRoutes;
    },
    get commands() {
      return commands;
    },
    get fallbackChat() {
      return fallbackChat;
    },
    get autocompleteHandlers() {
      return autocompleteHandlers;
    },
    get buttonHandlers() {
      return buttonHandlers;
    },
    get selectHandlers() {
      return selectHandlers;
    },
    get modalHandlers() {
      return modalHandlers;
    },
    intents: [...intentSet],
    collect,
    attach,
  };
}

function resolvePrefixedHandler<T>(
  map: ReadonlyMap<string, T>,
  customId: string,
): T | undefined {
  const exact = map.get(customId);
  if (exact) return exact;

  for (const [key, handler] of map) {
    if (key.endsWith("_") && customId.startsWith(key)) {
      return handler;
    }
  }
  return undefined;
}

/** Resuelve un handler de botón por customId (exacto o prefijo). */
export function resolveButtonHandler(
  registry: ModuleRegistry,
  customId: string,
): ButtonHandler | undefined {
  return resolvePrefixedHandler(registry.buttonHandlers, customId);
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

/** Resuelve un handler de String Select por customId (exacto o prefijo). */
export function resolveSelectHandler(
  registry: ModuleRegistry,
  customId: string,
): SelectHandler | undefined {
  return resolvePrefixedHandler(registry.selectHandlers, customId);
}

export async function dispatchSelect(
  registry: ModuleRegistry,
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  const handler = resolveSelectHandler(registry, interaction.customId);
  if (!handler) return false;
  await handler(interaction);
  return true;
}

/** Resuelve un handler de modal submit por customId (exacto o prefijo). */
export function resolveModalHandler(
  registry: ModuleRegistry,
  customId: string,
): ModalHandler | undefined {
  return resolvePrefixedHandler(registry.modalHandlers, customId);
}

export async function dispatchModal(
  registry: ModuleRegistry,
  interaction: ModalSubmitInteraction,
): Promise<boolean> {
  const handler = resolveModalHandler(registry, interaction.customId);
  if (!handler) return false;
  await handler(interaction);
  return true;
}

export async function dispatchAutocomplete(
  registry: ModuleRegistry,
  interaction: AutocompleteInteraction,
): Promise<boolean> {
  const handler = registry.autocompleteHandlers.get(interaction.commandName);
  if (!handler) return false;
  await handler(interaction);
  return true;
}
