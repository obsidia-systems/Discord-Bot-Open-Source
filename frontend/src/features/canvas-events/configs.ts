import {
  fetchCanvasEventSettings,
  saveCanvasEventSettings,
} from "@/lib/api";
import type { CanvasEventBuilderConfig } from "./CanvasEventBuilder";

export const leaveBuilderConfig: CanvasEventBuilderConfig = {
  cardTitle: "Leave card design",
  cardDescription:
    "1920×1080 PNG card when someone leaves the server.",
  defaultMessage: "{user} left the server. We are now {membercount}.",
  defaultPrimaryText: "See you soon!",
  defaultSecondaryText: "{username}",
  loadingLabel: "leave settings",
  saveLabel: "Save leave card",
  savedActiveMessage: "Leave card saved and active.",
  savedInactiveMessage: "Configuration saved (module disabled).",
  fetchSettings: () => fetchCanvasEventSettings("leave"),
  saveSettings: (payload) => saveCanvasEventSettings("leave", payload),
};

export const banBuilderConfig: CanvasEventBuilderConfig = {
  cardTitle: "Ban card design",
  cardDescription:
    "1920×1080 PNG card when someone is banned from the server.",
  defaultMessage: "{user} was banned from the server.",
  defaultPrimaryText: "User banned",
  defaultSecondaryText: "{username}",
  loadingLabel: "ban settings",
  saveLabel: "Save ban card",
  savedActiveMessage: "Ban card saved and active.",
  savedInactiveMessage: "Configuration saved (module disabled).",
  fetchSettings: () => fetchCanvasEventSettings("ban"),
  saveSettings: (payload) => saveCanvasEventSettings("ban", payload),
};

export const boostBuilderConfig: CanvasEventBuilderConfig = {
  cardTitle: "Boost card design",
  cardDescription:
    "1920×1080 PNG card when someone boosts the server.",
  defaultMessage: "{user} boosted the server. Thank you!",
  defaultPrimaryText: "Thanks for the boost!",
  defaultSecondaryText: "{username}",
  loadingLabel: "boost settings",
  saveLabel: "Save boost card",
  savedActiveMessage: "Boost card saved and active.",
  savedInactiveMessage: "Configuration saved (module disabled).",
  fetchSettings: () => fetchCanvasEventSettings("boost"),
  saveSettings: (payload) => saveCanvasEventSettings("boost", payload),
};
