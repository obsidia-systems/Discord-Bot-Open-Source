import type {
  CreateAutoRoleRequest,
  CreateAutoRoleResponse,
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

export async function createAutoRole(
  payload: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  const response = await fetch(`${API_BASE}/api/autoroles/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al crear autorol (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<CreateAutoRoleResponse>;
}
