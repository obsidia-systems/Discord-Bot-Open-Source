import type {
  CreateGuildRoleRequest,
  CreateGuildRoleResponse,
  DeleteGuildRoleResponse,
  RolesBuilderListResponse,
  UpdateGuildRoleRequest,
  UpdateGuildRoleResponse,
  UpdateRolePositionsRequest,
  UpdateRolePositionsResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchRolesBuilderList(): Promise<RolesBuilderListResponse> {
  const response = await apiFetch("/api/roles/list", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load the role list."),
    );
  }
  return response.json() as Promise<RolesBuilderListResponse>;
}

export async function createGuildRole(
  input: CreateGuildRoleRequest,
): Promise<CreateGuildRoleResponse> {
  const response = await apiFetch("/api/roles/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't create the role in Discord."),
    );
  }
  return response.json() as Promise<CreateGuildRoleResponse>;
}

export async function updateGuildRole(
  roleId: string,
  input: UpdateGuildRoleRequest,
): Promise<UpdateGuildRoleResponse> {
  const response = await apiFetch(`/api/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't update the role."),
    );
  }
  return response.json() as Promise<UpdateGuildRoleResponse>;
}

export async function deleteGuildRole(
  roleId: string,
): Promise<DeleteGuildRoleResponse> {
  const response = await apiFetch(`/api/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't delete the role."),
    );
  }
  return response.json() as Promise<DeleteGuildRoleResponse>;
}

export async function updateRolePositions(
  input: UpdateRolePositionsRequest,
): Promise<UpdateRolePositionsResponse> {
  const response = await apiFetch("/api/roles/positions", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        "Couldn't save the new hierarchy.",
      ),
    );
  }
  return response.json() as Promise<UpdateRolePositionsResponse>;
}
