import type {
  CreateFormRequest,
  FormAnswerEntry,
  FormResponse,
  FormResponseStatus,
  InteractiveForm,
  UpdateFormRequest,
} from "@adobos/shared";
import {
  DEFAULT_FORMS_EMBED_COLOR,
  DEFAULT_FORMS_THANK_YOU,
  FORMS_MAX_PER_GUILD,
  FORMS_RESPONSES_LIST_MAX,
  clampFormCooldownMinutes,
  defaultInteractiveForm,
  normalizeFormQuestions,
  normalizeFormResponseStatus,
  normalizeFormSubmitMode,
  normalizeSnowflakeId,
  normalizeSnowflakeIdList,
} from "@adobos/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, one } from "../../db/client.js";
import { formResponses, guildForms, guildSettings } from "../../db/schema.js";
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
    throw new FormsError("Missing guildId.", 400, "MISSING_GUILD_ID");
  }
  return id;
}

async function ensureGuildRow(guildId: string): Promise<void> {
  const existing = await one(
    getDb()
      .select({ guildId: guildSettings.guildId })
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1),
  );
  if (!existing) {
    await getDb()
      .insert(guildSettings)
      .values({
        guildId,
        prefix: "!",
        welcomeEnabled: false,
        updatedAt: new Date(),
      });
  }
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

function thankYouOf(value: unknown, fallback = DEFAULT_FORMS_THANK_YOU): string {
  const raw = String(value ?? "").trim().slice(0, 500);
  return raw || fallback;
}

function rowToForm(
  row: typeof guildForms.$inferSelect,
  responseCount = 0,
): InteractiveForm {
  return {
    id: row.id,
    guildId: row.guildId,
    enabled: row.enabled !== false,
    modalTitle: (row.modalTitle ?? "").trim().slice(0, 45) || "Form",
    buttonLabel:
      (row.buttonLabel ?? "").trim().slice(0, 80) || "Open form",
    embedTitle:
      (row.embedTitle ?? "").trim().slice(0, 256) || "Server form",
    embedDescription: (row.embedDescription ?? "").trim().slice(0, 4000),
    embedColor: normalizeColor(row.embedColor),
    embedImageUrl: normalizeMediaRef(row.embedImageUrl),
    embedThumbnailUrl: normalizeMediaRef(row.embedThumbnailUrl),
    publishChannelId: row.publishChannelId ?? null,
    receptionChannelId: row.receptionChannelId ?? null,
    questions: normalizeFormQuestions(
      parseJson(row.questions, [] as InteractiveForm["questions"]),
    ),
    submitMode: normalizeFormSubmitMode(row.submitMode),
    cooldownMinutes: clampFormCooldownMinutes(row.cooldownMinutes),
    requiredRoleIds: normalizeSnowflakeIdList(
      parseJson(row.requiredRoleIds, [] as string[]),
    ),
    blockedRoleIds: normalizeSnowflakeIdList(
      parseJson(row.blockedRoleIds, [] as string[]),
    ),
    pingRoleId: row.pingRoleId ?? null,
    thankYouMessage: thankYouOf(row.thankYouMessage),
    acceptRoleId: row.acceptRoleId ?? null,
    publishedChannelId: row.publishedChannelId ?? null,
    publishedMessageId: row.publishedMessageId ?? null,
    responseCount,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function rowToResponse(row: typeof formResponses.$inferSelect): FormResponse {
  return {
    id: row.id,
    formId: row.formId,
    guildId: row.guildId,
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    answers: parseJson<FormAnswerEntry[]>(row.answers, []),
    status: normalizeFormResponseStatus(row.status),
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function invalidateFormsCache(formId?: number): void {
  if (formId != null) formCache.delete(formId);
  else formCache.clear();
}

export async function listForms(guildId?: string): Promise<InteractiveForm[]> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  const counts = getDb()
    .select({
      formId: formResponses.formId,
      c: count().as("c"),
    })
    .from(formResponses)
    .groupBy(formResponses.formId)
    .as("form_resp_counts");

  const rows = await getDb()
    .select({
      form: guildForms,
      responseCount: counts.c,
    })
    .from(guildForms)
    .leftJoin(counts, eq(counts.formId, guildForms.id))
    .where(eq(guildForms.guildId, id))
    .orderBy(desc(guildForms.updatedAt));

  const forms: InteractiveForm[] = [];
  for (const row of rows) {
    const mapped = rowToForm(row.form, Number(row.responseCount ?? 0));
    formCache.set(mapped.id, mapped);
    forms.push(mapped);
  }
  return forms;
}

async function countForms(guildId: string): Promise<number> {
  const row = await one(
    getDb()
      .select({ c: count() })
      .from(guildForms)
      .where(eq(guildForms.guildId, guildId))
      .limit(1),
  );
  return Number(row?.c ?? 0);
}

export async function getForm(
  formId: number,
  guildId?: string,
): Promise<InteractiveForm> {
  const gid = resolveGuildId(guildId);
  const row = await one(
    getDb()
      .select()
      .from(guildForms)
      .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, gid)))
      .limit(1),
  );
  if (!row) {
    throw new FormsError("Form not found.", 404, "NOT_FOUND");
  }
  const countRow = await one(
    getDb()
      .select({ c: count() })
      .from(formResponses)
      .where(eq(formResponses.formId, formId))
      .limit(1),
  );
  const mapped = rowToForm(row, countRow?.c ?? 0);
  formCache.set(mapped.id, mapped);
  return mapped;
}

