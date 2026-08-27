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

export interface PokemonPastTypesEntry {
  /** Última generación en la que aplicaban estos tipos. */
  throughGeneration: number;
  types: string[];
}

export interface PokemonPastAbilitiesEntry {
  throughGeneration: number;
  abilities: PokemonAbilitySlot[];
}

export interface PokemonData {
  id: number;
  name: string;
  /** Nombre de la especie base (sin mega/gmax); útil para species/evolution-chain. */
  speciesName: string;
  types: string[];
  abilities: PokemonAbilitySlot[];
  stats: PokemonStatBlock;
  /** Preferir GIF Showdown; fallback a sprite oficial. */
  spriteUrl: string | null;
  /** Altura en metros (PokéAPI decímetros / 10). */
  heightM: number;
  /** Peso en kg (PokéAPI hectogramos / 10). */
  weightKg: number;
  pastTypes: PokemonPastTypesEntry[];
  pastAbilities: PokemonPastAbilitiesEntry[];
}

export interface PokemonVariety {
  name: string;
  isDefault: boolean;
}

export interface PokemonSpeciesData {
  id: number;
  name: string;
  names: Array<{ language: string; name: string }>;
  varieties: PokemonVariety[];
  /** API name de la pre-evolución, si existe. */
  evolvesFromSpecies: string | null;
  /** URL absoluta de `/evolution-chain/{id}/`. */
  evolutionChainUrl: string | null;
}

