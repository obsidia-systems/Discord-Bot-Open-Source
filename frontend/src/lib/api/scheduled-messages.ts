import type {
  CreateScheduledMessageRequest,
  ScheduledMessageResponse,
  ScheduledMessagesListResponse,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchScheduledMessages(): Promise<ScheduledMessagesListResponse> {
  const response = await fetch(`${API_BASE}/api/scheduled-messages`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Mensajes programados (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessagesListResponse>;
}

export async function createScheduledMessage(
  input: CreateScheduledMessageRequest,
): Promise<ScheduledMessageResponse> {
  const response = await fetch(`${API_BASE}/api/scheduled-messages`, {
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
        `No se pudo crear el mensaje (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function updateScheduledMessage(
  id: number,
  input: UpdateScheduledMessageRequest,
): Promise<ScheduledMessageResponse> {
  const response = await fetch(`${API_BASE}/api/scheduled-messages/${id}`, {
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
        `No se pudo actualizar el mensaje (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function toggleScheduledMessage(
  id: number,
  isActive: boolean,
): Promise<ScheduledMessageResponse> {
  const response = await fetch(
    `${API_BASE}/api/scheduled-messages/${id}/toggle`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive }),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cambiar el estado (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function deleteScheduledMessage(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/scheduled-messages/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo eliminar el mensaje (${response.status})`,
      ),
    );
  }
}
