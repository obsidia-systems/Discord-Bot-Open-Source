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
        const match = data.guilds.find((g) => g.id === current);
        const pick = match ?? data.guilds[0];
        if (pick && pick.id !== current) setSelectedGuildId(pick.id);
        else if (pick) setSelectedGuildId(pick.id);
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
        <h2 className="font-display text-lg font-semibold">Sin servidores</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          No administras ningún servidor donde esté el bot, o te falta el
          permiso Gestionar servidor.
        </p>
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
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="border-b border-border/70 px-4 py-2 text-sm text-muted-foreground lg:px-8">
        Comprobando sesión…
      </div>
    );
  }

  const selected = getSelectedGuildId() ?? me.guilds[0]!.id;

  function onChange(guild: PanelMeGuild): void {
    setSelectedGuildId(guild.id);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/40 px-4 py-2 text-sm lg:px-8">
      <label className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-muted-foreground">Servidor</span>
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
              {guild.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {PLAN_TIER_LABEL[tier]}
        </span>
        <span className="truncate text-muted-foreground">{me.user.username}</span>
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
          Salir
        </button>
      </div>
    </div>
  );
}
