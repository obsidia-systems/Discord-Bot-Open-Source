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

/** Espejos de sets Smogon (data.pkmn.cc + GitHub Pages). */
const SETS_MIRRORS = [
  "https://data.pkmn.cc/sets",
  "https://pkmn.github.io/smogon/data/sets",
] as const;

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

/**
 * Normaliza nombres PokéAPI / Showdown a candidatos Smogon.
 * `staraptor-mega` → `Staraptor-Mega`, `Charizard-Mega-X`, etc.
 */
export function toSmogonSpeciesCandidates(input: string): string[] {
  const raw = input.trim().replace(/\s+/g, "-");
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const showdown = lower
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
  return [...new Set([showdown, raw, lower].filter(Boolean))];
}

/** ¿Es una forma Mega? (`Staraptor-Mega`, `charizard-mega-x`). */
export function isMegaSpeciesName(name: string): boolean {
  return /(^|-)mega(-|$)/i.test(name.trim().replace(/\s+/g, "-"));
}

/**
 * Forma base competitiva: `Staraptor-Mega` → `Staraptor`,
 * `Charizard-Mega-X` → `Charizard`.
 */
export function baseSpeciesNameFromForm(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-mega(-[xy])?$/i, "")
    .replace(/-(gmax|alola|galar|hisui|paldea)$/i, "");
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
  /** Forma exacta a la que pertenece el set (`Charizard-Mega-Y`). */
  speciesName: string;
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
  evs?: CompetitiveSetEvs | CompetitiveSetEvs[];
}

type FormatSetsTable = Record<string, Record<string, RawSmogonSet>>;
/** `gen{N}.json`: species → tierId → setName → set */
type GenSetsTable = Record<string, Record<string, Record<string, RawSmogonSet>>>;

const setsCache = new Map<string, CacheEntry<FormatSetsTable>>();
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
  "vgc2026",
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
  vgc2026: "VGC 2026",
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
  const targets = new Set(
    toSmogonSpeciesCandidates(apiName).map((c) => toSpeciesId(c)),
  );
  for (const [key, value] of Object.entries(table)) {
    if (targets.has(toSpeciesId(key))) {
      return { speciesName: key, sets: value };
    }
  }
  // Sin fallback a la forma base: Mega ≠ base.
  return null;
}

