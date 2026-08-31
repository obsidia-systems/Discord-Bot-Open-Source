import type { ApiErrorBody } from "@adobos/shared";
import { ValidationError } from "./validate.js";

/** Error HTTP con status/code. Los errores de módulo ya exponen el mismo shape. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface AppHttpError extends Error {
  status: number;
  code: string;
  issues?: ApiErrorBody["issues"];
}

export function isAppHttpError(error: unknown): error is AppHttpError {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { status?: unknown; code?: unknown };
  return (
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status < 600 &&
    typeof candidate.code === "string"
  );
}

function isMulterLimit(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "LIMIT_FILE_SIZE"
  );
}

function isInvalidUpload(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /solo PNG|máx\.|Avatar:|WEBP|GIF|JPG/i.test(error.message)
  );
}

export interface MappedHttpError {
  status: number;
  body: ApiErrorBody & {
    feature?: string;
    limit?: string;
    tier?: string;
  };
  log: boolean;
}

/** Clasifica cualquier throw del borde HTTP. */
export function mapHttpError(error: unknown): MappedHttpError {
  if (error instanceof ValidationError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        issues: error.issues,
      },
      log: false,
    };
  }

  if (
    error instanceof Error &&
    error.name === "EntitlementError" &&
    isAppHttpError(error)
  ) {
    const extra = error as AppHttpError & {
      feature?: string;
      limit?: string;
    };
    return {
      status: extra.status,
      body: {
        error: extra.message,
        code: extra.code,
        feature: extra.feature,
        limit: extra.limit,
      },
      log: false,
    };
  }

  if (isMulterLimit(error)) {
    return {
      status: 400,
      body: {
        error: "El archivo supera el límite de tamaño.",
        code: "FILE_TOO_LARGE",
      },
      log: false,
    };
  }

  if (isInvalidUpload(error)) {
    return {
      status: 400,
      body: { error: error.message, code: "INVALID_FILE" },
      log: false,
    };
  }

  if (
    error instanceof SyntaxError &&
    "body" in error &&
    typeof (error as { status?: number }).status === "number"
  ) {
    return {
      status: 400,
      body: { error: "JSON inválido.", code: "INVALID_JSON" },
      log: false,
    };
  }

  if (isAppHttpError(error)) {
    const clientError = error.status < 500;
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
      log: !clientError,
    };
  }

  return {
    status: 500,
    body: { error: "Error interno.", code: "INTERNAL_ERROR" },
    log: true,
  };
}
