import type {
  AutoReply,
  AutoRepliesConfigResponse,
  CreateAutoReplyRequest,
  UpdateAutoReplyRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchAutoReplies(): Promise<AutoRepliesConfigResponse> {
  const response = await apiFetch(`/api/auto-replies`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load Auto-Replies (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<AutoRepliesConfigResponse>;
}

export async function createAutoReply(
  input: CreateAutoReplyRequest,
): Promise<AutoReply> {
  const response = await apiFetch(`/api/auto-replies`, {
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
        `Couldn't create the Auto-Reply (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { reply: AutoReply };
  return json.reply;
}

export async function updateAutoReply(
  id: number,
  input: UpdateAutoReplyRequest,
): Promise<AutoReply> {
  const response = await apiFetch(`/api/auto-replies/${id}`, {
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
        `Couldn't save the Auto-Reply (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { reply: AutoReply };
  return json.reply;
}

export async function deleteAutoReply(id: number): Promise<void> {
  const response = await apiFetch(`/api/auto-replies/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't delete the Auto-Reply (${response.status})`,
      ),
    );
  }
}
