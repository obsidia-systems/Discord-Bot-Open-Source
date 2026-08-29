/**
 * App Emojis de Discord para el módulo Pokémon (Developer Portal).
 * - Tipos: clave = nombre en inglés de PokéAPI (`fire`, `ghost`, …).
 * - Clases de movimiento / mega: claves propias para `/moveset` y línea evolutiva.
 */

export const POKEMON_TYPES_EMOJIS: Record<string, string> = {
  normal: "<:Normaltype:1542318063532122218>",
  fighting: "<:Luchatype:1542318062634668113>",
  flying: "<:Voladortype:1542318082054426727>",
  poison: "<:Venenotype:1542318080850403348>",
  ground: "<:Tierratype:1542318078866751489>",
  rock: "<:Rocatype:1542318076375343144>",
  bug: "<:Bichotype:1542318052203307108>",
  ghost: "<:Fantasmatype:1542318057467416597>",
  steel: "<:Acerotype:1542318049045250259>",
  fire: "<:Fuegotype:1542318059937865928>",
  water: "<:Aguatype:1542318051062718575>",
  grass: "<:Plantatype:1542318073950900355>",
  electric: "<:Electricotype:1542318055462412428>",
  psychic: "<:Psiquicotype:1542318075209187459>",
  ice: "<:Hielotype:1542318062290600056>",
  dragon: "<:Dragontype:1542318054048923658>",
  dark: "<:Siniestrotype:1542318077344096276>",
  fairy: "<:Hadatype:1542318061116461117>",
};

/** Emojis auxiliares (moveset + mega evolución). */
export const POKEMON_UI_EMOJIS = {
  move_physical: "<:Clase_fisico_Masters:1542326373115494530>",
  move_special: "<:Clase_especial_Masters:1542326375191420970>",
  move_status: "<:Clase_estado_Masters:1542326374277316648>",
  mega_evolution: "<:mega_evolution:1542327306738208849>",
} as const;

/** Devuelve el markup del App Emoji del tipo, o `null` si no está mapeado. */
export function getPokemonTypeEmoji(typeName: string): string | null {
  const key = typeName.trim().toLowerCase();
  return POKEMON_TYPES_EMOJIS[key] ?? null;
}

/** Emoji de clase de daño PokéAPI (`physical` / `special` / `status`). */
export function getMoveDamageClassEmoji(
  damageClass: string | null | undefined,
): string {
  const key = (damageClass ?? "").toLowerCase();
  if (key === "physical") return POKEMON_UI_EMOJIS.move_physical;
  if (key === "special") return POKEMON_UI_EMOJIS.move_special;
  if (key === "status") return POKEMON_UI_EMOJIS.move_status;
  return POKEMON_UI_EMOJIS.move_status;
}

/**
 * Etiqueta de tipo con emoji delante cuando exista.
 * Ej: `<:Fantasmatype:…> Fantasma`
 */
export function formatPokemonTypeWithEmoji(
  typeName: string,
  label: string,
): string {
  const emoji = getPokemonTypeEmoji(typeName);
  return emoji ? `${emoji} ${label}` : label;
}
