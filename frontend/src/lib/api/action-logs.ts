import type {
  ActionLogsConfigResponse,
  ActionLogsHistoryQuery,
  ActionLogsHistoryResponse,
  ActionLogsTestResponse,
  UpdateActionLogsConfigRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchActionLogsConfig(): Promise<ActionLogsConfigResponse> {
  const response = await fetch(`${API_BASE}/api/logs/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar la configuración (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ActionLogsConfigResponse>;
}

export async function saveActionLogsConfig(
  input: UpdateActionLogsConfigRequest,
): Promise<ActionLogsConfigResponse> {
  const response = await fetch(`${API_BASE}/api/logs/config`, {
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
        `No se pudo guardar la configuración (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ActionLogsConfigResponse>;
}

export async function fetchActionLogsHistory(
  query: ActionLogsHistoryQuery = {},
): Promise<ActionLogsHistoryResponse> {
  const params = new URLSearchParams();
  if (query.category && query.category !== "all") {
    params.set("category", query.category);
  }
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));

  const qs = params.toString();
  const response = await fetch(
    `${API_BASE}/api/logs/history${qs ? `?${qs}` : ""}`,
  );
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar el historial (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ActionLogsHistoryResponse>;
}

export async function sendActionLogsTest(): Promise<ActionLogsTestResponse> {
  const response = await fetch(`${API_BASE}/api/logs/test`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo enviar el embed de prueba (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<ActionLogsTestResponse>;
}
