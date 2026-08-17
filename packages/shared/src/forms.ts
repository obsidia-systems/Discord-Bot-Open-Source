/** Contratos Formularios interactivos (Discord Modals) — multi-formulario. */

export type FormQuestionStyle = "SHORT" | "PARAGRAPH";

export interface FormQuestion {
  /** Id estable interno (también base del customId del TextInput). */
  id: string;
  label: string;
  style: FormQuestionStyle;
  required: boolean;
  /** Placeholder del TextInput (máx. 100 en Discord). */
  placeholder: string;
}

export interface InteractiveForm {
  id: number;
  guildId: string;
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
  /** Anti-spam: minutos entre envíos del mismo usuario (0 = sin límite). */
  cooldownMinutes: number;
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
  cooldownMinutes?: number;
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

export const DEFAULT_FORMS_EMBED_COLOR = "#5865F2";

export function defaultFormQuestion(): FormQuestion {
  return {
    id: `q${Date.now().toString(36)}`,
    label: "Nueva pregunta",
    style: "SHORT",
    required: true,
    placeholder: "",
  };
}

export function defaultInteractiveForm(guildId = ""): InteractiveForm {
  return {
    id: 0,
    guildId,
    modalTitle: "Formulario",
    buttonLabel: "Abrir formulario",
    embedTitle: "Formulario del servidor",
    embedDescription:
      "Haz clic en el botón para completar el formulario.",
    embedColor: DEFAULT_FORMS_EMBED_COLOR,
    embedImageUrl: null,
    embedThumbnailUrl: null,
    publishChannelId: null,
    receptionChannelId: null,
    questions: [],
    cooldownMinutes: 0,
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

export function normalizeFormQuestionStyle(
  value: unknown,
): FormQuestionStyle {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "PARAGRAPH" || raw === "LONG" || raw === "MULTI") {
    return "PARAGRAPH";
  }
  return "SHORT";
}

/** Prefijos Discord (customId ≤ 100). Incluyen el id numérico del form. */
export const FORM_OPEN_PREFIX = "form_open_";
export const FORM_SUBMIT_PREFIX = "form_submit_";
export const FORM_QUESTION_PREFIX = "form_q_";
