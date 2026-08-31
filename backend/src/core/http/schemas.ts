import { z } from "zod";
import { SNOWFLAKE_RE } from "./snowflake.js";

export const snowflake = z.string().regex(SNOWFLAKE_RE, "snowflake inválido");
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
