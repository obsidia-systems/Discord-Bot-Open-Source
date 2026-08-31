import { randomBytes } from "node:crypto";
import type {
  CreateFormRequest,
  FormAnswerEntry,
  FormQuestion,
  FormResponse,
  InteractiveForm,
  UpdateFormRequest,
} from "@adobos/shared";
import {
  DEFAULT_FORMS_EMBED_COLOR,
  FORMS_MAX_QUESTIONS,
  defaultInteractiveForm,
  normalizeFormQuestionStyle,
} from "@adobos/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import {
  formResponses,
  guildForms,
  guildSettings,
} from "../../db/schema.js";
import { BoundedTtlMap } from "../../core/cache/boundedTtlMap.js";

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

const formCache = new BoundedTtlMap<number, InteractiveForm>(2_000, 10 * 60_000);

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveGuildId(guildId?: string): string {
  const id = (guildId ?? "").trim();
  if (!id) {
    throw new FormsError(
      "Falta guildId.",
      400,
      "MISSING_GUILD_ID",
    );
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(getDb()
    .select({ guildId: guildSettings.guildId })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1));
  if (!existing) {
    await getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      })
      ;
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

function normalizeMediaRef(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw.slice(0, 500);
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 500);
  return null;
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
      placeholder: String(raw.placeholder ?? "")
        .trim()
        .slice(0, 100),
    });
  }
  return out;
}

function clampCooldown(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 60 * 24 * 30);
}

function rowToForm(
  row: typeof guildForms.$inferSelect,
  responseCount = 0,
): InteractiveForm {
  return {
    id: row.id,
    guildId: row.guildId,
    modalTitle: (row.modalTitle ?? "").trim().slice(0, 45) || "Formulario",
    buttonLabel:
      (row.buttonLabel ?? "").trim().slice(0, 80) || "Abrir formulario",
    embedTitle:
      (row.embedTitle ?? "").trim().slice(0, 256) || "Formulario del servidor",
    embedDescription: (row.embedDescription ?? "").trim().slice(0, 4000),
    embedColor: normalizeColor(row.embedColor),
    embedImageUrl: normalizeMediaRef(row.embedImageUrl),
    embedThumbnailUrl: normalizeMediaRef(row.embedThumbnailUrl),
    publishChannelId: row.publishChannelId ?? null,
    receptionChannelId: row.receptionChannelId ?? null,
    questions: normalizeFormQuestions(
      parseJson<FormQuestion[]>(row.questions, []),
    ),
    cooldownMinutes: clampCooldown(row.cooldownMinutes),
    publishedChannelId: row.publishedChannelId ?? null,
    publishedMessageId: row.publishedMessageId ?? null,
    responseCount,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function invalidateFormsCache(formId?: number): void {
  if (formId != null) formCache.delete(formId);
  else formCache.clear();
}

export async function listForms(guildId?: string): Promise<InteractiveForm[]> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const rows = await getDb()
    .select()
    .from(guildForms)
    .where(eq(guildForms.guildId, id))
    .orderBy(desc(guildForms.updatedAt));

  const forms: InteractiveForm[] = [];
  for (const row of rows) {
    const countRow = await one(
      getDb()
        .select({ c: count() })
        .from(formResponses)
        .where(eq(formResponses.formId, row.id))
        .limit(1),
    );
    const mapped = rowToForm(row, countRow?.c ?? 0);
    formCache.set(mapped.id, mapped);
    forms.push(mapped);
  }
  return forms;
}

export async function getForm(formId: number, guildId?: string): Promise<InteractiveForm> {
  const gid = resolveGuildId(guildId);
  const row = await one(getDb()
    .select()
    .from(guildForms)
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, gid)))
    .limit(1));
  if (!row) {
    throw new FormsError("Formulario no encontrado.", 404, "NOT_FOUND");
  }
  const countRow = await one(getDb()
    .select({ c: count() })
    .from(formResponses)
    .where(eq(formResponses.formId, formId))
    .limit(1));
  const mapped = rowToForm(row, countRow?.c ?? 0);
  formCache.set(mapped.id, mapped);
  return mapped;
}

