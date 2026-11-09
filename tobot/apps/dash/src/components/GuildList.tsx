import type { GuildDiscoveryItem } from "../lib/session-client";
import {
  discoveryExpiryLabel,
  discoveryFreshness,
  guildGroup,
  guildIconUrl,
  installationLabel,
  installationView,
  isTenantId,
} from "../lib/shell-state";

type GuildListProps = {
  guilds: GuildDiscoveryItem[];
  expiresAtUnix: number;
  nowUnix: number;
  pendingGuildId: string | null;
  onInstall: (providerGuildId: string) => void;
};

export function GuildList({
  guilds,
  expiresAtUnix,
  nowUnix,
  pendingGuildId,
  onInstall,
}: GuildListProps) {
  if (guilds.length === 0) {
    return (
      <p className="text-zinc-700">
        No servers you can manage were observed. Discord requires Manage Server
        to add an application.
      </p>
    );
  }

  const withTobot: GuildDiscoveryItem[] = [];
  const withoutTobot: GuildDiscoveryItem[] = [];
  for (const guild of guilds) {
    const view = installationView({
      tenantId: guild.shell?.tenant_id ?? null,
      installationState: guild.shell?.installation_state ?? null,
      capabilities: null,
    });
    if (guildGroup(view) === "with") withTobot.push(guild);
    else withoutTobot.push(guild);
  }
  const stale = discoveryFreshness(nowUnix, expiresAtUnix) === "stale";

  return (
    <>
      <p className="text-sm text-zinc-600">
        Servers where you are the owner, an administrator, or can manage the
        server. Discord requires Manage Server to add an application.
      </p>
      {stale ? (
        <p className="mt-2 text-sm text-zinc-600">
          {discoveryExpiryLabel(nowUnix, expiresAtUnix)}
        </p>
      ) : null}
      {withTobot.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold">With Tobot</h2>
          <ul className="mt-2 list-none p-0">
            {withTobot.map((guild) => (
              <GuildRow
                key={guild.provider_guild_id}
                guild={guild}
                pendingGuildId={pendingGuildId}
                onInstall={onInstall}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {withoutTobot.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-semibold">Without Tobot</h2>
          <ul className="mt-2 list-none p-0">
            {withoutTobot.map((guild) => (
              <GuildRow
                key={guild.provider_guild_id}
                guild={guild}
                pendingGuildId={pendingGuildId}
                onInstall={onInstall}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function GuildRow({
  guild,
  pendingGuildId,
  onInstall,
}: {
  guild: GuildDiscoveryItem;
  pendingGuildId: string | null;
  onInstall: (providerGuildId: string) => void;
}) {
  const view = installationView({
    tenantId: guild.shell?.tenant_id ?? null,
    installationState: guild.shell?.installation_state ?? null,
    capabilities: null,
  });
  const icon = guildIconUrl(guild.provider_guild_id, guild.icon_hash ?? null);
  const health = guild.shell?.health_state;
  const showHealth = typeof health === "string" && health.length > 0 && health !== "Healthy";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-200 py-3">
      {icon ? (
        <img src={icon} alt="" width={32} height={32} className="h-8 w-8" />
      ) : (
        <span className="h-8 w-8 border border-zinc-200" aria-hidden="true" />
      )}
      <span className="font-medium">{guild.name}</span>
      <span className="text-sm text-zinc-600">{installationLabel(view)}</span>
      {showHealth ? <span className="text-sm text-zinc-800">{health}</span> : null}
      {view.kind === "not-enabled" ? (
        <button
          className="ml-auto border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:cursor-wait disabled:opacity-60"
          type="button"
          onClick={() => onInstall(guild.provider_guild_id)}
          disabled={pendingGuildId === guild.provider_guild_id}
        >
          Add to this server
        </button>
      ) : guild.shell && isTenantId(guild.shell.tenant_id) ? (
        <a
          className="ml-auto underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
          href={`/guild/${guild.shell.tenant_id}`}
        >
          Open
        </a>
      ) : null}
    </li>
  );
}
