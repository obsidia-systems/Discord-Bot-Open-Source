import type {
  CreateScheduledMessageRequest,
  EmbedTemplateSummary,
  GuildChannelAsset,
  GuildRoleAsset,
  ScheduledEmbedData,
  ScheduledFrequency,
  ScheduledFrequencyType,
  ScheduledMessage,
  ScheduledWeekday,
  UpdateScheduledMessageRequest,
} from "@adobos/shared";
import {
  DEFAULT_SCHEDULED_INTERVAL_MINUTES,
  SCHEDULED_MAX_INTERVAL_MINUTES,
  SCHEDULED_MIN_INTERVAL_MINUTES,
  defaultScheduledEmbedData,
  defaultScheduledFrequency,
  detectLocalTimezone,
  embedPayloadToScheduledEmbedData,
  formatScheduledFrequencySummary,
} from "@adobos/shared";
import {
  createScheduledMessage,
  deleteScheduledMessage,
  fetchEmbedTemplate,
  fetchGuildAssets,
  fetchScheduledMessages,
  listEmbedTemplates,
  resolvePublicAssetUrl,
  sendScheduledMessageNow,
  toggleScheduledMessage,
  updateScheduledMessage,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { useEntitlements } from "@/features/entitlements/useEntitlements";
import { TimezoneCombobox } from "@/features/scheduled-messages/TimezoneCombobox";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type BuilderTab = "list" | "builder";

const TEXT_CHANNEL_TYPES = new Set([0, 5]);

const FREQUENCY_LABELS: Record<ScheduledFrequencyType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  interval: "Interval",
  specific_date: "Specific date",
};

