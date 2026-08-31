import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { discordMarkdownRehype } from "@/lib/discordMarkdown";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import type {
  AutoroleCreateSource,
  AutoroleMappingItem,
  AutoroleRegistryEntry,
  AutoroleRegistryType,
  EmbedPayload,
  EmbedTemplateSummary,
  GuildAssetsResponse,
  MessageButtonStyle,
  ModFetchedMessageReaction,
  ModFetchedMessageResponse,
} from "@adobos/shared";
import {
  createAutoroleCompact,
  deleteAutorole,
  fetchActiveAutoroles,
  fetchAutoJoinRoles,
  fetchEmbedTemplate,
  fetchGuildAssets,
  fetchModMessage,
  listEmbedTemplates,
  saveAutoJoinRoles,
  updateAutoroleContent,
  updateAutoroleMapping,
} from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/api/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { parseDiscordEmojis } from "@/lib/parseDiscordEmojis";
import {
  DiscordEmojiPicker,
  type DiscordEmojiSelection,
} from "@/components/shared/DiscordEmojiPicker";
import { EmbedFormTemplate } from "@/components/shared/EmbedFormTemplate";
import { RoleColorDot } from "@/components/shared/RoleColorDot";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { AlertDialog } from "@/components/ui/alert-dialog";
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
import { Sheet } from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TopTab = "registry" | "create" | "autojoin";
type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

interface MappingRow extends AutoroleMappingItem {
  selection: DiscordEmojiSelection | null;
}

const ACTION_STYLES: Exclude<MessageButtonStyle, "Link">[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
];

const TYPE_LABEL: Record<AutoroleRegistryType, string> = {
  BUTTONS: "Botones",
  SELECT: "Menú desplegable",
  REACTIONS: "Reacciones",
};

const BUTTON_PREVIEW_CLASS: Record<
  Exclude<MessageButtonStyle, "Link">,
  string
> = {
  Primary: "bg-[#5865f2] text-white",
  Secondary: "bg-[#4e5058] text-white",
  Success: "bg-[#248046] text-white",
  Danger: "bg-[#da373c] text-white",
};

function mediaSrc(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return resolvePublicAssetUrl(trimmed);
}

function emptyRow(): MappingRow {
  return {
    roleId: "",
    label: "Obtener rol",
    emojiKey: "",
    style: "Primary",
    selection: null,
  };
}

function rowsFromReactions(
  reactions: ModFetchedMessageReaction[],
): MappingRow[] {
  if (reactions.length === 0) return [emptyRow()];
  return reactions.map((reaction) => {
    const isCustom = reaction.emojiKey.startsWith("custom:");
    return {
      roleId: "",
      label: reaction.name ? `Rol ${reaction.name}` : "Obtener rol",
      emojiKey: reaction.emojiKey,
      style: "Primary" as const,
      selection: {
        emojiKey: reaction.emojiKey,
        display: isCustom
          ? reaction.name
            ? `:${reaction.name}:`
            : reaction.emojiKey
          : (reaction.name ?? reaction.emojiKey.replace(/^unicode:/, "")),
        imageUrl: reaction.imageUrl ?? undefined,
        mention:
          isCustom && reaction.name && reaction.id
            ? `<${reaction.animated ? "a" : ""}:${reaction.name}:${reaction.id}>`
            : undefined,
      },
    };
  });
}

function embedFromFetched(
  message: ModFetchedMessageResponse,
): EmbedPayload {
  const first = message.embeds[0];
  return {
    content: message.content || undefined,
    title: first?.title,
    description: first?.description,
    url: first?.url,
    color: first?.color,
    authorName: first?.authorName,
    authorIconUrl: first?.authorIconUrl,
    thumbnailUrl: first?.thumbnailUrl,
    imageUrl: first?.imageUrl,
    footerText: first?.footerText,
    footerIconUrl: first?.footerIconUrl,
    timestamp: first?.timestamp,
  };
}

const DUPLICATE_AUTOROLE_TOAST =
  "Este mensaje ya cuenta con un autorol activo. Visita «Mensajes Activos» para gestionarlo.";

