import type { GuildMember } from "discord.js";
import {
  accountAgeTooNew,
  decideNewMemberAction,
  isAntiRaidImmune,
  recordAndCount,
  type AntiRaidSettings,
  type NewMemberVerdict,
} from "@adobos/shared";
import { applyGuildLockdown } from "./lockdown.js";
import { resolveAlertChannel, sendAntiRaidAlert } from "./alerts.js";

const joinWindows = new Map<string, number[]>();

function timeoutMs(settings: AntiRaidSettings): number {
  return settings.timeoutSeconds * 1000;
}

async function applyVerdict(
  member: GuildMember,
  verdict: NewMemberVerdict,
  settings: AntiRaidSettings,
  reason: string,
): Promise<void> {
  if (verdict === "allow") return;
  if (verdict === "lockdown") {
    if (!settings.lockdownActive) {
      await applyGuildLockdown(member.guild, member.client.user?.id ?? null);
    }
    if (member.kickable) {
      await member.kick(reason).catch(() => undefined);
    }
    return;
  }
  if (verdict === "kick" && member.kickable) {
    await member.kick(reason).catch(() => undefined);
    return;
  }
  if (verdict === "ban" && member.bannable) {
    await member.ban({ reason, deleteMessageSeconds: 0 }).catch(() => undefined);
    return;
  }
  if (verdict === "timeout" && member.moderatable) {
    await member
      .timeout(timeoutMs(settings), reason)
      .catch(() => undefined);
  }
}

export async function onAntiRaidMemberAdd(
  member: GuildMember,
  settings: AntiRaidSettings,
): Promise<NewMemberVerdict> {
  if (member.user.bot) return "allow";
  const now = Date.now();
  const immune = isAntiRaidImmune({
    userId: member.id,
    ownerId: member.guild.ownerId,
    botId: member.client.user?.id ?? null,
    memberRoleIds: [...member.roles.cache.keys()],
    whitelistUserIds: [],
    whitelistRoleIds: settings.whitelistRoleIds,
  });

  const windowMs = settings.joinWindowSeconds * 1000;
  const recorded = recordAndCount(
    joinWindows.get(member.guild.id) ?? [],
    now,
    windowMs,
  );
  joinWindows.set(member.guild.id, recorded.next);

  const verdict = decideNewMemberAction({
    enabled: settings.enabled,
    immune,
    lockdownActive: settings.lockdownActive,
    lockdownJoinAction: settings.lockdownJoinAction,
    accountAgeEnabled: settings.accountAgeEnabled,
    accountTooNew: accountAgeTooNew(
      member.user.createdTimestamp,
      settings.accountAgeDays,
      now,
    ),
    accountAgeAction: settings.accountAgeAction,
    joinFloodEnabled: settings.joinFloodEnabled,
    flood: recorded.count >= settings.joinCount,
    joinAction: settings.joinAction,
  });

  if (verdict === "allow") return verdict;

  const reason =
    verdict === "lockdown" || (settings.joinFloodEnabled && recorded.count >= settings.joinCount)
      ? `Anti-Raid: flood de joins (${recorded.count}/${settings.joinCount})`
      : settings.lockdownActive
        ? "Anti-Raid: lockdown activo"
        : `Anti-Raid: cuenta más nueva de ${settings.accountAgeDays}d`;

  await applyVerdict(member, verdict, settings, reason);

  const alert = await resolveAlertChannel(member.guild, settings);
  await sendAntiRaidAlert(
    alert,
    "Anti-Raid",
    `Acción **${verdict}** sobre <@${member.id}> (\`${member.id}\`). ${reason}.`,
  );
  return verdict;
}
