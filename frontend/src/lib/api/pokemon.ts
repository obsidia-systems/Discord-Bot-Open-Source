import type {
  PokemonConfig,
  PokemonConfigResponse,
  UpdatePokemonConfigRequest,
} from "@adobos/shared";
import { API_BASE, readApiError } from "./client";

export async function fetchPokemonConfig(): Promise<PokemonConfig> {
  const response = await fetch(`${API_BASE}/api/pokemon/config`);
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo cargar el plugin Pokémon."),
    );
  }
  const body = (await response.json()) as PokemonConfigResponse;
  return body.config;
}

export async function savePokemonConfig(
  input: UpdatePokemonConfigRequest,
): Promise<PokemonConfig> {
  const response = await fetch(`${API_BASE}/api/pokemon/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(response, "No se pudo guardar el plugin Pokémon."),
    );
  }
  const body = (await response.json()) as PokemonConfigResponse;
  return body.config;
}
