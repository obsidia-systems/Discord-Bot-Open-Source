import type { WelcomeTextLayer } from "./welcome.js";

export type CanvasEventType = "leave" | "ban" | "boost";

export const CANVAS_EVENT_TYPES: readonly CanvasEventType[] = [
  "leave",
  "ban",
  "boost",
] as const;

/** Misma forma que la config de bienvenida (canvas PNG). */
export interface CanvasEventSettingsResponse {
  guildId: string;
  channelId: string | null;
  isEnabled: boolean;
  backgroundUrl: string;
  bgFilepath: string | null;
  blurAmount: number;
  messageContent: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  textLayers: WelcomeTextLayer[];
}

export interface SaveCanvasEventSettingsRequest {
  guildId: string;
  channelId?: string | null;
  isEnabled: boolean;
  backgroundUrl?: string;
  bgFilepath?: string | null;
  blurAmount: number;
  messageContent?: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  textLayers: WelcomeTextLayer[];
}

export interface SaveCanvasEventSettingsResponse {
  ok: true;
}
