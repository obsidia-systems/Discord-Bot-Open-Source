import { randomBytes } from "node:crypto";
import type {
  FormQuestion,
  FormsConfig,
  UpdateFormsConfigRequest,
} from "@adobos/shared";
import {
  DEFAULT_FORMS_EMBED_COLOR,
  FORMS_MAX_QUESTIONS,
  defaultFormsConfig,
  normalizeFormQuestionStyle,
} from "@adobos/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { guildSettings, interactiveForms } from "../../db/schema.js";

export class FormsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "FormsError";
  }
}

const configCache = new Map<string, FormsConfig>();

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? process.env.DISCORD_GUILD_ID ?? "").trim();
  if (!id) {
    throw new FormsError(
      "Falta DISCORD_GUILD_ID (o guildId).",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

function ensureGuildRow(guildId: string): void {
  const existing = getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .get();
  if (!existing) {
    getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      .run();
  }
}

function normalizeSnowflake(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value).trim();
  if (!/^\d{17,20}$/.test(id)) return null;
  return id;
}

function normalizeColor(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return DEFAULT_FORMS_EMBED_COLOR;
}

function newQuestionId(): string {
  return randomBytes(4).toString("hex");
}

export function normalizeFormQuestions(
  input: FormQuestion[] | undefined,
): FormQuestion[] {
  if (!input) return [];
  const out: FormQuestion[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, FORMS_MAX_QUESTIONS)) {
    const label = String(raw.label ?? "").trim().slice(0, 45);
    if (!label) continue;
    let id = String(raw.id ?? "").trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!id || id.length > 40) id = newQuestionId();
    if (seen.has(id)) id = `${id}_${newQuestionId()}`;
    seen.add(id);
    out.push({
      id,
      label,
      style: normalizeFormQuestionStyle(raw.style),
      required: Boolean(raw.required),
    });
  }
  return out;
}

function rowToConfig(
  guildId: string,
  row: typeof interactiveForms.$inferSelect | undefined,
): FormsConfig {
  if (!row) return defaultFormsConfig(guildId);
  return {
    guildId,
    modalTitle: (row.modalTitle ?? "").trim().slice(0, 45) || "Formulario",
    buttonLabel:
      (row.buttonLabel ?? "").trim().slice(0, 80) || "Abrir formulario",
    embedTitle:
      (row.embedTitle ?? "").trim().slice(0, 256) || "Formulario del servidor",
    embedDescription: (row.embedDescription ?? "").trim().slice(0, 4000),
    embedColor: normalizeColor(row.embedColor),
    publishChannelId: row.publishChannelId ?? null,
    receptionChannelId: row.receptionChannelId ?? null,
    questions: normalizeFormQuestions(
      parseJson<FormQuestion[]>(row.questions, []),
    ),
    publishedChannelId: row.publishedChannelId ?? null,
    publishedMessageId: row.publishedMessageId ?? null,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function invalidateFormsConfigCache(guildId?: string): void {
  if (guildId) configCache.delete(guildId);
  else configCache.clear();
}

export function getFormsConfig(guildId?: string): FormsConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const row = getDb()
    .select()
    .from(interactiveForms)
    .where(eq(interactiveForms.guildId, id))
    .get();
  const config = rowToConfig(id, row);
  configCache.set(id, config);
  return config;
}

export function getFormsConfigCached(guildId: string): FormsConfig {
  const cached = configCache.get(guildId);
  if (cached) return cached;
  try {
    return getFormsConfig(guildId);
  } catch {
    return defaultFormsConfig(guildId);
  }
}

export function updateFormsConfig(
  input: UpdateFormsConfigRequest,
  guildId?: string,
): FormsConfig {
  const id = resolveGuildId(guildId);
  ensureGuildRow(id);
  const current = getFormsConfig(id);

  const next: FormsConfig = {
    guildId: id,
    modalTitle:
      input.modalTitle !== undefined
        ? String(input.modalTitle).trim().slice(0, 45) || "Formulario"
        : current.modalTitle,
    buttonLabel:
      input.buttonLabel !== undefined
        ? String(input.buttonLabel).trim().slice(0, 80) || "Abrir formulario"
        : current.buttonLabel,
    embedTitle:
      input.embedTitle !== undefined
        ? String(input.embedTitle).trim().slice(0, 256) ||
          "Formulario del servidor"
        : current.embedTitle,
    embedDescription:
      input.embedDescription !== undefined
        ? String(input.embedDescription).trim().slice(0, 4000)
        : current.embedDescription,
    embedColor:
      input.embedColor !== undefined
        ? normalizeColor(input.embedColor)
        : current.embedColor,
    publishChannelId:
      input.publishChannelId !== undefined
        ? normalizeSnowflake(input.publishChannelId)
        : current.publishChannelId,
    receptionChannelId:
      input.receptionChannelId !== undefined
        ? normalizeSnowflake(input.receptionChannelId)
        : current.receptionChannelId,
    questions:
      input.questions !== undefined
        ? normalizeFormQuestions(input.questions)
        : current.questions,
    publishedChannelId: current.publishedChannelId,
    publishedMessageId: current.publishedMessageId,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .insert(interactiveForms)
    .values({
      guildId: id,
      modalTitle: next.modalTitle,
      buttonLabel: next.buttonLabel,
      embedTitle: next.embedTitle,
      embedDescription: next.embedDescription,
      embedColor: next.embedColor,
      publishChannelId: next.publishChannelId,
      receptionChannelId: next.receptionChannelId,
      questions: JSON.stringify(next.questions),
      publishedChannelId: next.publishedChannelId,
      publishedMessageId: next.publishedMessageId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: interactiveForms.guildId,
      set: {
        modalTitle: next.modalTitle,
        buttonLabel: next.buttonLabel,
        embedTitle: next.embedTitle,
        embedDescription: next.embedDescription,
        embedColor: next.embedColor,
        publishChannelId: next.publishChannelId,
        receptionChannelId: next.receptionChannelId,
        questions: JSON.stringify(next.questions),
        updatedAt: new Date(),
      },
    })
    .run();

  configCache.set(id, next);
  return next;
}

export function setFormsPublishedMessage(
  guildId: string,
  channelId: string,
  messageId: string,
): FormsConfig {
  const id = resolveGuildId(guildId);
  const current = getFormsConfig(id);
  const next: FormsConfig = {
    ...current,
    publishedChannelId: channelId,
    publishedMessageId: messageId,
    updatedAt: new Date().toISOString(),
  };

  getDb()
    .update(interactiveForms)
    .set({
      publishedChannelId: channelId,
      publishedMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(interactiveForms.guildId, id))
    .run();

  configCache.set(id, next);
  return next;
}
