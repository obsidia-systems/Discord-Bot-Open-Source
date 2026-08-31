import type { FeatureKey } from "@adobos/shared";
import type {
  APIApplicationCommandOption,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ClientEvents,
  ModalSubmitInteraction,
} from "discord.js";
import type { Router } from "express";

/** Definición mínima de un slash command registrado por un módulo. */
export interface ChatInputCommandDefinition {
  name: string;
  description: string;
  /** Opciones Discord para el sync REST (usuario, duración, etc.). */
  options?: APIApplicationCommandOption[];
  handle: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export type ButtonHandler = (interaction: ButtonInteraction) => Promise<void>;

export type ModalHandler = (
  interaction: ModalSubmitInteraction,
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
  route: (
    basePath: string,
    router: Router,
    opts?: { feature?: FeatureKey },
  ) => void;
  command: (def: ChatInputCommandDefinition) => void;
  /** Prefijo o customId exacto. Prefijos terminan en `_` (ej. `autorole_`). */
  button: (prefixOrId: string, handler: ButtonHandler) => void;
  /** Prefijo o customId exacto de modal submit. Prefijos terminan en `_`. */
  modal: (prefixOrId: string, handler: ModalHandler) => void;
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
  feature?: FeatureKey;
}
