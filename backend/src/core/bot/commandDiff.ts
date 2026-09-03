import type {
  ApplicationCommand,
  Collection,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

/**
 * ¿El conjunto de comandos deseado difiere del ya registrado en Discord?
 *
 * Reutiliza `ApplicationCommand#equals` (compara nombre, descripción, opciones
 * recursivas, `default_member_permissions`, contextos y localizaciones, con
 * orden de opciones estricto) para no re-implementar la normalización. `equals`
 * acepta el cuerpo REST crudo en tiempo de ejecución (lee las claves snake_case),
 * pero su firma pide la forma GET; de ahí el cast.
 */
export function commandsNeedSync(
  current: Collection<string, ApplicationCommand>,
  desired: readonly RESTPostAPIApplicationCommandsJSONBody[],
): boolean {
  if (current.size !== desired.length) return true;
  for (const body of desired) {
    const existing = current.find((cmd) => cmd.name === body.name);
    if (!existing) return true;
    const equalsArg = body as unknown as Parameters<typeof existing.equals>[0];
    if (!existing.equals(equalsArg, true)) return true;
  }
  return false;
}
