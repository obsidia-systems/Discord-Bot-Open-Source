/** Snowflake de Discord: 17–20 dígitos. */
export const SNOWFLAKE_RE = /^\d{17,20}$/;

export function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && SNOWFLAKE_RE.test(value);
}
