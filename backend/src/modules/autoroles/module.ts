import { exclusiveSelectRoleIds } from "@adobos/shared";
import {
  type ButtonInteraction,
  GatewayIntentBits,
  MessageFlags,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import {
  assignableSkipMessage,
  isRoleAssignableInGuild,
} from "./assignable.js";
import { onGuildMemberAddAutoRoles } from "./gateway/guildMemberAdd.js";
import { onMessageReactionAdd } from "./gateway/messageReactionAdd.js";
import { onMessageReactionRemove } from "./gateway/messageReactionRemove.js";
import { rolesRoutes } from "./http/roles.routes.js";
import { autoroleRoutes } from "./http/routes.js";

async function replyEphemeral(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  content: string,
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction
      .followUp({ content, flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  await interaction
    .reply({ content, flags: MessageFlags.Ephemeral })
    .catch(() => undefined);
}

async function toggleRole(
  interaction: ButtonInteraction,
  roleId: string,
): Promise<void> {
  if (!/^\d{17,20}$/.test(roleId)) {
    await replyEphemeral(interaction, "Invalid role.");
    return;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await replyEphemeral(
      interaction,
      "This control only works inside a server.",
    );
    return;
  }

  const guild = interaction.guild;
  if (!guild.members.me) {
    await guild.members.fetchMe().catch(() => null);
  }

  const member = await guild.members.fetch(interaction.user.id);
  if (member.user.bot) return;

  if (!isRoleAssignableInGuild(guild, roleId)) {
    await replyEphemeral(interaction, assignableSkipMessage(roleId, guild));
    return;
  }

  try {
    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      await member.roles.remove(roleId, "Adobos autorole");
      await replyEphemeral(interaction, "Role removed.");
      return;
    }
    await member.roles.add(roleId, "Adobos autorole");
    await replyEphemeral(interaction, "Role assigned!");
  } catch {
    await replyEphemeral(interaction, assignableSkipMessage(roleId, guild));
  }
}

async function handleAutoroleSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await replyEphemeral(
      interaction,
      "This control only works inside a server.",
    );
    return;
  }

  const guild = interaction.guild;
  if (!guild.members.me) {
    await guild.members.fetchMe().catch(() => null);
  }

  const mappingRoleIds = interaction.component.options.map(
    (option) => option.value,
  );
  const selected = interaction.values[0] ?? "";
  const plan = exclusiveSelectRoleIds(mappingRoleIds, selected);
  if (!plan.add) {
    await replyEphemeral(interaction, "Invalid role.");
    return;
  }

  if (!isRoleAssignableInGuild(guild, plan.add)) {
    await replyEphemeral(interaction, assignableSkipMessage(plan.add, guild));
    return;
  }

  const member = await guild.members.fetch(interaction.user.id);
  if (member.user.bot) return;

  try {
    for (const roleId of plan.remove) {
      if (
        member.roles.cache.has(roleId) &&
        isRoleAssignableInGuild(guild, roleId)
      ) {
        await member.roles.remove(roleId, "Adobos autorole");
      }
    }
    if (!member.roles.cache.has(plan.add)) {
      await member.roles.add(plan.add, "Adobos autorole");
    }
    await replyEphemeral(interaction, "Role assigned!");
  } catch {
    await replyEphemeral(interaction, assignableSkipMessage(plan.add, guild));
  }
}

async function handleAutoroleButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const roleId = interaction.customId.slice("autorole_".length);
  await toggleRole(interaction, roleId);
}

export const autorolesModule: AdobosModule = {
  id: "autoroles",
  name: "Autoroles",
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  register(ctx) {
    ctx.on("guildMemberAdd", (member) => {
      void onGuildMemberAddAutoRoles(member);
    });
    ctx.on("messageReactionAdd", (reaction, user) => {
      void onMessageReactionAdd(reaction, user);
    });
    ctx.on("messageReactionRemove", (reaction, user) => {
      void onMessageReactionRemove(reaction, user);
    });
    ctx.on("interactionCreate", (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (interaction.customId !== "autorole_select") return;
      void handleAutoroleSelect(interaction);
    });
    ctx.button("autorole_", (interaction) => handleAutoroleButton(interaction));
    ctx.route("/api/autoroles", autoroleRoutes(ctx.client), {
      feature: "autoroles",
    });
    ctx.route("/api/roles", rolesRoutes(ctx.client), { feature: "autoroles" });
  },
};

export {
  AutoRoleError,
  createAutoRoleSetup,
  normalizeEmojiKey,
  saveReactionRoleMappings,
} from "./http/controller.js";
