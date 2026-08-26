/**
 * Cliente HTTP hacia PokéAPI + caché en memoria para autocomplete.
 * Base: https://pokeapi.co/api/v2/
 */

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

export class PokemonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PokemonApiError";
  }
}

export interface PokemonListEntry {
  name: string;
  url: string;
}

export interface PokemonAbilitySlot {
  name: string;
  isHidden: boolean;
  slot: number;
}

export interface PokemonStatBlock {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  bst: number;
}

export interface PokemonData {
  id: number;
  name: string;
  types: string[];
  abilities: PokemonAbilitySlot[];
  stats: PokemonStatBlock;
  /** Preferir GIF Showdown; fallback a sprite oficial. */
  spriteUrl: string | null;
}

export interface PokemonSpeciesData {
  id: number;
  name: string;
  names: Array<{ language: string; name: string }>;
}

/** Colores de barra del embed según el tipo primario del Pokémon. */
export const POKEMON_TYPE_COLORS: Record<string, string> = {
  normal: "#A8A87E",
  fire: "#F18030",
  water: "#6990F0",
  electric: "#F8D02F",
  grass: "#78C851",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85988",
  bug: "#A8B81F",
  rock: "#B8A038",
  ghost: "#6F5898",
  dragon: "#7038F8",
  dark: "#6F5848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
};

const TYPE_LABELS_ES: Record<string, string> = {
  normal: "Normal",
  fire: "Fuego",
  water: "Agua",
  electric: "Eléctrico",
  grass: "Planta",
  ice: "Hielo",
  fighting: "Lucha",
  poison: "Veneno",
  ground: "Tierra",
  flying: "Volador",
  psychic: "Psíquico",
  bug: "Bicho",
  rock: "Roca",
  ghost: "Fantasma",
  dragon: "Dragón",
  dark: "Siniestro",
  steel: "Acero",
  fairy: "Hada",
};

/** Caché global del listado (autocomplete). */
let speciesIndex: PokemonListEntry[] = [];
let cacheReady = false;
let cachePromise: Promise<void> | null = null;

/** Caché corta de respuestas /pokemon y /pokemon-species. */
const pokemonCache = new Map<string, { at: number; data: PokemonData }>();
const speciesCache = new Map<string, { at: number; data: PokemonSpeciesData }>();
const DETAIL_TTL_MS = 30 * 60_000;

async function pokeFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${POKEAPI_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new PokemonApiError(
      `No se pudo contactar PokéAPI: ${error instanceof Error ? error.message : "error de red"}`,
      502,
      "POKEAPI_NETWORK",
    );
  }

  if (response.status === 404) {
    throw new PokemonApiError(
      "Pokémon no encontrado.",
      404,
      "POKEAPI_NOT_FOUND",
    );
  }

  if (!response.ok) {
    throw new PokemonApiError(
      `PokéAPI respondió ${response.status} en ${path}`,
      response.status,
      "POKEAPI_HTTP",
    );
  }

  return (await response.json()) as T;
}

/**
 * Precarga `pokemon?limit=2000` en memoria (una vez al arrancar).
 */
export async function warmPokemonAutocompleteCache(): Promise<number> {
  if (cacheReady && speciesIndex.length > 0) return speciesIndex.length;
  if (cachePromise) {
    await cachePromise;
    return speciesIndex.length;
  }

  cachePromise = (async () => {
    const body = await pokeFetch<{
      count: number;
      results: PokemonListEntry[];
    }>("/pokemon?limit=2000");
    speciesIndex = Array.isArray(body.results) ? body.results : [];
    cacheReady = true;
    console.log(
      `[adobos] pokemon: caché autocomplete lista (${speciesIndex.length} especies)`,
    );
  })();

  try {
    await cachePromise;
  } finally {
    cachePromise = null;
  }
  return speciesIndex.length;
}

export function isPokemonCacheReady(): boolean {
  return cacheReady;
}

export function getPokemonIndex(): readonly PokemonListEntry[] {
  return speciesIndex;
}

/**
 * Filtra el índice en memoria para autocomplete de Discord (máx. 25).
 */
export function searchPokemonAutocomplete(
  query: string,
  limit = 25,
): Array<{ name: string; value: string }> {
  const q = query.trim().toLowerCase();
  const max = Math.min(25, Math.max(1, limit));
  const source = speciesIndex;

  const matched = !q
    ? source.slice(0, max)
    : source.filter(
        (entry) =>
          entry.name.includes(q) || entry.name.startsWith(q),
      );

  // Prioriza startsWith sobre includes
  const ranked = !q
    ? matched
    : [
        ...matched.filter((e) => e.name.startsWith(q)),
        ...matched.filter((e) => !e.name.startsWith(q) && e.name.includes(q)),
      ];

  const seen = new Set<string>();
  const out: Array<{ name: string; value: string }> = [];
  for (const entry of ranked) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    const label = capitalizePokemonName(entry.name);
    out.push({ name: label.slice(0, 100), value: entry.name.slice(0, 100) });
    if (out.length >= max) break;
  }
  return out;
}

function readStat(
  stats: Array<{ base_stat: number; stat: { name: string } }>,
  key: string,
): number {
  return stats.find((s) => s.stat.name === key)?.base_stat ?? 0;
}

