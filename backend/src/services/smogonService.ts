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

// ── Competitive sets (Smogon / data.pkmn.cc) ───────────────────────────────

const PKMN_SETS_BASE = "https://data.pkmn.cc/sets";

export interface CompetitiveSetEvs {
  hp?: number;
  atk?: number;
  def?: number;
  spa?: number;
  spd?: number;
  spe?: number;
}

export interface CompetitiveSet {
  name: string;
  /** Id completo data.pkmn.cc (`gen9vgc2025`). */
  formatId: string;
  /** Etiqueta corta para UI (`VGC 2025`). */
  formatName: string;
  item: string;
  ability: string;
  nature: string;
  evs: CompetitiveSetEvs;
  /** Hasta 4 movimientos (opción primaria si hay slash). */
  moves: string[];
  /** Opciones alternativas por slot (tras la primaria). */
  moveAlts?: string[][];
}

export interface PokemonCompetitiveSets {
  speciesName: string;
  formatId: string;
  sets: CompetitiveSet[];
}

export interface PokemonAllCompetitiveSets {
  speciesName: string;
  generation: number;
  sets: CompetitiveSet[];
}

type RawSlashField = string | string[] | undefined;

interface RawSmogonSet {
  moves?: RawSlashField[];
  item?: RawSlashField;
  ability?: RawSlashField;
  nature?: RawSlashField;
  evs?: CompetitiveSetEvs;
}

type FormatSetsTable = Record<string, Record<string, RawSmogonSet>>;
/** `gen{N}.json`: species → tierId → setName → set */
type GenSetsTable = Record<string, Record<string, Record<string, RawSmogonSet>>>;

const setsCache = new Map<string, CacheEntry<FormatSetsTable>>();
const genSetsCache = new Map<number, CacheEntry<GenSetsTable>>();
const abilityNameCache = new Map<string, { at: number; es: string; en: string }>();

/** Orden preferido al aplanar sets de una generación. */
const FORMAT_TIER_PRIORITY = [
  "ou",
  "ubers",
  "uu",
  "ru",
  "nu",
  "pu",
  "zu",
  "lc",
  "nationaldex",
  "nationaldexuu",
  "nationaldexru",
  "nationaldexubers",
  "doublesou",
  "nationaldexdoubles",
  "vgc2025",
  "vgc2024",
  "vgc2023",
  "monotype",
  "nationaldexmonotype",
  "battlestadiumsingles",
] as const;

const FORMAT_TIER_LABELS: Record<string, string> = {
  ou: "OU",
  uu: "UU",
  ru: "RU",
  nu: "NU",
  pu: "PU",
  zu: "ZU",
  ubers: "Ubers",
  ubersuu: "Ubers UU",
  lc: "LC",
  nfe: "NFE",
  nationaldex: "National Dex",
  nationaldexuu: "National Dex UU",
  nationaldexru: "National Dex RU",
  nationaldexubers: "National Dex Ubers",
  nationaldexdoubles: "National Dex Doubles",
  nationaldexmonotype: "National Dex Monotype",
  doublesou: "Doubles OU",
  vgc2025: "VGC 2025",
  vgc2024: "VGC 2024",
  vgc2023: "VGC 2023",
  monotype: "Monotype",
  almostanyability: "AAA",
  balancedhackmons: "BH",
  godlygift: "Godly Gift",
  mixandmega: "Mix and Mega",
  stabmons: "STABmons",
  partnersincrime: "Partners in Crime",
  inheritance: "Inheritance",
  anythinggoes: "AG",
  cap: "CAP",
  "1v1": "1v1",
  battlestadiumsingles: "BSS",
};

/** Etiqueta UI de un tier Smogon (`vgc2025` → `VGC 2025`). */
export function formatCompetitiveTierLabel(tierId: string): string {
  const key = tierId.trim().toLowerCase();
  if (FORMAT_TIER_LABELS[key]) return FORMAT_TIER_LABELS[key]!;
  // gen9ou → intentar strip gen prefix
  const stripped = key.replace(/^gen[1-9]/, "");
  if (stripped && FORMAT_TIER_LABELS[stripped]) {
    return FORMAT_TIER_LABELS[stripped]!;
  }
  return key
    .replace(/^gen[1-9]/, "")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || tierId;
}

