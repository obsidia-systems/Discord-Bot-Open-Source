import { useMemo, useState } from "react";
import {
  Info,
  Loader2,
  Save,
  Send,
} from "lucide-react";
import type {
  ActionLogChannelsMapping,
  ActionLogEventKey,
  ActionLogRetentionDays,
  ActionLogRoutingMode,
  ActionLogsConfig,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import {
  ACTION_LOG_RETENTION_OPTIONS,
} from "@adobos/shared";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EVENT_ACCORDION_GROUPS, TOTAL_EVENT_COUNT } from "./labels";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const IGNORE_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15]); // + category + voice

interface ActionLogsConfigTabProps {
  config: ActionLogsConfig;
  channels: GuildChannelAsset[];
  roles: GuildRoleAsset[];
  dirty: boolean;
  saving: boolean;
  testing: boolean;
  onChange: (next: ActionLogsConfig) => void;
  onSave: () => void;
  onTest: () => void;
}

function ChannelSelect({
  id,
  label,
  value,
  channels,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string | null;
  channels: GuildChannelAsset[];
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Sin canal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Sin canal</SelectItem>
          {channels.map((ch) => (
            <SelectItem key={ch.id} value={ch.id}>
              #{ch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function retentionLabel(days: ActionLogRetentionDays): string {
  return (
    ACTION_LOG_RETENTION_OPTIONS.find((o) => o.value === days)?.label ??
    `${days} días`
  );
}

export function ActionLogsConfigTab({
  config,
  channels,
  roles,
  dirty,
  saving,
  testing,
  onChange,
  onSave,
  onTest,
}: ActionLogsConfigTabProps) {
  const [openAccordion, setOpenAccordion] = useState<string>("messages");

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const ignoreChannels = useMemo(
    () =>
      channels
        .filter((ch) => IGNORE_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => {
          const ac = a.type === 4 ? 0 : 1;
          const bc = b.type === 4 ? 0 : 1;
          if (ac !== bc) return ac - bc;
          return a.position - b.position || a.name.localeCompare(b.name);
        }),
    [channels],
  );

  const assignableRoles = useMemo(
    () =>
      roles
        .filter((r) => !r.managed && r.name !== "@everyone")
        .sort((a, b) => b.position - a.position),
    [roles],
  );

  function patch(partial: Partial<ActionLogsConfig>): void {
    onChange({ ...config, ...partial });
  }

  function setRoutingMode(mode: ActionLogRoutingMode): void {
    patch({ routingMode: mode });
  }

  function setMapping(
    key: keyof ActionLogChannelsMapping,
    channelId: string | null,
  ): void {
    patch({
      channelsMapping: { ...config.channelsMapping, [key]: channelId },
    });
  }

  function setEvent(key: ActionLogEventKey, enabled: boolean): void {
    patch({
      enabledEvents: { ...config.enabledEvents, [key]: enabled },
    });
  }

  function setGroupEvents(
    keys: ActionLogEventKey[],
    enabled: boolean,
  ): void {
    const next = { ...config.enabledEvents };
    for (const key of keys) next[key] = enabled;
    patch({ enabledEvents: next });
  }

  const enabledCount = Object.values(config.enabledEvents).filter(Boolean).length;

  const destinationLines = useMemo(() => {
    const nameOf = (id: string | null | undefined) =>
      id
        ? `#${textChannels.find((c) => c.id === id)?.name ?? id}`
        : "—";
    if (config.routingMode === "SIMPLE") {
      return [`Simple: ${nameOf(config.globalChannelId)}`];
    }
    return [
      `Mensajes: ${nameOf(config.channelsMapping.messages)}`,
      `Miembros: ${nameOf(config.channelsMapping.members)}`,
      `Roles: ${nameOf(config.channelsMapping.roles)}`,
      `Canales: ${nameOf(config.channelsMapping.channels)}`,
      `Voz: ${nameOf(config.channelsMapping.voice)}`,
      `Recursos: ${nameOf(config.channelsMapping.assets)}`,
      `Reserva: ${nameOf(config.globalChannelId)}`,
    ];
  }, [config, textChannels]);

  const ignoredCategoryCount = useMemo(
    () =>
      config.ignoredChannels.filter((id) =>
        ignoreChannels.some((ch) => ch.id === id && ch.type === 4),
      ).length,
    [config.ignoredChannels, ignoreChannels],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Estado del módulo</CardTitle>
                <CardDescription>
                  Activa Action Logs para capturar eventos de Discord.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="logs-enabled" className="text-sm">
                  {config.enabled ? "Habilitado" : "Deshabilitado"}
                </Label>
                <Switch
                  id="logs-enabled"
                  checked={config.enabled}
                  onCheckedChange={(enabled) => patch({ enabled })}
                />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enrutamiento de canales</CardTitle>
            <CardDescription>
              Los embeds salen por webhook «Adobos Audit» (identidad fija del bot).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    mode: "SIMPLE" as const,
                    title: "Enrutamiento simple",
                    blurb: "Un solo canal global para todos los eventos.",
                  },
                  {
                    mode: "ADVANCED" as const,
                    title: "Enrutamiento avanzado",
                    blurb: "6 canales: mensajes, miembros, roles, canales, voz y recursos.",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setRoutingMode(opt.mode)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    config.routingMode === opt.mode
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <p className="text-sm font-semibold">{opt.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {opt.blurb}
                  </p>
                </button>
              ))}
            </div>

            {config.routingMode === "SIMPLE" ? (
              <ChannelSelect
                id="global-channel"
                label="Canal global"
                value={config.globalChannelId}
                channels={textChannels}
                onChange={(globalChannelId) => patch({ globalChannelId })}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <ChannelSelect
                  id="map-messages"
                  label="Mensajes"
                  value={config.channelsMapping.messages}
                  channels={textChannels}
                  onChange={(id) => setMapping("messages", id)}
                />
                <ChannelSelect
                  id="map-members"
                  label="Miembros"
                  value={config.channelsMapping.members}
                  channels={textChannels}
                  onChange={(id) => setMapping("members", id)}
                />
                <ChannelSelect
                  id="map-roles"
                  label="Roles"
                  value={config.channelsMapping.roles}
                  channels={textChannels}
                  onChange={(id) => setMapping("roles", id)}
                />
                <ChannelSelect
                  id="map-channels"
                  label="Canales / invitaciones"
                  value={config.channelsMapping.channels}
                  channels={textChannels}
                  onChange={(id) => setMapping("channels", id)}
                />
                <ChannelSelect
                  id="map-voice"
                  label="Voz"
                  value={config.channelsMapping.voice}
                  channels={textChannels}
                  onChange={(id) => setMapping("voice", id)}
                />
                <ChannelSelect
                  id="map-assets"
                  label="Recursos"
                  value={config.channelsMapping.assets}
                  channels={textChannels}
                  onChange={(id) => setMapping("assets", id)}
                />
                <div className="sm:col-span-2">
                  <ChannelSelect
                    id="fallback-global"
                    label="Reserva global (si falta categoría)"
                    value={config.globalChannelId}
                    channels={textChannels}
                    onChange={(globalChannelId) => patch({ globalChannelId })}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lista de exclusión</CardTitle>
            <CardDescription>
              Canales, categorías, roles y bots cuya actividad no generará logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChannelMultiSelect
              id="ignored-channels"
              label="Canales / categorías ignorados"
              placeholder="Buscar canales o categorías…"
              channels={ignoreChannels}
              value={config.ignoredChannels}
              onChange={(ignoredChannels) => patch({ ignoredChannels })}
              emptyHint="Ningún canal ni categoría ignorados."
            />
            <RoleMultiSelect
              id="ignored-roles"
              label="Roles ignorados"
              roles={assignableRoles}
              value={config.ignoredRoles}
              onChange={(ignoredRoles) => patch({ ignoredRoles })}
              emptyHint="Ningún rol ignorado."
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Ignorar acciones de bots</p>
                <p className="text-xs text-muted-foreground">
                  No registrar eventos cuyo ejecutor sea otro bot.
                </p>
              </div>
              <Switch
                checked={config.ignoreBots}
                onCheckedChange={(ignoreBots) => patch({ ignoreBots })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retención de datos</CardTitle>
            <CardDescription>
              Auto-borrado del historial en SQLite del dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="retention">Conservar registros</Label>
              <Select
                value={String(config.dataRetentionDays)}
                onValueChange={(v) =>
                  patch({
                    dataRetentionDays: Number(v) as ActionLogRetentionDays,
                  })
                }
              >
                <SelectTrigger id="retention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_LOG_RETENTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos activos</CardTitle>
            <CardDescription>
              Switches granulares por tipo de evento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              {EVENT_ACCORDION_GROUPS.map((group) => {
                const open = openAccordion === group.id;
                const on = group.events.filter(
                  (e) => config.enabledEvents[e.key],
                ).length;
                return (
                  <AccordionItem key={group.id}>
                    <div className="flex items-start gap-2 px-4 py-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenAccordion(open ? "" : group.id)
                        }
                      >
                        <span className="block text-sm font-semibold">
                          {group.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {on}/{group.events.length} activos
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          className="text-[11px] font-medium text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupEvents(
                              group.events.map((ev) => ev.key),
                              true,
                            );
                          }}
                        >
                          Activar todo
                        </button>
                        <span className="text-[11px] text-muted-foreground">
                          |
                        </span>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupEvents(
                              group.events.map((ev) => ev.key),
                              false,
                            );
                          }}
                        >
                          Desactivar todo
                        </button>
                      </div>
                    </div>
                    <AccordionContent open={open}>
                      <div className="space-y-3">
                        {group.events.map((event) => (
                          <div
                            key={event.key}
                            className="flex items-center justify-between gap-3"
                          >
                            <Label
                              htmlFor={`evt-${event.key}`}
                              className="text-sm font-normal"
                            >
                              {event.label}
                            </Label>
                            <Switch
                              id={`evt-${event.key}`}
                              checked={Boolean(config.enabledEvents[event.key])}
                              onCheckedChange={(checked) =>
                                setEvent(event.key, checked)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <div className="sticky top-6 flex flex-col gap-4 self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monitor de estado</CardTitle>
            <CardDescription>
              Vista en vivo del formulario (antes de guardar).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Estado general</span>
              <Badge
                className={
                  config.enabled
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : undefined
                }
              >
                {config.enabled ? "Activo" : "Inactivo"}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Canales de destino</p>
              <ul className="space-y-0.5 text-xs font-medium">
                {destinationLines.map((line) => (
                  <li key={line} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Eventos en escucha</span>
              <span className="font-medium tabular-nums">
                {enabledCount} / {TOTAL_EVENT_COUNT}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Exclusiones</span>
              <span className="text-right font-medium">
                {config.ignoredChannels.length} canal
                {config.ignoredChannels.length === 1 ? "" : "es"}
                {ignoredCategoryCount > 0
                  ? ` (${ignoredCategoryCount} cat.)`
                  : ""}
                , {config.ignoredRoles.length} rol
                {config.ignoredRoles.length === 1 ? "" : "es"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Retención</span>
              <span className="font-medium">
                {retentionLabel(config.dataRetentionDays)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Ignorar bots</span>
              <span className="font-medium">
                {config.ignoreBots ? "Sí" : "No"}
              </span>
            </div>

            <Button
              type="button"
              className="mt-1 w-full gap-1.5"
              disabled={saving || !dirty}
              onClick={onSave}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {saving ? "Cargando…" : "Guardar configuración"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5"
              disabled={testing || saving}
              onClick={onTest}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar embed de prueba
            </Button>

            {!dirty ? (
              <p className="text-center text-[11px] text-muted-foreground">
                Sin cambios pendientes.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              Los logs se envían por webhook («Adobos Audit Log») con el avatar
              del ejecutor. Los mensajes fuera de caché de discord.js pueden no
              incluir el texto «Antes».
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