/** Lookup por id (handlers Discord) sin exigir guild query. */
export async function getFormById(
  formId: number,
): Promise<InteractiveForm | null> {
  const cached = formCache.get(formId);
  if (cached) return cached;
  const row = await one(
    getDb().select().from(guildForms).where(eq(guildForms.id, formId)).limit(1),
  );
  if (!row) return null;
  const countRow = await one(
    getDb()
      .select({ c: count() })
      .from(formResponses)
      .where(eq(formResponses.formId, formId))
      .limit(1),
  );
  const mapped = rowToForm(row, countRow?.c ?? 0);
  formCache.set(mapped.id, mapped);
  return mapped;
}

type FormMutable = Omit<
  InteractiveForm,
  | "id"
  | "guildId"
  | "responseCount"
  | "createdAt"
  | "updatedAt"
  | "publishedChannelId"
  | "publishedMessageId"
> & {
  publishedChannelId: string | null;
  publishedMessageId: string | null;
};

function applyInput(
  base: InteractiveForm,
  input: CreateFormRequest | UpdateFormRequest,
): FormMutable {
  return {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : base.enabled,
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
          "Server form"
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
        ? normalizeSnowflakeId(input.publishChannelId)
        : base.publishChannelId,
    receptionChannelId:
      input.receptionChannelId !== undefined
        ? normalizeSnowflakeId(input.receptionChannelId)
        : base.receptionChannelId,
    questions:
      input.questions !== undefined
        ? normalizeFormQuestions(input.questions)
        : base.questions,
    submitMode:
      input.submitMode !== undefined
        ? normalizeFormSubmitMode(input.submitMode)
        : base.submitMode,
    cooldownMinutes:
      input.cooldownMinutes !== undefined
        ? clampFormCooldownMinutes(input.cooldownMinutes)
        : base.cooldownMinutes,
    requiredRoleIds:
      input.requiredRoleIds !== undefined
        ? normalizeSnowflakeIdList(input.requiredRoleIds)
        : base.requiredRoleIds,
    blockedRoleIds:
      input.blockedRoleIds !== undefined
        ? normalizeSnowflakeIdList(input.blockedRoleIds)
        : base.blockedRoleIds,
    pingRoleId:
      input.pingRoleId !== undefined
        ? normalizeSnowflakeId(input.pingRoleId)
        : base.pingRoleId,
    thankYouMessage:
      input.thankYouMessage !== undefined
        ? thankYouOf(input.thankYouMessage, base.thankYouMessage)
        : base.thankYouMessage,
    acceptRoleId:
      input.acceptRoleId !== undefined
        ? normalizeSnowflakeId(input.acceptRoleId)
        : base.acceptRoleId,
    publishedChannelId: base.publishedChannelId,
    publishedMessageId: base.publishedMessageId,
  };
}

function persistValues(next: FormMutable) {
  return {
    enabled: next.enabled,
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
    submitMode: next.submitMode,
    cooldownMinutes: next.cooldownMinutes,
    requiredRoleIds: JSON.stringify(next.requiredRoleIds),
    blockedRoleIds: JSON.stringify(next.blockedRoleIds),
    pingRoleId: next.pingRoleId,
    thankYouMessage: next.thankYouMessage,
    acceptRoleId: next.acceptRoleId,
  };
}

export async function createForm(
  input: CreateFormRequest,
  guildId?: string,
): Promise<InteractiveForm> {
  const id = resolveGuildId(guildId);
  await ensureGuildRow(id);
  if ((await countForms(id)) >= FORMS_MAX_PER_GUILD) {
    throw new FormsError(
      `At most ${FORMS_MAX_PER_GUILD} forms per server.`,
      400,
      "FORM_CAP",
    );
  }
  const defaults = defaultInteractiveForm(id);
  const next = applyInput(defaults, input);
  const now = new Date();

  const [inserted] = await getDb()
    .insert(guildForms)
    .values({
      guildId: id,
      ...persistValues(next),
      publishedChannelId: null,
      publishedMessageId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: guildForms.id });
  if (!inserted) {
    throw new FormsError(
      "Couldn't create the form.",
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
      ...persistValues(next),
      updatedAt: new Date(),
    })
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, id)));

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
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, id)));
  invalidateFormsCache(formId);
  return await getForm(formId, id);
}

export async function deleteForm(
  formId: number,
  guildId?: string,
): Promise<{
  publishedChannelId: string | null;
  publishedMessageId: string | null;
}> {
  const id = resolveGuildId(guildId);
  const current = await getForm(formId, id);
  await getDb()
    .delete(guildForms)
    .where(and(eq(guildForms.id, formId), eq(guildForms.guildId, id)));
  invalidateFormsCache(formId);
  return {
    publishedChannelId: current.publishedChannelId,
    publishedMessageId: current.publishedMessageId,
  };
}