function parsePokemonPayload(raw: Record<string, unknown>): PokemonData {
  const id = Number(raw.id) || 0;
  const name = String(raw.name ?? "");
  const typesRaw = Array.isArray(raw.types) ? raw.types : [];
  const types = typesRaw
    .map((slot) => {
      const s = slot as { type?: { name?: string }; slot?: number };
      return String(s.type?.name ?? "").toLowerCase();
    })
    .filter(Boolean);

  const abilitiesRaw = Array.isArray(raw.abilities) ? raw.abilities : [];
  const abilities: PokemonAbilitySlot[] = abilitiesRaw.map((slot) => {
    const s = slot as {
      ability?: { name?: string };
      is_hidden?: boolean;
      slot?: number;
    };
    return {
      name: String(s.ability?.name ?? "unknown"),
      isHidden: Boolean(s.is_hidden),
      slot: Number(s.slot) || 0,
    };
  });

  const statsRaw = Array.isArray(raw.stats)
    ? (raw.stats as Array<{ base_stat: number; stat: { name: string } }>)
    : [];
  const hp = readStat(statsRaw, "hp");
  const attack = readStat(statsRaw, "attack");
  const defense = readStat(statsRaw, "defense");
  const specialAttack = readStat(statsRaw, "special-attack");
  const specialDefense = readStat(statsRaw, "special-defense");
  const speed = readStat(statsRaw, "speed");

  const sprites = (raw.sprites ?? {}) as {
    front_default?: string | null;
    other?: {
      showdown?: { front_default?: string | null };
      "official-artwork"?: { front_default?: string | null };
    };
  };

  const spriteUrl =
    sprites.other?.showdown?.front_default ||
    sprites.other?.["official-artwork"]?.front_default ||
    sprites.front_default ||
    null;

  return {
    id,
    name,
    types,
    abilities,
    stats: {
      hp,
      attack,
      defense,
      specialAttack,
      specialDefense,
      speed,
      bst: hp + attack + defense + specialAttack + specialDefense + speed,
    },
    spriteUrl,
  };
}

/** Alias pedido en la spec. */
export async function getPokemonData(nameOrId: string): Promise<PokemonData> {
  const key = nameOrId.trim().toLowerCase();
  if (!key) {
    throw new PokemonApiError("Nombre vacío.", 400, "POKEAPI_EMPTY");
  }

  const cached = pokemonCache.get(key);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return cached.data;
  }

  const raw = await pokeFetch<Record<string, unknown>>(
    `/pokemon/${encodeURIComponent(key)}`,
  );
  const data = parsePokemonPayload(raw);
  pokemonCache.set(key, { at: Date.now(), data });
  pokemonCache.set(String(data.id), { at: Date.now(), data });
  return data;
}

/** Alias pedido en la spec. */
export async function getPokemonSpecies(
  nameOrId: string,
): Promise<PokemonSpeciesData> {
  const key = nameOrId.trim().toLowerCase();
  if (!key) {
    throw new PokemonApiError("Nombre vacío.", 400, "POKEAPI_EMPTY");
  }

  const cached = speciesCache.get(key);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return cached.data;
  }

  const raw = await pokeFetch<{
    id: number;
    name: string;
    names?: Array<{ name: string; language: { name: string } }>;
  }>(`/pokemon-species/${encodeURIComponent(key)}`);

  const data: PokemonSpeciesData = {
    id: raw.id,
    name: raw.name,
    names: (raw.names ?? []).map((n) => ({
      language: n.language.name,
      name: n.name,
    })),
  };
  speciesCache.set(key, { at: Date.now(), data });
  speciesCache.set(String(data.id), { at: Date.now(), data });
  return data;
}

export function getTypeColor(
  typeName: string | undefined,
  fallback = "#EF4444",
): number {
  const hex =
    (typeName && POKEMON_TYPE_COLORS[typeName.toLowerCase()]) || fallback;
  const cleaned = hex.replace("#", "");
  const n = Number.parseInt(cleaned, 16);
  return Number.isFinite(n) ? n : 0xef4444;
}

export function formatTypeLabel(
  typeName: string,
  language: "es" | "en",
): string {
  const key = typeName.toLowerCase();
  if (language === "es") return TYPE_LABELS_ES[key] ?? capitalizePokemonName(key);
  return capitalizePokemonName(key);
}

export function capitalizePokemonName(name: string): string {
  return name
    .split("-")
    .map((part) =>
      part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1),
    )
    .join("-");
}

export function formatAbilityLabel(name: string): string {
  return capitalizePokemonName(name.replace(/-/g, " "));
}

export function resolveDisplayName(
  species: PokemonSpeciesData | null,
  fallbackApiName: string,
  language: "es" | "en",
): string {
  if (species) {
    const localized = species.names.find((n) => n.language === language)?.name;
    if (localized) return localized;
    const en = species.names.find((n) => n.language === "en")?.name;
    if (en) return en;
  }
  return capitalizePokemonName(fallbackApiName);
}

export { POKEAPI_BASE };

/** @deprecated usar getPokemonData */
export const fetchPokemon = getPokemonData;
/** @deprecated usar getPokemonSpecies */
export const fetchPokemonSpecies = getPokemonSpecies;
