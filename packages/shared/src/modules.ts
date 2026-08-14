/** IDs alineados con `backend/src/modules` (catálogo ENABLED_MODULES + plugins). */
export type ModuleId =
  | "welcome"
  | "messages"
  | "autoroles"
  | "guild-assets"
  | "economy"
  | "moderation"
  | "bot-profile"
  | "action-logs";

export type PluginId =
  | "minecraft"
  | "osu"
  | "valorant"
  | "gachas"
  | "alerts";

export interface PluginMeta {
  id: PluginId;
  name: string;
  description: string;
  enabled: boolean;
}
