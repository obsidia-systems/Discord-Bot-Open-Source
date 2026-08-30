/**
 * Persistencia del Teambuilder (Fase 2) vía Drizzle / SQLite.
 * Key = Discord userId.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { userTeams } from "../db/schema.js";

export const MAX_TEAM_SIZE = 6;

/** Slot persistido en `team_data` JSON. */
export interface TeamSlotData {
  species: string;
  moves: string[];
  item: string | null;
}

export type TeamSlots = Array<TeamSlotData | null>;

export interface TeamData {
  userId: string;
  /** Siempre longitud 6; `null` = ranura vacía. */
  slots: TeamSlots;
}

/** Refs efímeras del último panel (para editar tras selects). */
export interface TeamPanelRef {
  channelId: string;
  messageId: string;
  guildId?: string;
}

const panelRefs = new Map<string, TeamPanelRef>();

function emptySlots(): TeamSlots {
  return [null, null, null, null, null, null];
}

function normalizeSlots(raw: unknown): TeamSlots {
  const out = emptySlots();
  if (!Array.isArray(raw)) return out;

  for (let i = 0; i < MAX_TEAM_SIZE; i += 1) {
    const entry = raw[i];
    if (entry == null) {
      out[i] = null;
      continue;
    }
    if (typeof entry !== "object") {
      out[i] = null;
      continue;
    }
    const obj = entry as Record<string, unknown>;
    const species =
      typeof obj.species === "string"
        ? obj.species.trim().toLowerCase()
        : typeof obj.apiName === "string"
          ? obj.apiName.trim().toLowerCase()
          : "";
    if (!species) {
      out[i] = null;
      continue;
    }
    const moves = Array.isArray(obj.moves)
      ? obj.moves
          .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
          .map((m) => m.trim())
          .slice(0, 4)
      : [];
    const item =
      typeof obj.item === "string" && obj.item.trim()
        ? obj.item.trim()
        : null;
    out[i] = { species, moves, item };
  }

  // Compat: listas densas legacy (pokemonList) sin padding a 6.
  if (raw.length > 0 && raw.length < MAX_TEAM_SIZE && !raw.some((x) => x === null)) {
    // ya rellenado arriba
  }

  return out;
}

function serializeSlots(slots: TeamSlots): string {
  return JSON.stringify(slots.map((s) => (s ? { ...s, moves: [...s.moves] } : null)));
}

function readRow(userId: string): TeamData {
  const row = getDb()
    .select()
    .from(userTeams)
    .where(eq(userTeams.userId, userId))
    .get();

  if (!row) {
    return { userId, slots: emptySlots() };
  }

  let parsed: unknown = [];
  try {
    parsed = JSON.parse(row.teamData || "[]");
  } catch {
    parsed = [];
  }

  return { userId, slots: normalizeSlots(parsed) };
}

function writeSlots(userId: string, slots: TeamSlots): TeamData {
  const normalized = normalizeSlots(slots);
  const payload = serializeSlots(normalized);
  const now = new Date();

  const existing = getDb()
    .select({ userId: userTeams.userId })
    .from(userTeams)
    .where(eq(userTeams.userId, userId))
    .get();

  if (existing) {
    getDb()
      .update(userTeams)
      .set({ teamData: payload, updatedAt: now })
      .where(eq(userTeams.userId, userId))
      .run();
  } else {
    getDb()
      .insert(userTeams)
      .values({ userId, teamData: payload, updatedAt: now })
      .run();
  }

  return { userId, slots: normalized };
}

export function getOrCreateTeam(userId: string): TeamData {
  return readRow(userId);
}

export function getTeam(userId: string): TeamData | null {
  const row = getDb()
    .select({ userId: userTeams.userId })
    .from(userTeams)
    .where(eq(userTeams.userId, userId))
    .get();
  if (!row) return null;
  return readRow(userId);
}

export function setTeamMessageRef(
  userId: string,
  refs: TeamPanelRef,
): void {
  panelRefs.set(userId, refs);
}

export function getTeamMessageRef(userId: string): TeamPanelRef | null {
  return panelRefs.get(userId) ?? null;
}

export function countFilledSlots(team: TeamData): number {
  return team.slots.filter((s) => s != null).length;
}

export function isTeamFull(team: TeamData): boolean {
  return countFilledSlots(team) >= MAX_TEAM_SIZE;
}

export function isTeamEmpty(team: TeamData): boolean {
  return countFilledSlots(team) === 0;
}

export function addPokemonToTeam(
  userId: string,
  species: string,
): TeamData {
  const team = readRow(userId);
  if (isTeamFull(team)) throw new Error("TEAM_FULL");

  const index = team.slots.findIndex((s) => s == null);
  if (index < 0) throw new Error("TEAM_FULL");

  const next = [...team.slots] as TeamSlots;
  next[index] = {
    species: species.trim().toLowerCase(),
    moves: [],
    item: null,
  };
  return writeSlots(userId, next);
}

/** Quita el slot 0-based (deja `null`, no compacta). */
export function removePokemonFromTeam(
  userId: string,
  index: number,
): TeamData {
  const team = readRow(userId);
  if (index < 0 || index >= MAX_TEAM_SIZE) throw new Error("INVALID_SLOT");
  if (!team.slots[index]) throw new Error("INVALID_SLOT");

  const next = [...team.slots] as TeamSlots;
  next[index] = null;
  return writeSlots(userId, next);
}

export function clearTeam(userId: string): TeamData {
  return writeSlots(userId, emptySlots());
}

export function setSlotMoves(
  userId: string,
  index: number,
  moves: string[],
): TeamData {
  const team = readRow(userId);
  const slot = team.slots[index];
  if (!slot) throw new Error("INVALID_SLOT");

  const next = [...team.slots] as TeamSlots;
  next[index] = {
    ...slot,
    moves: moves.map((m) => m.trim()).filter(Boolean).slice(0, 4),
  };
  return writeSlots(userId, next);
}

export function setSlotItem(
  userId: string,
  index: number,
  item: string | null,
): TeamData {
  const team = readRow(userId);
  const slot = team.slots[index];
  if (!slot) throw new Error("INVALID_SLOT");

  const next = [...team.slots] as TeamSlots;
  next[index] = {
    ...slot,
    item: item?.trim() ? item.trim() : null,
  };
  return writeSlots(userId, next);
}
