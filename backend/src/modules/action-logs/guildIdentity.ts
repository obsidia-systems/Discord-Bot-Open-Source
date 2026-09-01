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
  return t || "(ninguno)";
}

/** Diff de nombre / icono / vanity / descripción. Vacío → no loguear. */
export function diffGuildIdentity(
  oldG: GuildIdentitySnapshot,
  newG: GuildIdentitySnapshot,
): GuildIdentityDiff[] {
  const diffs: GuildIdentityDiff[] = [];
  if (oldG.name !== newG.name) {
    diffs.push({
      name: "Nombre",
      value: `\`${oldG.name}\` ➔ \`${newG.name}\``,
    });
  }
  if (oldG.icon !== newG.icon) {
    diffs.push({ name: "Icono", value: "Cambió el icono del servidor" });
  }
  if (oldG.banner !== newG.banner) {
    diffs.push({ name: "Banner", value: "Cambió el banner" });
  }
  if (oldG.splash !== newG.splash) {
    diffs.push({ name: "Splash de invitación", value: "Cambió el splash" });
  }
  if ((oldG.description ?? "") !== (newG.description ?? "")) {
    diffs.push({
      name: "Descripción",
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
