import type {
  AutoModConfig,
  AutoModPunishmentAction,
  AutoModWarnDecayDays,
} from "@adobos/shared";
import {
  AUTO_MOD_DURATION_OPTIONS,
  AUTO_MOD_PUNISHMENT_ACTION_OPTIONS,
  AUTO_MOD_WARN_DECAY_OPTIONS,
  newAutoModPunishmentRow,
} from "@adobos/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { FilterToggle } from "./AutoModUi";

export function AutoModSanctionsTab({
  config,
  levelsEnabled,
  onPatch,
}: {
  config: AutoModConfig;
  levelsEnabled: boolean;
  onPatch: (partial: Partial<AutoModConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Caducidad de Warns</CardTitle>
          <CardDescription>
            Define cuánto tiempo un Warn cuenta como activo para futuros
            castigos automáticos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="warn-decay">Periodo de caducidad</Label>
            <Select
              value={String(config.warnDecayDays)}
              onValueChange={(value) =>
                onPatch({
                  warnDecayDays: Number(value) as AutoModWarnDecayDays,
                })
              }
            >
              <SelectTrigger id="warn-decay" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_MOD_WARN_DECAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Los Warns más antiguos a este periodo no sumarán para castigos
              automáticos, pero seguirán en el expediente histórico.
            </p>
          </div>
          <FilterToggle
            id="warnOnHit"
            label="Registrar warn al filtrar"
            description="Si está apagado, Auto-Mod solo bloquea el mensaje. El escalado no avanza."
            checked={config.warnOnHit !== false}
            onCheckedChange={(warnOnHit) => onPatch({ warnOnHit })}
          >
            <FilterToggle
              id="dmOnHit"
              label="Avisar por DM"
              description="Envía un mensaje privado cuando se registra el warn."
              checked={config.dmOnHit !== false}
              onCheckedChange={(dmOnHit) => onPatch({ dmOnHit })}
            />
          </FilterToggle>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Escalado de sanciones</CardTitle>
          <CardDescription>
            Al alcanzar exactamente N warns activos se ejecuta la acción.
            Integra castigos de Discord y de Rangos y XP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.punishments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin reglas todavía. Añade una sanción para empezar.
            </p>
          ) : null}

          {config.punishments.map((row, index) => (
            <div
              key={`${row.actionType}-${row.warnThreshold}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2.5"
            >
              <span className="text-sm text-muted-foreground">A los</span>
              <Input
                type="number"
                min={1}
                max={100}
                className="w-16"
                value={row.warnThreshold}
                onChange={(e) => {
                  const warnThreshold = Math.max(
                    1,
                    Math.min(100, Math.round(Number(e.target.value) || 1)),
                  );
                  onPatch({
                    punishments: config.punishments.map((p, i) =>
                      i === index ? { ...p, warnThreshold } : p,
                    ),
                  });
                }}
              />
              <span className="text-sm text-muted-foreground">Warns →</span>
              <Select
                value={row.actionType}
                onValueChange={(value) => {
                  const actionType = value as AutoModPunishmentAction;
                  let actionParam: number | null = null;
                  if (actionType === "TIMEOUT" || actionType === "XP_FREEZE") {
                    actionParam = AUTO_MOD_DURATION_OPTIONS[0]!.value;
                  } else if (actionType === "REMOVE_XP") {
                    actionParam = 100;
                  }
                  onPatch({
                    punishments: config.punishments.map((p, i) =>
                      i === index ? { ...p, actionType, actionParam } : p,
                    ),
                  });
                }}
              >
                <SelectTrigger className="w-[9.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_MOD_PUNISHMENT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {row.actionType === "TIMEOUT" ||
              row.actionType === "XP_FREEZE" ? (
                <Select
                  value={String(
                    row.actionParam ?? AUTO_MOD_DURATION_OPTIONS[0]!.value,
                  )}
                  onValueChange={(value) => {
                    const actionParam = Number(value);
                    onPatch({
                      punishments: config.punishments.map((p, i) =>
                        i === index ? { ...p, actionParam } : p,
                      ),
                    });
                  }}
                >
                  <SelectTrigger className="w-[8.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTO_MOD_DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {row.actionType === "REMOVE_XP" ? (
                <Input
                  type="number"
                  min={1}
                  className="w-28"
                  placeholder="XP"
                  value={row.actionParam ?? 100}
                  onChange={(e) => {
                    const actionParam = Math.max(
                      1,
                      Math.round(Number(e.target.value) || 1),
                    );
                    onPatch({
                      punishments: config.punishments.map((p, i) =>
                        i === index ? { ...p, actionParam } : p,
                      ),
                    });
                  }}
                />
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() =>
                  onPatch({
                    punishments: config.punishments.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onPatch({
                punishments: [...config.punishments, newAutoModPunishmentRow()],
              })
            }
          >
            <Plus className="size-4" />
            Añadir Sanción
          </Button>

          {!levelsEnabled ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Las sanciones de XP no tendrán efecto mientras el módulo de Rangos
              y XP esté apagado.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
