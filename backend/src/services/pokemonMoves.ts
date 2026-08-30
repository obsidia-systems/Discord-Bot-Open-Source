/**
 * Learnsets / moveset desde PokéAPI (filtrado por generación + detalle de moves).
 */

import {
  PokemonApiError,
  capitalizePokemonName,
  getPokemonData,
} from "./pokemonApi.js";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const DETAIL_TTL_MS = 30 * 60_000;

export type MoveLearnMethod = "level-up" | "machine" | "egg";

export interface LearnsetMoveEntry {
  apiName: string;
  displayName: string;
  type: string;
  damageClass: "physical" | "special" | "status" | string;
  levelLearnedAt: number;
  method: MoveLearnMethod;
}

export interface PokemonLearnset {
  pokemonId: number;
  pokemonName: string;
  generation: number;
  levelUp: LearnsetMoveEntry[];
  machine: LearnsetMoveEntry[];
  egg: LearnsetMoveEntry[];
}

/** Version groups PokéAPI por generación (orden = preferencia, último = más reciente). */
export const VERSION_GROUPS_BY_GEN: Record<number, readonly string[]> = {
  1: ["red-blue", "yellow"],
  2: ["gold-silver", "crystal"],
  3: ["ruby-sapphire", "emerald", "firered-leafgreen"],
  4: ["diamond-pearl", "platinum", "heartgold-soulsilver"],
  5: ["black-white", "black-2-white-2"],
  6: ["x-y", "omega-ruby-alpha-sapphire"],
  7: ["sun-moon", "ultra-sun-ultra-moon", "lets-go-pikachu-lets-go-eevee"],
  8: [
    "sword-shield",
    "brilliant-diamond-shining-pearl",
    "legends-arceus",
  ],
  9: ["scarlet-violet", "the-teal-mask", "the-indigo-disk"],
};

interface RawVersionGroupDetail {
  level_learned_at?: number;
  move_learn_method?: { name?: string };
  version_group?: { name?: string };
}

interface RawPokemonMoveSlot {
  move?: { name?: string; url?: string };
  version_group_details?: RawVersionGroupDetail[];
}

interface MoveDetailCached {
  apiName: string;
  displayNameEs: string;
  displayNameEn: string;
  type: string;
  damageClass: string;
}

const moveDetailCache = new Map<
  string,
  { at: number; data: MoveDetailCached }
>();
const learnsetCache = new Map<string, { at: number; data: PokemonLearnset }>();