/** Lookup por id (handlers Discord) sin exigir guild query. */
export async function getFormById(formId: number): Promise<InteractiveForm | null> {
  const cached = formCache.get(formId);
  if (cached) return cached;
  const row = await one(getDb()
    .select()
    .from(guildForms)
    .where(eq(guildForms.id, formId))
    .limit(1));
  if (!row) return null;
  const countRow = await one(getDb()
    .select({ c: count() })
    .from(formResponses)
    .where(eq(formResponses.formId, formId))
    .limit(1));
  const mapped = rowToForm(row, countRow?.c ?? 0);
  formCache.set(mapped.id, mapped);
  return mapped;
}

function applyInput(
  base: InteractiveForm,
  input: CreateFormRequest | UpdateFormRequest,
): Omit<
  InteractiveForm,
  "id" | "guildId" | "responseCount" | "createdAt" | "updatedAt" | "publishedChannelId" | "publishedMessageId"
> & {
  publishedChannelId: string | null;
  publishedMessageId: string | null;
} {
  return {
    modalTitle:
      input.modalTitle !== undefined
        ? String(input.modalTitle).trim().slice(0, 45) || "Formulario"
        : base.modalTitle,
    buttonLabel:
      input.buttonLabel !== undefined
        ? String(input.buttonLabel).trim().slice(0, 80) || "Abrir formulario"
        : base.buttonLabel,
    embedTitle:
      input.embedTitle !== undefined
        ? String(input.embedTitle).trim().slice(0, 256) ||
          "Formulario del servidor"
        : base.embedTitle,
    embedDescription:
      input.embedDescription !== undefined
        ? String(input.embedDescription).trim().slice(0, 4000)
        : base.embedDescription,
    embedColor:
      input.embedColor !== undefined
        ? normalizeColor(input.embedColor)
        : base.embedColor,
    embedImageUrl:
      input.embedImageUrl !== undefined
        ? normalizeMediaRef(input.embedImageUrl)
        : base.embedImageUrl,
    embedThumbnailUrl:
      input.embedThumbnailUrl !== undefined
        ? normalizeMediaRef(input.embedThumbnailUrl)
        : base.embedThumbnailUrl,
    publishChannelId:
      input.publishChannelId !== undefined
        ? normalizeSnowflake(input.publishChannelId)
        : base.publishChannelId,
    receptionChannelId:
      input.receptionChannelId !== undefined
        ? normalizeSnowflake(input.receptionChannelId)
        : base.receptionChannelId,
    questions:
      input.questions !== undefined
        ? normalizeFormQuestions(input.questions)
        : base.questions,
    cooldownMinutes:
      input.cooldownMinutes !== undefined
        ? clampCooldown(input.cooldownMinutes)
        : base.cooldownMinutes,
    publishedChannelId: base.publishedChannelId,
    publishedMessageId: base.publishedMessageId,
  };
}

export async function createForm(
  input: CreateFormRequest,
  guildId?: string,
): Promise<InteractiveForm> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const defaults = defaultInteractiveForm(id);
  const next = applyInput(defaults, input);
  const now = new Date();

  const [inserted] = await getDb()
    .insert(guildForms)
    .values({
      guildId: id,
      modalTitle: next.modalTitle,
      buttonLabel: next.buttonLabel,
      embedTitle: next.embedTitle,
      embedDescription: next.embedDescription,
      embedColor: next.embedColor,
      embedImageUrl: next.embedImageUrl,
      embedThumbnailUrl: next.embedThumbnailUrl,
      publishChannelId: next.publishChannelId,
      receptionChannelId: next.receptionChannelId,
      questions: JSON.stringify(next.questions),
      cooldownMinutes: next.cooldownMinutes,
      publishedChannelId: null,
      publishedMessageId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: guildForms.id });
  if (!inserted) {
    throw new FormsError(
      "No se pudo crear el formulario.",
      500,
      "INSERT_FAILED",
    );
  }

  return await getForm(inserted.id, id);
}

