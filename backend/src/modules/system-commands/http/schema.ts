import { z } from "zod";
import { snowflakeList } from "#core/http/schemas.js";

export const updateSystemCommandsSchema = z.object({
  commands: z.array(
    z.object({
      commandName: z.string().min(1).max(32),
      enabled: z.boolean(),
      allowedRoles: snowflakeList,
      ignoredChannels: snowflakeList,
      ephemeral: z.boolean(),
    }),
  ),
});
