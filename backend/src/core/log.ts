import pino from "pino";
import { requestContext } from "./http/requestContext.js";

const isProd = process.env.NODE_ENV === "production";
/** Pretty solo con LOG_PRETTY=1. En Compose (JSON) el transport de pino-pretty rompe el arranque. */
const pretty = !isProd && process.env.LOG_PRETTY === "1";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: { service: "adobos" },
  mixin() {
    return requestContext.getStore() ?? {};
  },
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization"],
    remove: true,
  },
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});
