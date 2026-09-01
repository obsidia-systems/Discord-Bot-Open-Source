/** Barrel de clientes API del panel — importar desde `@/lib/api`. */
export { API_BASE, apiFetch, readApiError, resolvePublicAssetUrl } from "./api/client";
export { fetchMe, logout } from "./api/me";
export { fetchEntitlements } from "./api/entitlements";
export {
  assignGuildToPlan,
  fetchBilling,
  startBillingPortal,
  startCheckout,
  unassignGuildFromPlan,
} from "./api/billing";
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
export {
  fetchAutoDeleteConfig,
  saveAutoDeleteConfig,
} from "./api/auto-delete";
export {
  fetchForms,
  fetchForm,
  createForm,
  saveForm,
  deleteForm,
  publishForm,
  fetchFormResponses,
  downloadFormResponsesCsv,
  fetchFormsConfig,
  saveFormsConfig,
  publishFormsConfig,
} from "./api/forms";
export {
  fetchScheduledMessages,
  createScheduledMessage,
  updateScheduledMessage,
  toggleScheduledMessage,
  deleteScheduledMessage,
} from "./api/scheduled-messages";
export {
  fetchCustomCommands,
  createCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,
} from "./api/custom-commands";
export {
  fetchSystemCommands,
  saveSystemCommands,
} from "./api/system-commands";
export {
  fetchLevelsConfig,
  saveLevelsConfig,
  fetchLevelsLeaderboard,
} from "./api/levels";

export {
  fetchEconomyConfig,
  saveEconomyConfig,
  fetchEconomyLeaderboard,
  adjustEconomyFunds,
  fetchEconomyIncomeConfig,
  saveEconomyIncomeConfig,
  fetchEconomyCasinoConfig,
  saveEconomyCasinoConfig,
  fetchShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
} from "./api/economy";

export {
  fetchRolesBuilderList,
  createGuildRole,
  updateRolePositions,
} from "./api/roles-builder";
