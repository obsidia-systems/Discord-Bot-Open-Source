import type {
  SystemCommandConfig,
  SystemCommandsListResponse,
  SystemCommandsUpdateResponse,
  UpdateSystemCommandsRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchSystemCommands(): Promise<SystemCommandConfig[]> {
  const response = await apiFetch(`/api/system-commands`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't load the commands."),
    );
  }
  const body = (await response.json()) as SystemCommandsListResponse;
  return body.commands ?? [];
}

export async function saveSystemCommands(
  commands: UpdateSystemCommandsRequest["commands"],
): Promise<SystemCommandConfig[]> {
  const response = await apiFetch(`/api/system-commands`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands } satisfies UpdateSystemCommandsRequest),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "Couldn't save the changes."),
    );
  }
  const body = (await response.json()) as SystemCommandsUpdateResponse;
  return body.commands ?? [];
}
