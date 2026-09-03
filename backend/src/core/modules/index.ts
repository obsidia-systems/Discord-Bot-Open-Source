import { logger } from "../log.js";
import { createModuleRegistry, type ModuleRegistry } from "./registry.js";
import type { AdobosModule } from "./types.js";

export function loadModules(modules: readonly AdobosModule[]): ModuleRegistry {
  logger.info(
    `Loading ${modules.length} module(s): ${modules
      .map((m) => m.id)
      .join(", ")}`,
  );
  return createModuleRegistry(modules);
}

export type { ModuleRegistry };
