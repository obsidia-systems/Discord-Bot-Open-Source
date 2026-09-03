import { logger } from "../../core/log.js";
import { registerJob } from "../../core/lifecycle.js";
import {
  EmbedBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import {
  applyLevelsTokens,
  embedColorToInt,
} from "@adobos/shared";
import {
  getLeaderboardTotal,
  getLevelsConfigCached,
  getTopUserXpRows,
  setLiveLeaderboardMessageId,
  topFingerprint,
} from "./service.js";

/** Debounce tras un cambio de Top 10. */
const DEBOUNCE_MS = 45_000;
/** Intervalo mínimo entre edits (anti rate-limit). */
const MIN_EDIT_INTERVAL_MS = 5 * 60_000;

const dirtyGuilds = new Set<string>();
const lastFingerprint = new Map<string, string>();
const lastEditAt = new Map<string, number>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let flushIntervalStarted = false;

function medals(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `**#${rank}**`;
}

async function resolveDisplayName(
  client: Client,
  guildId: string,
  userId: string,
): Promise<string> {
  const guild = client.guilds.cache.get(guildId);
  const member = await guild?.members.fetch(userId).catch(() => null);
  if (member) return member.displayName;
  const user = await client.users.fetch(userId).catch(() => null);
  return user?.username ?? userId;
}

export async function buildLiveLeaderboardEmbed(
  client: Client,
  guildId: string,
): Promise<EmbedBuilder> {
  const rows = await getTopUserXpRows(guildId, 10);
  const lines: string[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const name = await resolveDisplayName(client, guildId, row.userId);
    const rank = i + 1;
    lines.push(
      `${medals(rank)} | <@${row.userId}> | ${name} | Level **${row.level}** | \`${row.xp.toLocaleString("es-MX")} XP\``,
    );
  }

  const config = await getLevelsConfigCached(guildId);
  const total = await getLeaderboardTotal(guildId);
  const intro = applyLevelsTokens(config.leaderboardEmbedDescription, {
    "{total}": String(total),
  }).trim();
  const ranking =
    lines.length > 0
      ? lines.join("\n")
      : "_No users with XP yet._";
  const description = [intro, ranking].filter(Boolean).join("\n\n").slice(0, 4096);

  const embed = new EmbedBuilder()
    .setColor(embedColorToInt(config.leaderboardEmbedColor, 0xca7aff))
    .setTitle(
      (config.leaderboardEmbedTitle || "Leaderboard").slice(0, 256),
    )
    .setDescription(description)
    .setFooter({ text: "Auto-updated · Levels" })
    .setTimestamp(new Date());

  if (config.leaderboardShowThumbnail) {
    const guild = client.guilds.cache.get(guildId);
    const icon = guild?.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);
  }

  return embed;
}

async function flushLiveLeaderboard(
  client: Client,
  guildId: string,
): Promise<void> {
  if (!dirtyGuilds.has(guildId)) return;

  const now = Date.now();
  const last = lastEditAt.get(guildId) ?? 0;
  if (last > 0 && now - last < MIN_EDIT_INTERVAL_MS) {
    const wait = MIN_EDIT_INTERVAL_MS - (now - last);
    clearTimeout(debounceTimers.get(guildId));
    debounceTimers.set(
      guildId,
      setTimeout(() => {
        void flushLiveLeaderboard(client, guildId);
      }, wait),
    );
    return;
  }

  const config = await getLevelsConfigCached(guildId);
  if (!config.enabled || !config.liveLeaderboardChannelId) {
    dirtyGuilds.delete(guildId);
    return;
  }

  const channel = await client.channels
    .fetch(config.liveLeaderboardChannelId)
    .catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    dirtyGuilds.delete(guildId);
    return;
  }

  const textChannel = channel as TextChannel;
  const embed = await buildLiveLeaderboardEmbed(client, guildId);
  const rows = await getTopUserXpRows(guildId, 10);
  const fp = topFingerprint(rows);

  try {
    if (config.liveLeaderboardMessageId) {
      const existing = await textChannel.messages
        .fetch(config.liveLeaderboardMessageId)
        .catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed] });
      } else {
        const sent = await textChannel.send({ embeds: [embed] });
        await setLiveLeaderboardMessageId(guildId, sent.id);
      }
    } else {
      const sent = await textChannel.send({ embeds: [embed] });
      await setLiveLeaderboardMessageId(guildId, sent.id);
    }

    lastFingerprint.set(guildId, fp);
    lastEditAt.set(guildId, Date.now());
    dirtyGuilds.delete(guildId);
  } catch (error) {
    logger.warn({ err: error }, `levels: couldn't update the live leaderboard (${guildId}):`);
  }
}

/**
 * Tras ganar XP: solo marca dirty si el Top 10 cambia.
 * El edit real va con debounce + intervalo mínimo de 5 min.
 */
export async function scheduleLiveLeaderboardRefresh(
  client: Client,
  guildId: string,
): Promise<void> {
  const config = await getLevelsConfigCached(guildId);
  if (!config.enabled || !config.liveLeaderboardChannelId) return;

  const rows = await getTopUserXpRows(guildId, 10);
  const fp = topFingerprint(rows);
  const prev = lastFingerprint.get(guildId);
  if (prev !== undefined && prev === fp) return;

  // Primera vez o Top cambió
  if (prev === undefined) {
    lastFingerprint.set(guildId, fp);
  }

  dirtyGuilds.add(guildId);

  clearTimeout(debounceTimers.get(guildId));
  debounceTimers.set(
    guildId,
    setTimeout(() => {
      void flushLiveLeaderboard(client, guildId);
    }, DEBOUNCE_MS),
  );

  await ensureFlushInterval(client);
}

/** Fuerza un refresh (p. ej. al cambiar el canal en el dashboard). */
export async function forceLiveLeaderboardRefresh(
  client: Client,
  guildId: string,
): Promise<void> {
  dirtyGuilds.add(guildId);
  lastEditAt.delete(guildId);
  clearTimeout(debounceTimers.get(guildId));
  debounceTimers.set(
    guildId,
    setTimeout(() => {
      void flushLiveLeaderboard(client, guildId);
    }, 1_500),
  );
  await ensureFlushInterval(client);
}

async function ensureFlushInterval(client: Client): Promise<void> {
  if (flushIntervalStarted) return;
  flushIntervalStarted = true;
  const timer = setInterval(() => {
    for (const guildId of [...dirtyGuilds]) {
      void flushLiveLeaderboard(client, guildId);
    }
  }, MIN_EDIT_INTERVAL_MS);
  registerJob("levels:live-leaderboard-flush", timer);
}
