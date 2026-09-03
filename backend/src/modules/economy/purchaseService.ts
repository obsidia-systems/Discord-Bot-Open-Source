import type {
  EconomyPurchaseStatus,
  EconomyShopItem,
  EconomyShopRewards,
} from "@adobos/shared";
import { applyShopNameTemplate, durationToMinutes } from "@adobos/shared";
import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { getDb } from "../../db/client.js";
import {
  economyOwnedChannels,
  economyOwnedRoles,
  economyPurchases,
  economyUserBoosts,
} from "../../db/schema.js";
import { getLevelsConfig } from "../levels/service.js";
import { EconomyError, getEconomyConfig } from "./service.js";
import { debitShopPurchase, refundShopPurchase } from "./funds.js";
import { getShopItem } from "./shopService.js";
import { logger } from "../../core/log.js";

const PRIVATE_CATEGORY_NAME = "Private Zones";

async function ensurePrivateCategory(guild: Guild): Promise<string> {
  const existing = guild.channels.cache.find(
    (ch) =>
      ch.type === ChannelType.GuildCategory &&
      ch.name === PRIVATE_CATEGORY_NAME,
  );
  if (existing) return existing.id;
  const created = await guild.channels.create({
    name: PRIVATE_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    reason: "Private zones category (shop)",
  });
  return created.id;
}

type RewardResult = { pending?: boolean; meta: Record<string, unknown> };

async function fulfillRole(
  guild: Guild,
  member: GuildMember,
  item: EconomyShopItem,
  purchaseId: string,
): Promise<RewardResult> {
  const cfg = item.rewards.roleConfig;
  const role = await guild.roles.fetch(cfg.roleId).catch(() => null);
  if (!role) {
    throw new EconomyError(
      "The configured role no longer exists.",
      400,
      "ROLE_MISSING",
    );
  }
  await member.roles.add(role, `Shop: ${item.name}`);

  let expiresAt: Date | null = null;
  if (cfg.temporary) {
    expiresAt = new Date(
      Date.now() +
        durationToMinutes(cfg.durationValue, cfg.durationUnit) * 60_000,
    );
  }

  await getDb()
    .insert(economyOwnedRoles)
    .values({
      id: crypto.randomUUID(),
      guildId: guild.id,
      userId: member.id,
      roleId: role.id,
      itemId: item.id,
      purchaseId,
      expiresAt,
      deleteRoleOnExpire: false,
      createdAt: new Date(),
    })
    ;

  return {
    meta: {
      type: "role",
      roleId: role.id,
      temporary: cfg.temporary,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  };
}

async function fulfillChannel(
  guild: Guild,
  member: GuildMember,
  item: EconomyShopItem,
  purchaseId: string,
): Promise<RewardResult> {
  const cfg = item.rewards.channelConfig;
  const vars = {
    username: member.user.username,
    displayname: member.displayName,
    userid: member.id,
  };
  const name =
    applyShopNameTemplate(cfg.nameTemplate, vars)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 100) || `privado-${member.id.slice(-4)}`;

  let parentId = cfg.categoryId;
  if (!parentId) parentId = await ensurePrivateCategory(guild);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
    reason: `Shop: ${item.name}`,
  });

  let expiresAt: Date | null = null;
  if (cfg.temporary) {
    expiresAt = new Date(
      Date.now() +
        durationToMinutes(cfg.durationValue, cfg.durationUnit) * 60_000,
    );
  }

  await getDb()
    .insert(economyOwnedChannels)
    .values({
      id: crypto.randomUUID(),
      guildId: guild.id,
      userId: member.id,
      channelId: channel.id,
      itemId: item.id,
      purchaseId,
      expiresAt,
      createdAt: new Date(),
    })
    ;

  return {
    meta: {
      type: "channel",
      channelId: channel.id,
      categoryId: parentId,
      temporary: cfg.temporary,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  };
}

