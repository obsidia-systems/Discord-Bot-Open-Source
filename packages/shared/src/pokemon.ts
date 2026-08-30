/** Configuración del plugin Pokémon (PokéAPI + helpers competitivos). */

export const POKEMON_COMMAND_NAMES = [
  "pokeinfo",
  "teambuilder",
  "weakness",
  "coverage",
  "breeding",
  "location",
  "moveset",
  "bestsets",
  "counters",
  "sandwich",
] as const;

export type PokemonCommandName = (typeof POKEMON_COMMAND_NAMES)[number];

export type PokemonApiLanguage = "es" | "en";

/** Generaciones soportadas como default del plugin. */
export const POKEMON_GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type PokemonGeneration = (typeof POKEMON_GENERATIONS)[number];

export type PokemonCommandsEnabled = Record<PokemonCommandName, boolean>;

export interface PokemonConfig {
  guildId: string;
  isActive: boolean;
  defaultGeneration: PokemonGeneration;
  language: PokemonApiLanguage;
  /** Color hex de embeds (#RRGGBB). */
  embedColor: string;
  /** Fuerza respuestas efímeras (anti-sniping). */
  forceEphemeral: boolean;
  /** Lista blanca de canales; vacía = todos. */
  allowedChannels: string[];
  /**
   * Lista blanca de roles; vacía = cualquiera del servidor puede usar
   * los comandos del módulo (siempre que el plugin esté activo).
   */
  allowedRoles: string[];
  commands: PokemonCommandsEnabled;
}

export interface PokemonConfigResponse {
  config: PokemonConfig;
}

export type UpdatePokemonConfigRequest = Partial<{
  isActive: boolean;
  defaultGeneration: PokemonGeneration | number;
  language: PokemonApiLanguage | string;
  embedColor: string;
  forceEphemeral: boolean;
  allowedChannels: string[];
  allowedRoles: string[];
  commands: Partial<PokemonCommandsEnabled>;
  guildId: string;
}>;

export function defaultPokemonCommands(): PokemonCommandsEnabled {
  return {
    pokeinfo: true,
    teambuilder: true,
    weakness: true,
    coverage: true,
    breeding: true,
    location: true,
    moveset: true,
    bestsets: true,
    counters: true,
    sandwich: true,
  };
}

export function defaultPokemonConfig(guildId = ""): PokemonConfig {
  return {
    guildId,
    isActive: false,
    defaultGeneration: 9,
    language: "es",
    embedColor: "#EF4444",
    forceEphemeral: true,
    allowedChannels: [],
    allowedRoles: [],
    commands: defaultPokemonCommands(),
  };
}

export function normalizePokemonGeneration(
  value: unknown,
  fallback: PokemonGeneration = 9,
): PokemonGeneration {
  const n = typeof value === "number" ? value : Number(value);
  return (POKEMON_GENERATIONS as readonly number[]).includes(n)
    ? (n as PokemonGeneration)
    : fallback;
}

export function normalizePokemonLanguage(
  value: unknown,
  fallback: PokemonApiLanguage = "es",
): PokemonApiLanguage {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return v === "en" || v === "es" ? v : fallback;
}