/** Snapshot ya resuelto para una generación concreta. */
export interface PokemonGenerationSnapshot {
  generation: number;
  types: string[];
  abilities: PokemonAbilitySlot[];
  stats: PokemonStatBlock;
  spriteUrl: string | null;
  id: number;
  name: string;
  heightM: number;
  weightKg: number;
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

function generationNumberFromName(name: string): number {
  const map: Record<string, number> = {
    "generation-i": 1,
    "generation-ii": 2,
    "generation-iii": 3,
    "generation-iv": 4,
    "generation-v": 5,
    "generation-vi": 6,
    "generation-vii": 7,
    "generation-viii": 8,
    "generation-ix": 9,
  };
  return map[name.toLowerCase()] ?? 9;
}

function parseTypeSlots(
  typesRaw: unknown[],
): string[] {
  return typesRaw
    .map((slot) => {
      const s = slot as { type?: { name?: string } };
      return String(s.type?.name ?? "").toLowerCase();
    })
    .filter(Boolean);
}

function parseAbilitySlots(abilitiesRaw: unknown[]): PokemonAbilitySlot[] {
  return abilitiesRaw.map((slot) => {
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
}

function parsePokemonPayload(raw: Record<string, unknown>): PokemonData {
  const id = Number(raw.id) || 0;
  const name = String(raw.name ?? "");
  const types = parseTypeSlots(Array.isArray(raw.types) ? raw.types : []);
  const abilities = parseAbilitySlots(
    Array.isArray(raw.abilities) ? raw.abilities : [],
  );

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

  const pastTypesRaw = Array.isArray(raw.past_types) ? raw.past_types : [];
  const pastTypes: PokemonPastTypesEntry[] = pastTypesRaw.map((entry) => {
    const e = entry as {
      generation?: { name?: string };
      types?: unknown[];
    };
    return {
      throughGeneration: generationNumberFromName(
        String(e.generation?.name ?? "generation-ix"),
      ),
      types: parseTypeSlots(Array.isArray(e.types) ? e.types : []),
    };
  });

  const pastAbilitiesRaw = Array.isArray(raw.past_abilities)
    ? raw.past_abilities
    : [];
  const pastAbilities: PokemonPastAbilitiesEntry[] = pastAbilitiesRaw.map(
    (entry) => {
      const e = entry as {
        generation?: { name?: string };
        abilities?: unknown[];
      };
      return {
        throughGeneration: generationNumberFromName(
          String(e.generation?.name ?? "generation-ix"),
        ),
        abilities: parseAbilitySlots(
          Array.isArray(e.abilities) ? e.abilities : [],
        ),
      };
    },
  );

  return {
    id,
    name,
    speciesName: String(
      (raw.species as { name?: string } | undefined)?.name ?? name,
    ).toLowerCase(),
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
    // PokéAPI: height en decímetros, weight en hectogramos.
    heightM: Math.round((Number(raw.height) || 0) * 10) / 100,
    weightKg: Math.round((Number(raw.weight) || 0) * 10) / 100,
    pastTypes,
    pastAbilities,
  };
}

/**
 * Resuelve tipos/habilidades según generación.
 * `past_types[].throughGeneration` = última gen en la que aplicaban esos tipos.
 */
export function resolvePokemonForGeneration(
  data: PokemonData,
  generation: number,
): PokemonGenerationSnapshot {
  const gen = Math.max(1, Math.min(9, Math.floor(generation) || 9));

  const pastType = data.pastTypes
    .filter((p) => gen <= p.throughGeneration)
    .sort((a, b) => a.throughGeneration - b.throughGeneration)[0];

  const pastAbility = data.pastAbilities
    .filter((p) => gen <= p.throughGeneration)
    .sort((a, b) => a.throughGeneration - b.throughGeneration)[0];

  return {
    generation: gen,
    id: data.id,
    name: data.name,
    types: pastType?.types?.length ? pastType.types : data.types,
    abilities: pastAbility?.abilities?.length
      ? pastAbility.abilities
      : data.abilities,
    stats: data.stats,
    spriteUrl: data.spriteUrl,
    heightM: data.heightM,
    weightKg: data.weightKg,
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
    evolves_from_species?: { name?: string } | null;
    evolution_chain?: { url?: string } | null;
    varieties?: Array<{
      is_default?: boolean;
      pokemon?: { name?: string };
    }>;
  }>(`/pokemon-species/${encodeURIComponent(key)}`);

  const data: PokemonSpeciesData = {
    id: raw.id,
    name: raw.name,
    names: (raw.names ?? []).map((n) => ({
      language: n.language.name,
      name: n.name,
    })),
    varieties: (raw.varieties ?? []).map((v) => ({
      name: String(v.pokemon?.name ?? ""),
      isDefault: Boolean(v.is_default),
    })),
    evolvesFromSpecies: raw.evolves_from_species?.name
      ? String(raw.evolves_from_species.name)
      : null,
    evolutionChainUrl: raw.evolution_chain?.url
      ? String(raw.evolution_chain.url)
      : null,
  };
  speciesCache.set(key, { at: Date.now(), data });
  speciesCache.set(String(data.id), { at: Date.now(), data });
  return data;
}

/** Detalle crudo de evolución (subset útil de PokéAPI). */
export interface EvolutionDetailInfo {
  trigger: string | null;
  item: string | null;
  heldItem: string | null;
  minLevel: number | null;
  minHappiness: number | null;
  minAffection: number | null;
  minBeauty: number | null;
  timeOfDay: string | null;
  location: string | null;
  knownMove: string | null;
  knownMoveType: string | null;
  gender: number | null;
  tradeSpecies: string | null;
  needsOverworldRain: boolean;
  turnUpsideDown: boolean;
  relativePhysicalStats: number | null;
  partySpecies: string | null;
  partyType: string | null;
}

export interface EvolutionChainNode {
  speciesName: string;
  /** Condiciones para llegar a este nodo desde el padre (vacío en la raíz). */
  details: EvolutionDetailInfo[];
  evolvesTo: EvolutionChainNode[];
}

export interface EvolutionLineEntry {
  speciesName: string;
  methodLabel: string;
  isMega?: boolean;
  megaLabel?: string;
  /** Línea compacta de muchas ramas (solo se usa methodLabel). */
  isBranchList?: boolean;
}

export interface EvolutionLineSummary {
  /** Cadena completa desde la raíz (incluye Base / métodos / megas al final). */
  stages: EvolutionLineEntry[];
}

const evolutionChainCache = new Map<
  string,
  { at: number; data: EvolutionChainNode }
>();

function parseEvolutionDetail(raw: Record<string, unknown>): EvolutionDetailInfo {
  const named = (v: unknown): string | null => {
    if (!v || typeof v !== "object") return null;
    const n = (v as { name?: string }).name;
    return n ? String(n) : null;
  };
  const time = typeof raw.time_of_day === "string" ? raw.time_of_day.trim() : "";
  return {
    trigger: named(raw.trigger),
    item: named(raw.item),
    heldItem: named(raw.held_item),
    minLevel:
      typeof raw.min_level === "number" ? raw.min_level : null,
    minHappiness:
      typeof raw.min_happiness === "number" ? raw.min_happiness : null,
    minAffection:
      typeof raw.min_affection === "number" ? raw.min_affection : null,
    minBeauty:
      typeof raw.min_beauty === "number" ? raw.min_beauty : null,
    timeOfDay: time || null,
    location: named(raw.location),
    knownMove: named(raw.known_move),
    knownMoveType: named(raw.known_move_type),
    gender: typeof raw.gender === "number" ? raw.gender : null,
    tradeSpecies: named(raw.trade_species),
    needsOverworldRain: Boolean(raw.needs_overworld_rain),
    turnUpsideDown: Boolean(raw.turn_upside_down),
    relativePhysicalStats:
      typeof raw.relative_physical_stats === "number"
        ? raw.relative_physical_stats
        : null,
    partySpecies: named(raw.party_species),
    partyType: named(raw.party_type),
  };
}

function parseEvolutionChainNode(raw: Record<string, unknown>): EvolutionChainNode {
  const species = raw.species as { name?: string } | undefined;
  const detailsRaw = Array.isArray(raw.evolution_details)
    ? raw.evolution_details
    : [];
  const evolvesRaw = Array.isArray(raw.evolves_to) ? raw.evolves_to : [];
  return {
    speciesName: String(species?.name ?? "").toLowerCase(),
    details: detailsRaw.map((d) =>
      parseEvolutionDetail((d ?? {}) as Record<string, unknown>),
    ),
    evolvesTo: evolvesRaw.map((c) =>
      parseEvolutionChainNode((c ?? {}) as Record<string, unknown>),
    ),
  };
}

/** Obtiene y cachea el árbol de `evolution-chain`. */
export async function getEvolutionChain(
  urlOrId: string,
): Promise<EvolutionChainNode> {
  const key = urlOrId.trim();
  if (!key) {
    throw new PokemonApiError("Cadena evolutiva vacía.", 400, "POKEAPI_EMPTY");
  }

  const cached = evolutionChainCache.get(key);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return cached.data;
  }

  const path = key.startsWith("http")
    ? key
    : `/evolution-chain/${encodeURIComponent(key)}`;
  const raw = await pokeFetch<{ chain?: Record<string, unknown> }>(path);
  if (!raw.chain) {
    throw new PokemonApiError(
      "Cadena evolutiva inválida.",
      502,
      "POKEAPI_EVO_CHAIN",
    );
  }
  const data = parseEvolutionChainNode(raw.chain);
  evolutionChainCache.set(key, { at: Date.now(), data });
  return data;
}

function slugToLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return capitalizePokemonName(slug.replace(/-/g, " "));
}

/** Piedras / objetos de evolución frecuentes (PokéAPI slug → ES). */
const EVOLUTION_ITEM_ES: Record<string, string> = {
  "thunder-stone": "Piedra Trueno",
  "fire-stone": "Piedra Fuego",
  "water-stone": "Piedra Agua",
  "leaf-stone": "Piedra Hoja",
  "moon-stone": "Piedra Lunar",
  "sun-stone": "Piedra Solar",
  "shiny-stone": "Piedra Día",
  "dusk-stone": "Piedra Noche",
  "dawn-stone": "Piedra Alba",
  "ice-stone": "Piedra Hielo",
  "oval-stone": "Piedra Oval",
  "kings-rock": "Roca del Rey",
  "metal-coat": "Revestimiento Metálico",
  "dragon-scale": "Escama Dragón",
  "upgrade": "Mejora",
  "dubious-disc": "Disco Extraño",
  "protector": "Protector",
  "electirizer": "Electrizador",
  "magmarizer": "Magmatizador",
  "reaper-cloth": "Tela Terrible",
  "razor-claw": "Garra Afilada",
  "razor-fang": "Colmillo Afilado",
  "prism-scale": "Escama Bella",
  "sachet": "Saquito Fragante",
  "whipped-dream": "Dulce de Nata",
  "tart-apple": "Manzana Ácida",
  "sweet-apple": "Manzana Dulce",
  "cracked-pot": "Tetera Agrietada",
  "chipped-pot": "Tetera Rota",
  "galarica-cuff": "Brazal Galanuez",
  "galarica-wreath": "Corona Galanuez",
  "black-augurite": "Mineral Negro",
  "peat-block": "Bloque de Turba",
  "linking-cord": "Cable Unión",
  "auspicious-armor": "Armadura Auspiciosa",
  "malicious-armor": "Armadura Maldita",
  "masterpiece-teacup": "Cuenco Exquisito",
  "unremarkable-teacup": "Cuenco Mediocre",
  "syrupy-apple": "Manzana Melosa",
};

function formatEvolutionItemLabel(
  slug: string | null | undefined,
  language: "es" | "en",
): string {
  if (!slug) return "";
  if (language === "es") {
    return EVOLUTION_ITEM_ES[slug.toLowerCase()] ?? slugToLabel(slug);
  }
  return slugToLabel(slug);
}

/**
 * Traduce `evolution_details` a una etiqueta corta en español/inglés.
 * Ej: `Nivel 20 (Día)`, `Piedra Trueno`, `Intercambio`.
 */
export function formatEvolutionMethodLabel(
  details: EvolutionDetailInfo[],
  language: "es" | "en" = "es",
): string {
  const detail = details[0];
  if (!detail) return language === "es" ? "Desconocido" : "Unknown";

  const notes: string[] = [];
  const es = language === "es";

  if (detail.timeOfDay === "day") notes.push(es ? "Día" : "Day");
  if (detail.timeOfDay === "night") notes.push(es ? "Noche" : "Night");
  if (detail.needsOverworldRain) notes.push(es ? "Lluvia" : "Rain");
  if (detail.turnUpsideDown) notes.push(es ? "Consola invertida" : "Upside-down");
  if (detail.location) notes.push(slugToLabel(detail.location));
  if (detail.knownMove) {
    notes.push(
      es
        ? `Mov. ${slugToLabel(detail.knownMove)}`
        : `Move ${slugToLabel(detail.knownMove)}`,
    );
  }
  if (detail.knownMoveType) {
    notes.push(
      es
        ? `Tipo ${formatTypeLabel(detail.knownMoveType, language)}`
        : `${formatTypeLabel(detail.knownMoveType, language)}-type move`,
    );
  }
  if (detail.gender === 1) notes.push(es ? "♀" : "Female");
  if (detail.gender === 2) notes.push(es ? "♂" : "Male");
  if (detail.relativePhysicalStats === 1) {
    notes.push(es ? "Atq > Def" : "Atk > Def");
  } else if (detail.relativePhysicalStats === -1) {
    notes.push(es ? "Atq < Def" : "Atk < Def");
  } else if (detail.relativePhysicalStats === 0) {
    notes.push(es ? "Atq = Def" : "Atk = Def");
  }
  if (detail.partySpecies) {
    notes.push(
      es
        ? `En equipo: ${slugToLabel(detail.partySpecies)}`
        : `Party: ${slugToLabel(detail.partySpecies)}`,
    );
  }
  if (detail.partyType) {
    notes.push(
      es
        ? `Tipo en equipo: ${formatTypeLabel(detail.partyType, language)}`
        : `Party type: ${formatTypeLabel(detail.partyType, language)}`,
    );
  }
  if (detail.tradeSpecies) {
    notes.push(
      es
        ? `Por ${slugToLabel(detail.tradeSpecies)}`
        : `For ${slugToLabel(detail.tradeSpecies)}`,
    );
  }

  let core = "";
  const trigger = detail.trigger ?? "";

  if (detail.minLevel != null) {
    core = es ? `Nivel ${detail.minLevel}` : `Level ${detail.minLevel}`;
  } else if (detail.item) {
    core = formatEvolutionItemLabel(detail.item, language);
  } else if (trigger === "trade") {
    core = detail.heldItem
      ? es
        ? `Intercambio (${formatEvolutionItemLabel(detail.heldItem, language)})`
        : `Trade (${formatEvolutionItemLabel(detail.heldItem, language)})`
      : es
        ? "Intercambio"
        : "Trade";
  } else if (trigger === "use-item" && detail.item) {
    core = formatEvolutionItemLabel(detail.item, language);
  } else if (detail.minHappiness != null) {
    core = es ? "Felicidad" : "Friendship";
  } else if (detail.minAffection != null) {
    core = es ? "Afecto" : "Affection";
  } else if (detail.minBeauty != null) {
    core = es ? "Belleza" : "Beauty";
  } else if (trigger === "shed") {
    core = es ? "Espacio libre en equipo" : "Empty party slot";
  } else if (trigger === "spin") {
    core = es ? "Girar" : "Spin";
  } else if (trigger === "tower-of-darkness" || trigger === "tower-of-waters") {
    core = slugToLabel(trigger);
  } else if (trigger === "three-critical-hits") {
    core = es ? "3 golpes críticos" : "3 critical hits";
  } else if (trigger === "take-damage") {
    core = es ? "Recibir daño" : "Take damage";
  } else if (trigger === "other") {
    core = es ? "Condición especial" : "Special condition";
  } else if (trigger === "level-up") {
    core = es ? "Subir de nivel" : "Level up";
  } else {
    core = slugToLabel(trigger) || (es ? "Desconocido" : "Unknown");
  }

  // Evitar duplicar "Felicidad" si ya está en notes vía time_of_day only
  if (
    detail.minHappiness != null &&
    !core.toLowerCase().includes(es ? "felicidad" : "friend")
  ) {
    notes.unshift(es ? "Felicidad" : "Friendship");
  }

  const uniqueNotes = [...new Set(notes.filter(Boolean))];
  if (uniqueNotes.length === 0) return core;
  // Si el core ya es Felicidad y solo hay Día/Noche, "Felicidad (Día)"
  return `${core} (${uniqueNotes.join(", ")})`;
}

function megaStoneLabel(_varietyName: string, language: "es" | "en"): string {
  // Preparado para inyección futura de emoji de ítem: `${emoji} Megapiedra`
  return language === "es" ? "Megapiedra" : "Mega Stone";
}

function formatMegaVarietyLabel(
  varietyName: string,
  speciesName: string,
): string {
  const n = varietyName.toLowerCase();
  const base = capitalizePokemonName(speciesName);
  if (n.includes("-mega-x")) return `Mega-${base} X`;
  if (n.includes("-mega-y")) return `Mega-${base} Y`;
  return `Mega-${base}`;
}

function collectMegaEntries(
  varieties: PokemonVariety[] | undefined,
  speciesName: string,
  language: "es" | "en",
): EvolutionLineEntry[] {
  const megas = (varieties ?? []).filter((v) => /-mega($|-)/i.test(v.name));
  return megas.map((mega) => ({
    speciesName: mega.name,
    methodLabel: megaStoneLabel(mega.name, language),
    isMega: true,
    megaLabel: formatMegaVarietyLabel(mega.name, speciesName),
  }));
}

function findLinearLeaf(node: EvolutionChainNode): EvolutionChainNode {
  let cur = node;
  while (cur.evolvesTo.length === 1) {
    cur = cur.evolvesTo[0]!;
  }
  return cur;
}

/** Megas indexadas por nombre de especie base. */
export type MegaBySpecies = Map<string, EvolutionLineEntry[]>;

/**
 * Agrupa megas del Pokémon actual y de la etapa final (cadena lineal).
 */
export function buildMegaBySpeciesMap(
  chain: EvolutionChainNode,
  speciesName: string,
  varieties: PokemonVariety[] | undefined,
  language: "es" | "en" = "es",
  finalStageVarieties?: PokemonVariety[],
): MegaBySpecies {
  const map: MegaBySpecies = new Map();
  const add = (sp: string, vars: PokemonVariety[] | undefined) => {
    const entries = collectMegaEntries(vars, sp, language);
    if (entries.length === 0) return;
    const key = sp.toLowerCase();
    const existing = map.get(key) ?? [];
    for (const e of entries) {
      if (!existing.some((x) => x.speciesName === e.speciesName)) {
        existing.push(e);
      }
    }
    map.set(key, existing);
  };

  add(speciesName, varieties);
  const leaf = findLinearLeaf(chain);
  if (leaf.speciesName !== speciesName.toLowerCase()) {
    add(leaf.speciesName, finalStageVarieties);
  } else if (finalStageVarieties && finalStageVarieties !== varieties) {
    add(leaf.speciesName, finalStageVarieties);
  }

  return map;
}

type TreeChild =
  | { kind: "evo"; node: EvolutionChainNode }
  | { kind: "mega"; entry: EvolutionLineEntry };

/**
 * Unidad de indentación: 3 NBSP.
 * Discord colapsa espacios ASCII normales al inicio de línea en embeds;
 * los no-break spaces se preservan y el árbol se ve anidado.
 */
const TREE_INDENT_UNIT = "\u00A0\u00A0\u00A0";

/**
 * Árbol ASCII de la cadena evolutiva (`├─` / `└─` + indent por `depth`).
 *
 * Ej. lineal:
 * ```
 * Dratini (Base)
 * └─ Dragonair (Nivel 30)
 *    └─ Dragonite (Nivel 55)
 *       └─ <:mega…> Mega-Dragonite (Megapiedra)
 * ```
 */
export function formatEvolutionAsciiTree(
  chain: EvolutionChainNode,
  language: "es" | "en" = "es",
  megaEmoji = "<:mega_evolution:1542327306738208849>",
  megasBySpecies: MegaBySpecies = new Map(),
): string | null {
  const lines: string[] = [];

  const childrenOf = (node: EvolutionChainNode): TreeChild[] => [
    ...node.evolvesTo.map((n): TreeChild => ({ kind: "evo", node: n })),
    ...(megasBySpecies.get(node.speciesName) ?? []).map(
      (entry): TreeChild => ({ kind: "mega", entry }),
    ),
  ];

  const walk = (
    node: EvolutionChainNode,
    depth: number,
    isLast: boolean,
  ): void => {
    if (depth === 0) {
      lines.push(`${capitalizePokemonName(node.speciesName)} (Base)`);
    } else {
      const indent = TREE_INDENT_UNIT.repeat(depth - 1);
      const branch = isLast ? "└─ " : "├─ ";
      const method = formatEvolutionMethodLabel(node.details, language);
      lines.push(
        `${indent}${branch}${capitalizePokemonName(node.speciesName)} (${method})`,
      );
    }

    const kids = childrenOf(node);
    kids.forEach((kid, index) => {
      const kidIsLast = index === kids.length - 1;
      if (kid.kind === "mega") {
        const megaDepth = depth + 1;
        const indent = TREE_INDENT_UNIT.repeat(Math.max(0, megaDepth - 1));
        const branch = kidIsLast ? "└─ " : "├─ ";
        const label =
          kid.entry.megaLabel ??
          capitalizePokemonName(kid.entry.speciesName);
        lines.push(
          `${indent}${branch}${megaEmoji} ${label} (${kid.entry.methodLabel})`,
        );
        return;
      }
      walk(kid.node, depth + 1, kidIsLast);
    });
  };

  walk(chain, 0, true);

  if (lines.length === 0) return null;
  return lines.join("\n").slice(0, 1024);
}

/**
 * @deprecated Preferir `formatEvolutionAsciiTree` + `buildMegaBySpeciesMap`.
 */
export function resolveEvolutionLine(
  chain: EvolutionChainNode,
  speciesName: string,
  varieties: PokemonVariety[] | undefined,
  language: "es" | "en" = "es",
  finalStageVarieties?: PokemonVariety[],
): EvolutionLineSummary {
  const megas = buildMegaBySpeciesMap(
    chain,
    speciesName,
    varieties,
    language,
    finalStageVarieties,
  );
  const tree =
    formatEvolutionAsciiTree(
      chain,
      language,
      "<:mega_evolution:1542327306738208849>",
      megas,
    ) ?? "";
  return {
    stages: tree.split("\n").map((line) => ({
      speciesName: line,
      methodLabel: "",
    })),
  };
}

/**
 * @deprecated Preferir `formatEvolutionAsciiTree`.
 */
export function formatEvolutionLineField(
  summary: EvolutionLineSummary,
  _language: "es" | "en" = "es",
  _megaEmoji = "<:mega_evolution:1542327306738208849>",
): string | null {
  if (!summary.stages.length) return null;
  return summary.stages.map((s) => s.speciesName).join("\n").slice(0, 1024);
}

/** Encuentro agrupado por versión de juego. */
export interface PokemonEncounterByVersion {
  version: string;
  versionLabel: string;
  locations: string[];
}

/** Etiquetas legibles de versiones (PokéAPI slug → nombre de juego). */
const VERSION_LABELS_ES: Record<string, string> = {
  red: "Pokémon Rojo",
  blue: "Pokémon Azul",
  yellow: "Pokémon Amarillo",
  gold: "Pokémon Oro",
  silver: "Pokémon Plata",
  crystal: "Pokémon Cristal",
  ruby: "Pokémon Rubí",
  sapphire: "Pokémon Zafiro",
  emerald: "Pokémon Esmeralda",
  firered: "Pokémon Rojo Fuego",
  leafgreen: "Pokémon Verde Hoja",
  diamond: "Pokémon Diamante",
  pearl: "Pokémon Perla",
  platinum: "Pokémon Platino",
  heartgold: "Pokémon Oro HeartGold",
  soulsilver: "Pokémon Plata SoulSilver",
  black: "Pokémon Negro",
  white: "Pokémon Blanco",
  "black-2": "Pokémon Negro 2",
  "white-2": "Pokémon Blanco 2",
  x: "Pokémon X",
  y: "Pokémon Y",
  "omega-ruby": "Pokémon Rubí Omega",
  "alpha-sapphire": "Pokémon Zafiro Alfa",
  sun: "Pokémon Sol",
  moon: "Pokémon Luna",
  "ultra-sun": "Pokémon Ultra Sol",
  "ultra-moon": "Pokémon Ultra Luna",
  "lets-go-pikachu": "Pokémon Let's Go Pikachu",
  "lets-go-eevee": "Pokémon Let's Go Eevee",
  sword: "Pokémon Espada",
  shield: "Pokémon Escudo",
  "brilliant-diamond": "Pokémon Diamante Brillante",
  "shining-pearl": "Pokémon Perla Reluciente",
  "legends-arceus": "Leyendas Pokémon: Arceus",
  scarlet: "Pokémon Escarlata",
  violet: "Pokémon Púrpura",
};

const encountersCache = new Map<
  string,
  { at: number; data: PokemonEncounterByVersion[] }
>();

/**
 * Formatea el slug de location-area (p. ej. `trophy-garden-area` → `Trophy Garden`).
 */
export function formatLocationAreaLabel(slug: string): string {
  const spaced = slug
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return dedupeLocationBaseName(spaced);
}

/**
 * Elimina sufijos de sub-áreas y deja el nombre base del mapa.
 * Ej: "Great Marsh Area 1" → "Great Marsh"
 *     "Foo North Towards Bar" → "Foo"
 */
export function dedupeLocationBaseName(label: string): string {
  let name = label.trim().replace(/\s+/g, " ");
  if (!name) return name;

  // Direcciones / "towards …"
  name = name.replace(
    /\s+(?:North|South|East|West)\s+Towards\b.*$/i,
    "",
  );
  name = name.replace(/\s+Towards\b.*$/i, "");

  // Variantes temporales / eventos en el mismo mapa
  name = name.replace(/\s+(?:Before|After)\b.*$/i, "");

  // "Area 1", "Area 2", "Area" al final o sueltos
  name = name.replace(/\s+Area(?:\s+\d+)?$/i, "");
  name = name.replace(/\s+Area\s+\d+\b/gi, "");

  // Sufijos tipo "Section 1", "Zone 2", "Spot 3"
  name = name.replace(/\s+(?:Section|Zone|Spot|Sector)\s+\d+$/i, "");

  return name.replace(/\s+/g, " ").trim();
}

export function formatVersionLabel(versionSlug: string): string {
  const key = versionSlug.toLowerCase();
  return VERSION_LABELS_ES[key] ?? capitalizePokemonName(key.replace(/-/g, " "));
}

/**
 * Consulta `GET /pokemon/{idOrName}/encounters` y agrupa ubicaciones por versión.
 */
export async function getPokemonEncounters(
  idOrName: string,
): Promise<PokemonEncounterByVersion[]> {
  const key = idOrName.trim().toLowerCase();
  if (!key) {
    throw new PokemonApiError("Nombre vacío.", 400, "POKEAPI_EMPTY");
  }

  const cacheKey = `v3:${key}`;
  const cached = encountersCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return cached.data;
  }