function rowsFromMappings(mappings: AutoroleMappingItem[]): MappingRow[] {
  if (mappings.length === 0) return [emptyRow()];
  return mappings.map((m) => ({
    ...m,
    style: m.style ?? "Primary",
    selection: m.emojiKey
      ? {
          emojiKey: m.emojiKey,
          display: m.emojiKey.startsWith("unicode:")
            ? m.emojiKey.slice("unicode:".length)
            : m.emojiKey,
        }
      : null,
  }));
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

export function AutoRoleBuilder() {
  const [topTab, setTopTab] = useState<TopTab>("registry");
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [templates, setTemplates] = useState<EmbedTemplateSummary[]>([]);
  const [entries, setEntries] = useState<AutoroleRegistryEntry[]>([]);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [listLoading, setListLoading] = useState(true);

  // Create wizard
  const [createType, setCreateType] =
    useState<AutoroleRegistryType>("BUTTONS");
  const [createSource, setCreateSource] =
    useState<AutoroleCreateSource>("template");
  const [channelId, setChannelId] = useState("");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [existingMessageId, setExistingMessageId] = useState("");
  const [plainContent, setPlainContent] = useState("");
  const [createRows, setCreateRows] = useState<MappingRow[]>([emptyRow()]);
  const [previewEmbed, setPreviewEmbed] = useState<EmbedPayload | null>(null);
  const [fetchedMessage, setFetchedMessage] =
    useState<ModFetchedMessageResponse | null>(null);
  const [messageFetchError, setMessageFetchError] = useState<string | null>(
    null,
  );
  const [messageFetching, setMessageFetching] = useState(false);

  const debouncedExistingMessageId = useDebouncedValue(existingMessageId, 500);

  // Auto-join
  const [humanRoles, setHumanRoles] = useState<string[]>([]);
  const [botRoles, setBotRoles] = useState<string[]>([]);

  // Registry modals
  const [manageEntry, setManageEntry] = useState<AutoroleRegistryEntry | null>(
    null,
  );
  const [manageRows, setManageRows] = useState<MappingRow[]>([emptyRow()]);
  const [editEntry, setEditEntry] = useState<AutoroleRegistryEntry | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editEmbed, setEditEmbed] = useState<EmbedPayload>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editTab, setEditTab] = useState<"message" | "embed">("message");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [duplicateToast, setDuplicateToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const busy = feedback.kind === "loading";

  const previewColor = useMemo(() => {
    const raw = previewEmbed?.color?.trim().replace(/^#/, "") ?? "";
    return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : "#C45C26";
  }, [previewEmbed?.color]);

  const channelLabel = useMemo(() => {
    if (!channelId) return null;
    return (
      assets?.channels.find((c) => c.id === channelId)?.name ?? channelId
    );
  }, [assets?.channels, channelId]);

  useEffect(() => {
    if (createSource !== "template" || !templateId) {
      setPreviewEmbed(null);
      return;
    }
    const id = Number.parseInt(templateId, 10);
    if (!Number.isFinite(id)) {
      setPreviewEmbed(null);
      return;
    }
    let cancelled = false;
    void fetchEmbedTemplate(id)
      .then((detail) => {
        if (!cancelled) setPreviewEmbed(detail.embedData);
      })
      .catch(() => {
        if (!cancelled) setPreviewEmbed(null);
      });
    return () => {
      cancelled = true;
    };
  }, [createSource, templateId]);

  useEffect(() => {
    if (createSource !== "existing") {
      setFetchedMessage(null);
      setMessageFetchError(null);
      setMessageFetching(false);
      return;
    }

    const messageId = debouncedExistingMessageId.trim();
    if (!channelId || !/^\d{17,20}$/.test(messageId)) {
      setFetchedMessage(null);
      setMessageFetchError(null);
      setMessageFetching(false);
      return;
    }

    const controller = new AbortController();
    setMessageFetching(true);
    setMessageFetchError(null);

    void fetchModMessage(channelId, messageId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setFetchedMessage(data);
        setMessageFetchError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFetchedMessage(null);
        setMessageFetchError(
          error instanceof Error
            ? error.message
            : "El mensaje no existe en el canal seleccionado",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setMessageFetching(false);
      });

    return () => controller.abort();
  }, [createSource, channelId, debouncedExistingMessageId]);

  const refreshRegistry = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await fetchActiveAutoroles();
      setEntries(data.entries);
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el registro",
      });
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGuildAssets()
      .then((data) => {
        if (!cancelled) setAssets(data);
      })
      .catch(() => undefined);
    void listEmbedTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data.templates);
      })
      .catch(() => undefined);
    void fetchAutoJoinRoles()
      .then((data) => {
        if (cancelled) return;
        setHumanRoles(data.config.humanRoles);
        setBotRoles(data.config.botRoles);
      })
      .catch(() => undefined);
    void refreshRegistry();
    return () => {
      cancelled = true;
    };
  }, [refreshRegistry]);

  const alreadyConfigured = Boolean(fetchedMessage?.alreadyConfigured);
  const messageReactions = fetchedMessage?.reactions ?? [];

  useEffect(() => {
    if (createSource === "existing" && alreadyConfigured) {
      setDuplicateToast(DUPLICATE_AUTOROLE_TOAST);
    }
  }, [createSource, alreadyConfigured, fetchedMessage?.id]);

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (alreadyConfigured) {
      setDuplicateToast(DUPLICATE_AUTOROLE_TOAST);
      setFeedback({ kind: "error", message: DUPLICATE_AUTOROLE_TOAST });
      return;
    }
    if (!assets) {
      setFeedback({ kind: "error", message: "Assets no disponibles." });
      return;
    }
    setFeedback({ kind: "loading" });
    try {
      const mappings = createRows
        .filter((r) => r.roleId)
        .map(({ roleId, label, emojiKey, style }) => ({
          roleId,
          label,
          emojiKey: emojiKey || undefined,
          style,
        }));
      const result = await createAutoroleCompact({
        guildId: assets.guildId,
        channelId,
        type: createType,
        source: createSource,
        title: title.trim() || undefined,
        templateId:
          createSource === "template" && templateId
            ? Number.parseInt(templateId, 10)
            : undefined,
        messageId:
          createSource === "existing" ? existingMessageId : undefined,
        plainContent:
          createSource === "plain" ? plainContent : undefined,
        mappings,
      });
      setFeedback({
        kind: "ok",
        message: `Autorol publicado · mensaje ${result.messageId}`,
      });
      setCreateRows([emptyRow()]);
      await refreshRegistry();
      setTopTab("registry");
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error al crear",
      });
    }
  }

  async function onSaveAutoJoin(event: FormEvent): Promise<void> {
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
      setFeedback({ kind: "ok", message: "Roles al unirse guardados." });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error al guardar",
      });
    }
  }

  function openManage(entry: AutoroleRegistryEntry): void {
    setManageEntry(entry);
    setManageRows(rowsFromMappings(entry.rolesMapping));
  }

  async function saveManage(): Promise<void> {
    if (!manageEntry) return;
    setFeedback({ kind: "loading" });
    try {
      const mappings = manageRows
        .filter((r) => r.roleId)
        .map(({ roleId, label, emojiKey, style, id }) => ({
          id,
          roleId,
          label,
          emojiKey: emojiKey || undefined,
          style,
        }));
      const result = await updateAutoroleMapping(manageEntry.id, { mappings });
      if (result.orphaned) {
        setFeedback({
          kind: "ok",
          message:
            "Mappings guardados en SQLite, pero el mensaje ya no existe en Discord (huérfano).",
        });
      } else {
        setFeedback({ kind: "ok", message: "Roles del mensaje actualizados." });
      }
      setManageEntry(null);
      await refreshRegistry();
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error al actualizar",
      });
    }
  }

  async function openEditContent(entry: AutoroleRegistryEntry): Promise<void> {
    if (entry.isBotAuthor === false) return;
    setEditEntry(entry);
    setEditTitle(entry.title);
    setEditEmbed({});
    setEditTab("message");
    setEditLoading(true);
    try {
      const message = await fetchModMessage(entry.channelId, entry.messageId);
      setEditEmbed(embedFromFetched(message));
    } catch {
      setEditEmbed({ content: "" });
    } finally {
      setEditLoading(false);
    }
  }

  async function saveEditContent(): Promise<void> {
    if (!editEntry) return;
    setFeedback({ kind: "loading" });
    try {
      const result = await updateAutoroleContent(editEntry.id, {
        title: editTitle,
        content: editEmbed.content,
        embed: editEmbed,
      });
      if (result.orphaned) {
        setFeedback({
          kind: "ok",
          message:
            "Título local actualizado. El mensaje no existe en Discord (huérfano).",
        });
        setSuccessToast(
          "Registro actualizado. El mensaje no existe en Discord (huérfano).",
        );
      } else {
        setFeedback({ kind: "ok", message: "Mensaje actualizado en Discord." });
        setSuccessToast("Mensaje actualizado en Discord");
      }
      setEditEntry(null);
      await refreshRegistry();
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error al editar",
      });
    }
  }

  function autocompleteReactions(): void {
    if (messageReactions.length === 0) return;
    setCreateRows(rowsFromReactions(messageReactions));
    if (createType !== "REACTIONS") {
      setCreateType("REACTIONS");
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteId == null) return;
    setFeedback({ kind: "loading" });
    try {
      const result = await deleteAutorole(deleteId);
      setFeedback({
        kind: "ok",
        message: result.orphaned
          ? "Registro limpio (el mensaje ya no existía en Discord)."
          : "Autorol eliminado del mensaje y del registro.",
      });
      setDeleteId(null);
      await refreshRegistry();
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error al eliminar",
      });
    }
  }

  function renderMappingEditor(
    rows: MappingRow[],
    setRows: (next: MappingRow[]) => void,
    type: AutoroleRegistryType,
    options?: { twoColumnCards?: boolean },
  ) {
    const twoColumnCards = options?.twoColumnCards ?? false;
    return (
      <div className="space-y-3">
        <div
          className={
            twoColumnCards
              ? "grid grid-cols-1 gap-3 md:grid-cols-2"
              : "space-y-3"
          }
        >
          {rows.map((row, index) => {
            const selectedRole = (assets?.roles ?? []).find(
              (r) => r.id === row.roleId,
            );
            return (
              <div
                key={`row-${index}`}
                className="flex flex-col gap-2 rounded-md bg-muted/30 p-2"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Rol
                    </Label>
                    <Select
                      value={row.roleId || undefined}
                      disabled={busy}
                      onValueChange={(roleId) => {
                        const next = [...rows];
                        const roleName =
                          assets?.roles.find((r) => r.id === roleId)?.name ??
                          row.label;
                        next[index] = {
                          ...row,
                          roleId,
                          label:
                            row.label === "Obtener rol" || !row.label
                              ? roleName
                              : row.label,
                        };
                        setRows(next);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        {selectedRole ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <RoleColorDot
                              color={
                                selectedRole.hexColor ?? selectedRole.color
                              }
                            />
                            <span className="truncate">
                              @{selectedRole.name}
                            </span>
                          </span>
                        ) : (
                          <SelectValue placeholder="Selecciona un rol…" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {(assets?.roles ?? []).map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            <span className="flex items-center gap-2">
                              <RoleColorDot
                                color={role.hexColor ?? role.color}
                              />
                              @{role.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-5 size-9 shrink-0"
                    disabled={busy || rows.length <= 1}
                    onClick={() =>
                      setRows(rows.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Etiqueta
                    </Label>
                    <Input
                      className="h-9"
                      value={row.label}
                      disabled={busy}
                      onChange={(event) => {
                        const next = [...rows];
                        next[index] = { ...row, label: event.target.value };
                        setRows(next);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Emoji
                    </Label>
                    <DiscordEmojiPicker
                      serverEmojis={assets?.emojis ?? []}
                      value={row.selection}
                      disabled={busy}
                      onSelect={(selection) => {
                        const next = [...rows];
                        next[index] = {
                          ...row,
                          selection,
                          emojiKey: selection.emojiKey,
                        };
                        setRows(next);
                      }}
                    />
                  </div>
                  {type !== "REACTIONS" ? (
                    <div className="min-w-[7.5rem] space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Estilo
                      </Label>
                      <Select
                        value={row.style ?? "Primary"}
                        disabled={busy || type === "SELECT"}
                        onValueChange={(style) => {
                          const next = [...rows];
                          next[index] = {
                            ...row,
                            style: style as MappingRow["style"],
                          };
                          setRows(next);
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
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
                </div>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setRows([...rows, emptyRow()])}
        >
          <Plus className="size-4" aria-hidden />
          Añadir asignación
        </Button>
      </div>
    );
  }

  function renderCreatePreview() {
    const activeRows = createRows.filter((r) => r.roleId || r.label);

    return (
      <div className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-lg border border-border bg-[#2b2d31] text-white shadow-sm">
        <div className="shrink-0 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
          Vista previa en vivo
          {channelLabel ? (
            <span className="ml-2 font-normal normal-case text-white/40">
              #{channelLabel}
            </span>
          ) : null}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {createSource === "existing" ? (
            messageFetching ? (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Cargando mensaje…
              </div>
            ) : messageFetchError ? (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-300">
                {messageFetchError}
              </div>
            ) : fetchedMessage ? (
              <div className="flex items-start gap-3">
                <UserAvatar
                  src={fetchedMessage.author.avatarUrl}
                  name={fetchedMessage.author.displayName}
                  className="size-10 ring-0"
                  fallbackClassName="text-xs"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">
                      {fetchedMessage.author.displayName}
                    </span>
                    <span className="text-[11px] text-white/45">
                      @{fetchedMessage.author.username}
                    </span>
                  </div>
                  {fetchedMessage.content.trim() ? (
                    <div className="discord-md text-sm text-white/90">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={discordMarkdownRehype}
                      >
                        {parseDiscordEmojis(fetchedMessage.content)}
                      </Markdown>
                    </div>
                  ) : null}
                  {fetchedMessage.embeds.map((embed, index) => {
                    const raw =
                      embed.color?.trim().replace(/^#/, "") ?? "";
                    const color = /^[0-9a-fA-F]{6}$/.test(raw)
                      ? `#${raw}`
                      : "#5865F2";
                    const hasBody =
                      embed.title?.trim() ||
                      embed.description?.trim() ||
                      embed.authorName?.trim() ||
                      mediaSrc(embed.thumbnailUrl) ||
                      mediaSrc(embed.imageUrl) ||
                      embed.footerText?.trim();
                    if (!hasBody) return null;
                    return (
                      <div
                        key={`fetched-embed-${index}`}
                        className="overflow-hidden rounded bg-[#1e1f22]"
                        style={{ borderLeft: `4px solid ${color}` }}
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
                                    rehypePlugins={discordMarkdownRehype}
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
                    );
                  })}
                  {!fetchedMessage.content.trim() &&
                  fetchedMessage.embeds.length === 0 ? (
                    <p className="text-sm text-white/45">
                      Mensaje sin contenido de texto ni embeds.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-6 text-center text-sm text-white/60">
                {!channelId
                  ? "Selecciona un canal e ingresa el ID del mensaje."
                  : existingMessageId.trim()
                    ? "Escribe un ID de mensaje válido (17–20 dígitos)."
                    : "Ingresa el ID del mensaje para previsualizarlo."}
              </div>
            )
          ) : null}

          {createSource === "plain" ? (
            <div className="discord-md rounded-md bg-[#313338] px-3 py-2 text-sm text-white/90">
              {plainContent.trim() ? (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={discordMarkdownRehype}
                >
                  {parseDiscordEmojis(plainContent)}
                </Markdown>
              ) : (
                <span className="text-white/40">Texto del mensaje…</span>
              )}
            </div>
          ) : null}

          {createSource === "template" ? (
            previewEmbed ? (
              <>
                {previewEmbed.content?.trim() ? (
                  <div className="discord-md text-sm text-white/90">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={discordMarkdownRehype}
                    >
                      {parseDiscordEmojis(previewEmbed.content)}
                    </Markdown>
                  </div>
                ) : null}
                <div
                  className="overflow-hidden rounded bg-[#1e1f22]"
                  style={{ borderLeft: `4px solid ${previewColor}` }}
                >
                  <div className="space-y-2 p-3">
                    {previewEmbed.authorName?.trim() ? (
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {mediaSrc(previewEmbed.authorIconUrl) ? (
                          <img
                            src={mediaSrc(previewEmbed.authorIconUrl)!}
                            alt=""
                            className="size-5 rounded-full object-cover"
                          />
                        ) : null}
                        <span>{previewEmbed.authorName}</span>
                      </div>
                    ) : null}
                    <div className="flex gap-3">
                      <div className="min-w-0 flex-1">
                        {previewEmbed.title?.trim() ? (
                          <p className="text-sm font-semibold text-white">
                            {previewEmbed.title}
                          </p>
                        ) : null}
                        {previewEmbed.description?.trim() ? (
                          <div className="discord-md mt-1 text-sm text-white/80">
                            <Markdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={discordMarkdownRehype}
                            >
                              {parseDiscordEmojis(previewEmbed.description)}
                            </Markdown>
                          </div>
                        ) : null}
                      </div>
                      {mediaSrc(previewEmbed.thumbnailUrl) ? (
                        <img
                          src={mediaSrc(previewEmbed.thumbnailUrl)!}
                          alt=""
                          className="size-16 rounded object-cover"
                        />
                      ) : null}
                    </div>
                    {mediaSrc(previewEmbed.imageUrl) ? (
                      <img
                        src={mediaSrc(previewEmbed.imageUrl)!}
                        alt=""
                        className="mt-2 max-h-40 w-full rounded object-cover"
                      />
                    ) : null}
                    {(previewEmbed.footerText?.trim() ||
                      previewEmbed.timestamp) && (
                      <div className="pt-1 text-[11px] text-white/55">
                        {previewEmbed.footerText?.trim()}
                        {previewEmbed.footerText?.trim() &&
                        previewEmbed.timestamp
                          ? " • "
                          : ""}
                        {previewEmbed.timestamp
                          ? new Date().toLocaleString("es-MX")
                          : ""}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/50">
                {templateId
                  ? "Cargando plantilla…"
                  : "Selecciona una plantilla para previsualizar."}
              </p>
            )
          ) : null}

          {createType === "BUTTONS" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {activeRows.map((row, i) => (
                <span
                  key={`btn-prev-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium",
                    BUTTON_PREVIEW_CLASS[row.style ?? "Primary"],
                  )}
                >
                  {row.selection?.imageUrl ? (
                    <img
                      src={row.selection.imageUrl}
                      alt=""
                      className="size-4"
                    />
                  ) : row.selection?.display &&
                    !row.selection.display.startsWith("<") ? (
                    <span>{row.selection.display}</span>
                  ) : null}
                  {row.label || "Rol"}
                </span>
              ))}
            </div>
          ) : null}

          {createType === "SELECT" ? (
            <div className="rounded bg-[#4e5058] px-3 py-2 text-xs text-white/90">
              Elige un rol…
              <span className="ml-2 text-white/50">
                ({activeRows.filter((r) => r.roleId).length} opciones)
              </span>
            </div>
          ) : null}

          {createType === "REACTIONS" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {activeRows
                .filter((r) => r.emojiKey)
                .map((row, i) => (
                  <span
                    key={`rxn-prev-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs"
                  >
                    {row.selection?.imageUrl ? (
                      <img
                        src={row.selection.imageUrl}
                        alt=""
                        className="size-4"
                      />
                    ) : (
                      row.selection?.display ?? "?"
                    )}
                    <span className="text-white/50">1</span>
                  </span>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
          <TabsTrigger
            active={topTab === "registry"}
            onClick={() => {
              setTopTab("registry");
              setFeedback({ kind: "idle" });
            }}
          >
            Mensajes Activos
          </TabsTrigger>
          <TabsTrigger
            active={topTab === "create"}
            onClick={() => {
              setTopTab("create");
              setFeedback({ kind: "idle" });
            }}
          >
            Crear Nuevo Autorol
          </TabsTrigger>
          <TabsTrigger
            active={topTab === "autojoin"}
            onClick={() => {
              setTopTab("autojoin");
              setFeedback({ kind: "idle" });
            }}
          >
            Roles Automáticos
          </TabsTrigger>
        </TabsList>

        {topTab === "registry" ? (
          <TabsContent className="space-y-4">
            {listLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Cargando registro…
              </p>
            ) : entries.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Sin menús activos</CardTitle>
                  <CardDescription>
                    Crea un autorol en la pestaña «Crear Nuevo Autorol».
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry) => (
                  <Card key={entry.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">
                          {entry.title}
                        </CardTitle>
                        <Badge>{TYPE_LABEL[entry.type]}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {entry.isBotAuthor === true ? (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 normal-case tracking-normal dark:text-emerald-400">
                            Enviado por el Bot
                          </Badge>
                        ) : entry.isBotAuthor === false ? (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-800 normal-case tracking-normal dark:text-amber-300">
                            Mensaje Externo (Usuario)
                          </Badge>
                        ) : (
                          <Badge className="normal-case tracking-normal text-muted-foreground">
                            Autoría desconocida
                          </Badge>
                        )}
                        {entry.orphaned ? (
                          <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-700 normal-case tracking-normal dark:text-rose-400">
                            Huérfano
                          </Badge>
                        ) : null}
                      </div>
                      <CardDescription>
                        #
                        {entry.channelName ??
                          assets?.channels.find((c) => c.id === entry.channelId)
                            ?.name ??
                          entry.channelId}{" "}
                        · {entry.rolesMapping.length} rol(es)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => openManage(entry)}
                      >
                        <Users className="size-4" aria-hidden />
                        Agregar / Gestionar roles
                      </Button>
                      {entry.isBotAuthor === false ? (
                        <Tooltip content="Discord no permite a los bots editar el texto o embed de mensajes enviados por usuarios humanos.">
                          <span className="w-full">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full"
                              disabled
                            >
                              <Pencil className="size-4" aria-hidden />
                              Editar contenido / Embed
                            </Button>
                          </span>
                        </Tooltip>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={entry.orphaned === true}
                          onClick={() => void openEditContent(entry)}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Editar contenido / Embed
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(entry.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Eliminar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <FeedbackBanner feedback={feedback} />
          </TabsContent>
        ) : null}

        {topTab === "create" ? (
          <TabsContent>
            <form onSubmit={onCreate} className="w-full space-y-6">
              {/* Sección superior: Paso 1 (50%) + Vista previa (50%) */}
              <div className="mb-6 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
                <Card className="flex h-full flex-col">
                  <CardHeader>
                    <CardTitle>Paso 1 · Configuración del mensaje</CardTitle>
                    <CardDescription>
                      Plantilla, mensaje existente o texto plano — sin
                      constructor de embeds aquí.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid flex-1 content-start gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tipo de interacción</Label>
                      <Select
                        value={createType}
                        onValueChange={(v) =>
                          setCreateType(v as AutoroleRegistryType)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BUTTONS">Botones</SelectItem>
                          <SelectItem value="SELECT">
                            Menú desplegable
                          </SelectItem>
                          <SelectItem value="REACTIONS">Reacciones</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Origen</Label>
                      <Select
                        value={createSource}
                        onValueChange={(v) =>
                          setCreateSource(v as AutoroleCreateSource)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="template">
                            Seleccionar plantilla de Embed
                          </SelectItem>
                          <SelectItem value="existing">
                            Usar ID de mensaje existente
                          </SelectItem>
                          <SelectItem value="plain">
                            Mensaje de texto plano
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Canal</Label>
                      <Select
                        value={channelId || undefined}
                        onValueChange={(next) => {
                          setChannelId(next);
                          setFetchedMessage(null);
                          setMessageFetchError(null);
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un canal…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(assets?.channels ?? []).map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              #{channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Nombre en el registro (opcional)</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ej. Roles de colores"
                        disabled={busy}
                      />
                    </div>

                    {createSource === "template" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Plantilla</Label>
                        <Select
                          value={templateId || undefined}
                          onValueChange={setTemplateId}
                          disabled={busy}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Elige plantilla…" />
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
                      </div>
                    ) : null}

                    {createSource === "existing" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>ID del mensaje</Label>
                        <div className="relative">
                          <Input
                            value={existingMessageId}
                            onChange={(e) =>
                              setExistingMessageId(e.target.value.trim())
                            }
                            placeholder={
                              channelId
                                ? "Snowflake del mensaje"
                                : "Primero selecciona un canal"
                            }
                            disabled={busy || !channelId}
                            required
                            className="pr-10"
                          />
                          {messageFetching ? (
                            <Loader2
                              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                              aria-hidden
                            />
                          ) : null}
                        </div>
                        {messageFetchError ? (
                          <p
                            role="alert"
                            className="text-xs font-medium text-rose-600 dark:text-rose-400"
                          >
                            {messageFetchError}
                          </p>
                        ) : alreadyConfigured ? (
                          <p
                            role="alert"
                            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-300"
                          >
                            {DUPLICATE_AUTOROLE_TOAST}
                          </p>
                        ) : fetchedMessage ? (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            Mensaje encontrado · @{fetchedMessage.author.username}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {createSource === "plain" ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Texto del mensaje</Label>
                        <Textarea
                          value={plainContent}
                          onChange={(e) => setPlainContent(e.target.value)}
                          rows={3}
                          disabled={busy}
                          required
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="h-full min-h-[280px]">
                  {renderCreatePreview()}
                </div>
              </div>

              {/* Sección inferior: Paso 2 a ancho completo */}
              <Card className="w-full">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <CardTitle>Paso 2 · Mapeo de roles</CardTitle>
                      <CardDescription>
                        Emoji, etiqueta, rol y estilo — dos por fila.
                      </CardDescription>
                    </div>
                    {createSource === "existing" &&
                    messageReactions.length > 0 &&
                    !alreadyConfigured ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={autocompleteReactions}
                      >
                        <Sparkles className="size-4" aria-hidden />
                        Autocompletar emojis del mensaje
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  {renderMappingEditor(
                    createRows,
                    setCreateRows,
                    createType,
                    { twoColumnCards: true },
                  )}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !channelId ||
                    alreadyConfigured ||
                    (createSource === "existing" && messageFetching)
                  }
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Publicar autorol
                </Button>
                <FeedbackBanner feedback={feedback} />
              </div>
            </form>
          </TabsContent>
        ) : null}

        {topTab === "autojoin" ? (
          <TabsContent>
            <form onSubmit={onSaveAutoJoin} className="w-full space-y-4">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Card className="lg:col-span-8">
                  <CardHeader>
                    <CardTitle>Roles al unirse</CardTitle>
                    <CardDescription>
                      Humanos y bots reciben roles distintos al entrar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5 sm:grid-cols-2">
                    <RoleMultiSelect
                      label="Roles a asignar a Humanos"
                      roles={assets?.roles ?? []}
                      value={humanRoles}
                      onChange={setHumanRoles}
                      disabled={busy}
                    />
                    <RoleMultiSelect
                      label="Roles a asignar a Bots"
                      roles={assets?.roles ?? []}
                      value={botRoles}
                      onChange={setBotRoles}
                      disabled={busy}
                    />
                  </CardContent>
                </Card>
                <aside className="space-y-4 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
                  <div className="overflow-hidden rounded-lg border border-border bg-[#2b2d31] text-white shadow-sm">
                    <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60">
                      Vista previa
                    </div>
                    <div className="space-y-3 p-4 text-sm text-white/80">
                      <div>
                        <p className="mb-1 text-xs text-white/50">Humanos</p>
                        <p>
                          {humanRoles.length
                            ? humanRoles
                                .map(
                                  (id) =>
                                    `@${assets?.roles.find((r) => r.id === id)?.name ?? id}`,
                                )
                                .join(", ")
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-white/50">Bots</p>
                        <p>
                          {botRoles.length
                            ? botRoles
                                .map(
                                  (id) =>
                                    `@${assets?.roles.find((r) => r.id === id)?.name ?? id}`,
                                )
                                .join(", ")
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Guardar configuración
                  </Button>
                  <FeedbackBanner feedback={feedback} />
                </aside>
              </div>
            </form>
          </TabsContent>
        ) : null}
      </Tabs>

      <Sheet
        open={manageEntry != null}
        onOpenChange={(open) => {
          if (!open) setManageEntry(null);
        }}
        title="Gestionar roles"
        description={
          manageEntry
            ? `${manageEntry.title} · ${TYPE_LABEL[manageEntry.type]}`
            : undefined
        }
      >
        {manageEntry ? (
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
            {renderMappingEditor(
              manageRows,
              setManageRows,
              manageEntry.type,
            )}
            <Button type="button" disabled={busy} onClick={() => void saveManage()}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar en Discord
            </Button>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={editEntry != null}
        onOpenChange={(open) => {
          if (!open) setEditEntry(null);
        }}
        side="right"
        className="w-full max-w-[450px] sm:max-w-[540px]"
        title="Editar Contenido de Autorol"
        description="Modifica el texto o embed del mensaje en vivo. Los cambios se aplicarán instantáneamente en Discord."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditEntry(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || editLoading || !editEntry}
              onClick={() => void saveEditContent()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Guardar Cambios en Discord
            </Button>
          </div>
        }
      >
        {editEntry ? (
          <div className="space-y-4">
            {editLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Cargando contenido actual…
              </p>
            ) : (
              <Tabs>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    active={editTab === "message"}
                    onClick={() => setEditTab("message")}
                  >
                    Mensaje Base
                  </TabsTrigger>
                  <TabsTrigger
                    active={editTab === "embed"}
                    onClick={() => setEditTab("embed")}
                  >
                    Campos del Embed
                  </TabsTrigger>
                </TabsList>

                {editTab === "message" ? (
                  <TabsContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="autorole-edit-dashboard-title">
                        Título en el dashboard
                      </Label>
                      <Input
                        id="autorole-edit-dashboard-title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="autorole-edit-content">
                          Texto del mensaje
                        </Label>
                        <DiscordEmojiPicker
                          serverEmojis={assets?.emojis ?? []}
                          disabled={busy}
                          onSelect={(selection) => {
                            const mention =
                              selection.mention ?? selection.display;
                            setEditEmbed((prev) => ({
                              ...prev,
                              content: `${prev.content ?? ""}${mention}`,
                            }));
                          }}
                        />
                      </div>
                      <Textarea
                        id="autorole-edit-content"
                        rows={6}
                        value={editEmbed.content ?? ""}
                        onChange={(e) =>
                          setEditEmbed((prev) => ({
                            ...prev,
                            content: e.target.value,
                          }))
                        }
                        placeholder="Texto plano fuera del embed…"
                        disabled={busy}
                        maxLength={2000}
                      />
                      <p className="text-xs text-muted-foreground">
                        Este texto aparece encima del embed en Discord.
                      </p>
                    </div>
                  </TabsContent>
                ) : (
                  <TabsContent>
                    <EmbedFormTemplate
                      value={editEmbed}
                      onChange={setEditEmbed}
                      serverEmojis={assets?.emojis ?? []}
                      disabled={busy}
                      idPrefix="autorole-edit"
                      compact
                      hideOuterContent
                    />
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        ) : null}
      </Sheet>

      <ToastBanner
        message={duplicateToast}
        variant="error"
        onDismiss={() => setDuplicateToast(null)}
      />
      <ToastBanner
        message={successToast}
        variant="success"
        onDismiss={() => setSuccessToast(null)}
      />

      <AlertDialog
        open={deleteId != null}
        title="Eliminar autorol"
        description="Se quitarán los botones/reacciones del mensaje en Discord y el registro en la base de datos. Si el mensaje ya no existe, solo se limpia el registro."
        confirmLabel="Eliminar"
        tone="destructive"
        confirming={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
