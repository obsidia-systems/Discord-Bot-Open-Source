/** Utilidades del bot — placeholder para loaders de comandos/plugins. */
export function assertNever(value: never): never {
  throw new Error(`Valor inesperado: ${String(value)}`);
}
