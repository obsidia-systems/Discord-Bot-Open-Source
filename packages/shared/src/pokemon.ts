/** Configuración del plugin Pokémon (PokéAPI + helpers competitivos). */

export const POKEMON_COMMAND_NAMES = [
  "pokeinfo",
  "teambuilder",
  "weakness",
  "breeding",
  "location",
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
  commands: Partial<PokemonCommandsEnabled>;
  guildId: string;
}>;

export function defaultPokemonCommands(): PokemonCommandsEnabled {
  return {
    pokeinfo: true,
    teambuilder: true,
    weakness: true,
    breeding: true,
    location: true,
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
    forceEphemeral: false,
    allowedChannels: [],
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
  teambuilder: "/teambuilder — Constructor de equipos",
  weakness: "/weakness — Debilidades y resistencias",
  breeding: "/breeding — Cría y egg groups",
  location: "/location — Ubicaciones / encounters",
  counters: "/counters — Contadores competitivos",
  sandwich: "/sandwich — Sándwiches (SV)",
};
