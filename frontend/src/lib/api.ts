/** Barrel de clientes API del panel — importar desde `@/lib/api`. */
export { API_BASE, readApiError, resolvePublicAssetUrl } from "./api/client";
export { fetchHealth, fetchGuildAssets } from "./api/health";
export { sendChannelMessage, sendEmbedMessage } from "./api/messages";
export {
  fetchEmbedLibrary,
  sendEmbedToLibrary,
  editSentEmbed,
  deleteSentEmbed,
} from "./api/embed-library";
export {
  saveReactionRoles,
  createAutoRole,
  createAutoroleCompact,
  saveInteractiveRoles,
  fetchActiveAutoroles,
  updateAutoroleMapping,
  updateAutoroleContent,
  deleteAutorole,
  fetchAutoJoinRoles,
  saveAutoJoinRoles,
} from "./api/autoroles";
export { fetchWelcomeSettings, saveWelcomeSettings } from "./api/welcome";
export {
  fetchCanvasEventSettings,
  saveCanvasEventSettings,
} from "./api/canvas-events";
export { uploadBackgroundFile, uploadImageFile } from "./api/uploads";
export {
  fetchBotGuildProfile,
  fetchBotProfile,
  saveBotGuildProfile,
  saveBotProfile,
} from "./api/bot-profile";
export type { SaveBotGuildProfileInput, SaveBotProfileInput } from "./api/bot-profile";
export {
  searchModMembers,
  searchModChannels,
  fetchModMemberInfo,
  fetchModChannelInfo,
  fetchModMessage,
  executeModAction,
  fetchDiscordAuditLog,
  fetchActiveBans,
  fetchActiveTimeouts,
} from "./api/moderation";
export {
  listEmbedTemplates,
  fetchEmbedTemplate,
  saveEmbedTemplate,
  deleteEmbedTemplate,
} from "./api/embed-templates";
export {
  fetchActionLogsConfig,
  saveActionLogsConfig,
  fetchActionLogsHistory,
  sendActionLogsTest,
} from "./api/action-logs";
export { fetchAutoModConfig, saveAutoModConfig } from "./api/auto-mod";
