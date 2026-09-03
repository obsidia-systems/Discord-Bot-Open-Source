import type {
  UploadBackgroundResponse,
  UploadImageResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function uploadBackgroundFile(
  file: File,
): Promise<UploadBackgroundResponse> {
  const body = new FormData();
  body.append("file", file);

  const response = await apiFetch(`/api/uploads/background`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't upload image (${response.status})`,
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

  const response = await apiFetch(`/api/uploads/image`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't upload image (${response.status})`,
      ),
    );
  }

  return response.json() as Promise<UploadImageResponse>;
}
