import { logger } from "../../core/log.js";
/** @deprecated Eventos de dominio viven en modules/*; el kernel ya no usa este archivo. */
export function registerCoreEvents(_client: unknown): void {
  logger.warn("registerCoreEvents está deprecado; usa ModuleRegistry.bindClient.");
}
