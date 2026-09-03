import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Eraser,
  Gavel,
  Loader2,
  Lock,
  LogOut,
  Timer,
  Unlock,
  UserX,
  XCircle,
} from "lucide-react";
import type {
  EmbedTemplateSummary,
  ModActionType,
  ModChannelInfoResponse,
  ModMemberInfoResponse,
} from "@adobos/shared";
import {
  executeModAction,
  fetchModChannelInfo,
  fetchModMemberInfo,
  listEmbedTemplates,
  searchModChannels,
  searchModMembers,
} from "@/lib/api";
import {
  AsyncSearchSelect,
  type AsyncSelectOption,
} from "@/components/shared/AsyncSearchSelect";
import { ActiveSanctionsPanel } from "@/features/moderation/ActiveSanctionsPanel";
import { RoleColorBadge } from "@/components/shared/RoleColorDot";
import { UserAvatar } from "@/components/shared/UserAvatar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type MainTab = "usuarios" | "canales" | "sanciones";
type UserAction = Extract<
  ModActionType,
  "ban" | "kick" | "timeout" | "warn"
>;
type DmMode = "none" | "text" | "template";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const TIMEOUT_OPTIONS = [
  { value: "60", label: "60 seconds" },
  { value: "300", label: "5 minutes" },
  { value: "600", label: "10 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "1 week" },
] as const;

const USER_ACTIONS: Array<{
  id: UserAction;
  label: string;
  icon: typeof Ban;
  tone: string;
}> = [
  { id: "warn", label: "Warn", icon: AlertTriangle, tone: "border-amber-500/40" },
  { id: "timeout", label: "Timeout", icon: Timer, tone: "border-sky-500/40" },
  { id: "kick", label: "Kick", icon: LogOut, tone: "border-orange-500/40" },
  { id: "ban", label: "Ban", icon: Ban, tone: "border-red-500/40" },
];

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === "ok") {
    return (
      <p
        className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400"
        role="status"
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {feedback.message}
      </p>
    );
  }
  if (feedback.kind === "error") {
    return (
      <p
        className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400"
        role="alert"
      >
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {feedback.message}
      </p>
    );
  }
  return null;
}

