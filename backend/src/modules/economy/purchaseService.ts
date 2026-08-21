import type {
  EconomyPurchaseStatus,
  EconomyShopItem,
  EconomyShopRewardConfigCustomRole,
  EconomyShopRewardConfigManual,
  EconomyShopRewardConfigMultiplier,
  EconomyShopRewardConfigPrivateChannel,
  EconomyShopRewardConfigRoleAssign,
} from "@adobos/shared";
import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import {
  economyOwnedRoles,
  economyPurchases,
  economyShopItems,
  economyUserBoosts,
  userEconomy,
} from "../../db/schema.js";
import { getLevelsConfig } from "../levels/service.js";
import { EconomyError, getEconomyConfig } from "./service.js";
import { decrementShopStock, getShopItem } from "./shopService.js";

const PRIVATE_CATEGORY_NAME = "Zonas Privadas";

function ensureUserEconomy(
  guildId: string,
  userId: string,
): { wallet: number; bank: number } {
  const existing = getDb()
    .select()
    .from(userEconomy)
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .get();
  if (existing) return { wallet: existing.wallet, bank: existing.bank };

  const config = getEconomyConfig(guildId);
  const now = new Date();
  getDb()
    .insert(userEconomy)
    .values({
      guildId,
      userId,
      wallet: config.startBalance,
      bank: 0,
      updatedAt: now,
    })
    .run();
  return { wallet: config.startBalance, bank: 0 };
}

function debitFunds(
  guildId: string,
  userId: string,
  price: number,
): { wallet: number; bank: number } {
  const current = ensureUserEconomy(guildId, userId);
  const total = current.wallet + current.bank;
  if (total < price) {
    throw new EconomyError(
      `Saldo insuficiente. Necesitas ${price} (tienes ${total}).`,
      400,
      "INSUFFICIENT_FUNDS",
    );
  }

  let wallet = current.wallet;
  let bank = current.bank;
  let remaining = price;

  const fromWallet = Math.min(wallet, remaining);
  wallet -= fromWallet;
  remaining -= fromWallet;
  if (remaining > 0) {
    bank -= remaining;
  }

  getDb()
    .update(userEconomy)
    .set({ wallet, bank, updatedAt: new Date() })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .run();

  return { wallet, bank };
}

function refundFunds(
  guildId: string,
  userId: string,
  amount: number,
): void {
  const current = ensureUserEconomy(guildId, userId);
  getDb()
    .update(userEconomy)
    .set({
      wallet: current.wallet + amount,
      updatedAt: new Date(),
    })
    .where(
      and(eq(userEconomy.guildId, guildId), eq(userEconomy.userId, userId)),
    )
    .run();
}