  const raw = await pokeFetch<
    Array<{
      location_area?: { name?: string };
      version_details?: Array<{
        version?: { name?: string };
        max_chance?: number;
      }>;
    }>
  >(`/pokemon/${encodeURIComponent(key)}/encounters`);

  /** version → set de location labels base (deduplicados) */
  const byVersion = new Map<string, Set<string>>();

  for (const entry of raw) {
    const areaSlug = entry.location_area?.name;
    if (!areaSlug) continue;
    const areaLabel = formatLocationAreaLabel(areaSlug);
    if (!areaLabel) continue;

    for (const detail of entry.version_details ?? []) {
      const version = detail.version?.name;
      if (!version) continue;
      let set = byVersion.get(version);
      if (!set) {
        set = new Set();
        byVersion.set(version, set);
      }
      set.add(areaLabel);
    }
  }

  const grouped: PokemonEncounterByVersion[] = [...byVersion.entries()]
    .map(([version, locations]) => ({
      version,
      versionLabel: formatVersionLabel(version),
      locations: [...locations].sort((a, b) => a.localeCompare(b, "es")),
    }))
    .sort((a, b) => a.versionLabel.localeCompare(b.versionLabel, "es"));

  encountersCache.set(cacheKey, { at: Date.now(), data: grouped });
  return grouped;
}

