import { useEffect, useState } from "react";
import type { MeResponse, PanelMeGuild, PlanTier } from "@adobos/shared";
import { PLAN_TIER_LABEL } from "@adobos/shared";
import { fetchEntitlements } from "@/lib/api/entitlements";
import { fetchMe, logout } from "@/lib/api/me";
import {
  clearSelectedGuildId,
  getSelectedGuildId,
  setSelectedGuildId,
} from "@/lib/api/client";

export function AuthGate() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [empty, setEmpty] = useState(false);
  const [tier, setTier] = useState<PlanTier>("free");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchMe();
        if (cancelled) return;
        if (data.guilds.length === 0) {
          setEmpty(true);
          setMe(data);
          return;
        }
        const current = getSelectedGuildId();
        const withBot = data.guilds.filter((g) => g.botPresent);
        const match =
          data.guilds.find((g) => g.id === current && g.botPresent) ??
          withBot[0] ??
          data.guilds.find((g) => g.id === current) ??
          data.guilds[0];
        if (match) setSelectedGuildId(match.id);
        setMe(data);
        void fetchEntitlements()
          .then((ent) => {
            if (!cancelled) setTier(ent.tier);
          })
          .catch(() => undefined);
      } catch {
        if (!cancelled) window.location.assign("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (empty && me) {
    return (
      <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <h2 className="font-display text-lg font-semibold">No servers</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Add Adobos to a server where you can Manage Server. Discord will ask
          for the permissions; then come back and sign in with your account.
        </p>
        <a
          href="/auth/invite"
          className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Add to a server
        </a>
        <button
          type="button"
          className="text-sm text-primary underline"
          onClick={() => {
            void logout().finally(() => {
              clearSelectedGuildId();
              window.location.assign("/login");
            });
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="border-b border-border/70 px-4 py-2 text-sm text-muted-foreground lg:px-8">
        Checking session…
      </div>
    );
  }

  const selected = getSelectedGuildId() ?? me.guilds[0]!.id;

  const selectedGuild =
    me.guilds.find((g) => g.id === selected) ?? me.guilds[0]!;
  const selectedMissingBot = !selectedGuild.botPresent;

  function onChange(guild: PanelMeGuild): void {
    setSelectedGuildId(guild.id);
    window.location.reload();
  }

  return (
    <div className="border-b border-border/70 bg-card/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm lg:px-8">
        <label className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">Server</span>
          <select
            className="max-w-[16rem] truncate rounded-md border border-border bg-background px-2 py-1"
            value={selected}
            onChange={(event) => {
              const guild = me.guilds.find((g) => g.id === event.target.value);
              if (guild) onChange(guild);
            }}
          >
            {me.guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.botPresent ? guild.name : `${guild.name} (no bot)`}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/general/billing"
            className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            {PLAN_TIER_LABEL[tier]}
          </a>
          <span className="truncate text-muted-foreground">
            {me.user.username}
          </span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              void logout().finally(() => {
                clearSelectedGuildId();
                window.location.assign("/login");
              });
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      {selectedMissingBot ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-sm lg:px-8">
          <p className="text-muted-foreground">
            Adobos isn't in this server. Add it to use the dashboard.
          </p>
          <a
            href={`/auth/invite?guildId=${encodeURIComponent(selectedGuild.id)}`}
            className="font-semibold text-primary hover:underline"
          >
            Add to the server
          </a>
        </div>
      ) : null}
    </div>
  );
}