export function remainingMsFromLast(
  lastCreatedAt: Date | null,
  submitMode: InteractiveForm["submitMode"],
  cooldownMinutes: number,
): number {
  if (!lastCreatedAt) return 0;
  if (submitMode === "once") return Number.POSITIVE_INFINITY;
  if (cooldownMinutes <= 0) return 0;
  const elapsed = Date.now() - lastCreatedAt.getTime();
  return Math.max(0, cooldownMinutes * 60_000 - elapsed);
}

export async function getUserCooldownRemainingMs(
  formId: number,
  userId: string,
  cooldownMinutes: number,
  submitMode: InteractiveForm["submitMode"] = "cooldown",
): Promise<number> {
  if (submitMode === "cooldown" && cooldownMinutes <= 0) return 0;
  const last = await one(
    getDb()
      .select({ createdAt: formResponses.createdAt })
      .from(formResponses)
      .where(
        and(eq(formResponses.formId, formId), eq(formResponses.userId, userId)),
      )
      .orderBy(desc(formResponses.createdAt))
      .limit(1),
  );
  return remainingMsFromLast(last?.createdAt ?? null, submitMode, cooldownMinutes);
}

export async function insertFormResponse(input: {
  formId: number;
  guildId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  answers: FormAnswerEntry[];
  submitMode: InteractiveForm["submitMode"];
  cooldownMinutes: number;
}): Promise<FormResponse> {
  const now = new Date();
  const inserted = await getDb().transaction(async (tx) => {
    await one(
      tx
        .select({ id: guildForms.id })
        .from(guildForms)
        .where(
          and(
            eq(guildForms.id, input.formId),
            eq(guildForms.guildId, input.guildId),
          ),
        )
        .limit(1)
        .for("update"),
    );

    const last = await one(
      tx
        .select({ createdAt: formResponses.createdAt })
        .from(formResponses)
        .where(
          and(
            eq(formResponses.formId, input.formId),
            eq(formResponses.userId, input.userId),
          ),
        )
        .orderBy(desc(formResponses.createdAt))
        .limit(1),
    );
    const remaining = remainingMsFromLast(
      last?.createdAt ?? null,
      input.submitMode,
      input.cooldownMinutes,
    );
    if (remaining > 0) {
      throw new FormsError(
        input.submitMode === "once"
          ? "You already submitted this form."
          : "You are still on cooldown.",
        429,
        "COOLDOWN",
      );
    }

    const [row] = await tx
      .insert(formResponses)
      .values({
        formId: input.formId,
        guildId: input.guildId,
        userId: input.userId,
        username: input.username.slice(0, 100),
        displayName: input.displayName.slice(0, 100),
        avatarUrl: input.avatarUrl,
        answers: JSON.stringify(input.answers),
        status: "pending",
        createdAt: now,
      })
      .returning();
    return row;
  });

  if (!inserted) {
    throw new FormsError(
      "Couldn't save the response.",
      500,
      "INSERT_FAILED",
    );
  }

  invalidateFormsCache(input.formId);
  return rowToResponse(inserted);
}

export async function getFormResponseById(
  responseId: number,
): Promise<FormResponse | null> {
  const row = await one(
    getDb()
      .select()
      .from(formResponses)
      .where(eq(formResponses.id, responseId))
      .limit(1),
  );
  return row ? rowToResponse(row) : null;
}

export async function reviewFormResponse(input: {
  responseId: number;
  guildId: string;
  status: Exclude<FormResponseStatus, "pending">;
  reviewerId: string;
}): Promise<FormResponse> {
  const current = await getFormResponseById(input.responseId);
  if (!current || current.guildId !== input.guildId) {
    throw new FormsError("Response not found.", 404, "NOT_FOUND");
  }
  if (current.status !== "pending") {
    throw new FormsError("This response was already reviewed.", 409, "ALREADY_REVIEWED");
  }
  const now = new Date();
  await getDb()
    .update(formResponses)
    .set({
      status: input.status,
      reviewedBy: input.reviewerId,
      reviewedAt: now,
    })
    .where(
      and(
        eq(formResponses.id, input.responseId),
        eq(formResponses.guildId, input.guildId),
      ),
    );
  invalidateFormsCache(current.formId);
  return {
    ...current,
    status: input.status,
    reviewedBy: input.reviewerId,
    reviewedAt: now.toISOString(),
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
    .where(and(eq(formResponses.formId, formId), eq(formResponses.guildId, id)))
    .orderBy(desc(formResponses.createdAt))
    .limit(FORMS_RESPONSES_LIST_MAX);

  return rows.map(rowToResponse);
}

/** Compat: invalida caché (nombre antiguo). */
export function invalidateFormsConfigCache(guildId?: string): void {
  void guildId;
  invalidateFormsCache();
}
