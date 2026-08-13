import type {
  CreateAutoRoleRequest,
  CreateAutoRoleResponse,
  GetAutoJoinRolesResponse,
  SaveAutoJoinRolesRequest,
  SaveAutoJoinRolesResponse,
  SaveReactionRolesRequest,
  SaveReactionRolesResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function saveReactionRoles(
  payload: SaveReactionRolesRequest,
): Promise<SaveReactionRolesResponse> {
  const response = await fetch(`${API_BASE}/api/autoroles/reactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al guardar reaction roles (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<SaveReactionRolesResponse>;
}

/** @deprecated Prefer `saveInteractiveRoles` → `/api/roles/interactive`. */
export async function createAutoRole(
  payload: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  return saveInteractiveRoles(payload);
}

export async function saveInteractiveRoles(
  payload: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  const response = await fetch(`${API_BASE}/api/roles/interactive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al crear menú interactivo (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<CreateAutoRoleResponse>;
}

export async function fetchAutoJoinRoles(
  guildId?: string,
): Promise<GetAutoJoinRolesResponse> {
  const qs = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(`${API_BASE}/api/roles/auto${qs}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al cargar auto-roles (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<GetAutoJoinRolesResponse>;
}

export async function saveAutoJoinRoles(
  payload: SaveAutoJoinRolesRequest,
): Promise<SaveAutoJoinRolesResponse> {
  const response = await fetch(`${API_BASE}/api/roles/auto`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al guardar auto-roles (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<SaveAutoJoinRolesResponse>;
}
