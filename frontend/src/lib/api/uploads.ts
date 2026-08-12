import type {
  UploadBackgroundResponse,
  UploadImageResponse,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function uploadBackgroundFile(
  file: File,
): Promise<UploadBackgroundResponse> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE}/api/uploads/background`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al subir imagen (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<UploadBackgroundResponse>;
}

export async function uploadImageFile(
  file: File,
): Promise<UploadImageResponse> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE}/api/uploads/image`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Error al subir imagen (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<UploadImageResponse>;
}
