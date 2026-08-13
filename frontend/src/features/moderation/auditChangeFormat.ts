import type { DiscordAuditChangeItem, DiscordAuditTone } from "@adobos/shared";

const PROPERTY_LABELS: Record<string, string> = {
  name: "Nombre",
  type: "Tipo",
  topic: "Tema / Descripción",
  nsfw: "Restricción de edad (NSFW)",
  rate_limit_per_user: "Modo lento",
  bitrate: "Tasa de bits",
  user_limit: "Límite de usuarios",
  position: "Posición",
  color: "Color hex",
  hoist: "Mostrar separado",
  mentionable: "Mencionable",
  permissions: "Permisos",
  allow: "Permitir",
  deny: "Denegar",
  nick: "Apodo",
  mute: "Silenciado",
  deaf: "Ensordecido",
  communication_disabled_until: "Timeout",
  description: "Descripción",
  $add: "Roles añadidos",
  $remove: "Roles eliminados",
  code: "Código de invitación",
  channel_id: "Canal",
  inviter_id: "Invitado por",
  uses: "Usos actuales",
  max_uses: "Usos máximos",
  max_age: "Caducidad",
  temporary: "Temporal",
  avatar_hash: "Avatar",
  icon_hash: "Icono",
  splash_hash: "Splash",
  banner_hash: "Banner",
  vanity_url_code: "URL vanity",
  preferred_locale: "Idioma",
  afk_channel_id: "Canal AFK",
  afk_timeout: "Timeout AFK",
  system_channel_id: "Canal de sistema",
  rules_channel_id: "Canal de reglas",
  public_updates_channel_id: "Canal de actualizaciones",
  mfa_level: "Nivel MFA",
  verification_level: "Verificación",
  explicit_content_filter: "Filtro de contenido",
  default_message_notifications: "Notificaciones",
  owner_id: "Propietario",
  id: "ID",
};

const CHANNEL_TYPES: Record<string, string> = {
  "0": "Texto",
  "1": "DM",
  "2": "Voz",
  "3": "Grupo DM",
  "4": "Categoría",
  "5": "Anuncios",
  "10": "Hilo de anuncio",
  "11": "Hilo público",
  "12": "Hilo privado",
  "13": "Escenario",
  "14": "Directorio",
  "15": "Foro",
  "16": "Media",
};

const PERMISSION_FLAGS: Array<{ bit: bigint; label: string }> = [
  { bit: 1n << 0n, label: "Crear invitaciones" },
  { bit: 1n << 1n, label: "Expulsar miembros" },
  { bit: 1n << 2n, label: "Banear miembros" },
  { bit: 1n << 3n, label: "Administrador" },
  { bit: 1n << 4n, label: "Gestionar canales" },
  { bit: 1n << 5n, label: "Gestionar servidor" },
  { bit: 1n << 6n, label: "Añadir reacciones" },
  { bit: 1n << 7n, label: "Ver registro de auditoría" },
  { bit: 1n << 10n, label: "Ver canal" },
  { bit: 1n << 11n, label: "Enviar mensajes" },
  { bit: 1n << 12n, label: "Enviar TTS" },
  { bit: 1n << 13n, label: "Gestionar mensajes" },
  { bit: 1n << 14n, label: "Insertar enlaces" },
  { bit: 1n << 15n, label: "Adjuntar archivos" },
  { bit: 1n << 16n, label: "Leer historial" },
  { bit: 1n << 17n, label: "Mencionar @everyone" },
  { bit: 1n << 18n, label: "Usar emojis externos" },
  { bit: 1n << 20n, label: "Conectar a voz" },
  { bit: 1n << 21n, label: "Hablar" },
  { bit: 1n << 22n, label: "Silenciar miembros" },
  { bit: 1n << 23n, label: "Ensordecer miembros" },
  { bit: 1n << 24n, label: "Mover miembros" },
  { bit: 1n << 27n, label: "Gestionar roles" },
  { bit: 1n << 28n, label: "Gestionar webhooks" },
  { bit: 1n << 29n, label: "Gestionar emojis" },
  { bit: 1n << 40n, label: "Moderar miembros" },
];

export type SheetLayoutMode = "create" | "update" | "delete";

