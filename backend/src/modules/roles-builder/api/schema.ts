import { z } from "zod";
import { ROLE_PERMISSION_KEY_SET } from "@adobos/shared";
import { snowflake } from "../../../core/http/schemas.js";

const permissionKeySchema = z
  .string()
  .refine((key) => ROLE_PERMISSION_KEY_SET.has(key), {
    message: "permiso no permitido",
  });

export const createGuildRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().nullable().optional(),
  permissions: z.array(permissionKeySchema).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
});

export const updateGuildRoleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().nullable().optional(),
    permissions: z.array(permissionKeySchema).optional(),
    hoist: z.boolean().optional(),
    mentionable: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.permissions !== undefined ||
      value.hoist !== undefined ||
      value.mentionable !== undefined,
    { message: "Nada que actualizar." },
  );

export const updateRolePositionsSchema = z.object({
  positions: z.array(
    z.object({
      roleId: snowflake,
      position: z.number().int(),
    }),
  ),
});
