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
    error instanceof Error && /PNG|JPG|WEBP|GIF|Avatar:/i.test(error.message)
  );
}

function isStripeInvalidRequest(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const extra = error as Error & { type?: unknown; rawType?: unknown };
  return (
    error.name === "StripeInvalidRequestError" ||
    extra.type === "StripeInvalidRequestError" ||
    extra.rawType === "invalid_request_error"
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
        error: "The file exceeds the size limit.",
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

  if (isStripeInvalidRequest(error)) {
    const mentionsProd = /prod_/i.test(error.message);
    const missingPrice = /No such price/i.test(error.message);
    const missingCustomer = /No such customer/i.test(error.message);
    let message =
      "Stripe rejected the request. Check prices, Customer Portal or the test keys.";
    if (mentionsProd) {
      message =
        "That id is a Stripe product (prod_…), not a price (price_…). Copy the Price ID into STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS.";
    } else if (missingPrice) {
      message =
        "Stripe doesn't recognize that price id. It must be the same mode (Test) and the same account as STRIPE_SECRET_KEY.";
    } else if (missingCustomer) {
      message =
        "The Stripe customer belongs to another account. Try the checkout again.";
    }
    return {
      status: 400,
      body: {
        error: message,
        code: "STRIPE_INVALID_REQUEST",
      },
      log: !mentionsProd && !missingPrice && !missingCustomer,
    };
  }

  if (
    error instanceof SyntaxError &&
    "body" in error &&
    typeof (error as { status?: number }).status === "number"
  ) {
    return {
      status: 400,
      body: { error: "Invalid JSON.", code: "INVALID_JSON" },
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
    body: { error: "Internal error.", code: "INTERNAL_ERROR" },
    log: true,
  };
}
