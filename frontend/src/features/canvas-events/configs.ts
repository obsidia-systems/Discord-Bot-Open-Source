import {
  fetchCanvasEventSettings,
  saveCanvasEventSettings,
} from "@/lib/api";
import type { CanvasEventBuilderConfig } from "./CanvasEventBuilder";

export const leaveBuilderConfig: CanvasEventBuilderConfig = {
  cardTitle: "Diseño de la despedida",
  cardDescription:
    "Tarjeta PNG 1920×1080 cuando alguien abandona el servidor.",
  defaultMessage: "{user} abandonó el servidor. Ahora somos {membercount}.",
  defaultPrimaryText: "¡Hasta pronto!",
  defaultSecondaryText: "{username}",
  loadingLabel: "configuración de despedidas",
  saveLabel: "Guardar despedida",
  savedActiveMessage: "Despedida guardada y activa.",
  savedInactiveMessage: "Configuración guardada (módulo desactivado).",
  fetchSettings: () => fetchCanvasEventSettings("leave"),
  saveSettings: (payload) => saveCanvasEventSettings("leave", payload),
};

export const banBuilderConfig: CanvasEventBuilderConfig = {
  cardTitle: "Diseño del baneo",
  cardDescription:
    "Tarjeta PNG 1920×1080 cuando alguien es baneado del servidor.",
  defaultMessage: "{user} fue baneado del servidor.",
  defaultPrimaryText: "Usuario baneado",
  defaultSecondaryText: "{username}",
  loadingLabel: "configuración de baneos",
  saveLabel: "Guardar baneo",
  savedActiveMessage: "Baneo guardado y activo.",
  savedInactiveMessage: "Configuración guardada (módulo desactivado).",
  fetchSettings: () => fetchCanvasEventSettings("ban"),
  saveSettings: (payload) => saveCanvasEventSettings("ban", payload),
};

export const boostBuilderConfig: CanvasEventBuilderConfig = {
  cardTitle: "Diseño del boost",
  cardDescription:
    "Tarjeta PNG 1920×1080 cuando alguien impulsa el servidor.",
  defaultMessage: "{user} impulsó el servidor. ¡Gracias!",
  defaultPrimaryText: "¡Gracias por el boost!",
  defaultSecondaryText: "{username}",
  loadingLabel: "configuración de boosts",
  saveLabel: "Guardar boost",
  savedActiveMessage: "Boost guardado y activo.",
  savedInactiveMessage: "Configuración guardada (módulo desactivado).",
  fetchSettings: () => fetchCanvasEventSettings("boost"),
  saveSettings: (payload) => saveCanvasEventSettings("boost", payload),
};