async function fulfillReward(
  guild: Guild,
  member: GuildMember,
  item: EconomyShopItem,
  purchaseId: string,
): Promise<{ status: EconomyPurchaseStatus; metadata: Record<string, unknown> }> {
  switch (item.rewardType) {
    case "ROLE_ASSIGN": {
      const cfg = item.rewardConfig as EconomyShopRewardConfigRoleAssign;
      const role = await guild.roles.fetch(cfg.roleId).catch(() => null);
      if (!role) {
        throw new EconomyError(
          "El rol configurado ya no existe.",
          400,
          "ROLE_MISSING",
        );
      }
      await member.roles.add(role, `Tienda: ${item.name}`);
      return { status: "fulfilled", metadata: { roleId: role.id } };
    }

    case "CUSTOM_ROLE": {
      const cfg = item.rewardConfig as EconomyShopRewardConfigCustomRole;
      const roleName = `${member.displayName}`.slice(0, 90) || "Rol custom";
      const role = await guild.roles.create({
        name: roleName,
        permissions: [],
        reason: `Tienda: ${item.name} (${member.user.tag})`,
      });

      if (cfg.forceHierarchyBase) {
        try {
          await role.setPosition(1, {
            reason: "Jerarquía base sobre @everyone",
          });
        } catch (error) {
          console.warn(
            "[adobos] shop CUSTOM_ROLE: no se pudo reposicionar el rol:",
            error,
          );
        }
      }

      await member.roles.add(role, `Tienda: ${item.name}`);

      getDb()
        .insert(economyOwnedRoles)
        .values({
          id: crypto.randomUUID(),
          guildId: guild.id,
          userId: member.id,
          roleId: role.id,
          itemId: item.id,
          purchaseId,
          createdAt: new Date(),
        })
        .run();

      return {
        status: "fulfilled",
        metadata: { roleId: role.id, forceHierarchyBase: cfg.forceHierarchyBase },
      };
    }

    case "PRIVATE_CHANNEL": {
      const cfg = item.rewardConfig as EconomyShopRewardConfigPrivateChannel;
      let parentId = cfg.categoryId;

      if (!parentId) {
        const existing = guild.channels.cache.find(
          (ch) =>
            ch.type === ChannelType.GuildCategory &&
            ch.name === PRIVATE_CATEGORY_NAME,
        );
        if (existing) {
          parentId = existing.id;
        } else {
          const created = await guild.channels.create({
            name: PRIVATE_CATEGORY_NAME,
            type: ChannelType.GuildCategory,
            reason: "Categoría de zonas privadas (tienda)",
          });
          parentId = created.id;
        }
      }

      const slug = member.user.username
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "")
        .slice(0, 20);
      const channel = await guild.channels.create({
        name: `privado-${slug || member.id.slice(-4)}`.slice(0, 100),
        type: ChannelType.GuildText,
        parent: parentId,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
        reason: `Tienda: ${item.name}`,
      });

      return {
        status: "fulfilled",
        metadata: { channelId: channel.id, categoryId: parentId },
      };
    }

    case "MULTIPLIER_BOOST": {
      const cfg = item.rewardConfig as EconomyShopRewardConfigMultiplier;
      if (cfg.module === "xp") {
        const levels = getLevelsConfig(guild.id);
        if (!levels.enabled) {
          throw new EconomyError(
            "El módulo de Rangos y XP está desactivado. No se puede comprar este boost.",
            400,
            "XP_INACTIVE",
          );
        }
      }

      const expiresAt = new Date(
        Date.now() + cfg.durationMinutes * 60_000,
      );
      // Guardamos multiplier * 100 para soportar decimales (2.5 → 250).
      const stored = Math.round(cfg.multiplier * 100);
      getDb()
        .insert(economyUserBoosts)
        .values({
          id: crypto.randomUUID(),
          guildId: guild.id,
          userId: member.id,
          module: cfg.module,
          multiplier: stored,
          expiresAt,
          purchaseId,
          createdAt: new Date(),
        })
        .run();

      return {
        status: "fulfilled",
        metadata: {
          module: cfg.module,
          multiplier: cfg.multiplier,
          durationMinutes: cfg.durationMinutes,
          expiresAt: expiresAt.toISOString(),
        },
      };
    }

    case "MANUAL_FULFILLMENT": {
      const cfg = item.rewardConfig as EconomyShopRewardConfigManual;
      const channel = (await guild.channels
        .fetch(cfg.logChannelId)
        .catch(() => null)) as TextChannel | null;
      if (!channel || !channel.isTextBased()) {
        throw new EconomyError(
          "El canal de logs de canje no es válido.",
          400,
          "LOG_CHANNEL_MISSING",
        );
      }

      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("🎫 Nueva Orden de Compra")
        .setDescription(
          `**${member.displayName}** (<@${member.id}>) compró **${item.name}**.`,
        )
        .addFields(
          {
            name: "Ítem",
            value: `${item.icon} ${item.name}\n${item.description || "—"}`,
            inline: false,
          },
          {
            name: "Precio pagado",
            value: `\`${item.price}\``,
            inline: true,
          },
          {
            name: "Compra ID",
            value: `\`${purchaseId}\``,
            inline: true,
          },
        )
        .setTimestamp(new Date());

      await channel.send({
        content: `<@&${cfg.pingRoleId}>`,
        embeds: [embed],
        allowedMentions: { roles: [cfg.pingRoleId] },
      });

      return {
        status: "pending",
        metadata: {
          logChannelId: cfg.logChannelId,
          pingRoleId: cfg.pingRoleId,
        },
      };
    }

    default:
      throw new EconomyError(
        "Tipo de recompensa no soportado.",
        400,
        "INVALID_TYPE",
      );
  }
}

