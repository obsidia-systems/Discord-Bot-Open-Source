import pino from "pino";

const isProd = process.env.NODE_ENV === "production";
const pretty = !isProd && process.stdout.isTTY;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: { service: "adobos" },
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