async function pokeFetchJson<T>(path: string): Promise<T> {
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
      "Recurso no encontrado en PokéAPI.",
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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function pickDetailForMethod(
  details: RawVersionGroupDetail[],
  generation: number,
  method: MoveLearnMethod,
): RawVersionGroupDetail | null {
  const groups = VERSION_GROUPS_BY_GEN[generation] ?? VERSION_GROUPS_BY_GEN[9]!;
  const groupRank = new Map(groups.map((g, i) => [g, i]));

  const matching = details.filter((d) => {
    const vg = d.version_group?.name;
    const m = d.move_learn_method?.name;
    return Boolean(vg && m === method && groupRank.has(vg));
  });

  if (matching.length === 0) return null;

  matching.sort(
    (a, b) =>
      (groupRank.get(b.version_group!.name!) ?? -1) -
      (groupRank.get(a.version_group!.name!) ?? -1),
  );
  return matching[0] ?? null;
}

/** Convierte nombre display Smogon (`Headlong Rush`) → slug PokéAPI. */
export function toMoveApiSlug(displayOrSlug: string): string {
  return displayOrSlug
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getMoveDetail(apiName: string): Promise<MoveDetailCached> {
  const key = apiName.trim().toLowerCase();
  const cached = moveDetailCache.get(key);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return cached.data;
  }

  try {
    const raw = await pokeFetchJson<{
      name: string;
      type?: { name?: string };
      damage_class?: { name?: string };
      names?: Array<{ name: string; language: { name: string } }>;
    }>(`/move/${encodeURIComponent(key)}`);

    const data: MoveDetailCached = {
      apiName: raw.name,
      displayNameEs:
        raw.names?.find((n) => n.language.name === "es")?.name ??
        capitalizePokemonName(raw.name.replace(/-/g, " ")),
      displayNameEn:
        raw.names?.find((n) => n.language.name === "en")?.name ??
        capitalizePokemonName(raw.name.replace(/-/g, " ")),
      type: String(raw.type?.name ?? "normal").toLowerCase(),
      damageClass: String(raw.damage_class?.name ?? "status").toLowerCase(),
    };
    moveDetailCache.set(key, { at: Date.now(), data });
    moveDetailCache.set(String(raw.name), { at: Date.now(), data });
    return data;
  } catch {
    const fallback: MoveDetailCached = {
      apiName: key,
      displayNameEs: capitalizePokemonName(key.replace(/-/g, " ")),
      displayNameEn: capitalizePokemonName(key.replace(/-/g, " ")),
      type: "normal",
      damageClass: "status",
    };
    moveDetailCache.set(key, { at: Date.now(), data: fallback });
    return fallback;
  }
}

/**
 * Resuelve tipo / clase / nombre localizado de un movimiento
 * (acepta slug PokéAPI o nombre display Smogon en inglés).
 */
export async function resolveMoveInfo(
  displayOrSlug: string,
  language: "es" | "en" = "es",
): Promise<{
  apiName: string;
  displayName: string;
  type: string;
  damageClass: string;
}> {
  const slug = toMoveApiSlug(displayOrSlug);
  const detail = await getMoveDetail(slug || displayOrSlug);
  return {
    apiName: detail.apiName,
    displayName:
      language === "es" ? detail.displayNameEs : detail.displayNameEn,
    type: detail.type,
    damageClass: detail.damageClass,
  };
}

/**
 * Learnset del Pokémon filtrado por generación (level-up / MT / huevo).
 */
export async function getPokemonLearnset(
  nameOrId: string,
  generation: number,
  language: "es" | "en" = "es",
): Promise<PokemonLearnset> {
  const gen = Math.max(1, Math.min(9, Math.floor(generation) || 9));
  const pokemon = await getPokemonData(nameOrId);
  const cacheKey = `${pokemon.id}:g${gen}:${language}`;
  const cached = learnsetCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return cached.data;
  }

  const raw = await pokeFetchJson<{
    id: number;
    name: string;
    moves?: RawPokemonMoveSlot[];
  }>(`/pokemon/${encodeURIComponent(String(pokemon.id))}`);

  type Pending = {
    apiName: string;
    method: MoveLearnMethod;
    levelLearnedAt: number;
  };

  const pending: Pending[] = [];
  const seen = new Set<string>();

  for (const slot of raw.moves ?? []) {
    const apiName = slot.move?.name;
    if (!apiName) continue;
    const details = slot.version_group_details ?? [];

    for (const method of ["level-up", "machine", "egg"] as MoveLearnMethod[]) {
      const detail = pickDetailForMethod(details, gen, method);
      if (!detail) continue;
      const dedupeKey = `${apiName}:${method}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      pending.push({
        apiName,
        method,
        levelLearnedAt:
          method === "level-up" ? Number(detail.level_learned_at) || 0 : 0,
      });
    }
  }

  const uniqueNames = [...new Set(pending.map((p) => p.apiName))];
  const details = await mapPool(uniqueNames, 8, (name) => getMoveDetail(name));
  const detailByName = new Map(
    details.map((d) => [d.apiName.toLowerCase(), d] as const),
  );

  const levelUp: LearnsetMoveEntry[] = [];
  const machine: LearnsetMoveEntry[] = [];
  const egg: LearnsetMoveEntry[] = [];

  for (const item of pending) {
    const detail =
      detailByName.get(item.apiName.toLowerCase()) ??
      (await getMoveDetail(item.apiName));
    const entry: LearnsetMoveEntry = {
      apiName: detail.apiName,
      displayName:
        language === "es" ? detail.displayNameEs : detail.displayNameEn,
      type: detail.type,
      damageClass: detail.damageClass,
      levelLearnedAt: item.levelLearnedAt,
      method: item.method,
    };
    if (item.method === "level-up") levelUp.push(entry);
    else if (item.method === "machine") machine.push(entry);
    else egg.push(entry);
  }

  levelUp.sort(
    (a, b) =>
      a.levelLearnedAt - b.levelLearnedAt ||
      a.displayName.localeCompare(b.displayName, "es"),
  );
  machine.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  egg.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

  const learnset: PokemonLearnset = {
    pokemonId: pokemon.id,
    pokemonName: pokemon.name,
    generation: gen,
    levelUp,
    machine,
    egg,
  };
  learnsetCache.set(cacheKey, { at: Date.now(), data: learnset });
  return learnset;
}

export function getLearnsetCategoryMoves(
  learnset: PokemonLearnset,
  category: MoveLearnMethod,
): LearnsetMoveEntry[] {
  if (category === "level-up") return learnset.levelUp;
  if (category === "machine") return learnset.machine;
  return learnset.egg;
}

export interface CoverageMoveOption {
  apiName: string;
  displayName: string;
  type: string;
  damageClass: string;
}

/** Une level-up / MT / huevo sin duplicar por `apiName`. */
export function flattenLearnsetMoves(
  learnset: PokemonLearnset,
): CoverageMoveOption[] {
  const map = new Map<string, CoverageMoveOption>();
  for (const move of [
    ...learnset.levelUp,
    ...learnset.machine,
    ...learnset.egg,
  ]) {
    const key = move.apiName.toLowerCase();
    if (map.has(key)) continue;
    map.set(key, {
      apiName: move.apiName,
      displayName: move.displayName,
      type: move.type,
      damageClass: move.damageClass,
    });
  }
  return [...map.values()];
}

const SELECT_MENU_MAX = 25;

/**
 * Movepool para el SelectMenu de `/coverage` (máx. 25).
 * Si hay más, prioriza movimientos que aparecen en sets Smogon.
 */
export async function getCoverageMovepoolOptions(
  nameOrId: string,
  generation: number,
  language: "es" | "en" = "es",
): Promise<{
  pokemonId: number;
  pokemonName: string;
  moves: CoverageMoveOption[];
  truncated: boolean;
  totalMoves: number;
}> {
  const learnset = await getPokemonLearnset(nameOrId, generation, language);
  const all = flattenLearnsetMoves(learnset);
  const totalMoves = all.length;

  if (all.length <= SELECT_MENU_MAX) {
    all.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
    return {
      pokemonId: learnset.pokemonId,
      pokemonName: learnset.pokemonName,
      moves: all,
      truncated: false,
      totalMoves,
    };
  }

  const { getPokemonAllCompetitiveSets } = await import("./smogonService.js");
  let scores = new Map<string, number>();
  try {
    const competitive = await getPokemonAllCompetitiveSets(
      learnset.pokemonName,
      generation,
      language,
    );
    for (const set of competitive.sets) {
      for (const moveName of set.moves) {
        const slug = toMoveApiSlug(moveName);
        if (!slug) continue;
        scores.set(slug, (scores.get(slug) ?? 0) + 1);
      }
    }
  } catch {
    scores = new Map();
  }

  const ranked = [...all].sort((a, b) => {
    const sa = scores.get(a.apiName.toLowerCase()) ?? 0;
    const sb = scores.get(b.apiName.toLowerCase()) ?? 0;
    if (sb !== sa) return sb - sa;
    const da = a.damageClass === "status" ? 0 : 1;
    const db = b.damageClass === "status" ? 0 : 1;
    if (db !== da) return db - da;
    return a.displayName.localeCompare(b.displayName, "es");
  });

  return {
    pokemonId: learnset.pokemonId,
    pokemonName: learnset.pokemonName,
    moves: ranked.slice(0, SELECT_MENU_MAX),
    truncated: true,
    totalMoves,
  };
}
