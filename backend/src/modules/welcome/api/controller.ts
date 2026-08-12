/**
 * Capa HTTP del módulo welcome.
 * Re-exporta el servicio de dominio para las rutas Express.
 */
export {
  WelcomeSettingsError,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  getWelcomeSettings,
  saveWelcomeSettings,
  disableWelcomeSettings,
} from "../service.js";
