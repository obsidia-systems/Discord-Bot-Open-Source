import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ClientEvents,
} from "discord.js";
import type { Router } from "express";

/** Definición mínima de un slash command registrado por un módulo. */
export interface ChatInputCommandDefinition {
  name: string;
  description: string;
  handle: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export type ButtonHandler = (
  interaction: ButtonInteraction,
) => Promise<void>;

/**
 * Contexto que el kernel inyecta a cada módulo en `register`.
 * Los módulos solo hablan con el core a través de esta API.
 */
export interface ModuleContext {
  client: Client;
  on: <K extends keyof ClientEvents>(
    event: K,
    handler: (...args: ClientEvents[K]) => void,
  ) => void;
  once: <K extends keyof ClientEvents>(
    event: K,
    handler: (...args: ClientEvents[K]) => void,
  ) => void;
  route: (basePath: string, router: Router) => void;
  command: (def: ChatInputCommandDefinition) => void;
  /** Prefijo o customId exacto. Prefijos terminan en `_` (ej. `autorole_`). */
  button: (prefixOrId: string, handler: ButtonHandler) => void;
}

/** Contrato plug-and-play de un bloque Lego del bot. */
export interface AdobosModule {
  id: string;
  name: string;
  /** GatewayIntentBits adicionales a fusionar en el Client. */
  intents?: number[];
  register: (ctx: ModuleContext) => void;
}

export interface RegisteredRoute {
  basePath: string;
  router: Router;
}
