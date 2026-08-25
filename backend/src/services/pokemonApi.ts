/**
 * Cliente HTTP hacia PokéAPI.
 * Base: https://pokeapi.co/api/v2/
 *
 * Por ahora solo helpers tipados; la lógica de comandos llenará estos métodos.
 */

const POKEAPI_BASE = "https://pokeapi.co/api/v2";

export class PokemonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PokemonApiError";
  }
}

async function pokeFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${POKEAPI_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new PokemonApiError(
      `No se pudo contactar PokéAPI: ${error instanceof Error ? error.message : "error de red"}`,
      502,
      "POKEAPI_NETWORK",
    );
  }

  if (!response.ok) {
    throw new PokemonApiError(
      `PokéAPI respondió ${response.status} en ${path}`,
      response.status,
      "POKEAPI_HTTP",
    );
  }

  return (await response.json()) as T;
}

/** GET /pokemon/{nameOrId} */
export async function fetchPokemon(nameOrId: string): Promise<unknown> {
  const key = encodeURIComponent(nameOrId.trim().toLowerCase());
  return pokeFetch(`/pokemon/${key}`);
}

/** GET /pokemon-species/{nameOrId} */
export async function fetchPokemonSpecies(nameOrId: string): Promise<unknown> {
  const key = encodeURIComponent(nameOrId.trim().toLowerCase());
  return pokeFetch(`/pokemon-species/${key}`);
}

/** GET /type/{nameOrId} */
export async function fetchType(nameOrId: string): Promise<unknown> {
  const key = encodeURIComponent(nameOrId.trim().toLowerCase());
  return pokeFetch(`/type/${key}`);
}

/** GET /pokemon?limit=&offset= — listado para autocomplete futuro. */
export async function listPokemon(
  limit = 20,
  offset = 0,
): Promise<{ count: number; results: Array<{ name: string; url: string }> }> {
  return pokeFetch(
    `/pokemon?limit=${Math.min(100, Math.max(1, limit))}&offset=${Math.max(0, offset)}`,
  );
}

export { POKEAPI_BASE };
