import type {
  CloseTicketRequest,
  CreateTicketPanelRequest,
  PublishTicketPanelResponse,
  TicketDetailResponse,
  TicketListResponse,
  TicketPanelsResponse,
  TicketSettingsResponse,
  TicketStatus,
  TicketSummary,
  TicketUserRequest,
  UpdateTicketPanelRequest,
  UpdateTicketSettingsRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchTicketSettings(): Promise<TicketSettingsResponse> {
  const response = await apiFetch(`/api/tickets/settings`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load the Ticket settings (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<TicketSettingsResponse>;
}

export async function saveTicketSettings(
  input: UpdateTicketSettingsRequest,
): Promise<TicketSettingsResponse> {
  const response = await apiFetch(`/api/tickets/settings`, {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save the settings (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<TicketSettingsResponse>;
}

export async function fetchTicketPanels(): Promise<TicketPanelsResponse> {
  const response = await apiFetch(`/api/tickets/panels`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load the panels (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<TicketPanelsResponse>;
}

export async function createTicketPanel(
  input: CreateTicketPanelRequest = {},
): Promise<{ panel: TicketPanelsResponse["panels"][number] }> {
  const response = await apiFetch(`/api/tickets/panels`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't create the panel (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{
    panel: TicketPanelsResponse["panels"][number];
  }>;
}

export async function saveTicketPanel(
  id: number,
  input: UpdateTicketPanelRequest,
): Promise<{ panel: TicketPanelsResponse["panels"][number] }> {
  const response = await apiFetch(`/api/tickets/panels/${id}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save the panel (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{
    panel: TicketPanelsResponse["panels"][number];
  }>;
}

export async function deleteTicketPanel(id: number): Promise<void> {
  const response = await apiFetch(`/api/tickets/panels/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't delete the panel (${response.status})`,
      ),
    );
  }
}

export async function publishTicketPanel(
  id: number,
  input: UpdateTicketPanelRequest = {},
): Promise<PublishTicketPanelResponse> {
  const response = await apiFetch(`/api/tickets/panels/${id}/publish`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't publish the panel (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<PublishTicketPanelResponse>;
}

export async function fetchTickets(filters: {
  status?: TicketStatus | "";
  typeKey?: string;
  openerId?: string;
  claimedBy?: string;
} = {}): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.typeKey?.trim()) params.set("typeKey", filters.typeKey.trim());
  if (filters.openerId?.trim()) params.set("openerId", filters.openerId.trim());
  if (filters.claimedBy?.trim()) params.set("claimedBy", filters.claimedBy.trim());
  const qs = params.toString();
  const response = await apiFetch(`/api/tickets${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load the inbox (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<TicketListResponse>;
}

export async function fetchTicketDetail(
  id: number,
): Promise<TicketDetailResponse> {
  const response = await apiFetch(`/api/tickets/${id}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load the ticket (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<TicketDetailResponse>;
}

async function ticketAction(
  id: number,
  path: string,
  body?: unknown,
): Promise<TicketSummary> {
  const response = await apiFetch(`/api/tickets/${id}${path}`, {
    method: body === undefined && path.startsWith("/participants/")
      ? "DELETE"
      : "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body !== undefined
      ? { body: JSON.stringify(body) }
      : path.startsWith("/participants/")
        ? {}
        : { body: "{}" }),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, `Couldn't complete the action (${response.status})`),
    );
  }
  const json = (await response.json()) as { ticket: TicketSummary };
  return json.ticket;
}

export function claimTicket(id: number): Promise<TicketSummary> {
  return ticketAction(id, "/claim");
}

export function unclaimTicket(id: number): Promise<TicketSummary> {
  return ticketAction(id, "/unclaim");
}

export function waitTicket(id: number): Promise<TicketSummary> {
  return ticketAction(id, "/wait");
}

export function unwaitTicket(id: number): Promise<TicketSummary> {
  return ticketAction(id, "/unwait");
}

export function closeTicket(
  id: number,
  input: CloseTicketRequest,
): Promise<TicketSummary> {
  return ticketAction(id, "/close", input);
}

export function reopenTicket(id: number): Promise<TicketSummary> {
  return ticketAction(id, "/reopen");
}

export function addTicketUser(
  id: number,
  input: TicketUserRequest,
): Promise<TicketSummary> {
  return ticketAction(id, "/participants", input);
}

export async function removeTicketUser(
  id: number,
  userId: string,
): Promise<TicketSummary> {
  const response = await apiFetch(`/api/tickets/${id}/participants/${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't remove the user (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { ticket: TicketSummary };
  return json.ticket;
}
