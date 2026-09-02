/** IDs alineados con `backend/src/modules` (catálogo ENABLED_MODULES + plugins). */

import type { FeatureKey } from "./entitlements.js";

export const MODULE_IDS = [
  "welcome",
  "canvas-events",
  "messages",
  "autoroles",
  "guild-assets",
  "economy",
  "moderation",
  "bot-profile",
  "action-logs",
  "auto-mod",
  "auto-delete",
  "forms",
  "scheduled-messages",
  "custom-commands",
  "system-commands",
  "levels",
  "roles-builder",
  "billing",
  "voice-rooms",
  "reminders",
  "starboard",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type PluginId = "minecraft" | "osu" | "valorant" | "gachas" | "alerts";

/**
 * ModuleId → FeatureKey del catálogo de planes.
 * `billing` no se cobra como feature (vende planes). `guild-assets` y
 * `bot-profile` no tienen clave propia. `canvas-events` se cobra con welcome.
 * Este mapa no cambia el gating del backend (`requireFeature` en cada ruta).
 */
export const MODULE_FEATURE: Partial<Record<ModuleId, FeatureKey>> = {
  welcome: "welcome",
  "canvas-events": "welcome",
  messages: "messages",
  autoroles: "autoroles",
  economy: "economy",
  moderation: "moderation",
  "action-logs": "logs",
  "auto-mod": "automod",
  "auto-delete": "auto-delete",
  forms: "forms",
  "scheduled-messages": "scheduled-messages",
  "custom-commands": "custom-commands",
  "system-commands": "system-commands",
  levels: "levels",
  "roles-builder": "roles-builder",
  "voice-rooms": "voice-rooms",
  reminders: "reminders",
  starboard: "starboard",
};

export interface PluginMeta {
  id: PluginId;
  name: string;
  description: string;
  enabled: boolean;
}