async function fulfillBoost(
  guild: Guild,
  member: GuildMember,
  item: EconomyShopItem,
  purchaseId: string,
): Promise<RewardResult> {
  const cfg = item.rewards.boostConfig;
  if (cfg.module === "xp") {
    const levels = await getLevelsConfig(guild.id);
    if (!levels.enabled) {
      throw new EconomyError(
        "The Levels module is disabled. This boost can't be applied.",
        400,
        "XP_INACTIVE",
      );
    }
  }

  let expiresAt: Date | null = null;
  if (cfg.temporary) {
    expiresAt = new Date(
      Date.now() +
        durationToMinutes(cfg.durationValue, cfg.durationUnit) * 60_000,
    );
  }

  await getDb()
    .insert(economyUserBoosts)
    .values({
      id: crypto.randomUUID(),
      guildId: guild.id,
      userId: member.id,
      module: cfg.module,
      multiplier: Math.round(cfg.multiplier * 100),
      expiresAt,
      purchaseId,
      createdAt: new Date(),
    })
    ;

  return {
    meta: {
      type: "boost",
      module: cfg.module,
      multiplier: cfg.multiplier,
      temporary: cfg.temporary,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  };
}

async function fulfillManual(
  guild: Guild,
  member: GuildMember,
  item: EconomyShopItem,
  purchaseId: string,
): Promise<RewardResult> {
  const cfg = item.rewards.manualConfig;
  const channel = (await guild.channels
    .fetch(cfg.logChannelId)
    .catch(() => null)) as TextChannel | null;
  if (!channel || !channel.isTextBased()) {
    throw new EconomyError(
      "The ticket log channel is not valid.",
      400,
      "LOG_CHANNEL_MISSING",
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("🎫 Nueva Orden de Compra")
    .setDescription(
      `**${member.displayName}** (<@${member.id}>) bought **${item.name}**.`,
    )
    .addFields(
      {
        name: "Instrucciones para staff",
        value: cfg.staffInstructions || "—",
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

  const message = await channel.send({
    content: `<@&${cfg.pingRoleId}>`,
    embeds: [embed],
    allowedMentions: { roles: [cfg.pingRoleId] },
  });

  let threadId: string | null = null;
  if (
    message &&
    "startThread" in message &&
    typeof message.startThread === "function"
  ) {
    try {
      const thread = await message.startThread({
        name: `Orden ${item.name}`.slice(0, 100),
        autoArchiveDuration: 1440,
        reason: `Seguimiento compra ${purchaseId}`,
      });
      threadId = thread.id;
      await thread.send({
        content: `Delivery tracking for <@${member.id}>. Mark it when it's ready.`,
      });
    } catch (error) {
      logger.warn({ err: error }, "shop MANUAL_TICKET thread:");
    }
  }

  return {
    pending: true,
    meta: {
      type: "manual",
      logChannelId: cfg.logChannelId,
      pingRoleId: cfg.pingRoleId,
      messageId: message.id,
      threadId,
    },
  };
}

async function preflightRewards(guildId: string, rewards: EconomyShopRewards): Promise<void> {
  if (rewards.hasBoost && rewards.boostConfig.module === "xp") {
    const levels = await getLevelsConfig(guildId);
    if (!levels.enabled) {
      throw new EconomyError(
        "The Levels module is disabled. This item can't be bought.",
        400,
        "XP_INACTIVE",
      );
    }
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
 * Compra un ítem y ejecuta las recompensas con Switch activo.
 */
export async function purchaseShopItem(
  guild: Guild,
  member: GuildMember,
  itemId: string,
): Promise<PurchaseResult> {
  const config = await getEconomyConfig(guild.id);
  if (!config.isActive) {
    throw new EconomyError(
      "The economy is paused in this server.",
      400,
      "ECONOMY_PAUSED",
    );
  }

  const item = await getShopItem(itemId, guild.id);
  if (!item || !item.enabled) {
    throw new EconomyError("Item unavailable.", 404, "ITEM_UNAVAILABLE");
  }
  if (item.stock !== null && item.stock <= 0) {
    throw new EconomyError("Sin stock disponible.", 400, "OUT_OF_STOCK");
  }

  await preflightRewards(guild.id, item.rewards);

  const balances = await debitShopPurchase(
    guild.id,
    member.id,
    item.id,
    item.price,
  );

  const purchaseId = crypto.randomUUID();
  const results: Record<string, unknown>[] = [];
  let anyPending = false;

  try {
    const tasks: Array<() => Promise<RewardResult>> = [];
    if (item.rewards.hasRole) {
      tasks.push(() => fulfillRole(guild, member, item, purchaseId));
    }
    if (item.rewards.hasChannel) {
      tasks.push(() => fulfillChannel(guild, member, item, purchaseId));
    }
    if (item.rewards.hasBoost) {
      tasks.push(() => fulfillBoost(guild, member, item, purchaseId));
    }
    if (item.rewards.hasManual) {
      tasks.push(() => fulfillManual(guild, member, item, purchaseId));
    }

    // Orden fijo del sistema; promesas en paralelo cuando hay varias.
    const settled = await Promise.all(tasks.map((fn) => fn()));
    for (const result of settled) {
      results.push(result.meta);
      if (result.pending) anyPending = true;
    }
  } catch (error) {
    await refundShopPurchase(
      guild.id,
      member.id,
      item.id,
      item.price,
      item.stock !== null,
    );

    await getDb()
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
          results,
        }),
        createdAt: new Date(),
      })
      ;

    throw error;
  }

  const status: EconomyPurchaseStatus = anyPending ? "pending" : "fulfilled";
  const metadata = { rewards: results };

  await getDb()
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
    ;

  return {
    purchaseId,
    item,
    status,
    wallet: balances.wallet,
    bank: balances.bank,
    metadata,
  };
}