/** Valor de un field de ubicaciones (máx. 1024). */
export function formatEncounterFieldValue(
  locations: string[],
  maxLocations = 4,
): string {
  if (locations.length === 0) return "> —";

  const visible = locations.slice(0, Math.max(1, maxLocations));
  const extra = locations.length - visible.length;
  let value = `> ${visible.join(", ")}`;
  if (extra > 0) {
    value += `\n*... y ${extra} zonas más*`;
  }
  if (value.length > 1024) {
    value = `${value.slice(0, 1020)}…`;
  }
  return value;
}

/**
 * Fields del embed `/location` (1 por versión, máx. 25).
 */
export function buildEncounterEmbedFields(
  groups: PokemonEncounterByVersion[],
  options?: { maxLocationsPerVersion?: number; maxFields?: number },
): Array<{ name: string; value: string; inline: boolean }> {
  const maxLocs = options?.maxLocationsPerVersion ?? 4;
  const maxFields = Math.min(options?.maxFields ?? 25, 25);
  if (groups.length === 0) return [];

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  const versionsToShow =
    groups.length > maxFields ? groups.slice(0, maxFields - 1) : groups;

  for (const group of versionsToShow) {
    fields.push({
      name: `🎮 ${group.versionLabel}`.slice(0, 256),
      value: formatEncounterFieldValue(group.locations, maxLocs),
      inline: false,
    });
  }

  const omitted = groups.length - versionsToShow.length;
  if (omitted > 0 && fields.length < maxFields) {
    fields.push({
      name: "🎮 Más versiones",
      value: `*…y ${omitted} versión(es) más con encuentros.*`,
      inline: false,
    });
  }

  return fields;
}

