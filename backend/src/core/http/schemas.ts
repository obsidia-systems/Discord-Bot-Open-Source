import { z } from "zod";
import { SNOWFLAKE_RE } from "./snowflake.js";

export const snowflake = z.string().regex(SNOWFLAKE_RE, "invalid snowflake");
export const snowflakeOpt = snowflake.optional();
export const snowflakeNull = z.union([snowflake, z.null()]).optional();
export const snowflakeList = z.array(snowflake);

export const recordId = z.coerce.number().int().positive();
export const stringId = z.string().min(1);

/** preprocess de zod infiere output `unknown`; este wrapper conserva T. */
export function pre<T>(
  fn: (value: unknown) => unknown,
  schema: z.ZodType<T>,
): z.ZodType<T> {
  return z.preprocess(fn, schema) as z.ZodType<T>;
}

export const boolish: z.ZodType<boolean> = pre((value) => {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}, z.boolean());

export const hexColor = z.string().max(32);
export const nonNegInt = z.number().int().min(0);
export const posInt = z.number().int().positive();
export const finiteNum = z.number().finite();

export const weekday = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export function parseJsonish(value: unknown): unknown {
  if (value === "" || value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

export const embedFieldSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: boolish.optional(),
});

const embedButtonSchema = z.object({
  label: z.string().min(1).max(80),
  style: z
    .enum(["Primary", "Secondary", "Success", "Danger", "Link"])
    .default("Link"),
  customId: z.string().optional(),
  url: z.string().optional(),
  disabled: z.boolean().optional(),
  emoji: z.string().optional(),
});

const embedActionRowSchema = z.object({
  buttons: z.array(embedButtonSchema).min(1).max(5),
});

export const embedPayloadSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  authorName: z.string().optional(),
  authorIconUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  footerText: z.string().optional(),
  footerIconUrl: z.string().optional(),
  timestamp: boolish.optional(),
  fields: pre(parseJsonish, z.array(embedFieldSchema).max(25).optional()),
  components: pre(
    parseJsonish,
    z.array(embedActionRowSchema).max(5).optional(),
  ),
});

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().max(100).optional(),
});

export function emptyToUndef(value: unknown): unknown {
  if (value === "" || value === null) return undefined;
  return value;
}