async function fetchSetsResource<T>(fileName: string): Promise<T | null> {
  const file = fileName.replace(/^\//, "");
  for (const mirror of SETS_MIRRORS) {
    try {
      return await fetchJson<T>(`${mirror}/${encodeURIComponent(file)}`);
    } catch {
      /* siguiente espejo */
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
    const data = await fetchSetsResource<FormatSetsTable>(`${id}.json`);
    if (!data) return null;
    setsCache.set(id, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/** Caché de tablas generation-style (species → tier → sets). */
const namedGenTableCache = new Map<string, CacheEntry<GenSetsTable>>();

async function getNamedGenSetsTable(
  fileStem: string,
): Promise<GenSetsTable | null> {
  const stem = fileStem.trim().toLowerCase().replace(/\.json$/, "");
  if (!stem) return null;
  const cached = namedGenTableCache.get(stem);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await fetchSetsResource<GenSetsTable>(`${stem}.json`);
  if (!data) return null;
  namedGenTableCache.set(stem, { at: Date.now(), data });
  return data;
}

function findSpeciesInGenTable(
  table: GenSetsTable,
  apiName: string,
): { speciesName: string; byFormat: Record<string, Record<string, RawSmogonSet>> } | null {
  const targets = new Set(
    toSmogonSpeciesCandidates(apiName).map((c) => toSpeciesId(c)),
  );
  for (const [key, value] of Object.entries(table)) {
    if (targets.has(toSpeciesId(key))) {
      return { speciesName: key, byFormat: value };
    }
  }
  // Sin fallback Mega → base (evita sets de Staraptor cuando se pidió Staraptor-Mega).
  return null;
}

/**
 * En Champions (y similares) las Megas a veces viven bajo el nombre base
 * (`Charizard` + Charizardite Y) en lugar de `Charizard-Mega-Y`.
 * Tras el alias, hay que filtrar por megapiedra para no mezclar X/Y/base.
 */
function findSpeciesInGenTableWithMegaAlias(
  table: GenSetsTable,
  apiName: string,
  allowBaseAliasForMega: boolean,
): {
  speciesName: string;
  byFormat: Record<string, Record<string, RawSmogonSet>>;
  /** true si se resolvió vía nombre base (requiere filtro de piedra). */
  usedBaseAlias: boolean;
} | null {
  const exact = findSpeciesInGenTable(table, apiName);
  if (exact) {
    return { ...exact, usedBaseAlias: false };
  }
  if (!allowBaseAliasForMega || !isMegaSpeciesName(apiName)) return null;
  const base = baseSpeciesNameFromForm(apiName);
  if (!base || toSpeciesId(base) === toSpeciesId(apiName)) return null;
  const aliased = findSpeciesInGenTable(table, base);
  if (!aliased) return null;
  return { ...aliased, usedBaseAlias: true };
}

/** Megapiedras irregulares por forma (id compacto → ids de ítem). */
const MEGA_STONE_IDS_BY_FORM: Record<string, readonly string[]> = {
  charizardmegax: ["charizarditex"],
  charizardmegay: ["charizarditey"],
  mewtwomegax: ["mewtwonitex"],
  mewtwomegay: ["mewtwonitey"],
  staraptormega: ["staraptite"],
  blastoisemega: ["blastoisinite"],
  alakazammega: ["alakazite"],
  pinsirmega: ["pinsirite"],
  aerodactylmega: ["aerodactylite"],
  scizormega: ["scizorite"],
  heracrossmega: ["heracronite"],
  houndoommega: ["houndoominite"],
  tyranitarmega: ["tyranitarite"],
  blazikenmega: ["blazikenite"],
  gardevoirmega: ["gardevoirite"],
  mawilemega: ["mawilite"],
  aggronmega: ["aggronite"],
  medichammega: ["medichamite"],
  manectricmega: ["manectite"],
  banettemega: ["banettite"],
  absolmega: ["absolite"],
  gengarmega: ["gengarite"],
  kangaskhanmega: ["kangaskhanite"],
  gyaradosmega: ["gyaradosite"],
  ampharosmega: ["ampharosite"],
  lucariomega: ["lucarionite"],
  abomasnowmega: ["abomasite"],
  beedrillmega: ["beedrillite"],
  pidgeotmega: ["pidgeotite"],
  slowbromega: ["slowbronite"],
  steelixmega: ["steelixite"],
  sceptilemega: ["sceptilite"],
  swampertmega: ["swampertite"],
  sableyemega: ["sablenite"],
  sharpedomega: ["sharpedonite"],
  cameruptmega: ["cameruptite"],
  altariamega: ["altarianite"],
  glaliemega: ["glalitite"],
  salamencemega: ["salamencite"],
  metagrossmega: ["metagrossite"],
  latiasmega: ["latiasite"],
  latiosmega: ["latiosite"],
  lopunnymega: ["lopunnite"],
  gallademega: ["galladite"],
  audinomega: ["audinite"],
  dianciemega: ["diancite"],
  venusaurmega: ["venusaurite"],
};

/** Todas las megapiedras conocidas de una especie base (para excluirlas en query base). */
function megaStoneIdsForBaseSpecies(baseName: string): Set<string> {
  const baseId = toSpeciesId(baseName);
  const out = new Set<string>();
  out.add(`${baseId}ite`);
  out.add(`${baseId}itex`);
  out.add(`${baseId}itey`);
  for (const [formId, stones] of Object.entries(MEGA_STONE_IDS_BY_FORM)) {
    if (!formId.startsWith(baseId) || !formId.includes("mega")) continue;
    for (const s of stones) out.add(s);
  }
  return out;
}

/**
 * Ids de megapiedra esperados para una forma Mega concreta.
 * `Charizard-Mega-Y` → `charizarditey` (nunca X).
 */
export function expectedMegaStoneIds(speciesInput: string): string[] | null {
  if (!isMegaSpeciesName(speciesInput)) return null;
  const canonical = toSmogonSpeciesCandidates(speciesInput)[0] ?? speciesInput;
  const formId = toSpeciesId(canonical);
  const override = MEGA_STONE_IDS_BY_FORM[formId];
  if (override) return [...override];

  const xy = /mega([xy])$/.exec(formId);
  const baseId = toSpeciesId(baseSpeciesNameFromForm(canonical));
  if (xy) return [`${baseId}ite${xy[1]}`];
  return [`${baseId}ite`];
}

function rawSetItemIds(raw: RawSmogonSet): string[] {
  const value = raw.item;
  const list = !value
    ? []
    : Array.isArray(value)
      ? value
      : [value];
  return list
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => toSpeciesId(v));
}

/** ¿El set usa la megapiedra de la forma pedida? (strict). */
function setMatchesRequestedMegaForm(
  raw: RawSmogonSet,
  megaSpecies: string,
): boolean {
  const expected = expectedMegaStoneIds(megaSpecies);
  if (!expected || expected.length === 0) return false;
  const items = rawSetItemIds(raw);
  if (items.length === 0) return false;
  return items.some((id) => expected.includes(id));
}

/** ¿El set es claramente de una Mega (cualquier piedra de esa línea)? */
function setUsesMegaStoneForBase(
  raw: RawSmogonSet,
  baseSpecies: string,
): boolean {
  const stones = megaStoneIdsForBaseSpecies(baseSpecies);
  const items = rawSetItemIds(raw);
  return items.some((id) => stones.has(id));
}

/**
 * Filtra sets de un bucket base según la forma pedida.
 * - Mega-Y: solo Charizardite Y
 * - Base: excluye cualquier megapiedra de la línea
 */
function filterByFormatForRequestedForm(
  byFormat: Record<string, Record<string, RawSmogonSet>>,
  requestedForm: string,
  options: { usedBaseAlias: boolean; exactKeyWasBase: boolean },
): Record<string, Record<string, RawSmogonSet>> {
  const requestingMega = isMegaSpeciesName(requestedForm);
  const out: Record<string, Record<string, RawSmogonSet>> = {};

  for (const [tier, sets] of Object.entries(byFormat)) {
    const filtered: Record<string, RawSmogonSet> = {};
    for (const [setName, raw] of Object.entries(sets)) {
      if (requestingMega) {
        // Solo si vinimos del alias base (Champions) o el set trae piedra:
        // exigir megapiedra exacta de esa forma (Y ≠ X).
        if (options.usedBaseAlias) {
          if (!setMatchesRequestedMegaForm(raw, requestedForm)) continue;
        } else if (setUsesMegaStoneForBase(raw, baseSpeciesNameFromForm(requestedForm))) {
          // Clave exacta Mega pero set con piedra de otra variante
          if (!setMatchesRequestedMegaForm(raw, requestedForm)) continue;
        }
      } else if (options.exactKeyWasBase || options.usedBaseAlias) {
        // Forma base: excluir sets de Mega-X / Mega-Y / etc.
        if (setUsesMegaStoneForBase(raw, requestedForm)) continue;
      }
      filtered[setName] = raw;
    }
    if (Object.keys(filtered).length > 0) {
      out[tier] = filtered;
    }
  }

  return out;
}

function pickEvs(raw: RawSmogonSet["evs"]): CompetitiveSetEvs {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const first = raw.find((e) => e && typeof e === "object") ?? {};
    return first;
  }
  return raw;
}

async function buildCompetitiveSetFromRaw(
  setName: string,
  raw: RawSmogonSet,
  formatId: string,
  formatName: string,
  language: "es" | "en",
  speciesName: string,
): Promise<CompetitiveSet> {
  const moveSlots = (raw.moves ?? []).slice(0, 4).map(pickMoveSlot);
  const itemEn = pickSlashPrimary(raw.item);
  const abilityEn = pickSlashPrimary(raw.ability);
  const natureEn = pickSlashPrimary(raw.nature);

  return {
    name: setName,
    speciesName,
    formatId,
    formatName,
    item: itemEn ? localizeItem(itemEn) : "—",
    ability: abilityEn ? await localizeAbility(abilityEn, language) : "—",
    nature: natureEn
      ? language === "es"
        ? localizeNature(natureEn)
        : natureEn
      : "—",
    evs: pickEvs(raw.evs),
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

type SetsSource = {
  /** Stem del JSON (`gen9`, `champions`, `gen7`). */
  stem: string;
  /** Prefijo de formatId (`gen9`, `champions`, `gen7`). */
  formatPrefix: string;
  /** Prefijo de etiqueta (`Gen 9`, `Champions`, `Gen 7`). */
  labelPrefix: string;
  /** Permitir alias Mega → base (Champions), con filtro de piedra. */
  allowMegaBaseAlias: boolean;
};

function resolveSetsSources(
  generation: number,
  pokemonName: string,
): SetsSource[] {
  const gen = Math.max(1, Math.min(9, Math.floor(generation) || 9));
  const sources: SetsSource[] = [
    {
      stem: `gen${gen}`,
      formatPrefix: `gen${gen}`,
      labelPrefix: `Gen ${gen}`,
      allowMegaBaseAlias: false,
    },
  ];

  if (gen >= 9) {
    sources.push({
      stem: "champions",
      formatPrefix: "champions",
      labelPrefix: "Champions",
      allowMegaBaseAlias: true,
    });
  }

  if (isMegaSpeciesName(pokemonName)) {
    for (const megaGen of [7, 6] as const) {
      if (megaGen === gen) continue;
      if (sources.some((s) => s.stem === `gen${megaGen}`)) continue;
      sources.push({
        stem: `gen${megaGen}`,
        formatPrefix: `gen${megaGen}`,
        labelPrefix: `Gen ${megaGen}`,
        allowMegaBaseAlias: false,
      });
    }
  }

  return sources;
}

async function appendSetsFromGenSource(
  sets: CompetitiveSet[],
  source: SetsSource,
  pokemonName: string,
  language: "es" | "en",
): Promise<string | null> {
  const table = await getNamedGenSetsTable(source.stem);
  if (!table) return null;

  const found = findSpeciesInGenTableWithMegaAlias(
    table,
    pokemonName,
    source.allowMegaBaseAlias,
  );
  if (!found) return null;

  const canonicalForm =
    toSmogonSpeciesCandidates(pokemonName)[0] ?? pokemonName;
  const exactKeyWasBase =
    !found.usedBaseAlias &&
    toSpeciesId(found.speciesName) === toSpeciesId(canonicalForm) &&
    !isMegaSpeciesName(canonicalForm);

  const byFormat = filterByFormatForRequestedForm(found.byFormat, canonicalForm, {
    usedBaseAlias: found.usedBaseAlias,
    exactKeyWasBase:
      exactKeyWasBase ||
      (!isMegaSpeciesName(canonicalForm) &&
        toSpeciesId(found.speciesName) === toSpeciesId(canonicalForm)),
  });

  if (Object.keys(byFormat).length === 0) return null;

  for (const tier of sortFormatTiers(Object.keys(byFormat))) {
    const formatSets = byFormat[tier];
    if (!formatSets) continue;
    const formatId = `${source.formatPrefix}${tier}`;
    const tierLabel = formatCompetitiveTierLabel(tier);
    const formatName =
      source.labelPrefix === tierLabel
        ? tierLabel
        : `${source.labelPrefix} ${tierLabel}`;
    for (const [setName, raw] of Object.entries(formatSets)) {
      sets.push(
        await buildCompetitiveSetFromRaw(
          setName,
          raw,
          formatId,
          formatName,
          language,
          canonicalForm,
        ),
      );
    }
  }

  return canonicalForm;
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

  let table: FormatSetsTable | null = null;
  try {
    table = await getFormatSetsTable(format);
  } catch {
    table = null;
  }
  if (!table) {
    return { speciesName: name, formatId: format, sets: [] };
  }

  const canonicalForm = toSmogonSpeciesCandidates(name)[0] ?? name;
  let found = findSpeciesSets(table, name);
  let usedBaseAlias = false;
  if (
    !found &&
    isMegaSpeciesName(name) &&
    format.startsWith("champions")
  ) {
    found = findSpeciesSets(table, baseSpeciesNameFromForm(name));
    usedBaseAlias = Boolean(found);
  }
  if (!found) {
    return { speciesName: canonicalForm, formatId: format, sets: [] };
  }

  const wrapped = filterByFormatForRequestedForm(
    { _: found.sets },
    canonicalForm,
    {
      usedBaseAlias,
      exactKeyWasBase:
        !isMegaSpeciesName(canonicalForm) &&
        toSpeciesId(found.speciesName) === toSpeciesId(canonicalForm),
    },
  );
  const filteredSets = wrapped._ ?? {};

  const tier =
    format.replace(/^gen[1-9]/, "").replace(/^champions/, "") || format;
  const formatName = formatCompetitiveTierLabel(tier);
  const sets: CompetitiveSet[] = [];
  for (const [setName, raw] of Object.entries(filteredSets)) {
    sets.push(
      await buildCompetitiveSetFromRaw(
        setName,
        raw,
        format,
        formatName,
        language,
        canonicalForm,
      ),
    );
  }

  return {
    speciesName: canonicalForm,
    formatId: format,
    sets,
  };
}

/**
 * Todos los sets Smogon del Pokémon (gen del panel + Champions + gens Mega si aplica).
 * Coincidencia estricta por forma; Champions alias base + filtro de megapiedra.
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

  const canonicalForm = toSmogonSpeciesCandidates(name)[0] ?? name;
  const sets: CompetitiveSet[] = [];

  try {
    for (const source of resolveSetsSources(gen, name)) {
      await appendSetsFromGenSource(sets, source, name, language);
    }
  } catch {
    /* devolver lo acumulado */
  }

  // Defensa final: solo sets etiquetados con la forma pedida.
  const strictId = toSpeciesId(canonicalForm);
  const allSets = sets.filter((s) => toSpeciesId(s.speciesName) === strictId);

  return {
    speciesName: canonicalForm,
    generation: gen,
    sets: allSets,
  };
}
