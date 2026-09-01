/** Invite del bot (MEE6 / Dyno): no es el login del panel. */

export const BOT_INVITE_SCOPES = "bot applications.commands";

/**
 * Permisos que Adobos pide al invitar. No se pide Administrator:
 * Discord muestra cada casilla y el usuario confía más.
 */
export const BOT_INVITE_PERMISSIONS = (
  (1n << 0n) | // CREATE_INSTANT_INVITE (DM de kick)
  (1n << 1n) | // KICK_MEMBERS
  (1n << 2n) | // BAN_MEMBERS
  (1n << 4n) | // MANAGE_CHANNELS (lock, slowmode)
  (1n << 6n) | // ADD_REACTIONS
  (1n << 7n) | // VIEW_AUDIT_LOG
  (1n << 10n) | // VIEW_CHANNEL
  (1n << 11n) | // SEND_MESSAGES
  (1n << 13n) | // MANAGE_MESSAGES (purge)
  (1n << 14n) | // EMBED_LINKS
  (1n << 15n) | // ATTACH_FILES
  (1n << 16n) | // READ_MESSAGE_HISTORY
  (1n << 18n) | // USE_EXTERNAL_EMOJIS
  (1n << 20n) | // CONNECT (XP en voz)
  (1n << 28n) | // MANAGE_ROLES (autoroles, overwrite de lock)
  // MODERATE_MEMBERS (timeout)
  (1n << 40n)
).toString();

export function buildBotInviteUrl(options: {
  clientId: string;
  guildId?: string;
  permissions?: string;
}): string {
  const clientId = options.clientId.trim();
  const params: Record<string, string> = {
    client_id: clientId,
    permissions: options.permissions ?? BOT_INVITE_PERMISSIONS,
    scope: BOT_INVITE_SCOPES,
  };
  const guildId = options.guildId?.trim();
  if (guildId) {
    params.guild_id = guildId;
    params.disable_guild_select = "true";
  }
  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  return `https://discord.com/oauth2/authorize?${query}`;
}
