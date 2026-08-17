import type {
  FormsConfigResponse,
  PublishFormsResponse,
  UpdateFormsConfigRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchFormsConfig(): Promise<FormsConfigResponse> {
  const response = await fetch(`${API_BASE}/api/forms/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Formularios (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormsConfigResponse>;
}

export async function saveFormsConfig(
  input: UpdateFormsConfigRequest,
): Promise<FormsConfigResponse> {
  const response = await fetch(`${API_BASE}/api/forms/config`, {
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
        `No se pudo guardar Formularios (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormsConfigResponse>;
}

export async function publishFormsConfig(
  input: UpdateFormsConfigRequest,
): Promise<PublishFormsResponse> {
  const response = await fetch(`${API_BASE}/api/forms/publish`, {
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
        `No se pudo publicar el formulario (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<PublishFormsResponse>;
}
