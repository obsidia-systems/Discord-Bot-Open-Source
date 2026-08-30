import type { AdobosModule } from "../../core/modules/types.js";
import { warmPokemonAutocompleteCache } from "../../services/pokemonApi.js";
import { pokemonRoutes } from "./api/routes.js";
import {
  BESTSETS_JUMP_PREFIX,
  BESTSETS_PAGE_PREFIX,
  handleBestsetsJumpSelect,
  handleBestsetsPageButton,
} from "./commands/bestsets.js";
import {
  COVERAGE_SELECT_PREFIX,
  handleCoverageSelect,
} from "./commands/coverage.js";
import {
  LOCATION_JUMP_PREFIX,
  LOCATION_PAGE_PREFIX,
  handleLocationJumpSelect,
  handleLocationPageButton,
} from "./commands/location.js";
import {
  MOVESET_FILTER_PREFIX,
  MOVESET_PAGE_PREFIX,
  handleMovesetFilterSelect,
  handleMovesetPageButton,
} from "./commands/moveset.js";
import {
  TEAMBUILDER_ADV_PREFIX,
  TEAMBUILDER_MOVES_PREFIX,
  TEAMBUILDER_SLOT_PREFIX,
  TEAMBUILDER_SYN_PREFIX,
  handleTeambuilderAdvancedButton,
  handleTeambuilderMovesSelect,
  handleTeambuilderSlotSelect,
  handleTeambuilderSynergyButton,
} from "./commands/teambuilder.js";

/** Plugin Pokémon — helpers PokéAPI / Smogon. */
export const pokemonModule: AdobosModule = {
  id: "pokemon",
  name: "Pokémon",
  register(ctx) {
    ctx.route("/api/pokemon", pokemonRoutes(ctx.client));
    ctx.button(LOCATION_PAGE_PREFIX, (interaction) =>
      handleLocationPageButton(interaction),
    );
    ctx.button(MOVESET_PAGE_PREFIX, (interaction) =>
      handleMovesetPageButton(interaction),
    );
    ctx.button(BESTSETS_PAGE_PREFIX, (interaction) =>
      handleBestsetsPageButton(interaction),
    );
    ctx.button(TEAMBUILDER_ADV_PREFIX, (interaction) =>
      handleTeambuilderAdvancedButton(interaction),
    );
    ctx.button(TEAMBUILDER_SYN_PREFIX, (interaction) =>
      handleTeambuilderSynergyButton(interaction),
    );
    // Select menus: mismo patrón que autoroles (no hay registry de selects).
    ctx.on("interactionCreate", (interaction) => {
      if (!interaction.isStringSelectMenu()) return;
      if (interaction.customId.startsWith(LOCATION_JUMP_PREFIX)) {
        void handleLocationJumpSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith(MOVESET_FILTER_PREFIX)) {
        void handleMovesetFilterSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith(BESTSETS_JUMP_PREFIX)) {
        void handleBestsetsJumpSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith(COVERAGE_SELECT_PREFIX)) {
        void handleCoverageSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith(TEAMBUILDER_SLOT_PREFIX)) {
        void handleTeambuilderSlotSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith(TEAMBUILDER_MOVES_PREFIX)) {
        void handleTeambuilderMovesSelect(interaction);
      }
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
  BESTSETS_JUMP_PREFIX,
  BESTSETS_PAGE_PREFIX,
  handleBestsetsCommand,
  handleBestsetsJumpSelect,
  handleBestsetsPageButton,
} from "./commands/bestsets.js";
export {
  COVERAGE_SELECT_PREFIX,
  handleCoverageCommand,
  handleCoverageSelect,
} from "./commands/coverage.js";
export {
  LOCATION_JUMP_PREFIX,
  LOCATION_PAGE_PREFIX,
  handleLocationCommand,
  handleLocationJumpSelect,
  handleLocationPageButton,
} from "./commands/location.js";
export {
  MOVESET_FILTER_PREFIX,
  MOVESET_PAGE_PREFIX,
  handleMovesetCommand,
  handleMovesetFilterSelect,
  handleMovesetPageButton,
} from "./commands/moveset.js";
export { handlePokeinfoCommand } from "./commands/pokeinfo.js";
export { handleWeaknessCommand } from "./commands/weakness.js";
export { handleCountersCommand } from "./commands/counters.js";
export {
  TEAMBUILDER_ADV_PREFIX,
  TEAMBUILDER_MOVES_PREFIX,
  TEAMBUILDER_SLOT_PREFIX,
  TEAMBUILDER_SYN_PREFIX,
  handleTeambuilderCommand,
  handleTeambuilderAdvancedButton,
  handleTeambuilderMovesSelect,
  handleTeambuilderSlotSelect,
  handleTeambuilderSynergyButton,
} from "./commands/teambuilder.js";
export {
  handleBreedingCommand,
  handleSandwichCommand,
} from "./commands/stubs.js";
