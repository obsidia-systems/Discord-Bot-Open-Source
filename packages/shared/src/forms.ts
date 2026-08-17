/** Contratos Formularios interactivos (Discord Modals). */

export type FormQuestionStyle = "SHORT" | "PARAGRAPH";

export interface FormQuestion {
  /** Id estable interno (también base del customId del TextInput). */
  id: string;
  label: string;
  style: FormQuestionStyle;
  required: boolean;
}

export interface FormsConfig {
  guildId: string;
  /** Título del Modal de Discord (máx. 45). */
  modalTitle: string;
  /** Texto del botón que abre el modal. */
  buttonLabel: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  /** Canal donde se publica el embed+botón. */
  publishChannelId: string | null;
  /** Canal de recepción de respuestas. */
  receptionChannelId: string | null;
  questions: FormQuestion[];
  publishedChannelId: string | null;
  publishedMessageId: string | null;
  updatedAt: string;
}

export interface FormsConfigResponse {
  config: FormsConfig;
}

export type UpdateFormsConfigRequest = Partial<{
  modalTitle: string;
  buttonLabel: string;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  publishChannelId: string | null;
  receptionChannelId: string | null;
  questions: FormQuestion[];
}>;

export interface PublishFormsResponse {
  config: FormsConfig;
  messageId: string;
  channelId: string;
}

export const FORMS_MAX_QUESTIONS = 5;

export const DEFAULT_FORMS_EMBED_COLOR = "#5865F2";

export function defaultFormsConfig(guildId = ""): FormsConfig {
  return {
    guildId,
    modalTitle: "Formulario",
    buttonLabel: "Abrir formulario",
    embedTitle: "Formulario del servidor",
    embedDescription:
      "Haz clic en el botón para completar el formulario.",
    embedColor: DEFAULT_FORMS_EMBED_COLOR,
    publishChannelId: null,
    receptionChannelId: null,
    questions: [],
    publishedChannelId: null,
    publishedMessageId: null,
    updatedAt: new Date().toISOString(),
  };
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

/** Prefijos Discord (customId ≤ 100). */
export const FORM_OPEN_PREFIX = "form_open_";
export const FORM_SUBMIT_PREFIX = "form_submit_";
export const FORM_QUESTION_PREFIX = "form_q_";