export interface PurchaseResult {
  purchaseId: string;
  item: EconomyShopItem;
  status: EconomyPurchaseStatus;
  wallet: number;
  bank: number;
  metadata: Record<string, unknown>;
}

/**
 * Compra un ítem: valida economía activa, saldo, stock, aplica recompensa.
 */
export async function purchaseShopItem(
  guild: Guild,
  member: GuildMember,
  itemId: string,
): Promise<PurchaseResult> {
  const config = getEconomyConfig(guild.id);
  if (!config.isActive) {
    throw new EconomyError(
      "La economía está pausada en este servidor.",
      400,
      "ECONOMY_PAUSED",
    );
  }

  const item = getShopItem(itemId, guild.id);
  if (!item || !item.enabled) {
    throw new EconomyError("Ítem no disponible.", 404, "ITEM_UNAVAILABLE");
  }
  if (item.stock !== null && item.stock <= 0) {
    throw new EconomyError("Sin stock disponible.", 400, "OUT_OF_STOCK");
  }

  // Pre-check XP boost before debiting
  if (item.rewardType === "MULTIPLIER_BOOST") {
    const cfg = item.rewardConfig as EconomyShopRewardConfigMultiplier;
    if (cfg.module === "xp") {
      const levels = getLevelsConfig(guild.id);
      if (!levels.enabled) {
        throw new EconomyError(
          "El módulo de Rangos y XP está desactivado. No se puede comprar este boost.",
          400,
          "XP_INACTIVE",
        );
      }
    }
  }

  const balances = debitFunds(guild.id, member.id, item.price);
  decrementShopStock(item.id, guild.id);

  const purchaseId = crypto.randomUUID();
  let status: EconomyPurchaseStatus = "fulfilled";
  let metadata: Record<string, unknown> = {};

  try {
    const result = await fulfillReward(guild, member, item, purchaseId);
    status = result.status;
    metadata = result.metadata;
  } catch (error) {
    refundFunds(guild.id, member.id, item.price);
    if (item.stock !== null) {
      const current = getDb()
        .select()
        .from(economyShopItems)
        .where(eq(economyShopItems.id, item.id))
        .get();
      if (current?.stock !== null && current?.stock !== undefined) {
        getDb()
          .update(economyShopItems)
          .set({ stock: current.stock + 1, updatedAt: new Date() })
          .where(eq(economyShopItems.id, item.id))
          .run();
      }
    }

    getDb()
      .insert(economyPurchases)
      .values({
        id: purchaseId,
        guildId: guild.id,
        userId: member.id,
        itemId: item.id,
        itemName: item.name,
        pricePaid: item.price,
        status: "failed",
        metadata: JSON.stringify({
          error: error instanceof Error ? error.message : "unknown",
        }),
        createdAt: new Date(),
      })
      .run();

    throw error;
  }

  getDb()
    .insert(economyPurchases)
    .values({
      id: purchaseId,
      guildId: guild.id,
      userId: member.id,
      itemId: item.id,
      itemName: item.name,
      pricePaid: item.price,
      status,
      metadata: JSON.stringify(metadata),
      createdAt: new Date(),
    })
    .run();

  return {
    purchaseId,
    item,
    status,
    wallet: balances.wallet,
    bank: balances.bank,
    metadata,
  };
}
