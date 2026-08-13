import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  AutoRoleMode,
  ButtonRoleMappingInput,
  CreateAutoRoleRequest,
  EmbedPayload,
  EmbedTemplateSummary,
  GuildAssetsResponse,
  MessageButtonStyle,
  MessageSourceMode,
  ReactionRoleMappingInput,
} from "@adobos/shared";
import {
  fetchAutoJoinRoles,
  fetchEmbedTemplate,
  fetchGuildAssets,
  listEmbedTemplates,
  resolvePublicAssetUrl,
  saveAutoJoinRoles,
  saveInteractiveRoles,
} from "@/lib/api";
import { parseDiscordEmojis } from "@/lib/parseDiscordEmojis";
import {
  DiscordEmojiPicker,
  type DiscordEmojiSelection,
} from "@/components/shared/DiscordEmojiPicker";
import {
  EmbedFormTemplate,
  emptyEmbedPayload,
} from "@/components/shared/EmbedFormTemplate";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type TopTab = "interactive" | "autojoin";
type AccordionStep = "message" | "roles";
type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

interface MappingRow {
  roleId: string;
  label: string;
  emojiKey: string;
  selection: DiscordEmojiSelection | null;
  style: Exclude<MessageButtonStyle, "Link">;
}

const ACTION_STYLES: Exclude<MessageButtonStyle, "Link">[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
];

const BUTTON_PREVIEW_CLASS: Record<Exclude<MessageButtonStyle, "Link">, string> =
  {
    Primary: "bg-[#5865f2] text-white",
    Secondary: "bg-[#4e5058] text-white",
    Success: "bg-[#248046] text-white",
    Danger: "bg-[#da373c] text-white",
  };

function emptyMappingRow(): MappingRow {
  return {
    roleId: "",
    label: "Obtener rol",
    emojiKey: "",
    selection: null,
    style: "Primary",
  };
}

function mediaSrc(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return resolvePublicAssetUrl(trimmed);
}

