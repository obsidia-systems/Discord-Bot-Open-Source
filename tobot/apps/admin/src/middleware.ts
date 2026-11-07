import { timingSafeEqual } from "node:crypto";
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  const expected = process.env.TOBOT_ADMIN_OPERATOR_TOKEN;
  if (!expected || expected.length < 32) {
    return new Response("Admin access is not configured.", { status: 503 });
  }
  const authorization = context.request.headers.get("authorization") ?? "";
  let supplied = "";
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator > 0 && decoded.slice(0, separator) === "operator") {
        supplied = decoded.slice(separator + 1);
      }
    } catch {
      supplied = "";
    }
  }
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Operator authentication required.", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="Tobot Admin", charset="UTF-8"', "cache-control": "no-store" },
    });
  }
  return next();
});