function MemberDossier({
  info,
  loading,
  busy,
  onClearWarns,
}: {
  info: ModMemberInfoResponse | null;
  loading: boolean;
  busy: boolean;
  onClearWarns: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading record…
      </div>
    );
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a user to see their record.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          src={info.avatarUrl}
          name={info.displayName}
          className="size-14"
          fallbackClassName="text-sm"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold">
            {info.displayName}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            @{info.username}
          </p>
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono text-xs">{info.id}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Joined</dt>
          <dd>
            {info.joinedAt
              ? new Date(info.joinedAt).toLocaleString("en-US")
              : "—"}
          </dd>
        </div>
        {info.timedOutUntil ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Timeout until</dt>
            <dd>{new Date(info.timedOutUntil).toLocaleString("en-US")}</dd>
          </div>
        ) : null}
      </dl>

      {info.roles.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Roles
          </p>
          <div className="flex flex-wrap gap-1.5">
            {info.roles.map((role) => (
              <RoleColorBadge
                key={role.id}
                name={role.name}
                color={role.color}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Warns ({info.warnings.length})
        </p>
        {info.warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No warnings.</p>
        ) : (
          <>
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {info.warnings.map((warn) => (
                <li
                  key={warn.id}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
                >
                  <p>{warn.reason}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(warn.createdAt).toLocaleString("en-US")} · mod{" "}
                    {warn.moderatorId.slice(-4)}
                  </p>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onClearWarns}
            >
              Clear record
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ChannelContextCard({
  info,
  loading,
}: {
  info: ModChannelInfoResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading channel…
      </div>
    );
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a channel to see its context.
      </p>
    );
  }

  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-muted-foreground">Channel</dt>
        <dd className="font-display text-lg font-semibold">#{info.name}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">ID</dt>
        <dd className="font-mono text-xs">{info.id}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Slowmode</dt>
        <dd className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground" aria-hidden />
          {info.slowmodeSeconds === 0
            ? "Disabled"
            : `${info.slowmodeSeconds}s`}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">NSFW</dt>
        <dd>{info.nsfw ? "Yes" : "No"}</dd>
      </div>
      {info.topic ? (
        <div>
          <dt className="text-muted-foreground">Topic</dt>
          <dd className="mt-1 text-foreground/90">{info.topic}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ModerationTools() {
  const [tab, setTab] = useState<MainTab>("usuarios");
  const [memberOption, setMemberOption] = useState<AsyncSelectOption | null>(
    null,
  );
  const [channelOption, setChannelOption] =
    useState<AsyncSelectOption | null>(null);
  const [memberInfo, setMemberInfo] = useState<ModMemberInfoResponse | null>(
    null,
  );
  const [channelInfo, setChannelInfo] =
    useState<ModChannelInfoResponse | null>(null);
  const [loadingMember, setLoadingMember] = useState(false);
  const [loadingChannel, setLoadingChannel] = useState(false);

  const [activeAction, setActiveAction] = useState<UserAction | null>(null);
  const [reason, setReason] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState("300");
  const [deleteMessageDays, setDeleteMessageDays] = useState("0");
  const [purgeLimit, setPurgeLimit] = useState("20");
  const [slowmodeSeconds, setSlowmodeSeconds] = useState("0");
  const [dmMode, setDmMode] = useState<DmMode>("text");
  const [dmText, setDmText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<EmbedTemplateSummary[]>([]);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const busy = feedback.kind === "loading";
  const supportsDm =
    activeAction === "warn" ||
    activeAction === "timeout" ||
    activeAction === "kick" ||
    activeAction === "ban";

  const searchMembers = useCallback(async (q: string) => {
    const result = await searchModMembers(q);
    return result.members.map((member) => ({
      id: member.id,
      label: member.displayName || member.globalName || member.username,
      description: `@${member.username}${member.bot ? " · bot" : ""}`,
      meta: member.id,
      avatarUrl: member.avatarUrl,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listEmbedTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data.templates);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const searchChannels = useCallback(async (q: string) => {
    const result = await searchModChannels(q);
    return result.channels.map((channel) => ({
      id: channel.id,
      label: `#${channel.name}`,
      description: channel.id,
    }));
  }, []);

  useEffect(() => {
    if (!memberOption) {
      setMemberInfo(null);
      return;
    }
    let cancelled = false;
    setLoadingMember(true);
    void fetchModMemberInfo(memberOption.id)
      .then((info) => {
        if (!cancelled) setMemberInfo(info);
      })
      .catch(() => {
        if (!cancelled) setMemberInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingMember(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberOption]);

  useEffect(() => {
    if (!channelOption) {
      setChannelInfo(null);
      return;
    }
    let cancelled = false;
    setLoadingChannel(true);
    void fetchModChannelInfo(channelOption.id)
      .then((info) => {
        if (!cancelled) {
          setChannelInfo(info);
          setSlowmodeSeconds(String(info.slowmodeSeconds));
        }
      })
      .catch(() => {
        if (!cancelled) setChannelInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingChannel(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelOption]);

  async function runAction(
    action: ModActionType,
    payload: Parameters<typeof executeModAction>[0],
  ): Promise<void> {
    setFeedback({ kind: "loading" });
    try {
      const result = await executeModAction({ ...payload, action });
      setFeedback({ kind: "ok", message: result.message });
      if (
        memberOption &&
        (action === "warn" ||
          action === "timeout" ||
          action === "kick" ||
          action === "ban" ||
          action === "unban" ||
          action === "untimeout" ||
          action === "clearwarns")
      ) {
        const refreshed = await fetchModMemberInfo(memberOption.id).catch(
          () => null,
        );
        if (refreshed) setMemberInfo(refreshed);
      }
      if (
        channelOption &&
        (action === "slowmode" ||
          action === "purge" ||
          action === "lock" ||
          action === "unlock")
      ) {
        const refreshed = await fetchModChannelInfo(channelOption.id).catch(
          () => null,
        );
        if (refreshed) {
          setChannelInfo(refreshed);
          setSlowmodeSeconds(String(refreshed.slowmodeSeconds));
        }
      }
      if (action !== "purge" && action !== "slowmode") {
        setReason("");
        setActiveAction(null);
      }
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function submitUserAction(): Promise<void> {
    if (!memberOption || !activeAction) return;
    if (!reason.trim()) {
      setFeedback({
        kind: "error",
        message: "The reason is required.",
      });
      return;
    }

    const dmPayload =
      dmMode === "none"
        ? { dmMode: "none" as const }
        : dmMode === "template"
          ? {
              dmMode: "template" as const,
              templateId: Number.parseInt(templateId, 10),
            }
          : {
              dmMode: "text" as const,
              dmText: dmText.trim(),
            };

    if (
      supportsDm &&
      dmMode === "template" &&
      !Number.isFinite(Number.parseInt(templateId, 10))
    ) {
      setFeedback({
        kind: "error",
        message: "Select an embed template.",
      });
      return;
    }

    await runAction(activeAction, {
      action: activeAction,
      userId: memberOption.id,
      reason: reason.trim() || "Action from dashboard",
      durationSeconds:
        activeAction === "timeout"
          ? Number.parseInt(timeoutSeconds, 10)
          : undefined,
      deleteMessageDays:
        activeAction === "ban"
          ? Number.parseInt(deleteMessageDays, 10)
          : undefined,
      ...dmPayload,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Moderation tools</CardTitle>
            <CardDescription>
              Live actions · Ban, kick, timeout, warn, purge, lock.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs>
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger
                  active={tab === "usuarios"}
                  onClick={() => setTab("usuarios")}
                >
                  Users
                </TabsTrigger>
                <TabsTrigger
                  active={tab === "canales"}
                  onClick={() => setTab("canales")}
                >
                  Channels
                </TabsTrigger>
                <TabsTrigger
                  active={tab === "sanciones"}
                  onClick={() => setTab("sanciones")}
                >
                  Active sanctions
                </TabsTrigger>
              </TabsList>

              {tab === "usuarios" && (
                <TabsContent className="space-y-5">
                  <AsyncSearchSelect
                    label="Search member"
                    placeholder="Discord name or ID…"
                    value={memberOption}
                    onChange={(next) => {
                      setMemberOption(next);
                      setActiveAction(null);
                      setFeedback({ kind: "idle" });
                    }}
                    onSearch={searchMembers}
                    debounceMs={300}
                    minQueryLength={0}
                    disabled={busy}
                  />

                  {memberOption ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {USER_ACTIONS.map((item) => {
                          const Icon = item.icon;
                          const active = activeAction === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={busy}
                              className={cn(
                                "flex flex-col items-center gap-1.5 rounded-lg border bg-muted/20 px-2 py-3 text-xs font-medium transition-colors hover:bg-muted/40",
                                item.tone,
                                active && "border-primary bg-primary/10",
                              )}
                              onClick={() =>
                                setActiveAction((prev) =>
                                  prev === item.id ? null : item.id,
                                )
                              }
                            >
                              <Icon className="size-4" aria-hidden />
                              {item.label}
                            </button>
                          );
                        })}
                      </div>

                      {activeAction ? (
                        <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
                          <p className="text-sm font-medium capitalize">
                            Action: {activeAction}
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="mod-reason">Reason *</Label>
                            <Textarea
                              id="mod-reason"
                              value={reason}
                              rows={3}
                              disabled={busy}
                              placeholder="Reason for the sanction…"
                              onChange={(event) =>
                                setReason(event.target.value)
                              }
                            />
                          </div>

                          {activeAction === "timeout" ? (
                            <div className="space-y-2">
                              <Label>Duration</Label>
                              <Select
                                value={timeoutSeconds}
                                disabled={busy}
                                onValueChange={setTimeoutSeconds}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Duration…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIMEOUT_OPTIONS.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}

                          {activeAction === "ban" ? (
                            <div className="space-y-2">
                              <Label>Delete messages (days)</Label>
                              <Select
                                value={deleteMessageDays}
                                disabled={busy}
                                onValueChange={setDeleteMessageDays}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[0, 1, 3, 7].map((days) => (
                                    <SelectItem
                                      key={days}
                                      value={String(days)}
                                    >
                                      {days === 0
                                        ? "Don't delete"
                                        : `${days} day${days > 1 ? "s" : ""}`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}

                          {supportsDm ? (
                            <div className="space-y-3 rounded-md border border-border/80 bg-background/40 p-3">
                              <div>
                                <p className="text-sm font-medium">
                                  User notification (DM)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {activeAction === "kick"
                                    ? "For Kick, a single-use invite is attached to the DM."
                                    : "If the user has DMs disabled, the sanction still applies."}
                                </p>
                              </div>

                              <Tabs>
                                <TabsList className="grid h-auto w-full grid-cols-3">
                                  <TabsTrigger
                                    active={dmMode === "none"}
                                    onClick={() => setDmMode("none")}
                                  >
                                    No DM
                                  </TabsTrigger>
                                  <TabsTrigger
                                    active={dmMode === "text"}
                                    onClick={() => setDmMode("text")}
                                  >
                                    Plain text
                                  </TabsTrigger>
                                  <TabsTrigger
                                    active={dmMode === "template"}
                                    onClick={() => setDmMode("template")}
                                  >
                                    Embed template
                                  </TabsTrigger>
                                </TabsList>

                                {dmMode === "text" ? (
                                  <TabsContent className="space-y-2 pt-3">
                                    <Label htmlFor="mod-dm-text">
                                      DM message
                                    </Label>
                                    <Textarea
                                      id="mod-dm-text"
                                      rows={3}
                                      disabled={busy}
                                      value={dmText}
                                      placeholder="You've received a sanction in {server}. Reason: {reason}"
                                      onChange={(event) =>
                                        setDmText(event.target.value)
                                      }
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                      Variables: {"{user}"}, {"{reason}"},{" "}
                                      {"{moderator}"}, {"{server}"}, {"{action}"}
                                    </p>
                                  </TabsContent>
                                ) : null}

                                {dmMode === "template" ? (
                                  <TabsContent className="space-y-2 pt-3">
                                    <Label>Template</Label>
                                    <Select
                                      value={templateId || undefined}
                                      disabled={busy || templates.length === 0}
                                      onValueChange={setTemplateId}
                                    >
                                      <SelectTrigger>
                                        <SelectValue
                                          placeholder={
                                            templates.length === 0
                                              ? "No templates (create them in Embeds)"
                                              : "Select a template…"
                                          }
                                        />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {templates.map((template) => (
                                          <SelectItem
                                            key={template.id}
                                            value={String(template.id)}
                                          >
                                            {template.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TabsContent>
                                ) : null}
                              </Tabs>
                            </div>
                          ) : null}

                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              void submitUserAction();
                            }}
                          >
                            {busy ? (
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <Gavel className="size-4" aria-hidden />
                            )}
                            Run {activeAction}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </TabsContent>
              )}

              {tab === "canales" && (
                <TabsContent className="space-y-5">
                  <AsyncSearchSelect
                    label="Search channel"
                    placeholder="Channel name or ID…"
                    value={channelOption}
                    onChange={(next) => {
                      setChannelOption(next);
                      setFeedback({ kind: "idle" });
                    }}
                    onSearch={searchChannels}
                    disabled={busy}
                  />

                  {channelOption ? (
                    <div className="space-y-5">
                      <div className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2">
                          <Eraser className="size-4 text-primary" aria-hidden />
                          <p className="font-medium">Purge / clear messages</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="purge-limit">Amount (1–100)</Label>
                          <Input
                            id="purge-limit"
                            type="number"
                            min={1}
                            max={100}
                            value={purgeLimit}
                            disabled={busy}
                            onChange={(event) =>
                              setPurgeLimit(event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="purge-reason">
                            Reason (audit)
                          </Label>
                          <Input
                            id="purge-reason"
                            value={reason}
                            disabled={busy}
                            placeholder="Cleanup from dashboard…"
                            onChange={(event) =>
                              setReason(event.target.value)
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void runAction("purge", {
                              action: "purge",
                              channelId: channelOption.id,
                              reason: reason.trim() || "Purge from dashboard",
                              purgeLimit: Number.parseInt(purgeLimit, 10) || 10,
                            });
                          }}
                        >
                          {busy ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Eraser className="size-4" aria-hidden />
                          )}
                          Run cleanup
                        </Button>
                      </div>

                      <div className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-primary" aria-hidden />
                          <p className="font-medium">Slowmode</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="slowmode-seconds">
                            Seconds (0–21600)
                          </Label>
                          <Input
                            id="slowmode-seconds"
                            type="number"
                            min={0}
                            max={21600}
                            value={slowmodeSeconds}
                            disabled={busy}
                            onChange={(event) =>
                              setSlowmodeSeconds(event.target.value)
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            void runAction("slowmode", {
                              action: "slowmode",
                              channelId: channelOption.id,
                              reason: reason.trim() || "Slowmode from dashboard",
                              slowmodeSeconds:
                                Number.parseInt(slowmodeSeconds, 10) || 0,
                            });
                          }}
                        >
                          Apply slowmode
                        </Button>
                      </div>

                      <div className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2">
                          <Lock className="size-4 text-primary" aria-hidden />
                          <p className="font-medium">Lock channel</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Removes @everyone's permission to send messages. Unlock
                          restores it.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              void runAction("lock", {
                                action: "lock",
                                channelId: channelOption.id,
                                reason: reason.trim() || "Lock from dashboard",
                              });
                            }}
                          >
                            <Lock className="size-4" aria-hidden />
                            Lock
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              void runAction("unlock", {
                                action: "unlock",
                                channelId: channelOption.id,
                                reason: reason.trim() || "Unlock from dashboard",
                              });
                            }}
                          >
                            <Unlock className="size-4" aria-hidden />
                            Unlock
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>
              )}

              {tab === "sanciones" && (
                <TabsContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Live list of bans and timeouts. Click a row to see the
                    record; use the button to revoke.
                  </p>
                  <ActiveSanctionsPanel
                    selectedUserId={memberOption?.id ?? null}
                    disabled={busy}
                    onSelectUser={(user) => {
                      setMemberOption({
                        id: user.id,
                        label: user.label,
                        description: user.description,
                        avatarUrl: user.avatarUrl,
                      });
                      setActiveAction(null);
                      setFeedback({ kind: "idle" });
                    }}
                  />
                </TabsContent>
              )}
            </Tabs>

            <div className="mt-5">
              <FeedbackBanner feedback={feedback} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {tab === "canales" ? (
                <>
                  <Clock className="size-4" aria-hidden />
                  Channel context
                </>
              ) : (
                <>
                  <UserX className="size-4" aria-hidden />
                  Record
                </>
              )}
            </CardTitle>
            <CardDescription>
              {tab === "canales"
                ? "Current name and slowmode."
                : "Avatar, join date, and previous warns."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tab === "canales" ? (
              <ChannelContextCard
                info={channelInfo}
                loading={loadingChannel}
              />
            ) : (
              <MemberDossier
                info={memberInfo}
                loading={loadingMember}
                busy={busy}
                onClearWarns={() => {
                  if (!memberOption) return;
                  void runAction("clearwarns", {
                    action: "clearwarns",
                    userId: memberOption.id,
                    reason: "Clear warns from dashboard",
                  });
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
