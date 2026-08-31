/** Rol de proceso. Un binario, distinto trabajo. Default `all` = Compose actual. */

export const ADOBO_ROLES = ["all", "api", "gateway", "worker"] as const;

export type AdobosRole = (typeof ADOBO_ROLES)[number];

let current: AdobosRole = "all";
let workerLeader = false;

export function isAdobosRole(value: string): value is AdobosRole {
  return (ADOBO_ROLES as readonly string[]).includes(value);
}

export function setRuntimeRole(role: AdobosRole): void {
  current = role;
}

export function runtimeRole(): AdobosRole {
  return current;
}

export function roleRunsHttp(role: AdobosRole = current): boolean {
  return role === "all" || role === "api";
}

export function roleRunsGateway(role: AdobosRole = current): boolean {
  return role === "all" || role === "gateway" || role === "worker";
}

export function roleRunsWorker(role: AdobosRole = current): boolean {
  return role === "all" || role === "worker";
}

/**
 * Worker y gateway no deben desplegarse a la vez con el mismo token:
 * el worker también hace login para enviar mensajes (REST dedicado llega después).
 */
export function setWorkerLeader(value: boolean): void {
  workerLeader = value;
}

/** Este proceso es el líder de crons (advisory lock + rol worker). */
export function isWorkerLeader(): boolean {
  return workerLeader;
}
