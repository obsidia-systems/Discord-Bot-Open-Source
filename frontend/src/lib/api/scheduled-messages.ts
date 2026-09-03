import type {
  CreateScheduledMessageRequest,
  ScheduledMessageResponse,
  ScheduledMessagesListResponse,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchScheduledMessages(): Promise<ScheduledMessagesListResponse> {
  const response = await apiFetch(`/api/scheduled-messages`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load Scheduled Messages (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessagesListResponse>;
}

export async function createScheduledMessage(
  input: CreateScheduledMessageRequest,
): Promise<ScheduledMessageResponse> {
  const response = await apiFetch(`/api/scheduled-messages`, {
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
        `Couldn't create the message (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function updateScheduledMessage(
  id: number,
  input: UpdateScheduledMessageRequest,
): Promise<ScheduledMessageResponse> {
  const response = await apiFetch(`/api/scheduled-messages/${id}`, {
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
        `Couldn't update the message (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function toggleScheduledMessage(
  id: number,
  isActive: boolean,
): Promise<ScheduledMessageResponse> {
  const response = await apiFetch(
    `/api/scheduled-messages/${id}/toggle`,
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
        `Couldn't change the status (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function sendScheduledMessageNow(
  id: number,
): Promise<ScheduledMessageResponse> {
  const response = await apiFetch(`/api/scheduled-messages/${id}/send-now`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't send now (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ScheduledMessageResponse>;
}

export async function deleteScheduledMessage(id: number): Promise<void> {
  const response = await apiFetch(`/api/scheduled-messages/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't delete the message (${response.status})`,
      ),
    );
  }
}
