import type {
  CreateGuildRoleRequest,
  CreateGuildRoleResponse,
  RolesBuilderListResponse,
  UpdateRolePositionsRequest,
  UpdateRolePositionsResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchRolesBuilderList(
  guildId?: string,
): Promise<RolesBuilderListResponse> {
  const qs = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(`${API_BASE}/api/roles/list${qs}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo cargar la lista de roles."),
    );
  }
  return response.json() as Promise<RolesBuilderListResponse>;
}

export async function createGuildRole(
  input: CreateGuildRoleRequest,
  guildId?: string,
): Promise<CreateGuildRoleResponse> {
  const qs = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(`${API_BASE}/api/roles/create${qs}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo crear el rol en Discord."),
    );
  }
  return response.json() as Promise<CreateGuildRoleResponse>;
}

export async function updateRolePositions(
  input: UpdateRolePositionsRequest,
  guildId?: string,
): Promise<UpdateRolePositionsResponse> {
  const qs = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(`${API_BASE}/api/roles/positions${qs}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "No se pudo guardar la nueva jerarquía.",
      ),
    );
  }
  return response.json() as Promise<UpdateRolePositionsResponse>;
}
