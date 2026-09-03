import { useEffect, useState } from "react";
import { Activity, Bot, Loader2 } from "lucide-react";
import type { HealthResponse } from "@adobos/shared";
import { fetchHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: HealthResponse }
  | { kind: "error"; message: string };

interface StatusIslandProps {
  /** Datos ya resueltos en SSR de Astro (evita spinner eterno si falla la hidratación). */
  initialHealth?: HealthResponse | null;
}

export function StatusIsland({ initialHealth = null }: StatusIslandProps) {
  const [state, setState] = useState<LoadState>(() =>
    initialHealth ? { kind: "ok", data: initialHealth } : { kind: "loading" },
  );

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((data) => {
        if (!cancelled) setState({ kind: "ok", data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Conserva SSR si ya teníamos datos; solo muestra error si no hay nada
        setState((prev) =>
          prev.kind === "ok"
            ? prev
            : {
                kind: "error",
                message: error instanceof Error ? error.message : "Unknown error",
              },
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Activity className="size-4 text-primary" aria-hidden />
        System status
      </div>

      {state.kind === "loading" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking API…
        </p>
      )}

      {state.kind === "error" && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-400">
          Couldn't reach the API. Start the backend on port 3000.
          <span className="mt-1 block text-muted-foreground">{state.message}</span>
        </p>
      )}

      {state.kind === "ok" && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">API</dt>
            <dd className="mt-0.5 font-medium text-foreground">{state.data.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Uptime</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {Math.floor(state.data.uptime)}s
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Discord</dt>
            <dd
              className={cn(
                "mt-0.5 inline-flex items-center gap-2 font-medium",
                state.data.botReady
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              <Bot className="size-4" aria-hidden />
              {state.data.botReady ? "Connected" : "Disconnected / no token"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
