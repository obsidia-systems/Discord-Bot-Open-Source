/**
 * Embeds base del módulo Pokémon con atribución obligatoria.
 */

import { EmbedBuilder } from "discord.js";

/** Atribución Fair Use / fuentes de datos (siempre presente). */
export const POKEMON_EMBED_ATTRIBUTION = "PokéAPI • Smogon";

/**
 * Concatena un pie dinámico con la atribución global.
 * Ej: `Página 1 de 3 • PokéAPI • Smogon`
 */
export function formatPokemonFooter(extra?: string | null): string {
  const prefix = (extra ?? "").trim();
  if (!prefix) return POKEMON_EMBED_ATTRIBUTION;
  // Evita duplicar si el caller ya metió la atribución.
  if (prefix.includes(POKEMON_EMBED_ATTRIBUTION)) {
    return prefix.slice(0, 2048);
  }
  return `${prefix} • ${POKEMON_EMBED_ATTRIBUTION}`.slice(0, 2048);
}

/** EmbedBuilder con footer de atribución ya aplicado. */
export function createBasePokemonEmbed(extraFooter?: string | null): EmbedBuilder {
  return new EmbedBuilder().setFooter({
    text: formatPokemonFooter(extraFooter),
  });
}

/** Asegura/actualiza el footer de atribución en un embed existente. */
export function withPokemonFooter(
  embed: EmbedBuilder,
  extraFooter?: string | null,
): EmbedBuilder {
  return embed.setFooter({ text: formatPokemonFooter(extraFooter) });
}
