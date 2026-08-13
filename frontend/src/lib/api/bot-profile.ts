import type {
  BotActivityTypeName,
  BotPresenceStatus,
  BotProfileResponse,
  UpdateBotProfileResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchBotProfile(): Promise<BotProfileResponse> {
  const response = await fetch(`${API_BASE}/api/bot/profile`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar el perfil (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<BotProfileResponse>;
}

export interface SaveBotProfileInput {
  username: string;
  status: BotPresenceStatus;
  activityType: BotActivityTypeName;
  activityName: string;
  streamUrl: string;
  state: string;
  clearActivity: boolean;
  avatarFile: File | null;
}

export async function saveBotProfile(
  input: SaveBotProfileInput,
): Promise<UpdateBotProfileResponse> {
  const body = new FormData();
  body.set("username", input.username);
  body.set("status", input.status);
  body.set("activityType", input.activityType);
  body.set("activityName", input.activityName);
  body.set("streamUrl", input.streamUrl);
  body.set("state", input.state);
  body.set("clearActivity", input.clearActivity ? "true" : "false");
  if (input.avatarFile) {
    body.set("avatar", input.avatarFile);
  }

  const response = await fetch(`${API_BASE}/api/bot/profile`, {
    method: "POST",
    body,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al guardar perfil (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<UpdateBotProfileResponse>;
}
