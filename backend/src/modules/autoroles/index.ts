import { GatewayIntentBits, type ButtonInteraction } from "discord.js";
import type { AdobosModule } from "../../core/modules/types.js";
import { autoroleRoutes } from "./api/routes.js";
import { rolesRoutes } from "./api/roles.routes.js";
import { onGuildMemberAddAutoRoles } from "./events/guildMemberAdd.js";
import { onMessageReactionAdd } from "./events/messageReactionAdd.js";
import { onMessageReactionRemove } from "./events/messageReactionRemove.js";

async function handleAutoroleButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  const roleId = customId.slice("autorole_".length);

  if (!/^\d{17,20}$/.test(roleId)) {
    await interaction.reply({
      content: "customId de autorol inválido.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "Este botón solo funciona dentro de un servidor.",
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.user.bot) return;

  const hasRole = member.roles.cache.has(roleId);
  if (hasRole) {
    await member.roles.remove(roleId, "Adobos autorole button");
    await interaction.reply({
      content: "Rol eliminado.",
      ephemeral: true,
    });
    return;
  }

  await member.roles.add(roleId, "Adobos autorole button");
  await interaction.reply({
    content: "¡Rol asignado!",
    ephemeral: true,
  });
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
    ctx.button("autorole_", (interaction) => handleAutoroleButton(interaction));
    ctx.route("/api/autoroles", autoroleRoutes(ctx.client));
    ctx.route("/api/roles", rolesRoutes(ctx.client));
  },
};
export {
  AutoRoleError,
  createAutoRoleSetup,
  normalizeEmojiKey,
  saveReactionRoleMappings,
} from "./api/controller.js";
