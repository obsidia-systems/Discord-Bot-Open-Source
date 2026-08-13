import type {
  DiscordAuditLogResponse,
  ModActionRequest,
  ModActionResponse,
  ModActiveBansResponse,
  ModActiveTimeoutsResponse,
  ModChannelInfoResponse,
  ModChannelSearchResponse,
  ModMemberInfoResponse,
  ModMemberSearchResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function searchModMembers(
  q: string,
): Promise<ModMemberSearchResponse> {
  const response = await fetch(
    `${API_BASE}/api/mod/search-member?q=${encodeURIComponent(q)}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Error al buscar miembros (${response.status})`),
    );
  }
  return response.json() as Promise<ModMemberSearchResponse>;
}

export async function searchModChannels(
  q: string,
): Promise<ModChannelSearchResponse> {
  const response = await fetch(
    `${API_BASE}/api/mod/search-channel?q=${encodeURIComponent(q)}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Error al buscar canales (${response.status})`),
    );
  }
  return response.json() as Promise<ModChannelSearchResponse>;
}

export async function fetchModMemberInfo(
  userId: string,
): Promise<ModMemberInfoResponse> {
  const response = await fetch(
    `${API_BASE}/api/mod/member-info/${encodeURIComponent(userId)}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Error al cargar miembro (${response.status})`),
    );
  }
  return response.json() as Promise<ModMemberInfoResponse>;
}

export async function fetchModChannelInfo(
  channelId: string,
): Promise<ModChannelInfoResponse> {
  const response = await fetch(
    `${API_BASE}/api/mod/channel-info/${encodeURIComponent(channelId)}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Error al cargar canal (${response.status})`),
    );
  }
  return response.json() as Promise<ModChannelInfoResponse>;
}

export async function executeModAction(
  payload: ModActionRequest,
): Promise<ModActionResponse> {
  const response = await fetch(`${API_BASE}/api/mod/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  // 206 = sanción aplicada pero DM falló (DMs cerrados).
  if (!response.ok && response.status !== 206) {
    throw new Error(
      await readApiError(response, `Acción fallida (${response.status})`),
    );
  }
  return response.json() as Promise<ModActionResponse>;
}

export async function fetchDiscordAuditLog(
  options: {
    limit?: number;
    userId?: string;
    actionType?: number;
  } = {},
): Promise<DiscordAuditLogResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 100));
  if (options.userId) params.set("userId", options.userId);
  if (options.actionType != null) {
    params.set("actionType", String(options.actionType));
  }

  const response = await fetch(
    `${API_BASE}/api/mod/discord-audit?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    const error = new Error(
      await readApiError(
        response,
        `Error al cargar auditoría (${response.status})`,
      ),
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<DiscordAuditLogResponse>;
}

export async function fetchActiveBans(): Promise<ModActiveBansResponse> {
  const response = await fetch(`${API_BASE}/api/mod/active/bans`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al cargar baneos (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ModActiveBansResponse>;
}

export async function fetchActiveTimeouts(): Promise<ModActiveTimeoutsResponse> {
  const response = await fetch(`${API_BASE}/api/mod/active/timeouts`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al cargar timeouts (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ModActiveTimeoutsResponse>;
}
