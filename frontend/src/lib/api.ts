/** Barrel de clientes API del panel — importar desde `@/lib/api`. */
export { API_BASE, readApiError } from "./api/client";
export { fetchHealth, fetchGuildAssets } from "./api/health";
export { sendChannelMessage, sendEmbedMessage } from "./api/messages";
export { saveReactionRoles, createAutoRole } from "./api/autoroles";
export { fetchWelcomeSettings, saveWelcomeSettings } from "./api/welcome";
export { uploadBackgroundFile, uploadImageFile } from "./api/uploads";
