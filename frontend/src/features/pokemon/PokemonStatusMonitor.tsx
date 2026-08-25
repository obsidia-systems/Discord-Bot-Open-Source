import type { PokemonConfig } from "@adobos/shared";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PokemonStatusMonitor({
  config,
  className,
}: {
  config: PokemonConfig;
  className?: string;
}) {
  const enabledCommands = Object.entries(config.commands).filter(
    ([, on]) => on,
  ).length;
  const totalCommands = Object.keys(config.commands).length;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Monitor de estado</CardTitle>
        <CardDescription>
          Resumen en vivo de la configuración del plugin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <StatusRow
          label="Plugin"
          value={config.isActive ? "Activo" : "Inactivo"}
          tone={config.isActive ? "ok" : "off"}
        />
        <StatusRow
          label="Modo sigilo"
          value={config.forceEphemeral ? "Encendido" : "Apagado"}
          tone={config.forceEphemeral ? "warn" : "muted"}
        />
        <StatusRow label="Generación" value={`Gen ${config.defaultGeneration}`} />
        <StatusRow
          label="Idioma API"
          value={config.language === "es" ? "Español" : "English"}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Color embeds</span>
          <span className="inline-flex items-center gap-2 font-medium">
            <span
              className="size-4 rounded border border-border"
              style={{ backgroundColor: config.embedColor }}
              aria-hidden
            />
            {config.embedColor}
          </span>
        </div>
        <StatusRow
          label="Canales"
          value={
            config.allowedChannels.length === 0
              ? "Todos"
              : `${config.allowedChannels.length} en lista blanca`
          }
        />
        <StatusRow
          label="Comandos"
          value={`${enabledCommands}/${totalCommands} activos`}
        />
      </CardContent>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "off" | "warn" | "muted";
}) {
  const badgeClass =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300"
        : tone === "off"
          ? "border-border bg-muted text-muted-foreground"
          : undefined;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {badgeClass ? (
        <Badge variant="outline" className={badgeClass}>
          {value}
        </Badge>
      ) : (
        <span className="font-medium">{value}</span>
      )}
    </div>
  );
}
