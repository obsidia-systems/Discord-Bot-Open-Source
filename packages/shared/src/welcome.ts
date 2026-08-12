export interface WelcomeSettingsResponse {
  guildId: string;
  channelId: string | null;
  isEnabled: boolean;
  backgroundUrl: string;
  bgFilepath: string | null;
  blurAmount: number;
  primaryText: string;
  secondaryText: string;
  messageContent: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  textX: number;
  textY: number;
  fontSize: number;
  textColor: string;
}

export interface SaveWelcomeSettingsRequest {
  guildId: string;
  channelId: string;
  isEnabled: boolean;
  backgroundUrl?: string;
  bgFilepath?: string | null;
  blurAmount: number;
  primaryText: string;
  secondaryText: string;
  messageContent?: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  textX: number;
  textY: number;
  fontSize: number;
  textColor: string;
}

export interface SaveWelcomeSettingsResponse {
  ok: true;
}
