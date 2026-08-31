import type { AdobosModule } from "../../core/modules/types.js";
import { warmPokemonAutocompleteCache } from "../../services/pokemonApi.js";
import { pokemonRoutes } from "./api/routes.js";
import {
  LOCATION_JUMP_PREFIX,
  LOCATION_PAGE_PREFIX,
  handleLocationJumpSelect,
  handleLocationPageButton,
} from "./commands/location.js";

/** Plugin Pokémon — helpers PokéAPI / Smogon. */
export const pokemonModule: AdobosModule = {
  id: "pokemon",
  name: "Pokémon",
  register(ctx) {
    ctx.route("/api/pokemon", pokemonRoutes(ctx.client), { feature: "pokemon" });
    ctx.button(LOCATION_PAGE_PREFIX, (interaction) => handleLocationPageButton(interaction),
    );
    // Select menus: mismo patrón que autoroles (no hay registry de selects).
    ctx.on("interactionCreate", (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (!interaction.customId.startsWith(LOCATION_JUMP_PREFIX)) return;
      void handleLocationJumpSelect(interaction);
    });
    ctx.once("ready", () => {
      void warmPokemonAutocompleteCache().catch((error) => {
        console.warn("[adobos] pokemon: fallo al precargar caché:", error);
      });
      console.log("[adobos] pokemon: API /api/pokemon lista");
    });
  },
};

export {
  PokemonError,
  assertPokemonCommandAllowed,
  getPokemonConfig,
  updatePokemonConfig,
} from "./service.js";

export {
  LOCATION_JUMP_PREFIX,
  LOCATION_PAGE_PREFIX,
  handleLocationCommand,
  handleLocationJumpSelect,
  handleLocationPageButton,
} from "./commands/location.js";
export { handlePokeinfoCommand } from "./commands/pokeinfo.js";
export {
  handleBreedingCommand,
  handleCountersCommand,
  handleSandwichCommand,
  handleTeambuilderCommand,
  handleWeaknessCommand,
} from "./commands/stubs.js";
