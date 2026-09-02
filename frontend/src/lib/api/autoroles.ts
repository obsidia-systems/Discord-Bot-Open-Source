import type {
  CreateAutoroleCompactRequest,
  CreateAutoRoleRequest,
  CreateAutoRoleResponse,
  DeleteAutoroleResponse,
  GetAutoJoinRolesResponse,
  ListActiveAutorolesResponse,
  SaveAutoJoinRolesRequest,
  SaveAutoJoinRolesResponse,
  SaveReactionRolesRequest,
  SaveReactionRolesResponse,
  UpdateAutoroleContentRequest,
  UpdateAutoroleContentResponse,
  UpdateAutoroleMappingRequest,
  UpdateAutoroleMappingResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function saveReactionRoles(
  payload: SaveReactionRolesRequest,
): Promise<SaveReactionRolesResponse> {
  const response = await apiFetch(`/api/autoroles/reactions`, {
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

export async function fetchActiveAutoroles(): Promise<ListActiveAutorolesResponse> {
  const response = await apiFetch(`/api/autoroles/active`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al listar autoroles (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ListActiveAutorolesResponse>;
}

export async function createAutoroleCompact(
  payload: CreateAutoroleCompactRequest,
): Promise<CreateAutoRoleResponse> {
  const response = await apiFetch(`/api/autoroles/create`, {
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

/** @deprecated Prefer `createAutoroleCompact`. */
export async function createAutoRole(
  payload: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  return saveInteractiveRoles(payload);
}

export async function saveInteractiveRoles(
  payload: CreateAutoRoleRequest,
): Promise<CreateAutoRoleResponse> {
  const response = await apiFetch(`/api/roles/interactive`, {
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

export async function updateAutoroleMapping(
  id: number,
  payload: UpdateAutoroleMappingRequest,
): Promise<UpdateAutoroleMappingResponse> {
  const response = await apiFetch(
    `/api/autoroles/update-mapping/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al actualizar mappings (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<UpdateAutoroleMappingResponse>;
}

export async function updateAutoroleContent(
  id: number,
  payload: UpdateAutoroleContentRequest,
): Promise<UpdateAutoroleContentResponse> {
  const response = await apiFetch(
    `/api/autoroles/edit-content/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al editar contenido (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<UpdateAutoroleContentResponse>;
}

export async function deleteAutorole(
  id: number,
): Promise<DeleteAutoroleResponse> {
  const response = await apiFetch(`/api/autoroles/delete/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al eliminar autorol (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<DeleteAutoroleResponse>;
}

export async function fetchAutoJoinRoles(): Promise<GetAutoJoinRolesResponse> {
  const response = await apiFetch(`/api/roles/auto`, {
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
  const response = await apiFetch(`/api/roles/auto`, {
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
