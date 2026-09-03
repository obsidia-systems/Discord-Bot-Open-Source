/**
 * Capa HTTP del módulo welcome.
 * Re-exporta el servicio de dominio para las rutas Express.
 */
export {
  disableWelcomeSettings,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  getWelcomeSettings,
  saveWelcomeSettings,
  WelcomeSettingsError,
} from "../domain/welcome.js";
