import type { DiscordAuditChangeItem, DiscordAuditTone } from "@adobos/shared";

const PROPERTY_LABELS: Record<string, string> = {
  name: "Name",
  type: "Type",
  topic: "Topic / Description",
  nsfw: "Age restriction (NSFW)",
  rate_limit_per_user: "Slowmode",
  bitrate: "Bitrate",
  user_limit: "User limit",
  position: "Position",
  color: "Hex color",
  hoist: "Display separately",
  mentionable: "Mentionable",
  permissions: "Permissions",
  allow: "Allow",
  deny: "Deny",
  nick: "Nickname",
  mute: "Muted",
  deaf: "Deafened",
  communication_disabled_until: "Timeout",
  description: "Description",
  $add: "Roles added",
  $remove: "Roles removed",
  code: "Invite code",
  channel_id: "Channel",
  inviter_id: "Invited by",
  uses: "Current uses",
  max_uses: "Max uses",
  max_age: "Expiration",
  temporary: "Temporary",
  avatar_hash: "Avatar",
  icon_hash: "Icon",
  splash_hash: "Splash",
  banner_hash: "Banner",
  vanity_url_code: "Vanity URL",
  preferred_locale: "Language",
  afk_channel_id: "AFK channel",
  afk_timeout: "AFK timeout",
  system_channel_id: "System channel",
  rules_channel_id: "Rules channel",
  public_updates_channel_id: "Updates channel",
  mfa_level: "MFA level",
  verification_level: "Verification",
  explicit_content_filter: "Content filter",
  default_message_notifications: "Notifications",
  owner_id: "Owner",
  id: "ID",
};

const CHANNEL_TYPES: Record<string, string> = {
  "0": "Text",
  "1": "DM",
  "2": "Voice",
  "3": "Group DM",
  "4": "Category",
  "5": "Announcements",
  "10": "Announcement thread",
  "11": "Public thread",
  "12": "Private thread",
  "13": "Stage",
  "14": "Directory",
  "15": "Forum",
  "16": "Media",
};

const PERMISSION_FLAGS: Array<{ bit: bigint; label: string }> = [
  { bit: 1n << 0n, label: "Create invites" },
  { bit: 1n << 1n, label: "Kick members" },
  { bit: 1n << 2n, label: "Ban members" },
  { bit: 1n << 3n, label: "Administrator" },
  { bit: 1n << 4n, label: "Manage channels" },
  { bit: 1n << 5n, label: "Manage server" },
  { bit: 1n << 6n, label: "Add reactions" },
  { bit: 1n << 7n, label: "View audit log" },
  { bit: 1n << 10n, label: "View channel" },
  { bit: 1n << 11n, label: "Send messages" },
  { bit: 1n << 12n, label: "Send TTS messages" },
  { bit: 1n << 13n, label: "Manage messages" },
  { bit: 1n << 14n, label: "Embed links" },
  { bit: 1n << 15n, label: "Attach files" },
  { bit: 1n << 16n, label: "Read message history" },
  { bit: 1n << 17n, label: "Mention @everyone" },
  { bit: 1n << 18n, label: "Use external emoji" },
  { bit: 1n << 20n, label: "Connect to voice" },
  { bit: 1n << 21n, label: "Speak" },
  { bit: 1n << 22n, label: "Mute members" },
  { bit: 1n << 23n, label: "Deafen members" },
  { bit: 1n << 24n, label: "Move members" },
  { bit: 1n << 27n, label: "Manage roles" },
  { bit: 1n << 28n, label: "Manage webhooks" },
  { bit: 1n << 29n, label: "Manage emoji" },
  { bit: 1n << 40n, label: "Moderate members" },
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
  if (!raw || raw === "—" || raw === "0") return raw === "0" ? "None" : "—";
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
  return date.toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatBoolean(raw: string): string {
  if (raw === "true") return "Enabled";
  if (raw === "false") return "Disabled";
  return raw;
}

function formatDurationSeconds(raw: string): string {
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds)) return raw;
  if (seconds === 0) return "No limit";
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m} min ${s} s` : `${m} minutes`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** Humaniza un valor según la propiedad Discord. */
export function humanizePropertyValue(key: string, raw?: string): string {
  if (raw == null || raw === "" || raw === "—") return "—";

  if (key === "permissions" || key === "allow" || key === "deny") {
    return decodePermissions(raw);
  }
  if (key === "type") {
    return CHANNEL_TYPES[raw] ?? `Type ${raw}`;
  }
  if (key === "rate_limit_per_user") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return raw;
    if (n === 0) return "Disabled";
    return `${n} seconds`;
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
    if (Number.isFinite(n) && n === 0 && key !== "uses") return "Unlimited";
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
