import type { ZodError, ZodType } from "zod";

export class ValidationError extends Error {
  readonly status = 400;
  readonly code = "INVALID_BODY";
  readonly issues: Array<{ path: Array<string | number>; message: string }>;

  constructor(error: ZodError) {
    super("Datos inválidos.");
    this.name = "ValidationError";
    this.issues = error.issues.map((issue) => ({
      path: issue.path.map((part) =>
        typeof part === "symbol" ? String(part) : part,
      ),
      message: issue.message,
    }));
  }
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}

/** Express query: string | string[] | undefined → primer valor. */
export function flattenQuery(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

export function parseQuery<T>(
  schema: ZodType<T>,
  query: Record<string, unknown>,
): T {
  return parse(schema, flattenQuery(query));
}

export function sendIfValidationError(
  error: unknown,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): boolean {
  if (!(error instanceof ValidationError)) return false;
  res.status(error.status).json({
    error: error.message,
    code: error.code,
    issues: error.issues,
  });
  return true;
}
