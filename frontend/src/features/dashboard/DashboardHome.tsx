import type { HealthResponse } from "@adobos/shared";
import { getReadyModules, getSoonModules } from "@/lib/nav";
import { StatusIsland } from "@/features/dashboard/StatusIsland";

interface DashboardHomeProps {
  initialHealth?: HealthResponse | null;
}

export function DashboardHome({ initialHealth = null }: DashboardHomeProps) {
  const ready = getReadyModules();
  const soon = getSoonModules(6);

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
            Bienvenido
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Panel Adobos
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Gestiona mensajes, automatizaciones, moderación y plugins desde un
            solo lugar. El menú lateral agrupa todo el alcance del bot para
            crecer sin ruido.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <StatusIsland initialHealth={initialHealth} />

        <section className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
          <h2 className="font-display text-base font-semibold">
            Módulos listos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Funcionalidad disponible ahora mismo.
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

      <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
        <div>
          <h2 className="font-display text-base font-semibold">En el roadmap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ya visibles en el menú; la implementación llega por módulos.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {soon.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={`${item.href}-${item.label}`}
                href={item.href}
                className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="size-4 text-primary/80" aria-hidden />
                  {item.label}
                </span>
                {item.blurb && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.blurb}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
