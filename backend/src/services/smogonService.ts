/**
 * Datos competitivos (tier / objetos / naturalezas) desde fuentes públicas:
 * - Tier: Pokémon Showdown `pokedex.json` (gen actual) o `formats-data` en GitHub (gens pasadas).
 * - Uso: estadísticas agregadas en https://data.pkmn.cc/stats/{format}.json
 */

export interface CompetitiveMeta {
  tier: string;
  items: string[];
  natures: string[];
  /** Formato de ladder usado para items/naturalezas (ej. gen9ou). */
  format?: string;
  /** true solo si no hubo fuente usable (fallback local). */
  isStub: boolean;
}

const PS_POKEDEX_URL = "https://play.pokemonshowdown.com/data/pokedex.json";
const PKMN_STATS_BASE = "https://data.pkmn.cc/stats";
const GITHUB_FORMATS_BASE =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data";

const CACHE_TTL_MS = 6 * 60 * 60_000;

type CacheEntry<T> = { at: number; data: T };

let pokedexCache: CacheEntry<
  Record<string, { tier?: string; natDexTier?: string }>
> | null = null;
const formatsTierCache = new Map<number, CacheEntry<Map<string, string>>>();
const statsCache = new Map<
  string,
  CacheEntry<Record<string, PokemonUsageEntry>>
>();

interface PokemonUsageEntry {
  items?: Record<string, number>;
  spreads?: Record<string, number>;
}

/** Naturalezas EN → ES (Smogon usa inglés). */
const NATURE_ES: Record<string, string> = {
  hardy: "Fuerte",
  lonely: "Huraña",
  brave: "Audaz",
  adamant: "Firme",
  naughty: "Pícara",
  bold: "Osada",
  docile: "Dócil",
  relaxed: "Plácida",
  impish: "Agitada",
  lax: "Floja",
  timid: "Miedosa",
  hasty: "Activa",
  serious: "Seria",
  jolly: "Alegre",
  naive: "Ingenua",
  modest: "Modesta",
  mild: "Afable",
  quiet: "Mansa",
  bashful: "Tímida",
  rash: "Alocada",
  calm: "Serena",
  gentle: "Amable",
  sassy: "Grosera",
  careful: "Cauta",
  quirky: "Rara",
};

/** Objetos frecuentes EN → ES. */
const ITEM_ES: Record<string, string> = {
  leftovers: "Restos",
  "choice scarf": "Pañuelo Choice",
  "choice specs": "Gafas Choice",
  "choice band": "Cinta Choice",
  "life orb": "Vida Orb",
  "focus sash": "Banda Focus",
  "rocky helmet": "Casco Dentado",
  "heavy-duty boots": "Botas Gruesas",
  "assault vest": "Chaleco Asalto",
  "black glasses": "Gafas de Sol",
  "air balloon": "Globo Helio",
  "lum berry": "Baya Ziuela",
  "sitrus berry": "Baya Zidra",
  "loaded dice": "Dado Trucado",
  "clear amulet": "Amuleto Puro",
  "booster energy": "Energía Potenciadora",
  "light ball": "Bolaluminosa",
  "expert belt": "Cinta Experto",
  "weakness policy": "Política Débil",
  "eviolite": "Mineral Evolutivo",
  "throat spray": "Espray Bucal",
  "safety goggles": "Gafa Protectora",
  "mental herb": "Hierba Mental",
  "white herb": "Hierba Blanca",
  "flame orb": "Llamasfera",
  "toxic orb": "Toxisfera",
  "cover cloak": "Capa Cobertera",
  "covert cloak": "Capa Cobertera",
  "utility umbrella": "Parasol Protector",
  "soft sand": "Arena Fina",
  "earth plate": "Tabla Tierra",
  "shed shell": "Muda de Caparazón",
  "red card": "Tarjeta Roja",
  "sticky barb": "Toxiestrella",
  "iron ball": "Bola Férrea",
};

