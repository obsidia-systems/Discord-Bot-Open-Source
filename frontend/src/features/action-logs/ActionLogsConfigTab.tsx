import { useMemo, useState } from "react";
import {
  Info,
  Loader2,
  Save,
  Send,
} from "lucide-react";
import type {
  ActionLogChannelsMapping,
  ActionLogEnabledEvents,
  ActionLogEventKey,
  ActionLogRoutingMode,
  ActionLogsConfig,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
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
import { EVENT_ACCORDION_GROUPS } from "./labels";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]); // text, announcement, forum
const IGNORE_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15]); // + voice/stage

interface ActionLogsConfigTabProps {
  config: ActionLogsConfig;
  channels: GuildChannelAsset[];
  roles: GuildRoleAsset[];
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

function countEnabled(events: ActionLogEnabledEvents): number {
  return Object.values(events).filter(Boolean).length;
}

export function ActionLogsConfigTab({
  config,
  channels,
  roles,
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
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
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

  const enabledCount = countEnabled(config.enabledEvents);
  const destinationLabel =
    config.routingMode === "GLOBAL"
      ? config.globalChannelId
        ? `#${textChannels.find((c) => c.id === config.globalChannelId)?.name ?? config.globalChannelId}`
        : "Sin canal"
      : "Por categoría";

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
            <CardTitle className="text-base">Canales de destino</CardTitle>
            <CardDescription>
              Enruta los embeds a un canal global o a canales por categoría.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    mode: "GLOBAL" as const,
                    title: "Canal único global",
                    blurb: "Todos los eventos al mismo canal.",
                  },
                  {
                    mode: "CATEGORY" as const,
                    title: "Canales por categoría",
                    blurb: "Mensajes, miembros, server y assets.",
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

            {config.routingMode === "GLOBAL" ? (
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
                  id="map-server"
                  label="Roles / canales"
                  value={config.channelsMapping.server}
                  channels={textChannels}
                  onChange={(id) => setMapping("server", id)}
                />
                <ChannelSelect
                  id="map-assets"
                  label="Recursos (emojis / stickers / sonidos)"
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
              Canales, roles y bots cuya actividad no generará logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChannelMultiSelect
              id="ignored-channels"
              label="Canales ignorados"
              channels={ignoreChannels}
              value={config.ignoredChannels}
              onChange={(ignoredChannels) => patch({ ignoredChannels })}
              emptyHint="Ningún canal ignorado."
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
                    <AccordionTrigger
                      open={open}
                      subtitle={`${on}/${group.events.length} activos`}
                      onClick={() =>
                        setOpenAccordion(open ? "" : group.id)
                      }
                    >
                      {group.title}
                    </AccordionTrigger>
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="gap-1.5"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar configuración
          </Button>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription>Estado actual antes de guardar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Módulo</span>
              <Badge
                className={
                  config.enabled
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : undefined
                }
              >
                {config.enabled ? "ON" : "OFF"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Enrutamiento</span>
              <span className="font-medium">{config.routingMode}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Destino</span>
              <span className="truncate font-medium">{destinationLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Eventos</span>
              <span className="font-medium">{enabledCount} activos</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Ignorados</span>
              <span className="font-medium">
                {config.ignoredChannels.length} ch · {config.ignoredRoles.length}{" "}
                roles
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
              variant="outline"
              className="mt-2 w-full gap-1.5"
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
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              Discord.js solo incluye el texto antiguo de un mensaje si estaba
              en caché. Mensajes previos al arranque del bot pueden aparecer
              sin contenido «Antes» en el historial y en los embeds.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
