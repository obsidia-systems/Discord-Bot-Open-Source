import {
  EmbedBuilder,
  type Client,
  type TextChannel,
} from "discord.js";
import {
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
  return `**${rank}.**`;
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
  const rows = getTopUserXpRows(guildId, 10);
  const lines: string[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const name = await resolveDisplayName(client, guildId, row.userId);
    lines.push(
      `${medals(i + 1)} <@${row.userId}> · **Nv. ${row.level}** · \`${row.xp.toLocaleString("es-MX")} XP\` — ${name}`,
    );
  }

  const description =
    lines.length > 0
      ? lines.join("\n")
      : "_Todavía no hay usuarios con XP._";

  return new EmbedBuilder()
    .setColor(0xe11d48)
    .setTitle("🏆 Clasificación — Top 10")
    .setDescription(description)
    .setFooter({ text: "Actualización automática · Rangos y XP" })
    .setTimestamp(new Date());
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

  const config = getLevelsConfigCached(guildId);
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
  const rows = getTopUserXpRows(guildId, 10);
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
        setLiveLeaderboardMessageId(guildId, sent.id);
      }
    } else {
      const sent = await textChannel.send({ embeds: [embed] });
      setLiveLeaderboardMessageId(guildId, sent.id);
    }

    lastFingerprint.set(guildId, fp);
    lastEditAt.set(guildId, Date.now());
    dirtyGuilds.delete(guildId);
  } catch (error) {
    console.warn(
      `[adobos] levels: no se pudo actualizar leaderboard en vivo (${guildId}):`,
      error,
    );
  }
}

/**
 * Tras ganar XP: solo marca dirty si el Top 10 cambia.
 * El edit real va con debounce + intervalo mínimo de 5 min.
 */
export function scheduleLiveLeaderboardRefresh(
  client: Client,
  guildId: string,
): void {
  const config = getLevelsConfigCached(guildId);
  if (!config.enabled || !config.liveLeaderboardChannelId) return;

  const rows = getTopUserXpRows(guildId, 10);
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

  ensureFlushInterval(client);
}

/** Fuerza un refresh (p. ej. al cambiar el canal en el dashboard). */
export function forceLiveLeaderboardRefresh(
  client: Client,
  guildId: string,
): void {
  dirtyGuilds.add(guildId);
  lastEditAt.delete(guildId);
  clearTimeout(debounceTimers.get(guildId));
  debounceTimers.set(
    guildId,
    setTimeout(() => {
      void flushLiveLeaderboard(client, guildId);
    }, 1_500),
  );
  ensureFlushInterval(client);
}

function ensureFlushInterval(client: Client): void {
  if (flushIntervalStarted) return;
  flushIntervalStarted = true;
  setInterval(() => {
    for (const guildId of [...dirtyGuilds]) {
      void flushLiveLeaderboard(client, guildId);
    }
  }, MIN_EDIT_INTERVAL_MS);
}
