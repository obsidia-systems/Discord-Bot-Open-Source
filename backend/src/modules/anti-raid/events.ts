import type { Guild, GuildAuditLogsEntry, GuildMember } from "discord.js";
import { logger } from "#core/log.js";
import type { ModuleContext } from "#core/modules/types.js";
import { onAntiNukeAudit } from "./nuke.js";
import { onAntiRaidMemberAdd } from "./raid.js";
import { getAntiRaidSettings } from "./service.js";

function catchRaid(label: string, error: unknown): void {
  logger.warn({ err: error }, `anti-raid: ${label}`);
}

export function registerAntiRaidListeners(ctx: ModuleContext): void {
  ctx.on("guildMemberAdd", (member) => {
    void (async () => {
      const settings = await getAntiRaidSettings(member.guild.id);
      await onAntiRaidMemberAdd(member as GuildMember, settings);
    })().catch((error: unknown) => catchRaid("guildMemberAdd", error));
  });
  ctx.on("guildAuditLogEntryCreate", (entry, guild) => {
    void (async () => {
      const settings = await getAntiRaidSettings(guild.id);
      await onAntiNukeAudit(
        entry as GuildAuditLogsEntry,
        guild as Guild,
        settings,
      );
    })().catch((error: unknown) => catchRaid("audit", error));
  });
}
