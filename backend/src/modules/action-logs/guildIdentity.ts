/** Snapshot de identidad del guild (campos que el staff ve en el stream). */
export interface GuildIdentitySnapshot {
  name: string;
  icon: string | null;
  banner: string | null;
  splash: string | null;
  description: string | null;
  vanityURLCode: string | null;
}

export interface GuildIdentityDiff {
  name: string;
  value: string;
}

function fmt(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  return t || "(none)";
}

/** Diff de nombre / icono / vanity / descripción. Vacío → no loguear. */
export function diffGuildIdentity(
  oldG: GuildIdentitySnapshot,
  newG: GuildIdentitySnapshot,
): GuildIdentityDiff[] {
  const diffs: GuildIdentityDiff[] = [];
  if (oldG.name !== newG.name) {
    diffs.push({
      name: "Name",
      value: `\`${oldG.name}\` ➔ \`${newG.name}\``,
    });
  }
  if (oldG.icon !== newG.icon) {
    diffs.push({ name: "Icon", value: "The server icon changed" });
  }
  if (oldG.banner !== newG.banner) {
    diffs.push({ name: "Banner", value: "The banner changed" });
  }
  if (oldG.splash !== newG.splash) {
    diffs.push({ name: "Invite splash", value: "The splash changed" });
  }
  if ((oldG.description ?? "") !== (newG.description ?? "")) {
    diffs.push({
      name: "Description",
      value: `${fmt(oldG.description)} ➔ ${fmt(newG.description)}`,
    });
  }
  if ((oldG.vanityURLCode ?? "") !== (newG.vanityURLCode ?? "")) {
    diffs.push({
      name: "Vanity",
      value: `${fmt(oldG.vanityURLCode)} ➔ ${fmt(newG.vanityURLCode)}`,
    });
  }
  return diffs;
}

export function snapshotGuildIdentity(guild: {
  name: string;
  icon: string | null;
  banner: string | null;
  splash: string | null;
  description: string | null;
  vanityURLCode: string | null;
}): GuildIdentitySnapshot {
  return {
    name: guild.name,
    icon: guild.icon,
    banner: guild.banner,
    splash: guild.splash,
    description: guild.description,
    vanityURLCode: guild.vanityURLCode,
  };
}
