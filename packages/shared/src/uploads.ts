export interface UploadBackgroundResponse {
  ok: true;
  path: string;
  filename: string;
  size: number;
  mimeType: string;
}

/** POST /api/uploads/image — genérico (embeds, iconos, etc.) */
export type UploadImageResponse = UploadBackgroundResponse;
