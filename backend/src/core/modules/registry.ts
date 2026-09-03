import type {
  AutocompleteInteraction,
  ButtonInteraction,
  Client,
  ClientEvents,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
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

    pendingEvents.length = 0;
    routes.length = 0;
    rawRoutes.length = 0;
    commands.length = 0;
    fallbackChat = null;
    autocompleteHandlers.clear();
    buttonHandlers.clear();
    selectHandlers.clear();
    modalHandlers.clear();

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
    bindClient,
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