export function AutoRoleBuilder() {
  const [topTab, setTopTab] = useState<TopTab>("interactive");
  const [accordionStep, setAccordionStep] = useState<AccordionStep>("message");

  const [mode, setMode] = useState<AutoRoleMode>("buttons");
  const [messageSource, setMessageSource] =
    useState<MessageSourceMode>("create");
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [embed, setEmbed] = useState<EmbedPayload>(emptyEmbedPayload);
  const [mappings, setMappings] = useState<MappingRow[]>([emptyMappingRow()]);

  const [templates, setTemplates] = useState<EmbedTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);

  const [humanRoles, setHumanRoles] = useState<string[]>([]);
  const [botRoles, setBotRoles] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const isSubmitting = feedback.kind === "loading";

  const previewColor = useMemo(() => {
    const raw = embed.color?.trim().replace(/^#/, "") ?? "";
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : "#C45C26";
  }, [embed.color]);

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of assets?.roles ?? []) map.set(role.id, role.name);
    return map;
  }, [assets?.roles]);

  useEffect(() => {
    let cancelled = false;
    fetchGuildAssets()
      .then((data) => {
        if (!cancelled) {
          setAssets(data);
          setAssetsError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssetsError(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar assets",
          );
        }
      });
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    let cancelled = false;
    void fetchAutoJoinRoles()
      .then((data) => {
        if (cancelled) return;
        setHumanRoles(data.config.humanRoles);
        setBotRoles(data.config.botRoles);
      })
      .catch(() => {
        /* silencioso: tab puede cargar después */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onHydrateTemplate = useCallback(async (idRaw: string) => {
    setSelectedTemplateId(idRaw);
    if (!idRaw) return;
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(id)) return;

    setTemplateLoading(true);
    try {
      const detail = await fetchEmbedTemplate(id);
      setEmbed({ ...emptyEmbedPayload, ...detail.embedData });
      setMessageSource("template");
      setFeedback({
        kind: "ok",
        message: `Plantilla «${detail.name}» cargada. Puedes editarla antes de publicar.`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo cargar la plantilla",
      });
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  async function onSubmitInteractive(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!assets) {
      setFeedback({
        kind: "error",
        message: "Assets del servidor no disponibles.",
      });
      return;
    }

    const apiSource: "existing" | "create" =
      messageSource === "existing" ? "existing" : "create";

    setFeedback({ kind: "loading" });
    try {
      const reactionMappings: ReactionRoleMappingInput[] | undefined =
        mode === "reactions"
          ? mappings
              .filter((row) => row.emojiKey && row.roleId)
              .map(({ emojiKey, roleId }) => ({ emojiKey, roleId }))
          : undefined;

      const buttonMappings: ButtonRoleMappingInput[] | undefined =
        mode === "buttons"
          ? mappings
              .filter((row) => row.roleId)
              .map((row) => ({
                roleId: row.roleId,
                label: row.label.trim() || "Rol",
                style: row.style,
                customId: `autorole_${row.roleId}`,
                emojiKey: row.emojiKey || undefined,
              }))
          : undefined;

      const payload: CreateAutoRoleRequest = {
        mode,
        guildId: assets.guildId,
        channelId,
        messageSource: apiSource,
        messageId: apiSource === "existing" ? messageId : undefined,
        embed: apiSource === "create" ? embed : undefined,
        reactionMappings,
        buttonMappings,
      };

      const result = await saveInteractiveRoles(payload);
      setFeedback({
        kind: "ok",
        message: `Listo. Mensaje ${result.messageId} · ${result.saved} mapping(s) guardados.`,
      });
      if (apiSource === "create") {
        setMessageId(result.messageId);
      }
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  async function onSubmitAutoJoin(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFeedback({ kind: "loading" });
    try {
      const result = await saveAutoJoinRoles({
        guildId: assets?.guildId,
        humanRoles,
        botRoles,
      });
      setHumanRoles(result.config.humanRoles);
      setBotRoles(result.config.botRoles);
      setFeedback({
        kind: "ok",
        message: "Configuración de roles al unirse guardada.",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  const showEmbedEditor =
    messageSource === "create" || messageSource === "template";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
      <div className="space-y-4">
        <Tabs>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-2">
            <TabsTrigger
              active={topTab === "interactive"}
              onClick={() => {
                setTopTab("interactive");
                setFeedback({ kind: "idle" });
              }}
            >
              Menús Interactivos
            </TabsTrigger>
            <TabsTrigger
              active={topTab === "autojoin"}
              onClick={() => {
                setTopTab("autojoin");
                setFeedback({ kind: "idle" });
              }}
            >
              Roles Automáticos (Al unirse)
            </TabsTrigger>
          </TabsList>

          {topTab === "interactive" ? (
            <TabsContent>
              <form onSubmit={onSubmitInteractive} className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Modo</CardTitle>
                    <CardDescription>
                      Botones o reacciones. Servidor:{" "}
                      {assets?.guildName ?? "…"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
                      {(
                        [
                          { id: "buttons", label: "Botones" },
                          { id: "reactions", label: "Reacciones" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                            mode === option.id
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => setMode(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {assetsError ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        {assetsError}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Accordion>
                  <AccordionItem>
                    <AccordionTrigger
                      open={accordionStep === "message"}
                      subtitle="Origen del mensaje y contenido del embed"
                      onClick={() => setAccordionStep("message")}
                    >
                      Paso 1 · Configuración del mensaje
                    </AccordionTrigger>
                    <AccordionContent open={accordionStep === "message"}>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Origen del mensaje</Label>
                          <Select
                            value={messageSource}
                            onValueChange={(value) => {
                              setMessageSource(value as MessageSourceMode);
                              if (value !== "template") {
                                setSelectedTemplateId("");
                              }
                            }}
                            disabled={isSubmitting}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Elige origen…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="existing">
                                Usar mensaje existente
                              </SelectItem>
                              <SelectItem value="create">
                                Crear nuevo Embed
                              </SelectItem>
                              <SelectItem value="template">
                                Cargar desde Plantilla
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="channelId">Canal</Label>
                          {assets && assets.channels.length > 0 ? (
                            <Select
                              value={channelId || undefined}
                              onValueChange={setChannelId}
                              disabled={isSubmitting}
                            >
                              <SelectTrigger id="channelId">
                                <SelectValue placeholder="Selecciona un canal…" />
                              </SelectTrigger>
                              <SelectContent>
                                {assets.channels.map((channel) => (
                                  <SelectItem
                                    key={channel.id}
                                    value={channel.id}
                                  >
                                    #{channel.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id="channelId"
                              value={channelId}
                              required
                              disabled={isSubmitting}
                              onChange={(event) =>
                                setChannelId(event.target.value)
                              }
                            />
                          )}
                        </div>

                        {messageSource === "existing" ? (
                          <div className="space-y-2">
                            <Label htmlFor="messageId">ID del mensaje</Label>
                            <Input
                              id="messageId"
                              value={messageId}
                              required
                              placeholder="Snowflake del mensaje"
                              disabled={isSubmitting}
                              onChange={(event) =>
                                setMessageId(event.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              El bot editará el mensaje (botones) o añadirá
                              reacciones. Requiere permisos en el canal.
                            </p>
                          </div>
                        ) : null}

                        {messageSource === "template" ? (
                          <div className="space-y-2">
                            <Label>Plantilla</Label>
                            <Select
                              value={selectedTemplateId || undefined}
                              onValueChange={(id) => {
                                void onHydrateTemplate(id);
                              }}
                              disabled={isSubmitting || templateLoading}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona una plantilla…" />
                              </SelectTrigger>
                              <SelectContent>
                                {templates.map((tpl) => (
                                  <SelectItem
                                    key={tpl.id}
                                    value={String(tpl.id)}
                                  >
                                    {tpl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {templates.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No hay plantillas. Créalas en Mensajes → Embeds.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {showEmbedEditor ? (
                          <div className="rounded-md border border-border bg-muted/20 p-3">
                            <EmbedFormTemplate
                              value={embed}
                              onChange={setEmbed}
                              serverEmojis={assets?.emojis ?? []}
                              disabled={isSubmitting || templateLoading}
                              idPrefix="autorole-embed"
                              compact
                            />
                          </div>
                        ) : null}

                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() => setAccordionStep("roles")}
                        >
                          Continuar a asignación de roles
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem>
                    <AccordionTrigger
                      open={accordionStep === "roles"}
                      subtitle={
                        mode === "buttons"
                          ? "Rol, etiqueta del botón y emoji opcional"
                          : "Emoji y rol por cada opción"
                      }
                      onClick={() => setAccordionStep("roles")}
                    >
                      Paso 2 · Asignación de roles
                    </AccordionTrigger>
                    <AccordionContent open={accordionStep === "roles"}>
                      <div className="space-y-4">
                        {mappings.map((row, index) => (
                          <div
                            key={`map-${index}`}
                            className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2"
                          >
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Rol</Label>
                              <Select
                                value={row.roleId || undefined}
                                disabled={isSubmitting}
                                onValueChange={(roleId) => {
                                  const next = [...mappings];
                                  const roleLabel =
                                    roleNameById.get(roleId) ?? row.label;
                                  next[index] = {
                                    ...row,
                                    roleId,
                                    label:
                                      row.label === "Obtener rol" || !row.label
                                        ? roleLabel
                                        : row.label,
                                  };
                                  setMappings(next);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona un rol…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(assets?.roles ?? []).map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                      @{role.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>
                                {mode === "buttons"
                                  ? "Texto del botón"
                                  : "Texto / etiqueta"}
                              </Label>
                              <Input
                                value={row.label}
                                disabled={isSubmitting}
                                onChange={(event) => {
                                  const next = [...mappings];
                                  next[index] = {
                                    ...row,
                                    label: event.target.value,
                                  };
                                  setMappings(next);
                                }}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>
                                Emoji
                                {mode === "reactions" ? "" : " (opcional)"}
                              </Label>
                              <DiscordEmojiPicker
                                serverEmojis={assets?.emojis ?? []}
                                value={row.selection}
                                disabled={isSubmitting}
                                onSelect={(selection) => {
                                  const next = [...mappings];
                                  next[index] = {
                                    ...row,
                                    selection,
                                    emojiKey: selection.emojiKey,
                                  };
                                  setMappings(next);
                                }}
                              />
                            </div>

                            {mode === "buttons" ? (
                              <div className="space-y-2 sm:col-span-2">
                                <Label>Estilo</Label>
                                <Select
                                  value={row.style}
                                  disabled={isSubmitting}
                                  onValueChange={(style) => {
                                    const next = [...mappings];
                                    next[index] = {
                                      ...row,
                                      style:
                                        style as MappingRow["style"],
                                    };
                                    setMappings(next);
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Estilo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ACTION_STYLES.map((style) => (
                                      <SelectItem key={style} value={style}>
                                        {style}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}

                            <div className="flex justify-end sm:col-span-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={
                                  isSubmitting || mappings.length <= 1
                                }
                                onClick={() =>
                                  setMappings((prev) =>
                                    prev.filter((_, i) => i !== index),
                                  )
                                }
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() =>
                            setMappings((prev) => [
                              ...prev,
                              emptyMappingRow(),
                            ])
                          }
                        >
                          <Plus className="size-4" aria-hidden />
                          Añadir asignación
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="flex flex-col gap-3">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !channelId}
                  >
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    {messageSource === "existing"
                      ? "Guardar autoroles"
                      : "Crear mensaje y guardar autoroles"}
                  </Button>
                  <FeedbackBanner feedback={feedback} />
                </div>
              </form>
            </TabsContent>
          ) : (
            <TabsContent>
              <form onSubmit={onSubmitAutoJoin} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Roles al unirse</CardTitle>
                    <CardDescription>
                      Asigna roles automáticamente a usuarios y bots cuando
                      entran al servidor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <RoleMultiSelect
                      id="human-roles"
                      label="Roles a asignar a Usuarios"
                      roles={assets?.roles ?? []}
                      value={humanRoles}
                      onChange={setHumanRoles}
                      disabled={isSubmitting}
                      placeholder="Buscar roles para usuarios…"
                    />
                    <RoleMultiSelect
                      id="bot-roles"
                      label="Roles a asignar a Bots"
                      roles={assets?.roles ?? []}
                      value={botRoles}
                      onChange={setBotRoles}
                      disabled={isSubmitting}
                      placeholder="Buscar roles para bots…"
                    />
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-3">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-4" aria-hidden />
                    )}
                    Guardar configuración
                  </Button>
                  <FeedbackBanner feedback={feedback} />
                </div>
              </form>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="overflow-hidden rounded-lg border border-border bg-[#2b2d31] text-white shadow-sm">
          <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
            Vista previa
          </div>
          <div className="space-y-3 p-4">
            {topTab === "autojoin" ? (
              <div className="space-y-3 text-sm text-white/80">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Al unirse
                </p>
                <div>
                  <p className="mb-1 text-xs text-white/50">Usuarios</p>
                  <p>
                    {humanRoles.length
                      ? humanRoles
                          .map((id) => `@${roleNameById.get(id) ?? id}`)
                          .join(", ")
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-white/50">Bots</p>
                  <p>
                    {botRoles.length
                      ? botRoles
                          .map((id) => `@${roleNameById.get(id) ?? id}`)
                          .join(", ")
                      : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {showEmbedEditor && embed.content?.trim() ? (
                  <div className="discord-md text-sm text-white/90">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                    >
                      {parseDiscordEmojis(embed.content)}
                    </Markdown>
                  </div>
                ) : null}

                {showEmbedEditor ? (
                  <div
                    className="overflow-hidden rounded bg-[#1e1f22]"
                    style={{ borderLeft: `4px solid ${previewColor}` }}
                  >
                    <div className="space-y-2 p-3">
                      {embed.authorName?.trim() ? (
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          {mediaSrc(embed.authorIconUrl) ? (
                            <img
                              src={mediaSrc(embed.authorIconUrl)!}
                              alt=""
                              className="size-5 rounded-full object-cover"
                            />
                          ) : null}
                          <span>{embed.authorName}</span>
                        </div>
                      ) : null}
                      <div className="flex gap-3">
                        <div className="min-w-0 flex-1">
                          {embed.title?.trim() ? (
                            <p className="text-sm font-semibold text-white">
                              {embed.title}
                            </p>
                          ) : null}
                          {embed.description?.trim() ? (
                            <div className="discord-md mt-1 text-sm text-white/80">
                              <Markdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                              >
                                {parseDiscordEmojis(embed.description)}
                              </Markdown>
                            </div>
                          ) : null}
                        </div>
                        {mediaSrc(embed.thumbnailUrl) ? (
                          <img
                            src={mediaSrc(embed.thumbnailUrl)!}
                            alt=""
                            className="size-16 rounded object-cover"
                          />
                        ) : null}
                      </div>
                      {mediaSrc(embed.imageUrl) ? (
                        <img
                          src={mediaSrc(embed.imageUrl)!}
                          alt=""
                          className="mt-2 max-h-40 w-full rounded object-cover"
                        />
                      ) : null}
                      {(embed.footerText?.trim() || embed.timestamp) && (
                        <div className="pt-1 text-[11px] text-white/55">
                          {embed.footerText?.trim()}
                          {embed.footerText?.trim() && embed.timestamp
                            ? " • "
                            : ""}
                          {embed.timestamp
                            ? new Date().toLocaleString("es-MX")
                            : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/60">
                    Mensaje existente #{messageId || "…"}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {mode === "buttons"
                    ? mappings
                        .filter((row) => row.roleId)
                        .map((row, i) => (
                          <span
                            key={`btn-prev-${i}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium",
                              BUTTON_PREVIEW_CLASS[row.style],
                            )}
                          >
                            {row.selection?.display ?? ""}{" "}
                            {row.label || "Rol"}
                          </span>
                        ))
                    : mappings
                        .filter((row) => row.emojiKey && row.roleId)
                        .map((row, i) => (
                          <span
                            key={`rxn-prev-${i}`}
                            className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs"
                          >
                            {row.selection?.display ?? "?"} → @
                            {roleNameById.get(row.roleId) ?? row.roleId}
                          </span>
                        ))}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

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
