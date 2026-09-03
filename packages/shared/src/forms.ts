/** Contratos Forms — modales Discord (texto, select, adjunto). */

export type FormQuestionStyle =
  | "SHORT"
  | "PARAGRAPH"
  | "STRING_SELECT"
  | "FILE_UPLOAD";

export type FormSubmitMode = "cooldown" | "once";

export type FormResponseStatus = "pending" | "accepted" | "rejected";

export interface FormSelectOption {
  label: string;
  value: string;
}

export interface FormQuestion {
  /** Id estable interno (también base del customId del componente). */
  id: string;
  label: string;
  style: FormQuestionStyle;
  required: boolean;
  /** Placeholder del TextInput (máx. 100 en Discord). */
  placeholder: string;
  /** Opciones de STRING_SELECT (máx. 25). */
  options: FormSelectOption[];
}

export interface InteractiveForm {
  id: number;
  guildId: string;
  enabled: boolean;
  modalTitle: string;
  buttonLabel: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  /** URL http(s) o `/uploads/…`. */
  embedImageUrl: string | null;
  embedThumbnailUrl: string | null;
  publishChannelId: string | null;
  receptionChannelId: string | null;
  questions: FormQuestion[];
  submitMode: FormSubmitMode;
  /** Anti-spam: minutos entre envíos (0 = sin límite). Ignorado si once. */
  cooldownMinutes: number;
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  pingRoleId: string | null;
  thankYouMessage: string;
  acceptRoleId: string | null;
  publishedChannelId: string | null;
  publishedMessageId: string | null;
  /** Solo en listados. */
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormAnswerEntry {
  questionId: string;
  label: string;
  value: string;
}

export interface FormResponse {
  id: number;
  formId: number;
  guildId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  answers: FormAnswerEntry[];
  status: FormResponseStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface FormsListResponse {
  forms: InteractiveForm[];
}

export interface FormResponseBody {
  form: InteractiveForm;
}

export interface FormResponsesListResponse {
  responses: FormResponse[];
}

export type CreateFormRequest = {
  enabled?: boolean;
  modalTitle?: string;
  buttonLabel?: string;
  embedTitle?: string;
  embedDescription?: string;
  embedColor?: string;
  embedImageUrl?: string | null;
  embedThumbnailUrl?: string | null;
  publishChannelId?: string | null;
  receptionChannelId?: string | null;
  questions?: FormQuestion[];
  submitMode?: FormSubmitMode;
  cooldownMinutes?: number;
  requiredRoleIds?: string[];
  blockedRoleIds?: string[];
  pingRoleId?: string | null;
  thankYouMessage?: string;
  acceptRoleId?: string | null;
};

export type UpdateFormRequest = Partial<CreateFormRequest>;

export interface PublishFormResponse {
  form: InteractiveForm;
  messageId: string;
  channelId: string;
}

/** @deprecated Usar InteractiveForm — alias de transición. */
export type FormsConfig = InteractiveForm;

/** @deprecated Usar UpdateFormRequest. */
export type UpdateFormsConfigRequest = UpdateFormRequest;

/** @deprecated Usar FormResponseBody. */
export type FormsConfigResponse = FormResponseBody;

/** @deprecated Usar PublishFormResponse. */
export type PublishFormsResponse = PublishFormResponse;

export const FORMS_MAX_QUESTIONS = 5;
export const FORMS_MAX_PER_GUILD = 25;
export const FORMS_MAX_SELECT_OPTIONS = 25;
export const FORMS_RESPONSES_LIST_MAX = 200;
export const FORMS_MAX_COOLDOWN_MINUTES = 60 * 24 * 30;

export const DEFAULT_FORMS_EMBED_COLOR = "#5865F2";
export const DEFAULT_FORMS_THANK_YOU = "Form submitted successfully!";

export const FORM_QUESTION_STYLES: FormQuestionStyle[] = [
  "SHORT",
  "PARAGRAPH",
  "STRING_SELECT",
  "FILE_UPLOAD",
];

export const FORM_SUBMIT_MODES: FormSubmitMode[] = ["cooldown", "once"];

const SNOWFLAKE_RE = /^\d{17,20}$/;

export function defaultFormQuestion(): FormQuestion {
  return {
    id: `q${Date.now().toString(36)}`,
    label: "New question",
    style: "SHORT",
    required: true,
    placeholder: "",
    options: [],
  };
}

export function defaultInteractiveForm(guildId = ""): InteractiveForm {
  return {
    id: 0,
    guildId,
    enabled: true,
    modalTitle: "Form",
    buttonLabel: "Open form",
    embedTitle: "Server form",
    embedDescription: "Click the button to fill out the form.",
    embedColor: DEFAULT_FORMS_EMBED_COLOR,
    embedImageUrl: null,
    embedThumbnailUrl: null,
    publishChannelId: null,
    receptionChannelId: null,
    questions: [],
    submitMode: "cooldown",
    cooldownMinutes: 0,
    requiredRoleIds: [],
    blockedRoleIds: [],
    pingRoleId: null,
    thankYouMessage: DEFAULT_FORMS_THANK_YOU,
    acceptRoleId: null,
    publishedChannelId: null,
    publishedMessageId: null,
    responseCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated Usar defaultInteractiveForm. */
export function defaultFormsConfig(guildId = ""): InteractiveForm {
  return defaultInteractiveForm(guildId);
}

export function normalizeFormQuestionStyle(value: unknown): FormQuestionStyle {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (raw === "PARAGRAPH" || raw === "LONG" || raw === "MULTI") {
    return "PARAGRAPH";
  }
  if (raw === "STRING_SELECT" || raw === "SELECT" || raw === "DROPDOWN") {
    return "STRING_SELECT";
  }
  if (raw === "FILE_UPLOAD" || raw === "FILE" || raw === "ATTACHMENT") {
    return "FILE_UPLOAD";
  }
  return "SHORT";
}

export function normalizeFormSubmitMode(value: unknown): FormSubmitMode {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "once" ? "once" : "cooldown";
}

export function normalizeFormResponseStatus(
  value: unknown,
): FormResponseStatus {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "accepted" || raw === "rejected") return raw;
  return "pending";
}

export function clampFormCooldownMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, FORMS_MAX_COOLDOWN_MINUTES);
}

export function normalizeSnowflakeId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value).trim();
  if (!SNOWFLAKE_RE.test(id)) return null;
  return id;
}

