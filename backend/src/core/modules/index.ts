import type { AdobosModule } from "./types.js";
import { createModuleRegistry, type ModuleRegistry } from "./registry.js";

export function loadModules(
  modules: readonly AdobosModule[],
): ModuleRegistry {
  console.log(
    `[adobos] Cargando ${modules.length} módulo(s): ${modules
      .map((m) => m.id)
      .join(", ")}`,
  );
  return createModuleRegistry(modules);
}

export type { ModuleRegistry };
