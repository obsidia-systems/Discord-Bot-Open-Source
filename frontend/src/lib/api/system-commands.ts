import type {
  SystemCommandConfig,
  SystemCommandsListResponse,
  SystemCommandsUpdateResponse,
  UpdateSystemCommandsRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchSystemCommands(): Promise<SystemCommandConfig[]> {
  const response = await fetch(`${API_BASE}/api/system-commands`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudieron cargar los comandos."),
    );
  }
  const body = (await response.json()) as SystemCommandsListResponse;
  return body.commands ?? [];
}

export async function saveSystemCommands(
  commands: UpdateSystemCommandsRequest["commands"],
): Promise<SystemCommandConfig[]> {
  const response = await fetch(`${API_BASE}/api/system-commands`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands } satisfies UpdateSystemCommandsRequest),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudieron guardar los cambios."),
    );
  }
  const body = (await response.json()) as SystemCommandsUpdateResponse;
  return body.commands ?? [];
}
