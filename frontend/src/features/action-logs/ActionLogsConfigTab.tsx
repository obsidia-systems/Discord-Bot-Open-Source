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
  isUnlimited,
} from "@adobos/shared";
import { useEntitlements } from "@/features/entitlements/useEntitlements";
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
import { ActionLogDiscordPreview } from "./ActionLogDiscordPreview";

const TEXT_CHANNEL_TYPES = new Set([0, 5, 15]);
const IGNORE_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15]); // + category + voice

interface ActionLogsConfigTabProps {
  config: ActionLogsConfig;
  channels: GuildChannelAsset[];
  roles: GuildRoleAsset[];
  dirty: boolean;
  saving: boolean;
  testing: boolean;
  /** Nombre webhook preview: `${apodo|username} Audit`. */
  webhookDisplayName?: string;
  /** Avatar del bot (servidor o global) para la preview. */
  webhookAvatarUrl?: string | null;
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
          <SelectValue placeholder="No channel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No channel</SelectItem>
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
    `${days} days`
  );
}

export function ActionLogsConfigTab({
  config,
  channels,
  roles,
  dirty,
  saving,
  testing,
  webhookDisplayName = "Adobos Audit",
  webhookAvatarUrl = null,
  onChange,
  onSave,
  onTest,
}: ActionLogsConfigTabProps) {
  const { limitOf, isUnlimited: unlimitedRetention } = useEntitlements();
  const maxRetention = limitOf("logRetentionDays");
  const retentionOptions = ACTION_LOG_RETENTION_OPTIONS.filter(
    (opt) =>
      unlimitedRetention("logRetentionDays") ||
      isUnlimited(maxRetention) ||
      opt.value <= maxRetention ||
      opt.value === config.dataRetentionDays,
  );
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
      `Messages: ${nameOf(config.channelsMapping.messages)}`,
      `Members: ${nameOf(config.channelsMapping.members)}`,
      `Roles: ${nameOf(config.channelsMapping.roles)}`,
      `Channels: ${nameOf(config.channelsMapping.channels)}`,
      `Invites: ${nameOf(config.channelsMapping.invites)}`,
      `Voice: ${nameOf(config.channelsMapping.voice)}`,
      `Assets: ${nameOf(config.channelsMapping.assets)}`,
      `Fallback: ${nameOf(config.globalChannelId)}`,
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
          <CardHeader>
            <CardTitle className="text-base">Channel routing</CardTitle>
            <CardDescription>
              Embeds are sent via webhook with the bot's nickname and avatar in this server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    mode: "SIMPLE" as const,
                    title: "Simple routing",
                    blurb: "A single global channel for all events.",
                  },
                  {
                    mode: "ADVANCED" as const,
                    title: "Advanced routing",
                    blurb: "7 channels: messages, members, roles, channels, voice, invites, and assets.",
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
                label="Global channel"
                value={config.globalChannelId}
                channels={textChannels}
                onChange={(globalChannelId) => patch({ globalChannelId })}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <ChannelSelect
                  id="map-messages"
                  label="Messages"
                  value={config.channelsMapping.messages}
                  channels={textChannels}
                  onChange={(id) => setMapping("messages", id)}
                />
                <ChannelSelect
                  id="map-members"
                  label="Members"
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
                  label="Channels"
                  value={config.channelsMapping.channels}
                  channels={textChannels}
                  onChange={(id) => setMapping("channels", id)}
                />
                <ChannelSelect
                  id="map-invites"
                  label="Invites"
                  value={config.channelsMapping.invites}
                  channels={textChannels}
                  onChange={(id) => setMapping("invites", id)}
                />
                <ChannelSelect
                  id="map-voice"
                  label="Voice"
                  value={config.channelsMapping.voice}
                  channels={textChannels}
                  onChange={(id) => setMapping("voice", id)}
                />
                <ChannelSelect
                  id="map-assets"
                  label="Assets"
                  value={config.channelsMapping.assets}
                  channels={textChannels}
                  onChange={(id) => setMapping("assets", id)}
                />
                <div className="sm:col-span-2">
                  <ChannelSelect
                    id="fallback-global"
                    label="Global fallback (if a category is missing)"
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
            <CardTitle className="text-base">Exclusion list</CardTitle>
            <CardDescription>
              Channels, categories, roles, and bots whose activity won't generate logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChannelMultiSelect
              id="ignored-channels"
              label="Ignored channels / categories"
              placeholder="Search channels or categories…"
              channels={ignoreChannels}
              value={config.ignoredChannels}
              onChange={(ignoredChannels) => patch({ ignoredChannels })}
              emptyHint="No channels or categories ignored."
            />
            <RoleMultiSelect
              id="ignored-roles"
              label="Ignored roles"
              roles={assignableRoles}
              value={config.ignoredRoles}
              onChange={(ignoredRoles) => patch({ ignoredRoles })}
              emptyHint="No roles ignored."
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Ignore bot actions</p>
                <p className="text-xs text-muted-foreground">
                  Don't log events whose executor is another bot.
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
            <CardTitle className="text-base">Data retention</CardTitle>
            <CardDescription>
              Auto-deletion of the history. The Free plan keeps 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="retention">Keep logs</Label>
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
                  {retentionOptions.map((opt) => {
                    const locked =
                      !isUnlimited(maxRetention) && opt.value > maxRetention;
                    return (
                      <SelectItem
                        key={opt.value}
                        value={String(opt.value)}
                        disabled={locked}
                      >
                        {opt.label}
                        {locked ? " (Pro)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active events</CardTitle>
            <CardDescription>
              Granular switches per event type.
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
                          {on}/{group.events.length} active
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
                          Enable all
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
                          Disable all
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
        <ActionLogDiscordPreview
          webhookDisplayName={webhookDisplayName}
          webhookAvatarUrl={webhookAvatarUrl}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configuration summary</CardTitle>
            <CardDescription>
              Live view of the form (before saving).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Overall status</span>
              <Badge
                className={
                  config.enabled
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : undefined
                }
              >
                {config.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground">Destination channels</p>
              <ul className="space-y-0.5 text-xs font-medium">
                {destinationLines.map((line) => (
                  <li key={line} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Events being watched</span>
              <span className="font-medium tabular-nums">
                {enabledCount} / {TOTAL_EVENT_COUNT}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Exclusions</span>
              <span className="text-right font-medium">
                {config.ignoredChannels.length} channel
                {config.ignoredChannels.length === 1 ? "" : "s"}
                {ignoredCategoryCount > 0
                  ? ` (${ignoredCategoryCount} cat.)`
                  : ""}
                , {config.ignoredRoles.length} role
                {config.ignoredRoles.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Retention</span>
              <span className="font-medium">
                {retentionLabel(config.dataRetentionDays)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Ignore bots</span>
              <span className="font-medium">
                {config.ignoreBots ? "Yes" : "No"}
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
              {saving ? "Loading…" : "Save configuration"}
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
              Send test embed
            </Button>

            {!dirty ? (
              <p className="text-center text-[11px] text-muted-foreground">
                No pending changes.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              Logs are sent via webhook with the name "
              {webhookDisplayName}" and the bot's profile avatar in this
              server. Messages outside the discord.js cache may not include the
              "Before" text.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