function pickSlashPrimary(value: RawSlashField): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && v.trim());
    return first?.trim() ?? "";
  }
  return value.trim();
}

function pickMoveSlot(slot: RawSlashField): { primary: string; alts: string[] } {
  if (!slot) return { primary: "", alts: [] };
  if (Array.isArray(slot)) {
    const clean = slot
      .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
      .map((v) => v.trim());
    return { primary: clean[0] ?? "", alts: clean.slice(1) };
  }
  return { primary: slot.trim(), alts: [] };
}

function toAbilitySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function localizeAbility(
  englishName: string,
  language: "es" | "en",
): Promise<string> {
  const raw = englishName.trim();
  if (!raw) return "—";
  if (language === "en") return raw;

  const slug = toAbilitySlug(raw);
  const cached = abilityNameCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.es || raw;
  }

  try {
    const data = await fetchJson<{
      names?: Array<{ name: string; language: { name: string } }>;
    }>(`https://pokeapi.co/api/v2/ability/${encodeURIComponent(slug)}`);
    const es =
      data.names?.find((n) => n.language.name === "es")?.name ?? raw;
    const en =
      data.names?.find((n) => n.language.name === "en")?.name ?? raw;
    abilityNameCache.set(slug, { at: Date.now(), es, en });
    return es;
  } catch {
    return raw;
  }
}

/**
 * Formatea EVs Smogon: `{ atk: 252, spe: 252 }` → `252 Atk / 252 Spe`.
 */
export function formatCompetitiveEvs(evs: CompetitiveSetEvs | undefined): string {
  if (!evs) return "—";
  const order: Array<{ key: keyof CompetitiveSetEvs; label: string }> = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
  ];
  const parts: string[] = [];
  for (const { key, label } of order) {
    const n = Number(evs[key] ?? 0);
    if (n > 0) parts.push(`${n} ${label}`);
  }
  return parts.length > 0 ? parts.join(" / ") : "—";
}

function findSpeciesSets(
  table: FormatSetsTable,
  apiName: string,
): { speciesName: string; sets: Record<string, RawSmogonSet> } | null {
  const target = toSpeciesId(apiName);
  for (const [key, value] of Object.entries(table)) {
    if (toSpeciesId(key) === target) {
      return { speciesName: key, sets: value };
    }
  }
  // Variantes: Charizard-Mega-X → Charizard
  const base = target.replace(/(mega[xy]?|gmax|alola|galar|hisui|paldea)$/i, "");
  if (base && base !== target) {
    for (const [key, value] of Object.entries(table)) {
      if (toSpeciesId(key) === base) {
        return { speciesName: key, sets: value };
      }
    }
  }
  return null;
}