function toSpeciesId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "AdobosBot/0.1 (+https://github.com/adobos)",
      },
    });
  } catch (error) {
    throw new Error(
      `Red Smogon/PS: ${error instanceof Error ? error.message : "fallo"}`,
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/plain, */*",
        "User-Agent": "AdobosBot/0.1 (+https://github.com/adobos)",
      },
    });
  } catch (error) {
    throw new Error(
      `Red Smogon/PS: ${error instanceof Error ? error.message : "fallo"}`,
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${url}`);
  }
  return response.text();
}

async function getPokedexTiers(): Promise<
  Record<string, { tier?: string; natDexTier?: string }>
> {
  if (pokedexCache && Date.now() - pokedexCache.at < CACHE_TTL_MS) {
    return pokedexCache.data;
  }
  const data = await fetchJson<
    Record<string, { tier?: string; natDexTier?: string }>
  >(PS_POKEDEX_URL);
  pokedexCache = { at: Date.now(), data };
  return data;
}

/**
 * Parsea `FormatsData` de TypeScript (GitHub) extrayendo `id → tier`.
 */
function parseFormatsDataTs(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const re =
    /([a-z0-9]+)\s*:\s*\{[^{}]*?tier\s*:\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    map.set(match[1]!.toLowerCase(), match[2]!);
  }
  return map;
}

async function getFormatsTiers(
  generation: number,
  useNatDex = false,
): Promise<Map<string, string>> {
  const gen = Math.max(1, Math.min(9, generation));
  const cacheKey = useNatDex ? gen + 100 : gen;
  const cached = formatsTierCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  if (gen >= 9 || useNatDex) {
    const dex = await getPokedexTiers();
    const map = new Map<string, string>();
    for (const [id, entry] of Object.entries(dex)) {
      const tier = useNatDex
        ? entry?.natDexTier || entry?.tier
        : entry?.tier;
      if (tier) map.set(id.toLowerCase(), tier);
    }
    formatsTierCache.set(cacheKey, { at: Date.now(), data: map });
    return map;
  }

  const path = `${GITHUB_FORMATS_BASE}/mods/gen${gen}/formats-data.ts`;
  const source = await fetchText(path);
  const map = parseFormatsDataTs(source);
  formatsTierCache.set(cacheKey, { at: Date.now(), data: map });
  return map;
}

/** Mapea tier Smogon → id de formato de stats en data.pkmn.cc. */
export function resolveStatsFormatId(tier: string, generation: number): string {
  const gen = Math.max(1, Math.min(9, generation));
  const t = tier.replace(/[()]/g, "").trim().toUpperCase();
  const prefix = `gen${gen}`;

  if (t === "AG" || t === "ANYTHINGGOES") return `${prefix}ubers`;
  if (t === "UBER" || t === "UBERS") return `${prefix}ubers`;
  if (t === "OU" || t === "UUBL") return `${prefix}ou`;
  if (t === "UU" || t === "RUBL") return `${prefix}uu`;
  if (t === "RU" || t === "NUBL") return `${prefix}ru`;
  if (t === "NU" || t === "PUBL") return `${prefix}nu`;
  if (t === "PU" || t === "ZUBL") return `${prefix}pu`;
  if (t === "ZU") return `${prefix}zu`;
  if (t === "LC" || t === "LCUBER") return `${prefix}lc`;
  // NFE / Illegal / Untiered → intentar OU como referencia de uso
  return `${prefix}ou`;
}

async function getFormatUsage(
  formatId: string,
): Promise<Record<string, PokemonUsageEntry> | null> {
  const cached = statsCache.get(formatId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const raw = await fetchJson<{
      pokemon?: Record<string, PokemonUsageEntry>;
    }>(`${PKMN_STATS_BASE}/${formatId}.json`);
    const pokemon = raw.pokemon ?? {};
    statsCache.set(formatId, { at: Date.now(), data: pokemon });
    return pokemon;
  } catch {
    return null;
  }
}

function findUsageEntry(
  table: Record<string, PokemonUsageEntry>,
  apiName: string,
): PokemonUsageEntry | null {
  const target = toSpeciesId(apiName);
  for (const [key, value] of Object.entries(table)) {
    if (toSpeciesId(key) === target) return value;
  }
  return null;
}

function topKeys(
  weighted: Record<string, number> | undefined,
  limit: number,
): string[] {
  if (!weighted) return [];
  return Object.entries(weighted)
    .filter(([name, w]) => name && name !== "nothing" && Number(w) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

/** Agrega naturalezas desde spreads `Nature:hp/atk/...`. */
function topNaturesFromSpreads(
  spreads: Record<string, number> | undefined,
  limit: number,
): string[] {
  if (!spreads) return [];
  const totals = new Map<string, number>();
  for (const [spread, weight] of Object.entries(spreads)) {
    const nature = spread.split(":")[0]?.trim();
    if (!nature) continue;
    totals.set(nature, (totals.get(nature) ?? 0) + Number(weight));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([nature]) => nature);
}

function localizeNature(name: string): string {
  return NATURE_ES[name.toLowerCase()] ?? name;
}

function localizeItem(name: string): string {
  return ITEM_ES[name.toLowerCase()] ?? name;
}

function emptyMeta(tier = "Untiered"): CompetitiveMeta {
  return {
    tier,
    items: ["Sin datos"],
    natures: ["Sin datos"],
    isStub: false,
  };
}

/**
 * Obtiene tier + top items/naturalezas para un Pokémon y generación.
 * Nunca lanza: ante fallo devolvé fallback amigable.
 */
export async function getCompetitiveData(
  pokemonName: string,
  generation = 9,
  options?: {
    preferredFormatId?: string;
    useNatDex?: boolean;
  },
): Promise<CompetitiveMeta> {
  const name = pokemonName.trim();
  if (!name) return emptyMeta();

  const gen = Math.max(1, Math.min(9, generation));
  const speciesId = toSpeciesId(name);
  const useNatDex = Boolean(options?.useNatDex);

  let tier = "Untiered";
  try {
    const tiers = await getFormatsTiers(gen, useNatDex);
    tier = tiers.get(speciesId) ?? "Untiered";
  } catch {
    /* se intenta igual con stats OU */
  }

  if (!tier || tier === "Illegal") {
    return {
      tier: tier || "Untiered",
      items: ["Sin datos"],
      natures: ["Sin datos"],
      isStub: false,
    };
  }

  const primaryFormat = useNatDex
    ? options?.preferredFormatId ?? `gen${gen}nationaldex`
    : resolveStatsFormatId(tier, gen);

  const fallbackFormats = [
    options?.preferredFormatId,
    primaryFormat,
    useNatDex ? `gen${gen}nationaldex` : null,
    `gen${gen}ou`,
    `gen${gen}uu`,
    `gen${gen}ru`,
    `gen${gen}nu`,
    `gen${gen}pu`,
    `gen${gen}zu`,
    `gen${gen}ubers`,
    `gen${gen}lc`,
  ].filter((f): f is string => Boolean(f));

  const tried = new Set<string>();

  for (const formatId of fallbackFormats) {
    if (tried.has(formatId)) continue;
    tried.add(formatId);

    const table = await getFormatUsage(formatId);
    if (!table) continue;

    const entry = findUsageEntry(table, name);
    if (!entry) continue;

    const items = topKeys(entry.items, 3).map(localizeItem);
    const natures = topNaturesFromSpreads(entry.spreads, 3).map(localizeNature);

    return {
      tier: useNatDex && !tier.includes("National") ? `${tier} (NatDex)` : tier,
      items: items.length > 0 ? items : ["Sin datos"],
      natures: natures.length > 0 ? natures : ["Sin datos"],
      format: formatId,
      isStub: false,
    };
  }

  return {
    tier,
    items: ["Sin datos"],
    natures: ["Sin datos"],
    format: primaryFormat,
    isStub: false,
  };
}

export function formatCompetitiveBulletList(values: string[]): string {
  const clean = values.filter(
    (item) =>
      item &&
      item !== "—" &&
      item.toLowerCase() !== "nothing" &&
      item.toLowerCase() !== "sin datos",
  );
  if (clean.length === 0) return "• Sin datos";
  // Prefijo listo para inyectar emoji de ítem: `• ${emoji} Nombre`
  return clean.map((item) => `• ${item}`).join("\n");
}

export function formatCompetitiveMetaField(meta: CompetitiveMeta): string {
  return [
    `**Tier:** ${meta.tier}`,
    `**Objetos:**`,
    formatCompetitiveBulletList(meta.items),
    `**Naturalezas:**`,
    formatCompetitiveBulletList(meta.natures),
  ].join("\n");
}
