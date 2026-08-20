import type {
  CreateCustomCommandRequest,
  CustomCommand,
  CustomCommandEmbed,
  CustomCommandOptions,
  CustomCommandPermissions,
  CustomCommandResponseData,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import {
  CUSTOM_COMMAND_NAME_REGEX,
  CUSTOM_COMMAND_VARIABLE_GROUPS,
  defaultCustomCommand,
  defaultCustomCommandEmbed,
  defaultCustomCommandOptions,
  defaultCustomCommandPermissions,
  defaultCustomCommandResponseData,
  isValidCustomCommandName,
  normalizeCustomCommandName,
} from "@adobos/shared";
import {
  createCustomCommand,
  deleteCustomCommand,
  fetchCustomCommands,
  fetchGuildAssets,
  resolvePublicAssetUrl,
  updateCustomCommand,
} from "@/lib/api";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Copy,
  Loader2,
  Pencil,
  Plus,
  Save,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type MainTab = "list" | "builder";
type BuilderTab = "general" | "options" | "permissions";

type DraftState = {
  name: string;
  description: string;
  responseData: CustomCommandResponseData;
  options: CustomCommandOptions;
  permissions: CustomCommandPermissions;
  useEmbed: boolean;
};

function emptyDraft(): DraftState {
  const base = defaultCustomCommand();
  return {
    name: "",
    description: base.description,
    responseData: defaultCustomCommandResponseData(),
    options: defaultCustomCommandOptions(),
    permissions: defaultCustomCommandPermissions(),
    useEmbed: false,
  };
}

function commandToDraft(command: CustomCommand): DraftState {
  return {
    name: command.name,
    description: command.description,
    responseData: {
      content: command.responseData.content,
      embed: command.responseData.embed
        ? { ...command.responseData.embed }
        : null,
    },
    options: { ...command.options },
    permissions: {
      allowedRoleIds: [...command.permissions.allowedRoleIds],
      ignoredRoleIds: [...command.permissions.ignoredRoleIds],
      allowedChannelIds: [...command.permissions.allowedChannelIds],
      ignoredChannelIds: [...command.permissions.ignoredChannelIds],
    },
    useEmbed: Boolean(command.responseData.embed),
  };
}

function MiniEmbedPreview({ embed }: { embed: CustomCommandEmbed }) {
  const image = embed.imageUrl
    ? resolvePublicAssetUrl(embed.imageUrl)
    : null;
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1]">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: embed.color || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <p className="text-sm font-semibold text-white">
            {embed.title || "Sin título"}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">
            {embed.description || "Sin descripción"}
          </p>
          {image ? (
            <img
              src={image}
              alt=""
              className="max-h-36 w-full rounded object-cover"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VariablesReferenceCard() {
  const [openId, setOpenId] = useState<string>(
    CUSTOM_COMMAND_VARIABLE_GROUPS[0]?.id ?? "",
  );
  const [copied, setCopied] = useState<string | null>(null);

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(token);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card className="sticky top-4 self-start">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Referencia de Variables</CardTitle>
        <CardDescription>
          Haz clic para copiar un token al portapapeles.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[70vh] overflow-y-auto">
        <Accordion>
          {CUSTOM_COMMAND_VARIABLE_GROUPS.map((group) => {
            const open = openId === group.id;
            return (
              <AccordionItem key={group.id}>
                <AccordionTrigger
                  open={open}
                  onClick={() => setOpenId(open ? "" : group.id)}
                >
                  {group.title}
                </AccordionTrigger>
                <AccordionContent open={open} className="space-y-1.5">
                  {group.items.map((item) => (
                    <button
                      key={item.token}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50",
                        copied === item.token && "bg-primary/10",
                      )}
                      onClick={() => void copyToken(item.token)}
                    >
                      <code className="shrink-0 font-mono text-xs text-primary">
                        {item.token}
                      </code>
                      <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                        {item.description}
                      </span>
                      <Copy
                        className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export function CustomCommandsDashboard() {
  const [mainTab, setMainTab] = useState<MainTab>("list");
  const [builderTab, setBuilderTab] = useState<BuilderTab>("general");
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const nameValid = useMemo(
    () => !draft.name || isValidCustomCommandName(draft.name),
    [draft.name],
  );

  const roleOptions = useMemo(
    () =>
      roles
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          hexColor: r.hexColor,
        })),
    [roles],
  );

  const channelOptions = useMemo(
    () =>
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
      })),
    [channels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, assets] = await Promise.all([
        fetchCustomCommands(),
        fetchGuildAssets(),
      ]);
      setCommands(listRes.commands);
      setRoles(assets.roles);
      setChannels(assets.channels);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los comandos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setBuilderTab("general");
    setMainTab("builder");
    setSuccess(null);
  };

  const openEdit = (command: CustomCommand) => {
    setEditingId(command.id);
    setDraft(commandToDraft(command));
    setBuilderTab("general");
    setMainTab("builder");
    setSuccess(null);
  };

  const patchOptions = (partial: Partial<CustomCommandOptions>) => {
    setDraft((prev) => ({
      ...prev,
      options: { ...prev.options, ...partial },
    }));
    setSuccess(null);
  };

  const patchPermissions = (partial: Partial<CustomCommandPermissions>) => {
    setDraft((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, ...partial },
    }));
    setSuccess(null);
  };

  const patchEmbed = (partial: Partial<CustomCommandEmbed>) => {
    setDraft((prev) => ({
      ...prev,
      responseData: {
        ...prev.responseData,
        embed: {
          ...(prev.responseData.embed ?? defaultCustomCommandEmbed()),
          ...partial,
        },
      },
    }));
    setSuccess(null);
  };

  const save = async () => {
    const name = normalizeCustomCommandName(draft.name);
    if (!isValidCustomCommandName(name)) {
      setError(
        "Nombre inválido: solo minúsculas, números, _ y - (máx. 32).",
      );
      return;
    }
    if (!draft.description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    const responseData: CustomCommandResponseData = {
      content: draft.responseData.content,
      embed: draft.useEmbed
        ? draft.responseData.embed ?? defaultCustomCommandEmbed()
        : null,
    };
    if (!responseData.content.trim() && !responseData.embed) {
      setError("Añade texto de respuesta o activa el embed.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: CreateCustomCommandRequest = {
        name,
        description: draft.description.trim().slice(0, 100),
        responseData,
        options: draft.options,
        permissions: draft.permissions,
      };
      if (editingId == null) {
        const res = await createCustomCommand(body);
        setEditingId(res.command.id);
        setDraft(commandToDraft(res.command));
        setSuccess(`Comando /${res.command.name} creado y sincronizado.`);
      } else {
        const res = await updateCustomCommand(editingId, body);
        setDraft(commandToDraft(res.command));
        setSuccess(`Comando /${res.command.name} actualizado y sincronizado.`);
      }
      await load();
      setMainTab("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (command: CustomCommand) => {
    if (
      !window.confirm(
        `¿Eliminar \`/${command.name}\`? Se quitará también de Discord.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteCustomCommand(command.id);
      if (editingId === command.id) {
        setEditingId(null);
        setDraft(emptyDraft());
        setMainTab("list");
      }
      setSuccess(`Comando /${command.name} eliminado.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Cargando Comandos custom…
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
                active={mainTab === "list"}
                onClick={() => setMainTab("list")}
              >
                Mis Comandos
              </TabsTrigger>
              <TabsTrigger
                type="button"
                active={mainTab === "builder"}
                onClick={() => {
                  if (mainTab !== "builder") openCreate();
                }}
              >
                Crear/Editar
              </TabsTrigger>
            </TabsList>

            {mainTab === "list" ? (
              <TabsContent className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {commands.length === 0
                      ? "Aún no hay comandos."
                      : `${commands.length} comando${commands.length === 1 ? "" : "s"}`}
                  </p>
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus className="size-4" aria-hidden />
                    Nuevo
                  </Button>
                </div>

                {commands.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
                    <Terminal className="size-8 text-primary/70" aria-hidden />
                    <p className="text-sm font-medium">No hay comandos custom</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Crea slash commands como{" "}
                      <code className="rounded bg-muted px-1">/reglas</code> con
                      texto, embeds y variables.
                    </p>
                    <Button type="button" onClick={openCreate}>
                      Crear comando
                    </Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {commands.map((command) => (
                      <li key={command.id}>
                        <Card>
                          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-mono text-sm font-semibold text-primary">
                                  /{command.name}
                                </p>
                                {command.options.ephemeral ? (
                                  <Badge>Silencioso</Badge>
                                ) : null}
                                {command.options.dmResponse ? (
                                  <Badge>DM</Badge>
                                ) : null}
                              </div>
                              <p className="truncate text-sm text-muted-foreground">
                                {command.description}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(command)}
                              >
                                <Pencil className="size-3.5" aria-hidden />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void onDelete(command)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                                Eliminar
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
                <Tabs>
                  <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
                    <TabsTrigger
                      type="button"
                      active={builderTab === "general"}
                      onClick={() => setBuilderTab("general")}
                    >
                      General
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "options"}
                      onClick={() => setBuilderTab("options")}
                    >
                      Opciones
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "permissions"}
                      onClick={() => setBuilderTab("permissions")}
                    >
                      Permisos
                    </TabsTrigger>
                  </TabsList>

                  {builderTab === "general" ? (
                    <TabsContent className="mt-4 space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Identidad del slash
                          </CardTitle>
                          <CardDescription>
                            Nombre y descripción visibles en Discord.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="cc-name">Nombre</Label>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">/</span>
                              <Input
                                id="cc-name"
                                value={draft.name}
                                maxLength={32}
                                placeholder="reglas"
                                className={cn(
                                  "font-mono",
                                  !nameValid && "border-destructive",
                                )}
                                onChange={(e) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    name: normalizeCustomCommandName(
                                      e.target.value,
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Solo minúsculas, números, guiones y guiones bajos
                              (máx. 32). Regex:{" "}
                              <code className="rounded bg-muted px-1">
                                {CUSTOM_COMMAND_NAME_REGEX.source}
                              </code>
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="cc-desc">Descripción</Label>
                            <Input
                              id="cc-desc"
                              value={draft.description}
                              maxLength={100}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Respuesta
                          </CardTitle>
                          <CardDescription>
                            Texto plano y/o embed. Usa variables de la columna
                            derecha.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="cc-content">Texto</Label>
                            <Textarea
                              id="cc-content"
                              rows={4}
                              value={draft.responseData.content}
                              maxLength={2000}
                              placeholder="Hola {user}! Bienvenido a {server}."
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  responseData: {
                                    ...prev.responseData,
                                    content: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">
                                Incluir embed
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Mini constructor de embed Discord.
                              </p>
                            </div>
                            <Switch
                              checked={draft.useEmbed}
                              onCheckedChange={(checked) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  useEmbed: checked,
                                  responseData: {
                                    ...prev.responseData,
                                    embed: checked
                                      ? prev.responseData.embed ??
                                        defaultCustomCommandEmbed()
                                      : prev.responseData.embed,
                                  },
                                }))
                              }
                            />
                          </div>

                          {draft.useEmbed ? (
                            <div className="space-y-4 rounded-lg border border-border p-4">
                              <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                                <div className="space-y-1.5">
                                  <Label>Color</Label>
                                  <Input
                                    type="color"
                                    className="h-10 w-14 cursor-pointer p-1"
                                    value={
                                      draft.responseData.embed?.color ||
                                      "#5865F2"
                                    }
                                    onChange={(e) =>
                                      patchEmbed({ color: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Título</Label>
                                  <Input
                                    value={
                                      draft.responseData.embed?.title ?? ""
                                    }
                                    maxLength={256}
                                    onChange={(e) =>
                                      patchEmbed({ title: e.target.value })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label>Descripción</Label>
                                <Textarea
                                  rows={3}
                                  value={
                                    draft.responseData.embed?.description ?? ""
                                  }
                                  maxLength={4000}
                                  onChange={(e) =>
                                    patchEmbed({
                                      description: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label>Imagen URL (opcional)</Label>
                                <Input
                                  type="url"
                                  placeholder="https://… o /uploads/…"
                                  value={
                                    draft.responseData.embed?.imageUrl ?? ""
                                  }
                                  onChange={(e) =>
                                    patchEmbed({
                                      imageUrl:
                                        e.target.value.trim() || null,
                                    })
                                  }
                                />
                              </div>
                              {draft.responseData.embed ? (
                                <MiniEmbedPreview
                                  embed={draft.responseData.embed}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}

                  {builderTab === "options" ? (
                    <TabsContent className="mt-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Opciones</CardTitle>
                          <CardDescription>
                            Comportamiento al ejecutar el comando.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(
                            [
                              {
                                key: "ephemeral" as const,
                                label: "Respuesta silenciosa",
                                help: "Solo el usuario que ejecuta ve la respuesta (ephemeral).",
                              },
                              {
                                key: "dmResponse" as const,
                                label: "Respuesta por DM",
                                help: "Envía el contenido al privado en lugar del canal.",
                              },
                              {
                                key: "autoDelete" as const,
                                label: "Auto-eliminar respuesta",
                                help: "Borra la respuesta del bot a los 15 segundos.",
                              },
                              {
                                key: "disableMentions" as const,
                                label: "Desactivar pings",
                                help: "No notifica @everyone, @here ni roles en la respuesta.",
                              },
                            ] as const
                          ).map((item) => (
                            <div
                              key={item.key}
                              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  {item.label}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {item.help}
                                </p>
                              </div>
                              <Switch
                                checked={draft.options[item.key]}
                                onCheckedChange={(checked) =>
                                  patchOptions({ [item.key]: checked })
                                }
                              />
                            </div>
                          ))}
                          <div className="space-y-1.5 pt-2">
                            <Label htmlFor="cc-cooldown">
                              Cooldown (segundos)
                            </Label>
                            <Input
                              id="cc-cooldown"
                              type="number"
                              min={0}
                              max={86400}
                              value={draft.options.cooldownSeconds}
                              onChange={(e) =>
                                patchOptions({
                                  cooldownSeconds: Math.max(
                                    0,
                                    Number.parseInt(e.target.value, 10) || 0,
                                  ),
                                })
                              }
                            />
                            <p className="text-[11px] text-muted-foreground">
                              0 = sin límite entre usos por usuario.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}

                  {builderTab === "permissions" ? (
                    <TabsContent className="mt-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Permisos</CardTitle>
                          <CardDescription>
                            Vacío = sin restricción. Ignorados tienen prioridad
                            sobre permitidos.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                          <RoleMultiSelect
                            label="Roles permitidos"
                            roles={roleOptions}
                            value={draft.permissions.allowedRoleIds}
                            onChange={(allowedRoleIds) =>
                              patchPermissions({ allowedRoleIds })
                            }
                          />
                          <RoleMultiSelect
                            label="Roles ignorados"
                            roles={roleOptions}
                            value={draft.permissions.ignoredRoleIds}
                            onChange={(ignoredRoleIds) =>
                              patchPermissions({ ignoredRoleIds })
                            }
                          />
                          <ChannelMultiSelect
                            label="Canales permitidos"
                            channels={channelOptions}
                            value={draft.permissions.allowedChannelIds}
                            onChange={(allowedChannelIds) =>
                              patchPermissions({ allowedChannelIds })
                            }
                          />
                          <ChannelMultiSelect
                            label="Canales ignorados"
                            channels={channelOptions}
                            value={draft.permissions.ignoredChannelIds}
                            onChange={(ignoredChannelIds) =>
                              patchPermissions({ ignoredChannelIds })
                            }
                          />
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}
                </Tabs>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={saving || !nameValid || !draft.name}
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    Guardar y sincronizar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMainTab("list");
                      setEditingId(null);
                      setDraft(emptyDraft());
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <VariablesReferenceCard />
      </div>
    </div>
  );
}