const WEEKDAY_OPTIONS: { value: ScheduledWeekday; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function emptyDraft(): {
  channelId: string;
  timezone: string;
  frequency: ScheduledFrequency;
  embedData: ScheduledEmbedData;
  content: string;
  pingRoleId: string | null;
  isActive: boolean;
} {
  return {
    channelId: "",
    timezone: detectLocalTimezone(),
    frequency: defaultScheduledFrequency(),
    embedData: defaultScheduledEmbedData(),
    content: "",
    pingRoleId: null,
    isActive: true,
  };
}

function formatRunAt(
  iso: string | null,
  timezone: string,
): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: timezone || "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function ScheduledEmbedPreview({
  embed,
  content,
  pingLabel,
}: {
  embed: ScheduledEmbedData;
  content?: string;
  pingLabel?: string | null;
}) {
  const previewImage = embed.imageUrl
    ? resolvePublicAssetUrl(embed.imageUrl)
    : null;
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1] shadow-sm">
      {pingLabel || content ? (
        <div className="space-y-1 border-b border-white/5 px-3 py-2">
          {pingLabel ? (
            <p className="text-sm font-medium text-[#dee0fc]">@{pingLabel}</p>
          ) : null}
          {content ? (
            <p className="whitespace-pre-wrap text-[#dbdee1]">{content}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: embed.color || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <p className="text-sm font-semibold text-white">
            {embed.title || "Untitled"}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
            {embed.description || "No description"}
          </p>
          {previewImage ? (
            <img
              src={previewImage}
              alt=""
              className="mt-1 max-h-48 w-full rounded object-cover"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toggleWeekday(
  days: ScheduledWeekday[],
  day: ScheduledWeekday,
): ScheduledWeekday[] {
  const set = new Set(days);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort((a, b) => a - b) as ScheduledWeekday[];
}

export function ScheduledDashboard() {
  const { limitOf, isUnlimited } = useEntitlements();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [templates, setTemplates] = useState<EmbedTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState<string>("none");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [tab, setTab] = useState<BuilderTab>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const scheduledCap = limitOf("scheduledMessages");
  const atScheduledLimit =
    !isUnlimited("scheduledMessages") && messages.length >= scheduledCap;

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const channelName = useCallback(
    (channelId: string) =>
      textChannels.find((ch) => ch.id === channelId)?.name ?? channelId,
    [textChannels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, assets, templatesRes] = await Promise.all([
        fetchScheduledMessages(),
        fetchGuildAssets(),
        listEmbedTemplates().catch(() => ({ templates: [] })),
      ]);
      setMessages(listRes.messages);
      setChannels(assets.channels);
      setRoles(assets.roles);
      setTemplates(templatesRes.templates);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't load Scheduled Messages.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    if (atScheduledLimit) {
      setError(
        `You've reached this plan's limit of ${scheduledCap} scheduled messages.`,
      );
      return;
    }
    setEditingId(null);
    setTemplateId("none");
    setDraft(emptyDraft());
    setTab("builder");
    setSuccess(null);
  };

  const openEdit = (message: ScheduledMessage) => {
    setEditingId(message.id);
    setTemplateId("none");
    setDraft({
      channelId: message.channelId,
      timezone: message.timezone || detectLocalTimezone(),
      frequency: { ...message.frequency, days: [...message.frequency.days] },
      embedData: { ...message.embedData },
      content: message.content,
      pingRoleId: message.pingRoleId,
      isActive: message.isActive,
    });
    setTab("builder");
    setSuccess(null);
  };

  const patchFrequency = (partial: Partial<ScheduledFrequency>) => {
    setDraft((prev) => ({
      ...prev,
      frequency: { ...prev.frequency, ...partial },
    }));
    setSuccess(null);
  };

  const patchEmbed = (partial: Partial<ScheduledEmbedData>) => {
    setDraft((prev) => ({
      ...prev,
      embedData: { ...prev.embedData, ...partial },
    }));
    setSuccess(null);
  };

  const loadTemplate = async (idValue: string) => {
    setTemplateId(idValue);
    if (idValue === "none") return;
    const id = Number.parseInt(idValue, 10);
    if (!Number.isFinite(id)) return;
    setLoadingTemplate(true);
    setError(null);
    try {
      const detail = await fetchEmbedTemplate(id);
      setDraft((prev) => ({
        ...prev,
        embedData: embedPayloadToScheduledEmbedData(detail.embedData),
      }));
      setSuccess(`Template "${detail.name}" loaded. You can edit it freely.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't load the template.",
      );
      setTemplateId("none");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const save = async () => {
    if (!draft.channelId) {
      setError("Select a destination channel.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId == null) {
        if (atScheduledLimit) {
          setError(
            `You've reached this plan's limit of ${scheduledCap} scheduled messages.`,
          );
          setSaving(false);
          return;
        }
        const body: CreateScheduledMessageRequest = {
          channelId: draft.channelId,
          timezone: draft.timezone,
          frequency: draft.frequency,
          embedData: draft.embedData,
          content: draft.content,
          pingRoleId: draft.pingRoleId,
          isActive: draft.isActive,
        };
        await createScheduledMessage(body);
        setSuccess("Schedule created.");
      } else {
        const body: UpdateScheduledMessageRequest = {
          channelId: draft.channelId,
          timezone: draft.timezone,
          frequency: draft.frequency,
          embedData: draft.embedData,
          content: draft.content,
          pingRoleId: draft.pingRoleId,
          isActive: draft.isActive,
        };
        await updateScheduledMessage(editingId, body);
        setSuccess("Schedule updated.");
      }
      await load();
      setTab("list");
      setEditingId(null);
      setTemplateId("none");
      setDraft(emptyDraft());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (message: ScheduledMessage, isActive: boolean) => {
    setTogglingId(message.id);
    setError(null);
    try {
      const res = await toggleScheduledMessage(message.id, isActive);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? res.message : m)),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't change the status.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const onSendNow = async (message: ScheduledMessage) => {
    setSendingId(message.id);
    setError(null);
    try {
      const res = await sendScheduledMessageNow(message.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? res.message : m)),
      );
      setSuccess("Message sent to the channel.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send now.",
      );
    } finally {
      setSendingId(null);
    }
  };

  const onDelete = async (message: ScheduledMessage) => {
    if (
      !window.confirm(
        `Delete "${message.label}"? This action can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteScheduledMessage(message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (editingId === message.id) {
        setEditingId(null);
        setDraft(emptyDraft());
      }
      setSuccess("Message deleted.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't delete.",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading Scheduled Messages…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />
      <ToastBanner
        variant="success"
        message={success}
        onDismiss={() => setSuccess(null)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
              <TabsTrigger
                type="button"
                active={tab === "list"}
                onClick={() => setTab("list")}
              >
                My Messages
              </TabsTrigger>
              <TabsTrigger
                type="button"
                active={tab === "builder"}
                onClick={() => {
                  if (tab !== "builder") openCreate();
                  else setTab("builder");
                }}
              >
                {editingId != null ? "Edit" : "Create/Edit"}
              </TabsTrigger>
            </TabsList>

            {tab === "list" ? (
              <TabsContent className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {messages.length === 0
                      ? "No schedules yet."
                      : `${messages.length}${isUnlimited("scheduledMessages") ? "" : ` / ${scheduledCap}`} message${messages.length === 1 ? "" : "s"}`}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openCreate}
                    disabled={atScheduledLimit}
                  >
                    <Plus className="size-4" aria-hidden />
                    New
                  </Button>
                </div>

                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
                    <CalendarClock
                      className="size-8 text-primary/70"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-foreground">
                      No scheduled messages
                    </p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Create announcements and reminders the bot will send
                      automatically on schedule.
                    </p>
                    <Button type="button" onClick={openCreate}>
                      Create message
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {messages.map((message) => (
                      <li key={message.id}>
                        <Card>
                          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-medium text-foreground">
                                  {message.label}
                                </p>
                                <Badge
                                  className={
                                    message.isActive
                                      ? "border-primary/40 bg-primary/15 text-primary"
                                      : undefined
                                  }
                                >
                                  {message.isActive ? "Active" : "Paused"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                #{channelName(message.channelId)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatScheduledFrequencySummary(
                                  message.frequency,
                                  message.timezone,
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Next:{" "}
                                {message.isActive
                                  ? formatRunAt(
                                      message.nextRunAt,
                                      message.timezone,
                                    )
                                  : "—"}
                                {" · "}
                                Last:{" "}
                                {formatRunAt(
                                  message.lastSentAt,
                                  message.timezone,
                                )}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={message.isActive}
                                  disabled={togglingId === message.id}
                                  onCheckedChange={(checked) =>
                                    void onToggle(message, checked)
                                  }
                                  aria-label={
                                    message.isActive
                                      ? "Disable message"
                                      : "Enable message"
                                  }
                                />
                                <span className="text-xs text-muted-foreground">
                                  {togglingId === message.id
                                    ? "…"
                                    : message.isActive
                                      ? "ON"
                                      : "OFF"}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={sendingId === message.id}
                                onClick={() => void onSendNow(message)}
                              >
                                {sendingId === message.id ? (
                                  <Loader2
                                    className="size-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Send className="size-3.5" aria-hidden />
                                )}
                                Send now
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(message)}
                              >
                                <Pencil className="size-3.5" aria-hidden />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void onDelete(message)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                                Delete
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            ) : (
              <TabsContent className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Destination and Schedule
                    </CardTitle>
                    <CardDescription>
                      Channel and automatic sending frequency.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Channel</Label>
                      <Select
                        value={draft.channelId || undefined}
                        onValueChange={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            channelId: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a channel" />
                        </SelectTrigger>
                        <SelectContent>
                          {textChannels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              #{ch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Frequency type</Label>
                        <Select
                          value={draft.frequency.type}
                          onValueChange={(value) =>
                            patchFrequency({
                              type: value as ScheduledFrequencyType,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              Object.keys(
                                FREQUENCY_LABELS,
                              ) as ScheduledFrequencyType[]
                            ).map((type) => (
                              <SelectItem key={type} value={type}>
                                {FREQUENCY_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Time</Label>
                        {draft.frequency.type === "interval" ? (
                          <p className="text-xs text-muted-foreground pt-2">
                            The interval doesn't use a fixed time.
                          </p>
                        ) : (
                          <Input
                            type="time"
                            step={60}
                            value={draft.frequency.time || "12:00"}
                            onChange={(e) =>
                              patchFrequency({
                                time: e.target.value || "12:00",
                              })
                            }
                          />
                        )}
                      </div>
                    </div>

                    {draft.frequency.type === "interval" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Every</Label>
                          <Input
                            type="number"
                            min={1}
                            max={SCHEDULED_MAX_INTERVAL_MINUTES}
                            value={
                              draft.frequency.everyMinutes % 60 === 0
                                ? draft.frequency.everyMinutes / 60
                                : draft.frequency.everyMinutes
                            }
                            onChange={(e) => {
                              const raw =
                                Number.parseInt(e.target.value, 10) || 1;
                              const inHours =
                                draft.frequency.everyMinutes % 60 === 0 &&
                                draft.frequency.everyMinutes >= 60;
                              patchFrequency({
                                everyMinutes: inHours
                                  ? raw * 60
                                  : raw,
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Unit</Label>
                          <Select
                            value={
                              draft.frequency.everyMinutes % 60 === 0 &&
                              draft.frequency.everyMinutes >= 60
                                ? "hours"
                                : "minutes"
                            }
                            onValueChange={(value) => {
                              const current = draft.frequency.everyMinutes;
                              if (value === "hours") {
                                const hours =
                                  current % 60 === 0
                                    ? current / 60
                                    : Math.max(1, Math.round(current / 60));
                                patchFrequency({
                                  everyMinutes: hours * 60,
                                });
                              } else {
                                const minutes =
                                  current % 60 === 0 && current >= 60
                                    ? Math.max(
                                        SCHEDULED_MIN_INTERVAL_MINUTES,
                                        current,
                                      )
                                    : current;
                                patchFrequency({ everyMinutes: minutes });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-[11px] text-muted-foreground sm:col-span-2">
                          Minimum {SCHEDULED_MIN_INTERVAL_MINUTES} minutes
                          (default{" "}
                          {DEFAULT_SCHEDULED_INTERVAL_MINUTES / 60} h). On
                          enabling it sends on the next tick and then every N.
                        </p>
                      </div>
                    ) : null}

                    {draft.frequency.type === "weekly" ? (
                      <div className="space-y-1.5">
                        <Label>Days of the week</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAY_OPTIONS.map((day) => {
                            const active = draft.frequency.days.includes(
                              day.value,
                            );
                            return (
                              <button
                                key={day.value}
                                type="button"
                                aria-pressed={active}
                                className={cn(
                                  "h-8 min-w-10 rounded-md border px-2 text-xs font-medium transition-colors",
                                  active
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                                )}
                                onClick={() =>
                                  patchFrequency({
                                    days: toggleWeekday(
                                      draft.frequency.days,
                                      day.value,
                                    ),
                                  })
                                }
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {draft.frequency.days.length === 0
                            ? "No selection = every day."
                            : "It will only send on the checked days."}
                        </p>
                      </div>
                    ) : null}

                    {draft.frequency.type === "monthly" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <div className="min-w-0">
                            <Label
                              htmlFor="scheduled-last-day"
                              className="text-sm font-medium"
                            >
                              Last day of the month
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              If off, day 31 adjusts to the last calendar day
                              (April → 30, February → 28/29).
                            </p>
                          </div>
                          <Switch
                            id="scheduled-last-day"
                            checked={draft.frequency.lastDayOfMonth}
                            onCheckedChange={(checked) =>
                              patchFrequency({ lastDayOfMonth: checked })
                            }
                          />
                        </div>
                        {draft.frequency.lastDayOfMonth ? null : (
                          <div className="space-y-1.5">
                            <Label>Day of the month</Label>
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={draft.frequency.dayOfMonth}
                              onChange={(e) =>
                                patchFrequency({
                                  dayOfMonth: Math.max(
                                    1,
                                    Math.min(
                                      31,
                                      Number.parseInt(e.target.value, 10) ||
                                        1,
                                    ),
                                  ),
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    ) : null}

                    {draft.frequency.type === "specific_date" ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={draft.frequency.date}
                            onChange={(e) =>
                              patchFrequency({
                                date: e.target.value || draft.frequency.date,
                              })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <div className="min-w-0">
                            <Label
                              htmlFor="scheduled-repeat-yearly"
                              className="text-sm font-medium"
                            >
                              Repeat yearly
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                              If on, the message is sent every year on this
                              date. If off, it's sent once and then disabled.
                            </p>
                          </div>
                          <Switch
                            id="scheduled-repeat-yearly"
                            checked={draft.frequency.repeatYearly}
                            onCheckedChange={(checked) =>
                              patchFrequency({ repeatYearly: checked })
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {draft.frequency.type === "interval" ? null : (
                      <>
                        <TimezoneCombobox
                          value={draft.timezone}
                          onChange={(timezone) =>
                            setDraft((prev) => ({ ...prev, timezone }))
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          The time is interpreted in the zone chosen for this
                          message (by default, your browser's).
                        </p>
                      </>
                    )}

                    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Active on save</p>
                        <p className="text-xs text-muted-foreground">
                          If OFF, it's saved paused (no sends).
                        </p>
                      </div>
                      <Switch
                        checked={draft.isActive}
                        onCheckedChange={(checked) =>
                          setDraft((prev) => ({
                            ...prev,
                            isActive: checked,
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Message Content
                    </CardTitle>
                    <CardDescription>
                      Mini embed that will be sent to the channel.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Load from template (Optional)</Label>
                      <Select
                        value={templateId}
                        onValueChange={(value) => void loadTemplate(value)}
                        disabled={loadingTemplate || templates.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              templates.length === 0
                                ? "No saved templates"
                                : "Select a template"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No template</SelectItem>
                          {templates.map((tpl) => (
                            <SelectItem key={tpl.id} value={String(tpl.id)}>
                              {tpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        {loadingTemplate
                          ? "Loading template…"
                          : "Fills in color, title, description, and image; then you can edit them."}
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                      <div className="space-y-1.5">
                        <Label>Color</Label>
                        <Input
                          type="color"
                          className="h-10 w-14 cursor-pointer p-1"
                          value={draft.embedData.color || "#5865F2"}
                          onChange={(e) =>
                            patchEmbed({ color: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Title</Label>
                        <Input
                          value={draft.embedData.title}
                          maxLength={256}
                          onChange={(e) =>
                            patchEmbed({ title: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea
                        rows={5}
                        value={draft.embedData.description}
                        maxLength={4000}
                        onChange={(e) =>
                          patchEmbed({ description: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Image URL (optional)</Label>
                      <Input
                        type="url"
                        placeholder="https://…"
                        value={draft.embedData.imageUrl ?? ""}
                        onChange={(e) =>
                          patchEmbed({
                            imageUrl: e.target.value.trim() || null,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Plain text (optional)</Label>
                      <Textarea
                        rows={3}
                        value={draft.content}
                        maxLength={2000}
                        placeholder="Message above the embed"
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            content: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Role ping (optional)</Label>
                      <Select
                        value={draft.pingRoleId || "none"}
                        onValueChange={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            pingRoleId: value === "none" ? null : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="No ping" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No ping</SelectItem>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              @{role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    Save Schedule
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setTab("list");
                      setEditingId(null);
                      setTemplateId("none");
                      setDraft(emptyDraft());
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <Card className="sticky top-4 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              Real-time embed
              {tab === "list" && messages[0]
                ? " (last message in the list)"
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduledEmbedPreview
              embed={
                tab === "builder"
                  ? draft.embedData
                  : (messages[0]?.embedData ?? defaultScheduledEmbedData())
              }
              content={
                tab === "builder"
                  ? draft.content
                  : (messages[0]?.content ?? "")
              }
              pingLabel={
                tab === "builder"
                  ? roles.find((r) => r.id === draft.pingRoleId)?.name
                  : roles.find((r) => r.id === messages[0]?.pingRoleId)?.name
              }
            />
            {tab === "builder" ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {formatScheduledFrequencySummary(
                  draft.frequency,
                  draft.timezone,
                )}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
