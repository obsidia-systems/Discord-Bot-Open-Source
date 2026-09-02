import type {
  CreateStreamAlertRequest,
  StreamAlert,
  StreamAlertsConfigResponse,
  UpdateStreamAlertRequest,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchStreamAlerts(): Promise<StreamAlertsConfigResponse> {
  const response = await apiFetch(`/api/stream-alerts`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Stream Alerts (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<StreamAlertsConfigResponse>;
}

export async function createStreamAlert(
  input: CreateStreamAlertRequest,
): Promise<StreamAlert> {
  const response = await apiFetch(`/api/stream-alerts`, {
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
        `No se pudo crear la alerta (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { alert: StreamAlert };
  return json.alert;
}

export async function updateStreamAlert(
  id: number,
  input: UpdateStreamAlertRequest,
): Promise<StreamAlert> {
  const response = await apiFetch(`/api/stream-alerts/${id}`, {
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
        `No se pudo guardar la alerta (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { alert: StreamAlert };
  return json.alert;
}

export async function deleteStreamAlert(id: number): Promise<void> {
  const response = await apiFetch(`/api/stream-alerts/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo borrar la alerta (${response.status})`,
      ),
    );
  }
}
