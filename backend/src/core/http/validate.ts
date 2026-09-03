import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodError, ZodType } from "zod";

export class ValidationError extends Error {
  readonly status = 400;
  readonly code = "INVALID_BODY";
  readonly issues: Array<{ path: Array<string | number>; message: string }>;

  constructor(error: ZodError) {
    super("Invalid data.");
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

interface RouteSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

type Parsed<S extends ZodType | undefined> = S extends ZodType
  ? ReturnType<S["parse"]>
  : undefined;

export interface ValidatedInput<S extends RouteSchemas> {
  body: Parsed<S["body"]>;
  query: Parsed<S["query"]>;
  params: Parsed<S["params"]>;
}

/**
 * Handler de ruta con validación de entrada obligatoria y `try/catch → next`
 * incorporado. Los schemas se parsean **antes** de entrar al handler; un fallo
 * lanza `ValidationError` (→ 400 con `issues` en `errorHandler`). El 4º argumento
 * `valid` llega tipado desde los schemas — sin casts en el call site.
 *
 * ```ts
 * router.post("/", defineRoute({ body: createSchema }, async (req, res, valid) => {
 *   res.status(201).json(await createThing(valid.body, guildIdOf(req)));
 * }));
 * ```
 */
export function defineRoute<S extends RouteSchemas>(
  schemas: S,
  handler: (
    req: Request,
    res: Response,
    valid: ValidatedInput<S>,
    next: NextFunction,
  ) => unknown | Promise<unknown>,
): RequestHandler {
  // Handler async: en Express 5 el `ValidationError` síncrono de `parse()` y
  // cualquier promesa rechazada del handler llegan solos al errorHandler.
  // No se reescribe `req.body/query/params`: la fuente de verdad es `valid`
  // (tipado y coaccionado). Mutar `req.body` borraría el `guildId` que canoniza
  // `requireGuildAccess` cuando el schema no lo incluye, y `req.query` es getter
  // de solo lectura en Express 5.
  return async (req, res, next) => {
    const valid: ValidatedInput<S> = {
      body: (schemas.body
        ? parse(schemas.body, req.body ?? {})
        : undefined) as ValidatedInput<S>["body"],
      query: (schemas.query
        ? parseQuery(schemas.query, req.query as Record<string, unknown>)
        : undefined) as ValidatedInput<S>["query"],
      params: (schemas.params
        ? parse(schemas.params, req.params)
        : undefined) as ValidatedInput<S>["params"],
    };
    await handler(req, res, valid, next);
  };
}