/**
 * @deprecated Preferir `buildEncounterEmbedFields` para el embed de `/location`.
 */
export function formatEncountersDescription(
  groups: PokemonEncounterByVersion[],
  options?: { maxVersions?: number; maxLocationsPerVersion?: number },
): string {
  if (groups.length === 0) {
    return "Este Pokémon no se encuentra de forma salvaje en la hierba.";
  }

  const maxVersions = options?.maxVersions ?? 20;
  const maxLocs = options?.maxLocationsPerVersion ?? 4;
  const lines: string[] = [];
  let shown = 0;

  for (const group of groups) {
    if (shown >= maxVersions) break;
    const locs = group.locations;
    const visible = locs.slice(0, maxLocs);
    const extra = locs.length - visible.length;
    const locText =
      visible.join(", ") + (extra > 0 ? ` (+${extra} más)` : "");
    lines.push(`**${group.versionLabel}:** ${locText}`);
    shown += 1;
  }

  const omitted = groups.length - shown;
  if (omitted > 0) {
    lines.push(`\n_…y ${omitted} versión(es) más._`);
  }

  let text = lines.join("\n");
  if (text.length > 3900) {
    text = `${text.slice(0, 3890)}…`;
  }
  return text;
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

/** Slug de dex Smogon según generación. */
export function smogonDexSlug(generation: number): string {
  const map: Record<number, string> = {
    1: "rb",
    2: "gs",
    3: "rs",
    4: "dp",
    5: "bw",
    6: "xy",
    7: "sm",
    8: "ss",
    9: "sv",
  };
  return map[generation] ?? "sv";
}

export function buildSmogonPokemonUrl(
  apiName: string,
  generation: number,
): string {
  const slug = apiName.trim().toLowerCase().replace(/\s+/g, "-");
  return `https://www.smogon.com/dex/${smogonDexSlug(generation)}/pokemon/${encodeURIComponent(slug)}/`;
}

export function formatStatsCodeBlock(stats: PokemonStatBlock): string {
  const pad = (label: string, value: number) =>
    `${label.padEnd(4)}: ${String(value).padStart(3)}`;
  return [
    "```text",
    `${pad("HP", stats.hp)}  | ${pad("SpA", stats.specialAttack)}`,
    `${pad("Atk", stats.attack)}  | ${pad("SpD", stats.specialDefense)}`,
    `${pad("Def", stats.defense)}  | ${pad("Spe", stats.speed)}`,
    "-------------------",
    `Total (BST) : ${stats.bst}`,
    "```",
  ].join("\n");
}

/** Etiquetas legibles de formas alternativas (gmax, regionales…). Sin megas. */
export function formatAlternativeForms(
  species: PokemonSpeciesData | null,
  currentApiName: string,
): string | null {
  if (!species?.varieties?.length) return null;
  const alts = species.varieties
    .filter((v) => {
      if (!v.name || v.isDefault || v.name === currentApiName) return false;
      // Las megas van en Línea Evolutiva.
      if (/-mega($|-)/i.test(v.name)) return false;
      return true;
    })
    .map((v) => {
      const n = v.name.toLowerCase();
      if (n.includes("-gmax") || n.includes("-gigantamax")) return "Gigantamax";
      if (n.includes("-alola")) return "Alola";
      if (n.includes("-galar")) return "Galar";
      if (n.includes("-hisui")) return "Hisui";
      if (n.includes("-paldea")) return "Paldea";
      if (n.includes("-therian")) return "Therian";
      if (n.includes("-origin")) return "Origin";
      if (n.includes("-crowned")) return "Crowned";
      if (n.includes("-ash")) return "Ash";
      return capitalizePokemonName(v.name.replace(`${species.name}-`, ""));
    });

  const unique = [...new Set(alts.filter(Boolean))];
  if (unique.length === 0) return null;
  return unique.join(", ");
}

export interface CompetitiveHints {
  items: string[];
  natures: string[];
}

export type { CompetitiveMeta } from "./smogonService.js";
export {
  formatCompetitiveMetaField,
  getCompetitiveData,
} from "./smogonService.js";

import { getCompetitiveData } from "./smogonService.js";

/**
 * @deprecated Usar `getCompetitiveData` (async, datos reales Smogon/PS).
 */
export async function resolveCompetitiveMeta(
  apiName: string,
  generation: number,
) {
  return getCompetitiveData(apiName, generation);
}

/** @deprecated Preferir `getCompetitiveData`. */
export async function tryFetchCompetitiveHints(
  apiName: string,
  generation: number,
): Promise<CompetitiveHints | null> {
  const meta = await getCompetitiveData(apiName, generation);
  if (meta.items.length === 1 && meta.items[0] === "Sin datos") return null;
  return { items: meta.items, natures: meta.natures };
}

export function formatCompetitiveHintsField(
  hints: CompetitiveHints,
): string {
  const parts: string[] = [];
  if (hints.items.length > 0) {
    parts.push(`**Objetos:** ${hints.items.join(", ")}`);
  }
  if (hints.natures.length > 0) {
    parts.push(`**Naturalezas:** ${hints.natures.join(", ")}`);
  }
  return parts.join("\n").slice(0, 1024);
}

export function formatPhysiqueLine(heightM: number, weightKg: number): string {
  const h = heightM.toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const w = weightKg.toLocaleString("es-MX", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `📏 **${h} m** · ⚖️ **${w} kg**`;
}

export function formatPreEvolutionLabel(
  species: PokemonSpeciesData | null,
  language: "es" | "en",
): string | null {
  if (!species?.evolvesFromSpecies) return null;
  const pre = species.evolvesFromSpecies;
  const label =
    language === "es"
      ? `Pre-evolución: ${capitalizePokemonName(pre)}`
      : `Pre-evolution: ${capitalizePokemonName(pre)}`;
  return label;
}

export { POKEAPI_BASE };

/** @deprecated usar getPokemonData */
export const fetchPokemon = getPokemonData;
/** @deprecated usar getPokemonSpecies */
export const fetchPokemonSpecies = getPokemonSpecies;