export function normalizeSnowflakeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = normalizeSnowflakeId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

function slugSelectValue(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

export function normalizeFormSelectOptions(value: unknown): FormSelectOption[] {
  if (!Array.isArray(value)) return [];
  const out: FormSelectOption[] = [];
  const seenValues = new Set<string>();
  const seenLabels = new Set<string>();
  for (const raw of value.slice(0, FORMS_MAX_SELECT_OPTIONS * 2)) {
    if (out.length >= FORMS_MAX_SELECT_OPTIONS) break;
    let label = "";
    let optionValue = "";
    if (typeof raw === "string") {
      label = raw.trim().slice(0, 100);
    } else if (raw && typeof raw === "object") {
      const rec = raw as { label?: unknown; value?: unknown };
      label = String(rec.label ?? "")
        .trim()
        .slice(0, 100);
      optionValue = String(rec.value ?? "")
        .trim()
        .slice(0, 100);
    }
    if (!label) continue;
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);
    if (!optionValue)
      optionValue = slugSelectValue(label, `opt_${out.length + 1}`);
    if (seenValues.has(optionValue))
      optionValue = `${optionValue}_${out.length}`;
    seenValues.add(optionValue);
    out.push({ label, value: optionValue });
  }
  return out;
}

export function normalizeFormQuestions(
  input: FormQuestion[] | undefined,
): FormQuestion[] {
  if (!input) return [];
  const out: FormQuestion[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (out.length >= FORMS_MAX_QUESTIONS) break;
    const label = String(raw.label ?? "")
      .trim()
      .slice(0, 45);
    if (!label) continue;
    let id = String(raw.id ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "");
    if (!id || id.length > 40) id = `q${out.length}_${Date.now().toString(36)}`;
    if (seen.has(id)) id = `${id}_${out.length}`;
    seen.add(id);
    const style = normalizeFormQuestionStyle(raw.style);
    out.push({
      id,
      label,
      style,
      required: Boolean(raw.required),
      placeholder: String(raw.placeholder ?? "")
        .trim()
        .slice(0, 100),
      options:
        style === "STRING_SELECT"
          ? normalizeFormSelectOptions(raw.options)
          : [],
    });
  }
  return out;
}

/** null = pasa. string = motivo para el usuario. */
export function formMemberGateReason(input: {
  memberRoleIds: Iterable<string>;
  requiredRoleIds: string[];
  blockedRoleIds: string[];
}): string | null {
  const have = new Set(input.memberRoleIds);
  if (input.blockedRoleIds.some((id) => have.has(id))) {
    return "You can't submit this form.";
  }
  if (
    input.requiredRoleIds.length > 0 &&
    !input.requiredRoleIds.some((id) => have.has(id))
  ) {
    return "You don't have the required role to submit this form.";
  }
  return null;
}

export function parseFormNumericId(
  customId: string,
  prefix: string,
): number | null {
  if (!customId.startsWith(prefix)) return null;
  const raw = customId.slice(prefix.length);
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id < 1) return null;
  return id;
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildFormResponsesCsv(
  form: Pick<InteractiveForm, "questions" | "modalTitle">,
  responses: FormResponse[],
): string {
  const headers = [
    "id",
    "userId",
    "username",
    "displayName",
    "status",
    "createdAt",
    ...form.questions.map((q) => q.label),
  ];
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of responses) {
    const byQuestion = new Map(row.answers.map((a) => [a.questionId, a.value]));
    const cells = [
      String(row.id),
      row.userId,
      row.username,
      row.displayName,
      row.status,
      row.createdAt,
      ...form.questions.map((q) => byQuestion.get(q.id) ?? ""),
    ];
    lines.push(cells.map(escapeCsvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Prefijos Discord (customId ≤ 100). Incluyen el id numérico. */
export const FORM_OPEN_PREFIX = "form_open_";
export const FORM_SUBMIT_PREFIX = "form_submit_";
export const FORM_QUESTION_PREFIX = "form_q_";
export const FORM_ACCEPT_PREFIX = "form_accept_";
export const FORM_DENY_PREFIX = "form_deny_";