export async function updateForm(
  formId: number,
  input: UpdateFormRequest,
  guildId?: string,
): Promise<InteractiveForm> {
  const id = resolveGuildId(guildId);
  const current = await getForm(formId, id);
  const next = applyInput(current, input);

  await getDb()
    .update(guildForms)
    .set({
      modalTitle: next.modalTitle,
      buttonLabel: next.buttonLabel,
      embedTitle: next.embedTitle,
      embedDescription: next.embedDescription,
      embedColor: next.embedColor,
      embedImageUrl: next.embedImageUrl,
      embedThumbnailUrl: next.embedThumbnailUrl,
      publishChannelId: next.publishChannelId,
      receptionChannelId: next.receptionChannelId,
      questions: JSON.stringify(next.questions),
      cooldownMinutes: next.cooldownMinutes,
      updatedAt: new Date(),
    })
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, id)))
    ;

  invalidateFormsCache(formId);
  return await getForm(formId, id);
}

export async function setFormPublishedMessage(
  formId: number,
  channelId: string,
  messageId: string,
  guildId?: string,
): Promise<InteractiveForm> {
  const id = resolveGuildId(guildId);
  await getForm(formId, id);
  await getDb()
    .update(guildForms)
    .set({
      publishedChannelId: channelId,
      publishedMessageId: messageId,
      updatedAt: new Date(),
    })
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, id)))
    ;
  invalidateFormsCache(formId);
  return await getForm(formId, id);
}

export async function deleteForm(
  formId: number,
  guildId?: string,
): Promise<{ publishedChannelId: string | null; publishedMessageId: string | null }> {
  const id = resolveGuildId(guildId);
  const current = await getForm(formId, id);
  await getDb()
    .delete(guildForms)
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, id)))
    ;
  invalidateFormsCache(formId);
  return {
    publishedChannelId: current.publishedChannelId,
    publishedMessageId: current.publishedMessageId,
  };
}

export async function getUserCooldownRemainingMs(
  formId: number,
  userId: string,
  cooldownMinutes: number,
): Promise<number> {
  if (cooldownMinutes <= 0) return 0;
  const last = await one(getDb()
    .select({ createdAt: formResponses.createdAt })
    .from(formResponses)
    .where(
      and(
        eq(formResponses.formId, formId),
        eq(formResponses.userId, userId),
      ),
    )
    .orderBy(desc(formResponses.createdAt))
    .limit(1));
  if (!last) return 0;
  const elapsed = Date.now() - new Date(last.createdAt).getTime();
  const windowMs = cooldownMinutes * 60_000;
  return Math.max(0, windowMs - elapsed);
}

export async function insertFormResponse(input: {
  formId: number;
  guildId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  answers: FormAnswerEntry[];
}): Promise<FormResponse> {
  const now = new Date();
  const [inserted] = await getDb()
    .insert(formResponses)
    .values({
      formId: input.formId,
      guildId: input.guildId,
      userId: input.userId,
      username: input.username.slice(0, 100),
      displayName: input.displayName.slice(0, 100),
      avatarUrl: input.avatarUrl,
      answers: JSON.stringify(input.answers),
      createdAt: now,
    })
    .returning({ id: formResponses.id });
  if (!inserted) {
    throw new FormsError(
      "No se pudo guardar la respuesta.",
      500,
      "INSERT_FAILED",
    );
  }

  invalidateFormsCache(input.formId);
  return {
    id: inserted.id,
    formId: input.formId,
    guildId: input.guildId,
    userId: input.userId,
    username: input.username,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    answers: input.answers,
    createdAt: now.toISOString(),
  };
}

export async function listFormResponses(
  formId: number,
  guildId?: string,
): Promise<FormResponse[]> {
  const id = resolveGuildId(guildId);
  await getForm(formId, id);
  const rows = await getDb()
    .select()
    .from(formResponses)
    .where(
      and(eq(formResponses.formId, formId), eq(formResponses.guildId, id)),
    )
    .orderBy(desc(formResponses.createdAt))
    ;

  return rows.map((row) => ({
    id: row.id,
    formId: row.formId,
    guildId: row.guildId,
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    answers: parseJson<FormAnswerEntry[]>(row.answers, []),
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}

/** Compat: invalida caché (nombre antiguo). */
export function invalidateFormsConfigCache(guildId?: string): void {
  void guildId;
  invalidateFormsCache();
}
