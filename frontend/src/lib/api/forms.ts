import type {
  CreateFormRequest,
  FormResponseBody,
  FormResponsesListResponse,
  FormsListResponse,
  PublishFormResponse,
  UpdateFormRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchForms(): Promise<FormsListResponse> {
  const response = await fetch(`${API_BASE}/api/forms`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar Formularios (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormsListResponse>;
}

export async function fetchForm(id: number): Promise<FormResponseBody> {
  const response = await fetch(`${API_BASE}/api/forms/${id}`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo cargar el formulario (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormResponseBody>;
}

export async function createForm(
  input: CreateFormRequest = {},
): Promise<FormResponseBody> {
  const response = await fetch(`${API_BASE}/api/forms`, {
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
        `No se pudo crear el formulario (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormResponseBody>;
}

export async function saveForm(
  id: number,
  input: UpdateFormRequest,
): Promise<FormResponseBody> {
  const response = await fetch(`${API_BASE}/api/forms/${id}`, {
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
        `No se pudo guardar el formulario (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormResponseBody>;
}

export async function deleteForm(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/forms/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudo eliminar el formulario (${response.status})`,
      ),
    );
  }
}

export async function publishForm(
  id: number,
  input: UpdateFormRequest,
): Promise<PublishFormResponse> {
  const response = await fetch(`${API_BASE}/api/forms/${id}/publish`, {
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
  return response.json() as Promise<PublishFormResponse>;
}

export async function fetchFormResponses(
  id: number,
): Promise<FormResponsesListResponse> {
  const response = await fetch(`${API_BASE}/api/forms/${id}/responses`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `No se pudieron cargar las respuestas (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<FormResponsesListResponse>;
}

/** @deprecated */
export async function fetchFormsConfig(): Promise<FormResponseBody> {
  const list = await fetchForms();
  const first = list.forms[0];
  if (!first) {
    const created = await createForm({});
    return created;
  }
  return { form: first };
}

/** @deprecated */
export async function saveFormsConfig(
  input: UpdateFormRequest,
): Promise<FormResponseBody> {
  const list = await fetchForms();
  if (list.forms[0]) return saveForm(list.forms[0].id, input);
  return createForm(input);
}

/** @deprecated */
export async function publishFormsConfig(
  input: UpdateFormRequest,
): Promise<PublishFormResponse> {
  const list = await fetchForms();
  const id = list.forms[0]?.id;
  if (!id) {
    const created = await createForm(input);
    return publishForm(created.form.id, input);
  }
  return publishForm(id, input);
}
