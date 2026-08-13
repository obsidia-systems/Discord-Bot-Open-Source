export type WelcomeTextWeight = "normal" | "bold";

/** Capa de texto del canvas de bienvenida. */
export interface WelcomeTextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  weight: WelcomeTextWeight;
}

export interface WelcomeSettingsResponse {
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

export interface SaveWelcomeSettingsRequest {
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

export interface SaveWelcomeSettingsResponse {
  ok: true;
}
