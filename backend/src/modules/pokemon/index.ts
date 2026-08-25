import type { AdobosModule } from "../../core/modules/types.js";
import { pokemonRoutes } from "./api/routes.js";

/** Plugin Pokémon — helpers PokéAPI / Smogon (stubs + config). */
export const pokemonModule: AdobosModule = {
  id: "pokemon",
  name: "Pokémon",
  register(ctx) {
    ctx.route("/api/pokemon", pokemonRoutes(ctx.client));
    ctx.once("ready", () => {
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
  handleBreedingCommand,
  handleCountersCommand,
  handleLocationCommand,
  handlePokeinfoCommand,
  handleSandwichCommand,
  handleTeambuilderCommand,
  handleWeaknessCommand,
} from "./commands/stubs.js";
