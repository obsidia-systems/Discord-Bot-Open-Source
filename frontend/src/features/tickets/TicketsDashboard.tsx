import type {
  GuildChannelAsset,
  GuildRoleAsset,
  TicketButtonStyle,
  TicketDetail,
  TicketPanel,
  TicketPanelButton,
  TicketSettings,
  TicketStatus,
  TicketSummary,
} from "@adobos/shared";
import {
  TICKET_BUTTON_STYLES,
  TICKET_EVENT_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_STATUSES,
  defaultTicketPanelButton,
} from "@adobos/shared";
import {
  addTicketUser,
  claimTicket,
  closeTicket,
  createTicketPanel,
  deleteTicketPanel,
  fetchGuildAssets,
  fetchTicketDetail,
  fetchTicketPanels,
  fetchTicketSettings,
  fetchTickets,
  publishTicketPanel,
  removeTicketUser,
  reopenTicket,
  saveTicketPanel,
  saveTicketSettings,
  unclaimTicket,
  unwaitTicket,
  waitTicket,
} from "@/lib/api";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
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
import { Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type TicketsTab = "inbox" | "panels" | "settings";

const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const CATEGORY_TYPE = 4;

function ChannelSelect({
  id,
  label,
  value,
  channels,
  onChange,
  allowEmpty = true,
}: {
  id: string;
  label: string;
  value: string | null;
  channels: GuildChannelAsset[];
  onChange: (next: string | null) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Seleccionar…" />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? (
            <SelectItem value="__none__">Ninguno</SelectItem>
          ) : null}
          {channels.map((ch) => (
            <SelectItem key={ch.id} value={ch.id}>
              {ch.type === CATEGORY_TYPE ? ch.name : `#${ch.name}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function statusBadgeClass(status: TicketStatus): string {
  if (status === "open") return "border-sky-500/40 text-sky-300";
  if (status === "claimed") return "border-emerald-500/40 text-emerald-300";
  if (status === "waiting") return "border-amber-500/40 text-amber-300";
  return "border-zinc-500/40 text-zinc-400";
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TicketsDashboard({
  initialTab = "inbox",
}: {
  initialTab?: TicketsTab;
}) {
  const [tab, setTab] = useState<TicketsTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [settings, setSettings] = useState<TicketSettings | null>(null);
  const [panels, setPanels] = useState<TicketPanel[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);

  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [typeFilter, setTypeFilter] = useState("");
  const [openerFilter, setOpenerFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [addUserId, setAddUserId] = useState("");

  const categories = useMemo(
    () =>
      channels
        .filter((ch) => ch.type === CATEGORY_TYPE)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );
  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => TEXT_CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const loadInbox = useCallback(async () => {
    const list = await fetchTickets({
      status: statusFilter,
      typeKey: typeFilter,
      openerId: openerFilter,
      claimedBy: staffFilter,
    });
    setTickets(list.tickets);
  }, [statusFilter, typeFilter, openerFilter, staffFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assets, cfg, panelList] = await Promise.all([
        fetchGuildAssets(),
        fetchTicketSettings(),
        fetchTicketPanels(),
      ]);
      setChannels(assets.channels);
      setRoles(assets.roles);
      setSettings(cfg.settings);
      setPanels(panelList.panels);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cargar Tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !settings) return;
    void loadInbox().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja.");
    });
  }, [loadInbox, loading, settings]);

  async function withBusy(fn: () => Promise<void>, ok?: string): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      if (ok) setSuccess(ok);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: number): Promise<void> {
    setError(null);
    try {
      const res = await fetchTicketDetail(id);
      setDetail(res.ticket);
      setCloseReason("");
      setAddUserId("");
      setDetailOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el ticket.");
    }
  }

  async function refreshDetail(id: number): Promise<void> {
    const res = await fetchTicketDetail(id);
    setDetail(res.ticket);
    await loadInbox();
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando Tickets…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <ToastBanner
          variant="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      ) : null}
      {success ? (
        <ToastBanner
          variant="success"
          message={success}
          onDismiss={() => setSuccess(null)}
        />
      ) : null}

      <Tabs>
        <TabsList>
          <TabsTrigger
            active={tab === "inbox"}
            onClick={() => setTab("inbox")}
          >
            Bandeja
          </TabsTrigger>
          <TabsTrigger
            active={tab === "panels"}
            onClick={() => setTab("panels")}
          >
            Paneles
          </TabsTrigger>
          <TabsTrigger
            active={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            Ajustes
          </TabsTrigger>
        </TabsList>

        {tab === "inbox" ? (
          <TabsContent className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bandeja</CardTitle>
                <CardDescription>
                  El expediente vive en Postgres. Si Discord borra el canal, el
                  ticket sigue aquí.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={statusFilter || "__all__"}
                    onValueChange={(v) =>
                      setStatusFilter(v === "__all__" ? "" : (v as TicketStatus))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {TICKET_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {TICKET_STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="type-filter">Tipo</Label>
                  <Input
                    id="type-filter"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    placeholder="support"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="opener-filter">Opener (ID)</Label>
                  <Input
                    id="opener-filter"
                    value={openerFilter}
                    onChange={(e) => setOpenerFilter(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-filter">Staff (ID)</Label>
                  <Input
                    id="staff-filter"
                    value={staffFilter}
                    onChange={(e) => setStaffFilter(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Opener</th>
                    <th className="px-3 py-2 font-medium">Staff</th>
                    <th className="px-3 py-2 font-medium">Abierto</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-6 text-center text-muted-foreground"
                        colSpan={6}
                      >
                        No hay tickets con estos filtros.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t hover:bg-muted/40"
                        onClick={() => void openDetail(row.id)}
                      >
                        <td className="px-3 py-2 font-medium">#{row.number}</td>
                        <td className="px-3 py-2">
                          <Badge className={statusBadgeClass(row.status)}>
                            {TICKET_STATUS_LABEL[row.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">{row.typeKey}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.openerId}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.claimedBy ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatWhen(row.openedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        ) : null}

        {tab === "panels" ? (
          <TabsContent className="space-y-4">
            <div className="flex justify-end">
              <Button
                disabled={saving}
                onClick={() =>
                  void withBusy(async () => {
                    const created = await createTicketPanel({});
                    setPanels((prev) => [...prev, created.panel]);
                  }, "Panel creado.")
                }
              >
                <Plus className="size-4" />
                Nuevo panel
              </Button>
            </div>
            {panels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                channels={textChannels}
                saving={saving}
                onChange={(next) =>
                  setPanels((prev) =>
                    prev.map((row) => (row.id === next.id ? next : row)),
                  )
                }
                onSave={() =>
                  void withBusy(async () => {
                    const saved = await saveTicketPanel(panel.id, {
                      channelId: panel.channelId,
                      embedTitle: panel.embedTitle,
                      embedDescription: panel.embedDescription,
                      embedColor: panel.embedColor,
                      buttons: panel.buttons,
                    });
                    setPanels((prev) =>
                      prev.map((row) =>
                        row.id === saved.panel.id ? saved.panel : row,
                      ),
                    );
                  }, "Panel guardado.")
                }
                onPublish={() =>
                  void withBusy(async () => {
                    const published = await publishTicketPanel(panel.id, {
                      channelId: panel.channelId,
                      embedTitle: panel.embedTitle,
                      embedDescription: panel.embedDescription,
                      embedColor: panel.embedColor,
                      buttons: panel.buttons,
                    });
                    setPanels((prev) =>
                      prev.map((row) =>
                        row.id === published.panel.id ? published.panel : row,
                      ),
                    );
                  }, "Panel publicado en Discord.")
                }
                onDelete={() =>
                  void withBusy(async () => {
                    await deleteTicketPanel(panel.id);
                    setPanels((prev) => prev.filter((row) => row.id !== panel.id));
                  }, "Panel borrado.")
                }
              />
            ))}
            {panels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Crea un panel, elige canal y publica el mensaje con botones.
              </p>
            ) : null}
          </TabsContent>
        ) : null}

        {tab === "settings" ? (
          <TabsContent>
            <Card>
              <CardHeader>
                <CardTitle>Ajustes</CardTitle>
                <CardDescription>
                  Categoría privada, staff y plantilla del canal. Tope operativo:
                  50 abiertos por servidor, 1 por usuario por defecto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ChannelSelect
                  id="ticket-category"
                  label="Categoría de tickets"
                  value={settings.categoryId}
                  channels={categories}
                  onChange={(categoryId) =>
                    setSettings({ ...settings, categoryId })
                  }
                />
                <ChannelSelect
                  id="ticket-log"
                  label="Canal de log"
                  value={settings.logChannelId}
                  channels={textChannels}
                  onChange={(logChannelId) =>
                    setSettings({ ...settings, logChannelId })
                  }
                />
                <RoleMultiSelect
                  label="Roles de staff"
                  roles={roles}
                  value={settings.staffRoleIds}
                  onChange={(staffRoleIds) =>
                    setSettings({ ...settings, staffRoleIds })
                  }
                />
                <div className="space-y-1.5">
                  <Label htmlFor="name-template">
                    Plantilla del canal ({"{n}"}, {"{user}"}, {"{type}"})
                  </Label>
                  <Input
                    id="name-template"
                    value={settings.nameTemplate}
                    onChange={(e) =>
                      setSettings({ ...settings, nameTemplate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Abiertos por usuario</Label>
                  <Select
                    value={String(settings.maxOpenPerUser)}
                    onValueChange={(v) =>
                      setSettings({
                        ...settings,
                        maxOpenPerUser: Number.parseInt(v, 10),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="opener-close">El opener puede cerrar</Label>
                    <p className="text-xs text-muted-foreground">
                      Claim, waiting y add/remove siguen siendo solo staff.
                    </p>
                  </div>
                  <Switch
                    id="opener-close"
                    checked={settings.openerCanClose}
                    onCheckedChange={(openerCanClose) =>
                      setSettings({ ...settings, openerCanClose })
                    }
                  />
                </div>
                <Button
                  disabled={saving}
                  onClick={() =>
                    void withBusy(async () => {
                      const saved = await saveTicketSettings({
                        categoryId: settings.categoryId,
                        logChannelId: settings.logChannelId,
                        staffRoleIds: settings.staffRoleIds,
                        nameTemplate: settings.nameTemplate,
                        maxOpenPerUser: settings.maxOpenPerUser,
                        openerCanClose: settings.openerCanClose,
                      });
                      setSettings(saved.settings);
                    }, "Ajustes guardados.")
                  }
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail ? `Ticket #${detail.number}` : "Ticket"}
        description={
          detail
            ? `${TICKET_STATUS_LABEL[detail.status]} · ${detail.typeKey}`
            : undefined
        }
        className="max-w-2xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {detail.status === "open" ||
              detail.status === "claimed" ||
              detail.status === "waiting" ? (
                <>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() =>
                      void withBusy(async () => {
                        await claimTicket(detail.id);
                        await refreshDetail(detail.id);
                      }, "Ticket reclamado.")
                    }
                  >
                    Claim
                  </Button>
                  {detail.status === "claimed" ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() =>
                          void withBusy(async () => {
                            await unclaimTicket(detail.id);
                            await refreshDetail(detail.id);
                          })
                        }
                      >
                        Unclaim
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() =>
                          void withBusy(async () => {
                            await waitTicket(detail.id);
                            await refreshDetail(detail.id);
                          })
                        }
                      >
                        Waiting
                      </Button>
                    </>
                  ) : null}
                  {detail.status === "waiting" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={() =>
                        void withBusy(async () => {
                          await unwaitTicket(detail.id);
                          await refreshDetail(detail.id);
                        })
                      }
                    >
                      Unwait
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void withBusy(async () => {
                      await reopenTicket(detail.id);
                      await refreshDetail(detail.id);
                    }, "Ticket reabierto.")
                  }
                >
                  Reopen
                </Button>
              )}
            </div>

            {detail.status !== "closed" ? (
              <div className="space-y-2">
                <Label htmlFor="close-reason">Motivo de cierre</Label>
                <Textarea
                  id="close-reason"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Obligatorio para cerrar"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving || !closeReason.trim()}
                  onClick={() =>
                    void withBusy(async () => {
                      await closeTicket(detail.id, {
                        reason: closeReason.trim(),
                      });
                      await refreshDetail(detail.id);
                    }, "Ticket cerrado.")
                  }
                >
                  Cerrar
                </Button>
                <div className="flex gap-2">
                  <Input
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    placeholder="ID o mención para añadir"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving || !addUserId.trim()}
                    onClick={() =>
                      void withBusy(async () => {
                        await addTicketUser(detail.id, { userId: addUserId });
                        setAddUserId("");
                        await refreshDetail(detail.id);
                      })
                    }
                  >
                    Añadir
                  </Button>
                </div>
                <ul className="space-y-1 text-sm">
                  {detail.participants
                    .filter((p) => p.kind === "added")
                    .map((p) => (
                      <li
                        key={p.userId}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="font-mono text-xs">{p.userId}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() =>
                            void withBusy(async () => {
                              await removeTicketUser(detail.id, p.userId);
                              await refreshDetail(detail.id);
                            })
                          }
                        >
                          Quitar
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-sm font-medium">Timeline</h3>
              <ol className="space-y-2 border-l pl-3">
                {detail.events.map((ev) => (
                  <li key={ev.id} className="text-sm">
                    <div className="font-medium">
                      {TICKET_EVENT_LABEL[ev.type]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatWhen(ev.createdAt)}
                      {ev.actorId ? ` · ${ev.actorId}` : ""}
                      {typeof ev.payload.closeReason === "string"
                        ? ` · ${ev.payload.closeReason}`
                        : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {detail.transcriptText ? (
              <div>
                <h3 className="mb-2 text-sm font-medium">Transcript</h3>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                  {detail.transcriptText}
                </pre>
              </div>
            ) : null}

            {detail.closeReason ? (
              <p className="text-sm text-muted-foreground">
                Motivo: {detail.closeReason}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function PanelCard({
  panel,
  channels,
  saving,
  onChange,
  onSave,
  onPublish,
  onDelete,
}: {
  panel: TicketPanel;
  channels: GuildChannelAsset[];
  saving: boolean;
  onChange: (next: TicketPanel) => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  function setButton(index: number, patch: Partial<TicketPanelButton>): void {
    const buttons = panel.buttons.map((btn, i) =>
      i === index ? { ...btn, ...patch } : btn,
    );
    onChange({ ...panel, buttons });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Panel #{panel.id}</CardTitle>
        <CardDescription>
          {panel.messageId
            ? "Publicado. Volver a publicar actualiza el mensaje."
            : "Aún no publicado."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChannelSelect
          id={`panel-ch-${panel.id}`}
          label="Canal de publicación"
          value={panel.channelId}
          channels={channels}
          onChange={(channelId) => onChange({ ...panel, channelId })}
        />
        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input
            value={panel.embedTitle}
            onChange={(e) =>
              onChange({ ...panel, embedTitle: e.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <Textarea
            value={panel.embedDescription}
            onChange={(e) =>
              onChange({ ...panel, embedDescription: e.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Color</Label>
          <Input
            value={panel.embedColor}
            onChange={(e) =>
              onChange({ ...panel, embedColor: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Botones (máx. 5 tipos)</Label>
          {panel.buttons.map((btn, index) => (
            <div key={`${btn.typeKey}-${index}`} className="grid gap-2 sm:grid-cols-3">
              <Input
                value={btn.typeKey}
                onChange={(e) => setButton(index, { typeKey: e.target.value })}
                placeholder="type-key"
              />
              <Input
                value={btn.label}
                onChange={(e) => setButton(index, { label: e.target.value })}
                placeholder="Etiqueta"
              />
              <Select
                value={btn.style}
                onValueChange={(v) =>
                  setButton(index, { style: v as TicketButtonStyle })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_BUTTON_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={panel.buttons.length >= 5}
              onClick={() =>
                onChange({
                  ...panel,
                  buttons: [
                    ...panel.buttons,
                    {
                      ...defaultTicketPanelButton(),
                      typeKey: `tipo-${panel.buttons.length + 1}`,
                    },
                  ],
                })
              }
            >
              Añadir botón
            </Button>
            {panel.buttons.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...panel,
                    buttons: panel.buttons.slice(0, -1),
                  })
                }
              >
                Quitar último
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={saving} onClick={onSave}>
            <Save className="size-4" />
            Guardar
          </Button>
          <Button disabled={saving} variant="secondary" onClick={onPublish}>
            <Send className="size-4" />
            Publicar
          </Button>
          <Button disabled={saving} variant="ghost" onClick={onDelete}>
            <Trash2 className="size-4" />
            Borrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
