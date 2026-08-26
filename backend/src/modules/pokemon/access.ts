import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { PokemonAccessContext } from "./service.js";

/** Extrae roles / admin del miembro para el guard del plugin. */
export function pokemonAccessFromInteraction(
  interaction: ChatInputCommandInteraction,
): PokemonAccessContext {
  const member = interaction.member;
  if (!member || typeof member === "string" || !("roles" in member)) {
    return {};
  }
  const guildMember = member as GuildMember;
  return {
    memberRoleIds: [...guildMember.roles.cache.keys()],
    isAdministrator: guildMember.permissions.has(
      PermissionFlagsBits.Administrator,
    ),
  };
}
