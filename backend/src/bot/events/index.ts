/** @deprecated Eventos de dominio viven en modules/*; el kernel ya no usa este archivo. */
export function registerCoreEvents(_client: unknown): void {
  console.warn(
    "[adobos] registerCoreEvents está deprecado; usa ModuleRegistry.bindClient.",
  );
}