export function normalizePokemonEmbedColor(
  value: unknown,
  fallback = "#EF4444",
): string {
  const raw = String(value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return fallback;
}

export function normalizePokemonChannelIds(ids: unknown): string[] {
  return normalizePokemonSnowflakeIds(ids);
}

/** Roles permitidos (mismos snowflakes Discord). */
export function normalizePokemonRoleIds(ids: unknown): string[] {
  return normalizePokemonSnowflakeIds(ids);
}

function normalizePokemonSnowflakeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!/^\d{17,20}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizePokemonCommands(
  input: Partial<PokemonCommandsEnabled> | null | undefined,
): PokemonCommandsEnabled {
  const base = defaultPokemonCommands();
  if (!input || typeof input !== "object") return base;
  for (const name of POKEMON_COMMAND_NAMES) {
    if (typeof input[name] === "boolean") base[name] = input[name]!;
  }
  return base;
}

export const POKEMON_COMMAND_LABELS: Record<PokemonCommandName, string> = {
  pokeinfo: "/pokeinfo — Ficha del Pokémon",
  teambuilder: "/teambuilder view|add|remove|clear — Constructor de equipos",
  weakness: "/weakness — Debilidades y resistencias",
  coverage: "/coverage — Cobertura ofensiva de 4 ataques",
  breeding: "/breeding — Cría y egg groups",
  location: "/location — Ubicaciones / encounters",
  moveset: "/moveset — Moveset por generación",
  bestsets: "/bestsets — Sets competitivos Smogon (todos los formatos)",
  counters: "/counters — Amenazas / checks Smogon",
  sandwich: "/sandwich — Sándwiches (SV)",
};

/** Values de la opción `/pokeinfo juego_formato`. */
export const POKEINFO_FORMAT_VALUES = [
  "gen1",
  "gen2",
  "gen3",
  "gen4",
  "gen5",
  "gen6",
  "gen7",
  "gen8",
  "gen9",
  "natdex",
] as const;

export type PokeinfoFormatValue = (typeof POKEINFO_FORMAT_VALUES)[number];

/** Choices Discord (name → value) para `juego_formato`. */
export const POKEINFO_FORMAT_CHOICES: ReadonlyArray<{
  name: string;
  value: PokeinfoFormatValue;
}> = [
  { name: "Rojo/Azul (RB) - Gen 1", value: "gen1" },
  { name: "Oro/Plata (GS) - Gen 2", value: "gen2" },
  { name: "Rubí/Zafiro (RS) - Gen 3", value: "gen3" },
  { name: "Diamante/Perla (DP) - Gen 4", value: "gen4" },
  { name: "Blanco/Negro (BW) - Gen 5", value: "gen5" },
  { name: "X/Y (XY) - Gen 6", value: "gen6" },
  { name: "Sol/Luna (SM) - Gen 7", value: "gen7" },
  { name: "Espada/Escudo (SS) - Gen 8", value: "gen8" },
  { name: "Escarlata/Púrpura (SV) - Gen 9", value: "gen9" },
  { name: "Champions / NatDex", value: "natdex" },
];

export interface ResolvedPokeinfoFormat {
  /** Clave de la opción Discord (`gen9`, `natdex`, …). */
  key: PokeinfoFormatValue | "default";
  /** Generación PokéAPI / past_types (1–9). */
  generation: number;
  /** Etiqueta corta para footer. */
  label: string;
  /** Preferir stats National Dex (`gen9nationaldex`). */
  useNatDex: boolean;
  /** Formato de stats preferido en data.pkmn.cc (si aplica). */
  preferredFormatId?: string;
}

/**
 * Mapea `juego_formato` → generación + hint de meta Smogon/PS.
 * Si `value` es null/undefined, usa `defaultGeneration` del panel.
 */
export function resolvePokeinfoFormat(
  value: string | null | undefined,
  defaultGeneration: number = 9,
): ResolvedPokeinfoFormat {
  const genDefault = Math.max(1, Math.min(9, Math.floor(defaultGeneration) || 9));
  const key = (value ?? "").trim().toLowerCase();

  if (!key) {
    return {
      key: "default",
      generation: genDefault,
      label: `Gen ${genDefault}`,
      useNatDex: false,
    };
  }

  if (key === "natdex") {
    return {
      key: "natdex",
      generation: 9,
      label: "NatDex",
      useNatDex: true,
      preferredFormatId: "gen9nationaldex",
    };
  }

  const match = /^gen([1-9])$/.exec(key);
  if (match) {
    const generation = Number(match[1]);
    const choice = POKEINFO_FORMAT_CHOICES.find((c) => c.value === key);
    return {
      key: key as PokeinfoFormatValue,
      generation,
      label: choice?.name ?? `Gen ${generation}`,
      useNatDex: false,
    };
  }

  return {
    key: "default",
    generation: genDefault,
    label: `Gen ${genDefault}`,
    useNatDex: false,
  };
}

/** Los 18 tipos elementales (valor = id PokéAPI / Showdown). */
export const POKEMON_ELEMENTAL_TYPES = [
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

export type PokemonElementalType = (typeof POKEMON_ELEMENTAL_TYPES)[number];

/** Choices Discord para `teratipo` (y similares). */
export const POKEMON_TYPE_CHOICES: ReadonlyArray<{
  name: string;
  value: PokemonElementalType;
}> = [
  { name: "Normal", value: "normal" },
  { name: "Fuego", value: "fire" },
  { name: "Agua", value: "water" },
  { name: "Eléctrico", value: "electric" },
  { name: "Planta", value: "grass" },
  { name: "Hielo", value: "ice" },
  { name: "Lucha", value: "fighting" },
  { name: "Veneno", value: "poison" },
  { name: "Tierra", value: "ground" },
  { name: "Volador", value: "flying" },
  { name: "Psíquico", value: "psychic" },
  { name: "Bicho", value: "bug" },
  { name: "Roca", value: "rock" },
  { name: "Fantasma", value: "ghost" },
  { name: "Dragón", value: "dragon" },
  { name: "Siniestro", value: "dark" },
  { name: "Acero", value: "steel" },
  { name: "Hada", value: "fairy" },
];

