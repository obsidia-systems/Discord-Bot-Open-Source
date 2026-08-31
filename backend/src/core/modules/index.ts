import { logger } from "../log.js";
import { createModuleRegistry, type ModuleRegistry } from "./registry.js";
import type { AdobosModule } from "./types.js";

export function loadModules(modules: readonly AdobosModule[]): ModuleRegistry {
  logger.info(
    `Cargando ${modules.length} módulo(s): ${modules
      .map((m) => m.id)
      .join(", ")}`,
  );
  return createModuleRegistry(modules);
}

export type { ModuleRegistry };
