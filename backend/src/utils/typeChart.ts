/**
 * Tabla de tipos Gen 6–9 (incluye Hada; Acero ya no resiste Fantasma/Siniestro).
 * Valores: multiplicador del tipo atacante contra el defensor.
 */

export const POKEMON_TYPE_NAMES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export type PokemonTypeName = (typeof POKEMON_TYPE_NAMES)[number];

export type DefensiveMatchupMultiplier = "x4" | "x2" | "x0.5" | "x0.25" | "x0";

export interface DefensiveMatchup {
  x4: PokemonTypeName[];
  x2: PokemonTypeName[];
  "x0.5": PokemonTypeName[];
  "x0.25": PokemonTypeName[];
  x0: PokemonTypeName[];
}

/** Orden de presentación en el embed (amenaza: x4 → x2 → x0 → x¼ → x½). */
export const DEFENSIVE_MATCHUP_ORDER: ReadonlyArray<{
  key: DefensiveMatchupMultiplier;
  title: string;
}> = [
  { key: "x4", title: "💥 Daño ×4" },
  { key: "x2", title: "⚠️ Daño ×2" },
  { key: "x0", title: "🛑 Inmune (×0)" },
  { key: "x0.25", title: "🛡️ Recibe ×¼" },
  { key: "x0.5", title: "🛡️ Recibe ×½" },
];

/**
 * TYPE_CHART[atacante][defensor] = efectividad (1 si no está listado).
 */
const TYPE_CHART: Record<
  PokemonTypeName,
  Partial<Record<PokemonTypeName, number>>
> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 2,
    bug: 2,
    rock: 0.5,
    dragon: 0.5,
    steel: 2,
  },
  water: {
    fire: 2,
    water: 0.5,
    grass: 0.5,
    ground: 2,
    rock: 2,
    dragon: 0.5,
  },
  electric: {
    water: 2,
    electric: 0.5,
    grass: 0.5,
    ground: 0,
    flying: 2,
    dragon: 0.5,
  },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 0.5,
    ground: 2,
    flying: 2,
    dragon: 2,
    steel: 0.5,
  },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: {
    grass: 2,
    poison: 0.5,
    ground: 0.5,
    rock: 0.5,
    ghost: 0.5,
    steel: 0,
    fairy: 2,
  },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    poison: 2,
    flying: 0,
    bug: 0.5,
    rock: 2,
    steel: 2,
  },
  flying: {
    electric: 0.5,
    grass: 2,
    fighting: 2,
    bug: 2,
    rock: 0.5,
    steel: 0.5,
  },
  psychic: {
    fighting: 2,
    poison: 2,
    psychic: 0.5,
    dark: 0,
    steel: 0.5,
  },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    fire: 2,
    ice: 2,
    fighting: 0.5,
    ground: 0.5,
    flying: 2,
    bug: 2,
    steel: 0.5,
  },
  ghost: {
    normal: 0,
    psychic: 2,
    ghost: 2,
    dark: 0.5,
  },
  dragon: {
    dragon: 2,
    steel: 0.5,
    fairy: 0,
  },
  dark: {
    fighting: 0.5,
    psychic: 2,
    ghost: 2,
    dark: 0.5,
    fairy: 0.5,
  },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    fairy: 2,
  },
  fairy: {
    fire: 0.5,
    fighting: 2,
    poison: 0.5,
    dragon: 2,
    dark: 2,
    steel: 0.5,
  },
};

export function isPokemonTypeName(value: string): value is PokemonTypeName {
  return (POKEMON_TYPE_NAMES as readonly string[]).includes(
    value.trim().toLowerCase(),
  );
}

function effectiveness(attacker: PokemonTypeName, defender: PokemonTypeName): number {
  const row = TYPE_CHART[attacker];
  const value = row?.[defender];
  return value === undefined ? 1 : value;
}

/**
 * Calcula el matchup defensivo para 1–2 tipos (producto de multiplicadores).
 * No incluye ×1 (neutral).
 */
export function calculateDefensiveMatchup(
  types: string[],
): DefensiveMatchup {
  const defenders = types
    .map((t) => t.trim().toLowerCase())
    .filter(isPokemonTypeName)
    .slice(0, 2);

  const result: DefensiveMatchup = {
    x4: [],
    x2: [],
    "x0.5": [],
    "x0.25": [],
    x0: [],
  };

  if (defenders.length === 0) return result;

  for (const attacker of POKEMON_TYPE_NAMES) {
    let mult = 1;
    for (const defender of defenders) {
      mult *= effectiveness(attacker, defender);
    }

    if (mult === 4) result.x4.push(attacker);
    else if (mult === 2) result.x2.push(attacker);
    else if (mult === 0.5) result["x0.5"].push(attacker);
    else if (mult === 0.25) result["x0.25"].push(attacker);
    else if (mult === 0) result.x0.push(attacker);
  }

  return result;
}