async function getFormatSetsTable(formatId: string): Promise<FormatSetsTable | null> {
  const id = formatId.trim().toLowerCase();
  if (!id) return null;
  const cached = setsCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const data = await fetchJson<FormatSetsTable>(
      `${PKMN_SETS_BASE}/${encodeURIComponent(id)}.json`,
    );
    setsCache.set(id, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

async function getGenerationSetsTable(
  generation: number,
): Promise<GenSetsTable | null> {
  const gen = Math.max(1, Math.min(9, Math.floor(generation) || 9));
  const cached = genSetsCache.get(gen);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const data = await fetchJson<GenSetsTable>(
      `${PKMN_SETS_BASE}/gen${gen}.json`,
    );
    genSetsCache.set(gen, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

function findSpeciesInGenTable(
  table: GenSetsTable,
  apiName: string,
): { speciesName: string; byFormat: Record<string, Record<string, RawSmogonSet>> } | null {
  const target = toSpeciesId(apiName);
  for (const [key, value] of Object.entries(table)) {
    if (toSpeciesId(key) === target) {
      return { speciesName: key, byFormat: value };
    }
  }
  const base = target.replace(
    /(mega[xy]?|gmax|alola|galar|hisui|paldea)$/i,
    "",
  );
  if (base && base !== target) {
    for (const [key, value] of Object.entries(table)) {
      if (toSpeciesId(key) === base) {
        return { speciesName: key, byFormat: value };
      }
    }
  }
  return null;
}

async function buildCompetitiveSetFromRaw(
  setName: string,
  raw: RawSmogonSet,
  formatId: string,
  formatName: string,
  language: "es" | "en",
): Promise<CompetitiveSet> {
  const moveSlots = (raw.moves ?? []).slice(0, 4).map(pickMoveSlot);
  const itemEn = pickSlashPrimary(raw.item);
  const abilityEn = pickSlashPrimary(raw.ability);
  const natureEn = pickSlashPrimary(raw.nature);

  return {
    name: setName,
    formatId,
    formatName,
    item: itemEn ? localizeItem(itemEn) : "—",
    ability: abilityEn ? await localizeAbility(abilityEn, language) : "—",
    nature: natureEn
      ? language === "es"
        ? localizeNature(natureEn)
        : natureEn
      : "—",
    evs: raw.evs ?? {},
    moves: moveSlots.map((m) => m.primary).filter(Boolean),
    moveAlts: moveSlots.map((m) => m.alts),
  };
}

function sortFormatTiers(tiers: string[]): string[] {
  const rank = new Map<string, number>(
    FORMAT_TIER_PRIORITY.map((t, i) => [t, i]),
  );
  return [...tiers].sort((a, b) => {
    const ra = rank.get(a.toLowerCase()) ?? 1000;
    const rb = rank.get(b.toLowerCase()) ?? 1000;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, "en");
  });
}

/**
 * Extrae los sets competitivos Smogon de un Pokémon en un formato (`gen9ou`, …).
 */
export async function getPokemonCompetitiveSets(
  pokemonName: string,
  formatId: string,
  language: "es" | "en" = "es",
): Promise<PokemonCompetitiveSets> {
  const name = pokemonName.trim();
  const format = formatId.trim().toLowerCase() || "gen9ou";
  if (!name) {
    return { speciesName: "", formatId: format, sets: [] };
  }

  const table = await getFormatSetsTable(format);
  if (!table) {
    return { speciesName: name, formatId: format, sets: [] };
  }

  const found = findSpeciesSets(table, name);
  if (!found) {
    return { speciesName: name, formatId: format, sets: [] };
  }

  const tier = format.replace(/^gen[1-9]/, "") || format;
  const formatName = formatCompetitiveTierLabel(tier);
  const sets: CompetitiveSet[] = [];
  for (const [setName, raw] of Object.entries(found.sets)) {
    sets.push(
      await buildCompetitiveSetFromRaw(
        setName,
        raw,
        format,
        formatName,
        language,
      ),
    );
  }

  return {
    speciesName: found.speciesName,
    formatId: format,
    sets,
  };
}

/**
 * Todos los sets Smogon del Pokémon en la generación (todos los formatos con presencia).
 * Fuente: `https://data.pkmn.cc/sets/gen{N}.json`
 */
export async function getPokemonAllCompetitiveSets(
  pokemonName: string,
  generation = 9,
  language: "es" | "en" = "es",
): Promise<PokemonAllCompetitiveSets> {
  const name = pokemonName.trim();
  const gen = Math.max(1, Math.min(9, Math.floor(generation) || 9));
  if (!name) {
    return { speciesName: "", generation: gen, sets: [] };
  }

  const table = await getGenerationSetsTable(gen);
  if (!table) {
    return { speciesName: name, generation: gen, sets: [] };
  }

  const found = findSpeciesInGenTable(table, name);
  if (!found) {
    return { speciesName: name, generation: gen, sets: [] };
  }

  const sets: CompetitiveSet[] = [];
  for (const tier of sortFormatTiers(Object.keys(found.byFormat))) {
    const formatSets = found.byFormat[tier];
    if (!formatSets) continue;
    const formatId = `gen${gen}${tier}`;
    const formatName = formatCompetitiveTierLabel(tier);
    for (const [setName, raw] of Object.entries(formatSets)) {
      sets.push(
        await buildCompetitiveSetFromRaw(
          setName,
          raw,
          formatId,
          formatName,
          language,
        ),
      );
    }
  }

  return {
    speciesName: found.speciesName,
    generation: gen,
    sets,
  };
}
