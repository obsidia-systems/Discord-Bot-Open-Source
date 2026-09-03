import type {
  CreateCustomCommandRequest,
  CustomCommandResponse,
  CustomCommandsListResponse,
  UpdateCustomCommandRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchCustomCommands(): Promise<CustomCommandsListResponse> {
  const response = await apiFetch(`/api/custom-commands`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load the commands (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<CustomCommandsListResponse>;
}

export async function createCustomCommand(
  input: CreateCustomCommandRequest,
): Promise<CustomCommandResponse> {
  const response = await apiFetch(`/api/custom-commands`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't create the command (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<CustomCommandResponse>;
}

export async function updateCustomCommand(
  id: number,
  input: UpdateCustomCommandRequest,
): Promise<CustomCommandResponse> {
  const response = await apiFetch(`/api/custom-commands/${id}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't update the command (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<CustomCommandResponse>;
}

export async function toggleCustomCommand(
  id: number,
  isActive: boolean,
): Promise<CustomCommandResponse> {
  const response = await apiFetch(`/api/custom-commands/${id}/toggle`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isActive }),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't change the status (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<CustomCommandResponse>;
}

export async function syncCustomCommands(): Promise<{ ok: boolean; count: number }> {
  const response = await apiFetch(`/api/custom-commands/sync`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't sync with Discord (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{ ok: boolean; count: number }>;
}

export async function deleteCustomCommand(id: number): Promise<void> {
  const response = await apiFetch(`/api/custom-commands/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't delete the command (${response.status})`,
      ),
    );
  }
}
