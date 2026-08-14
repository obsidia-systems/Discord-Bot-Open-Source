import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Eraser,
  Gavel,
  Loader2,
  LogOut,
  Timer,
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
  { value: "60", label: "60 segundos" },
  { value: "300", label: "5 minutos" },
  { value: "3600", label: "1 hora" },
  { value: "86400", label: "1 día" },
  { value: "604800", label: "1 semana" },
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
}: {
  info: ModMemberInfoResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Cargando expediente…
      </div>
    );
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un usuario para ver su expediente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img
          src={info.avatarUrl}
          alt=""
          className="size-14 rounded-full object-cover ring-1 ring-border"
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
          <dt className="text-muted-foreground">Se unió</dt>
          <dd>
            {info.joinedAt
              ? new Date(info.joinedAt).toLocaleString("es-MX")
              : "—"}
          </dd>
        </div>
        {info.timedOutUntil ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Timeout hasta</dt>
            <dd>{new Date(info.timedOutUntil).toLocaleString("es-MX")}</dd>
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
          <p className="text-sm text-muted-foreground">Sin advertencias.</p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {info.warnings.map((warn) => (
              <li
                key={warn.id}
                className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
              >
                <p>{warn.reason}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(warn.createdAt).toLocaleString("es-MX")} · mod{" "}
                  {warn.moderatorId.slice(-4)}
                </p>
              </li>
            ))}
          </ul>
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
        Cargando canal…
      </div>
    );
  }

  if (!info) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un canal para ver su contexto.
      </p>
    );
  }

  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-muted-foreground">Canal</dt>
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
            ? "Desactivado"
            : `${info.slowmodeSeconds}s`}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">NSFW</dt>
        <dd>{info.nsfw ? "Sí" : "No"}</dd>
      </div>
      {info.topic ? (
        <div>
          <dt className="text-muted-foreground">Tema</dt>
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
          action === "untimeout")
      ) {
        const refreshed = await fetchModMemberInfo(memberOption.id).catch(
          () => null,
        );
        if (refreshed) setMemberInfo(refreshed);
      }
      if (
        channelOption &&
        (action === "slowmode" || action === "purge")
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
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  async function submitUserAction(): Promise<void> {
    if (!memberOption || !activeAction) return;
    if (!reason.trim()) {
      setFeedback({
        kind: "error",
        message: "La razón es obligatoria.",
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
        message: "Selecciona una plantilla de embed.",
      });
      return;
    }

    await runAction(activeAction, {
      action: activeAction,
      userId: memberOption.id,
      reason: reason.trim() || "Acción desde panel",
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
            <CardTitle>Herramientas de moderación</CardTitle>
            <CardDescription>
              Acciones en vivo vía Discord.js · Ban, kick, timeout, warn, purge.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs>
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger
                  active={tab === "usuarios"}
                  onClick={() => setTab("usuarios")}
                >
                  Usuarios
                </TabsTrigger>
                <TabsTrigger
                  active={tab === "canales"}
                  onClick={() => setTab("canales")}
                >
                  Canales
                </TabsTrigger>
                <TabsTrigger
                  active={tab === "sanciones"}
                  onClick={() => setTab("sanciones")}
                >
                  Sanciones Activas
                </TabsTrigger>
              </TabsList>

              {tab === "usuarios" && (
                <TabsContent className="space-y-5">
                  <AsyncSearchSelect
                    label="Buscar miembro"
                    placeholder="Nombre o ID de Discord…"
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
                            Acción: {activeAction}
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="mod-reason">Razón *</Label>
                            <Textarea
                              id="mod-reason"
                              value={reason}
                              rows={3}
                              disabled={busy}
                              placeholder="Motivo de la sanción…"
                              onChange={(event) =>
                                setReason(event.target.value)
                              }
                            />
                          </div>

                          {activeAction === "timeout" ? (
                            <div className="space-y-2">
                              <Label>Duración</Label>
                              <Select
                                value={timeoutSeconds}
                                disabled={busy}
                                onValueChange={setTimeoutSeconds}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Duración…" />
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
                              <Label>Borrar mensajes (días)</Label>
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
                                        ? "No borrar"
                                        : `${days} día${days > 1 ? "s" : ""}`}
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
                                  Notificación al Usuario (DM)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {activeAction === "kick"
                                    ? "En Kick se adjunta un invite de un solo uso al DM."
                                    : "Si el usuario tiene los DMs cerrados, la sanción se aplica igual."}
                                </p>
                              </div>

                              <Tabs>
                                <TabsList className="grid h-auto w-full grid-cols-3">
                                  <TabsTrigger
                                    active={dmMode === "none"}
                                    onClick={() => setDmMode("none")}
                                  >
                                    Sin DM
                                  </TabsTrigger>
                                  <TabsTrigger
                                    active={dmMode === "text"}
                                    onClick={() => setDmMode("text")}
                                  >
                                    Texto Simple
                                  </TabsTrigger>
                                  <TabsTrigger
                                    active={dmMode === "template"}
                                    onClick={() => setDmMode("template")}
                                  >
                                    Plantilla Embed
                                  </TabsTrigger>
                                </TabsList>

                                {dmMode === "text" ? (
                                  <TabsContent className="space-y-2 pt-3">
                                    <Label htmlFor="mod-dm-text">
                                      Mensaje DM
                                    </Label>
                                    <Textarea
                                      id="mod-dm-text"
                                      rows={3}
                                      disabled={busy}
                                      value={dmText}
                                      placeholder="Has recibido una sanción en {server}. Razón: {reason}"
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
                                    <Label>Plantilla</Label>
                                    <Select
                                      value={templateId || undefined}
                                      disabled={busy || templates.length === 0}
                                      onValueChange={setTemplateId}
                                    >
                                      <SelectTrigger>
                                        <SelectValue
                                          placeholder={
                                            templates.length === 0
                                              ? "No hay plantillas (créalas en Embeds)"
                                              : "Selecciona plantilla…"
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
                            Ejecutar {activeAction}
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
                    label="Buscar canal"
                    placeholder="Nombre o ID del canal…"
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
                          <p className="font-medium">Purge / limpiar mensajes</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="purge-limit">Cantidad (1–100)</Label>
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
                            Razón (auditoría)
                          </Label>
                          <Input
                            id="purge-reason"
                            value={reason}
                            disabled={busy}
                            placeholder="Limpieza desde panel…"
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
                              reason: reason.trim() || "Purge desde panel",
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
                          Ejecutar limpieza
                        </Button>
                      </div>

                      <div className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-primary" aria-hidden />
                          <p className="font-medium">Slowmode</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="slowmode-seconds">
                            Segundos (0–21600)
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
                              reason: reason.trim() || "Slowmode desde panel",
                              slowmodeSeconds:
                                Number.parseInt(slowmodeSeconds, 10) || 0,
                            });
                          }}
                        >
                          Aplicar slowmode
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>
              )}

              {tab === "sanciones" && (
                <TabsContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Lista en vivo de baneos y timeouts. Haz clic en una fila
                    para ver el expediente; usa el botón para revocar.
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
                  Contexto del canal
                </>
              ) : (
                <>
                  <UserX className="size-4" aria-hidden />
                  Expediente
                </>
              )}
            </CardTitle>
            <CardDescription>
              {tab === "canales"
                ? "Nombre y slowmode actual."
                : "Avatar, unión y warns previos."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tab === "canales" ? (
              <ChannelContextCard
                info={channelInfo}
                loading={loadingChannel}
              />
            ) : (
              <MemberDossier info={memberInfo} loading={loadingMember} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
