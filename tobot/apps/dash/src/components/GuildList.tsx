import type { GuildDiscoveryItem } from "../lib/session-client";
import {
  discoveryExpiryLabel,
  installationLabel,
  installationView,
  isTenantId,
  projectionAgeLabel,
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

  return (
    <>
      <p className="text-sm text-zinc-600">
        Servers where you are the owner, an administrator, or can manage the
        server. Discord requires Manage Server to add an application.
      </p>
      <p className="mt-2 text-sm text-zinc-600">
        {discoveryExpiryLabel(nowUnix, expiresAtUnix)}
      </p>
      <ul className="mt-4 list-none p-0">
        {guilds.map((guild) => {
          const view = installationView({
            tenantId: guild.shell?.tenant_id ?? null,
            installationState: guild.shell?.installation_state ?? null,
            capabilities: null,
          });
          return (
            <li
              key={guild.provider_guild_id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-zinc-200 py-3"
            >
              <span className="font-medium">{guild.name}</span>
              <span className="text-sm text-zinc-600">{installationLabel(view)}</span>
              {guild.shell ? (
                <span className="w-full text-sm text-zinc-500">
                  {projectionAgeLabel(guild.shell.projection_age_seconds)}
                </span>
              ) : null}
              {view.kind === "not-enabled" ? (
                <button
                  className="border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  onClick={() => onInstall(guild.provider_guild_id)}
                  disabled={pendingGuildId === guild.provider_guild_id}
                >
                  Add to this server
                </button>
              ) : guild.shell && isTenantId(guild.shell.tenant_id) ? (
                <a
                  className="underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950"
                  href={`/guild/${guild.shell.tenant_id}`}
                >
                  Open
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
