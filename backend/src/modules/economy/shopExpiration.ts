import type { Client } from "discord.js";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  economyOwnedChannels,
  economyOwnedRoles,
  economyUserBoosts,
} from "../../db/schema.js";

const SWEEP_MS = 60_000;

/**
 * Expira roles/canales/boosts temporales de la tienda.
 * - Roles creados: se borran de Discord.
 * - Roles asignados existentes: solo se quitan del miembro.
 * - Canales: se eliminan.
 * - Boosts: se borran de la BD.
 */
export async function sweepExpiredShopGrants(bot: Client): Promise<void> {
  const now = new Date();

  const expiredRoles = getDb()
    .select()
    .from(economyOwnedRoles)
    .where(
      and(
        isNotNull(economyOwnedRoles.expiresAt),
        lte(economyOwnedRoles.expiresAt, now),
      ),
    )
    .all();

  for (const row of expiredRoles) {
    try {
      const guild =
        bot.guilds.cache.get(row.guildId) ??
        (await bot.guilds.fetch(row.guildId).catch(() => null));
      if (guild) {
        if (row.deleteRoleOnExpire) {
          const role = await guild.roles.fetch(row.roleId).catch(() => null);
          if (role) await role.delete("Tienda: rol temporal expirado");
        } else {
          const member = await guild.members
            .fetch(row.userId)
            .catch(() => null);
          if (member?.roles.cache.has(row.roleId)) {
            await member.roles.remove(
              row.roleId,
              "Tienda: rol temporal expirado",
            );
          }
        }
      }
    } catch (error) {
      console.warn("[adobos] shop expire role:", row.id, error);
    }
    getDb()
      .delete(economyOwnedRoles)
      .where(eq(economyOwnedRoles.id, row.id))
      .run();
  }

  const expiredChannels = getDb()
    .select()
    .from(economyOwnedChannels)
    .where(
      and(
        isNotNull(economyOwnedChannels.expiresAt),
        lte(economyOwnedChannels.expiresAt, now),
      ),
    )
    .all();

  for (const row of expiredChannels) {
    try {
      const guild =
        bot.guilds.cache.get(row.guildId) ??
        (await bot.guilds.fetch(row.guildId).catch(() => null));
      if (guild) {
        const channel = await guild.channels
          .fetch(row.channelId)
          .catch(() => null);
        if (channel) {
          await channel.delete("Tienda: canal temporal expirado");
        }
      }
    } catch (error) {
      console.warn("[adobos] shop expire channel:", row.id, error);
    }
    getDb()
      .delete(economyOwnedChannels)
      .where(eq(economyOwnedChannels.id, row.id))
      .run();
  }

  const expiredBoosts = getDb()
    .select()
    .from(economyUserBoosts)
    .where(
      and(
        isNotNull(economyUserBoosts.expiresAt),
        lte(economyUserBoosts.expiresAt, now),
      ),
    )
    .all();

  for (const row of expiredBoosts) {
    getDb()
      .delete(economyUserBoosts)
      .where(eq(economyUserBoosts.id, row.id))
      .run();
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startShopExpirationSweeper(bot: Client): void {
  if (sweepTimer) return;
  void sweepExpiredShopGrants(bot);
  sweepTimer = setInterval(() => {
    void sweepExpiredShopGrants(bot);
  }, SWEEP_MS);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
}