function toTitleCaseFallback(key: string): string {
  return key
    .replace(/^\$/, "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function humanizePropertyKey(key: string): string {
  return PROPERTY_LABELS[key] ?? toTitleCaseFallback(key);
}

function decodePermissions(raw?: string): string {
  if (!raw || raw === "—" || raw === "0") return raw === "0" ? "Ninguno" : "—";
  try {
    const bits = BigInt(raw);
    const labels = PERMISSION_FLAGS.filter(
      (flag) => (bits & flag.bit) === flag.bit,
    ).map((flag) => flag.label);
    if (labels.length === 0) return raw;
    if (labels.length > 8) {
      return `${labels.slice(0, 8).join(", ")} (+${labels.length - 8})`;
    }
    return labels.join(", ");
  } catch {
    return raw;
  }
}

function formatIsoDate(raw?: string): string {
  if (!raw || raw === "—") return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatBoolean(raw: string): string {
  if (raw === "true") return "Activado";
  if (raw === "false") return "Desactivado";
  return raw;
}

function formatDurationSeconds(raw: string): string {
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds)) return raw;
  if (seconds === 0) return "Sin límite";
  if (seconds < 60) return `${seconds} segundos`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m} min ${s} s` : `${m} minutos`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} hora${h === 1 ? "" : "s"}`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d} día${d === 1 ? "" : "s"}`;
}

/** Humaniza un valor según la propiedad Discord. */
export function humanizePropertyValue(key: string, raw?: string): string {
  if (raw == null || raw === "" || raw === "—") return "—";

  if (key === "permissions" || key === "allow" || key === "deny") {
    return decodePermissions(raw);
  }
  if (key === "type") {
    return CHANNEL_TYPES[raw] ?? `Tipo ${raw}`;
  }
  if (key === "rate_limit_per_user") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return raw;
    if (n === 0) return "Desactivado";
    return `${n} segundos`;
  }
  if (key === "bitrate") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return raw;
    return `${Math.round(n / 1000)} kbps`;
  }
  if (key === "color" && /^\d+$/.test(raw)) {
    return `#${Number.parseInt(raw, 10).toString(16).padStart(6, "0")}`;
  }
  if (key === "communication_disabled_until" || key.endsWith("_until")) {
    return formatIsoDate(raw);
  }
  if (key === "max_age" || key === "afk_timeout") {
    return formatDurationSeconds(raw);
  }
  if (key === "max_uses" || key === "uses" || key === "user_limit") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n === 0 && key !== "uses") return "Ilimitado";
  }
  if (
    key === "nsfw" ||
    key === "hoist" ||
    key === "mentionable" ||
    key === "mute" ||
    key === "deaf" ||
    key === "temporary"
  ) {
    return formatBoolean(raw);
  }

  return raw;
}

export function resolveSheetLayoutMode(
  tone: DiscordAuditTone,
  actionKey?: string,
): SheetLayoutMode {
  if (tone === "create") return "create";
  if (tone === "delete") return "delete";
  if (actionKey?.includes("Create")) return "create";
  if (actionKey?.includes("Delete") || actionKey?.includes("Kick")) {
    return "delete";
  }
  return "update";
}

export interface DiffRow {
  key: string;
  label: string;
  oldDisplay: string;
  newDisplay: string;
  kind: "added" | "removed" | "changed" | "info";
}

export function buildChangeDiffRows(
  changes: DiscordAuditChangeItem[],
): DiffRow[] {
  return changes
    .filter((change) => change.key !== "$add" && change.key !== "$remove")
    .map((change) => {
      const label = humanizePropertyKey(change.key);
      const oldDisplay = humanizePropertyValue(change.key, change.oldValue);
      const newDisplay = humanizePropertyValue(change.key, change.newValue);

      let kind: DiffRow["kind"] = "changed";
      if (
        (!change.oldValue || change.oldValue === "—") &&
        change.newValue &&
        change.newValue !== "—"
      ) {
        kind = "added";
      } else if (
        change.oldValue &&
        change.oldValue !== "—" &&
        (!change.newValue || change.newValue === "—")
      ) {
        kind = "removed";
      }

      return { key: change.key, label, oldDisplay, newDisplay, kind };
    });
}

/** @deprecated usar humanizePropertyKey */
export function labelForChangeKey(key: string): string {
  return humanizePropertyKey(key);
}

/** @deprecated usar humanizePropertyValue */
export function formatChangeValue(key: string, raw?: string): string {
  return humanizePropertyValue(key, raw);
}
