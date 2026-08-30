/**
 * Etiquetas visuales del módulo (rebranding UI).
 * No altera nombres de comandos Discord, APIs ni tipos internos.
 */
import type { PokemonCommandName } from "@adobos/shared";

/** Nombre del módulo en sidebar / títulos. */
export const DEX_MODULE_LABEL = "Dex Competitivo";

/** Subtítulo corto para nav y cabeceras. */
export const DEX_MODULE_BLURB =
  "Enciclopedia, laboratorio de equipos y análisis competitivo.";

/** Títulos descriptivos (enmascaran la sintaxis slash en el panel). */
export const DEX_COMMAND_UI_TITLES: Record<PokemonCommandName, string> = {
  pokeinfo: "Enciclopedia de Especies",
  teambuilder: "Laboratorio de Equipos",
  weakness: "Análisis Defensivo",
  coverage: "Cobertura Ofensiva",
  breeding: "Guía de Cría",
  location: "Atlas de Encuentros",
  moveset: "Catálogo de Movimientos",
  bestsets: "Análisis de Builds",
  counters: "Amenazas y Checks",
  sandwich: "Recetas de Picnic",
};

/** Descripciones seguras para el listado de comandos del plugin. */
export const DEX_COMMAND_UI_DESCRIPTIONS: Record<PokemonCommandName, string> = {
  pokeinfo: "Ficha enriquecida de una especie (tipos, stats, formas).",
  teambuilder: "Arma y analiza un equipo de hasta 6 especies.",
  weakness: "Debilidades, resistencias e inmunidades defensivas.",
  coverage: "Cobertura ofensiva con hasta 4 ataques.",
  breeding: "Grupos de huevo y opciones de cría.",
  location: "Ubicaciones y encuentros por generación.",
  moveset: "Movimientos aprendibles por generación.",
  bestsets: "Builds competitivos por formato.",
  counters: "Amenazas y checks según uso competitivo.",
  sandwich: "Recetas y buffs de picnic (SV).",
};

/** Descripciones amigables en el Sheet de comandos del sistema. */
export const DEX_SYSTEM_COMMAND_DESCRIPTIONS: Partial<
  Record<string, string>
> = {
  pokeinfo: "Consulta la enciclopedia de especies.",
  teambuilder: "Laboratorio interactivo de equipos.",
  weakness: "Calcula el perfil defensivo de una especie.",
  coverage: "Evalúa la cobertura ofensiva de hasta 4 ataques.",
  breeding: "Ayuda con grupos de huevo y cría.",
  location: "Muestra ubicaciones y encuentros.",
  moveset: "Lista movimientos por generación.",
  bestsets: "Muestra builds competitivos recomendados.",
  counters: "Lista amenazas y checks competitivos.",
  sandwich: "Consulta recetas de picnic.",
};

export function getDexCommandTitle(commandName: string): string | null {
  if (commandName in DEX_COMMAND_UI_TITLES) {
    return DEX_COMMAND_UI_TITLES[commandName as PokemonCommandName];
  }
  return null;
}

export function getDexCommandDescription(commandName: string): string | null {
  return DEX_SYSTEM_COMMAND_DESCRIPTIONS[commandName] ?? null;
}
