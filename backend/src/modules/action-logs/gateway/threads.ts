import { type AnyThreadChannel, AuditLogEvent } from "discord.js";
import { resolveAuditExecutor } from "../audit.js";
import { recordActionLog } from "../domain/action-logs.js";

function threadName(thread: AnyThreadChannel): string {
  const name = thread.name?.trim();
  return name || "hilo-sin-nombre";
}

function threadLabel(thread: AnyThreadChannel): string {
  const name = threadName(thread);
  const parent =
    thread.parent && "name" in thread.parent && thread.parent.name
      ? String(thread.parent.name)
      : null;
  return parent ? `#${parent} › ${name}` : name;
}

export async function onThreadCreate(thread: AnyThreadChannel): Promise<void> {
  if (!thread.guild) return;
  const executor = await resolveAuditExecutor(
    thread.guild,
    AuditLogEvent.ThreadCreate,
    thread.id,
  );
  const label = threadLabel(thread);
  await recordActionLog(thread.client, {
    guildId: thread.guild.id,
    eventKey: "threadCreate",
    executorId: executor?.id ?? thread.ownerId ?? null,
    executorTag: executor?.tag ?? null,
    targetId: thread.id,
    targetTag: label,
    channelId: thread.id,
    parentId: thread.parentId,
    summary: `Thread created: ${label}`,
    description: `🧵 **Thread created:** \`${label}\``,
    details: {
      name: threadName(thread),
      parentId: thread.parentId,
      targetKind: "channel",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onThreadDelete(thread: AnyThreadChannel): Promise<void> {
  if (!thread.guild) return;
  const executor = await resolveAuditExecutor(
    thread.guild,
    AuditLogEvent.ThreadDelete,
    thread.id,
  );
  const label = threadLabel(thread);
  await recordActionLog(thread.client, {
    guildId: thread.guild.id,
    eventKey: "threadDelete",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: thread.id,
    targetTag: label,
    channelId: null,
    parentId: thread.parentId,
    summary: `Hilo eliminado: ${label}`,
    description: `🗑️ **Hilo eliminado:** \`${label}\``,
    details: {
      name: threadName(thread),
      parentId: thread.parentId,
      channelDeleted: true,
      targetKind: "channel",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
  });
}

export async function onThreadUpdate(
  oldThread: AnyThreadChannel,
  newThread: AnyThreadChannel,
): Promise<void> {
  if (!newThread.guild) return;
  const diffs: string[] = [];
  if (oldThread.name !== newThread.name) {
    diffs.push(
      `Nombre: \`${oldThread.name ?? "?"}\` ➔ \`${newThread.name ?? "?"}\``,
    );
  }
  if (oldThread.archived !== newThread.archived) {
    diffs.push(newThread.archived ? "Archivado" : "Desarchivado");
  }
  if (oldThread.locked !== newThread.locked) {
    diffs.push(newThread.locked ? "Bloqueado" : "Desbloqueado");
  }
  if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
    diffs.push(
      `Auto-archivo: ${oldThread.autoArchiveDuration ?? "—"} ➔ ${newThread.autoArchiveDuration ?? "—"}`,
    );
  }
  if (diffs.length === 0) return;

  const executor = await resolveAuditExecutor(
    newThread.guild,
    AuditLogEvent.ThreadUpdate,
    newThread.id,
  );
  const label = threadLabel(newThread);
  await recordActionLog(newThread.client, {
    guildId: newThread.guild.id,
    eventKey: "threadUpdate",
    executorId: executor?.id ?? null,
    executorTag: executor?.tag ?? null,
    targetId: newThread.id,
    targetTag: label,
    channelId: newThread.id,
    parentId: newThread.parentId,
    summary: `Hilo actualizado: ${label}`,
    description: `🔧 **Hilo actualizado:** \`${label}\``,
    details: {
      name: threadName(newThread),
      diffs,
      targetKind: "channel",
    },
    actorIsBot: executor?.bot ?? false,
    actorRoleIds: executor?.roleIds,
    tone: "yellow",
  });
}
