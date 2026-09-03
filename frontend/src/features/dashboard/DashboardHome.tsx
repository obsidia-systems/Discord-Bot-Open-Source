import type { HealthResponse } from "@adobos/shared";
import { StatusIsland } from "@/features/dashboard/StatusIsland";
import { getReadyModules } from "@/lib/nav";

interface DashboardHomeProps {
  initialHealth?: HealthResponse | null;
}

export function DashboardHome({ initialHealth = null }: DashboardHomeProps) {
  const ready = getReadyModules();

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-6 shadow-sm backdrop-blur-sm sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 size-48 rounded-full bg-[hsl(var(--ado-cyan)/0.14)] blur-3xl"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Welcome
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Adobos Panel
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Manage messages, automation, moderation and integrations from one
            place. The sidebar groups the bot's whole feature set so it can grow
            without clutter.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <StatusIsland initialHealth={initialHealth} />

        <section className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
          <h2 className="font-display text-base font-semibold">
            Ready modules
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Features available right now.
          </p>
          <ul className="mt-4 space-y-2">
            {ready.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-primary/25 hover:bg-primary/5"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground group-hover:text-primary">
                        {item.label}
                      </span>
                      {item.blurb && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.blurb}
                        </span>
                      )}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
