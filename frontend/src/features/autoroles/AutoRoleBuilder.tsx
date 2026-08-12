import { useEffect, useState, type FormEvent } from "react";
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
  GuildAssetsResponse,
  MessageButtonStyle,
  MessageSourceMode,
  ReactionRoleMappingInput,
} from "@adobos/shared";
import { createAutoRole, fetchGuildAssets } from "@/lib/api";
import {
  DiscordEmojiPicker,
  type DiscordEmojiSelection,
} from "@/components/shared/DiscordEmojiPicker";
import {
  EmbedFormTemplate,
  emptyEmbedPayload,
} from "@/components/shared/EmbedFormTemplate";
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
import { cn } from "@/lib/utils";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

interface ReactionRow extends ReactionRoleMappingInput {
  selection: DiscordEmojiSelection | null;
}

const ACTION_STYLES: Exclude<MessageButtonStyle, "Link">[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
];

function emptyReactionRow(): ReactionRow {
  return { emojiKey: "", roleId: "", selection: null };
}

function emptyButtonMapping(): ButtonRoleMappingInput {
  return {
    roleId: "",
    label: "Obtener rol",
    style: "Primary",
    customId: "",
  };
}

export function AutoRoleBuilder() {
  const [mode, setMode] = useState<AutoRoleMode>("reactions");
  const [messageSource, setMessageSource] =
    useState<MessageSourceMode>("create");
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [embed, setEmbed] = useState<EmbedPayload>(emptyEmbedPayload);
  const [reactionRows, setReactionRows] = useState<ReactionRow[]>([
    emptyReactionRow(),
  ]);
  const [buttonMappings, setButtonMappings] = useState<ButtonRoleMappingInput[]>(
    [emptyButtonMapping()],
  );
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const isSubmitting = feedback.kind === "loading";

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
            error instanceof Error ? error.message : "No se pudieron cargar assets",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!assets) {
      setFeedback({ kind: "error", message: "Assets del servidor no disponibles." });
      return;
    }

    setFeedback({ kind: "loading" });
    try {
      const payload: CreateAutoRoleRequest = {
        mode,
        guildId: assets.guildId,
        channelId,
        messageSource,
        messageId: messageSource === "existing" ? messageId : undefined,
        embed: messageSource === "create" ? embed : undefined,
        reactionMappings:
          mode === "reactions"
            ? reactionRows
                .filter((row) => row.emojiKey && row.roleId)
                .map(({ emojiKey, roleId }) => ({ emojiKey, roleId }))
            : undefined,
        buttonMappings:
          mode === "buttons"
            ? buttonMappings
                .filter((row) => row.roleId)
                .map((row) => ({
                  ...row,
                  customId: row.customId || `autorole_${row.roleId}`,
                }))
            : undefined,
      };

      const result = await createAutoRole(payload);
      setFeedback({
        kind: "ok",
        message: `Listo. Mensaje ${result.messageId} · ${result.saved} mapping(s) guardados.`,
      });
      if (messageSource === "create") {
        setMessageId(result.messageId);
      }
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Modo de Autorol</CardTitle>
          <CardDescription>
            Botones interactivos o reacciones clásicas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
          {assetsError && (
            <p className="text-xs text-amber-700 dark:text-amber-400">{assetsError}</p>
          )}
          {assets && (
            <p className="text-xs text-muted-foreground">
              Servidor: {assets.guildName}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensaje del menú</CardTitle>
          <CardDescription>
            Usa un mensaje existente o crea un embed nuevo desde aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            {(
              [
                { id: "create", label: "Crear nuevo embed" },
                { id: "existing", label: "Mensaje existente" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  messageSource === option.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setMessageSource(option.id)}
              >
                {option.label}
              </button>
            ))}
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
                    <SelectItem key={channel.id} value={channel.id}>
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
                onChange={(event) => setChannelId(event.target.value)}
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
                placeholder="Snowflake del mensaje menú"
                disabled={isSubmitting}
                onChange={(event) => setMessageId(event.target.value)}
              />
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/20 p-4">
              <EmbedFormTemplate
                value={embed}
                onChange={setEmbed}
                serverEmojis={assets?.emojis ?? []}
                disabled={isSubmitting}
                idPrefix="autorole-embed"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {mode === "reactions" ? (
        <Card>
          <CardHeader>
            <CardTitle>Emoji → Rol</CardTitle>
            <CardDescription>
              Elige emojis nativos o del servidor con el picker visual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reactionRows.map((row, index) => (
              <div
                key={`reaction-${index}`}
                className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-[auto_1fr_auto]"
              >
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <DiscordEmojiPicker
                    serverEmojis={assets?.emojis ?? []}
                    value={row.selection}
                    disabled={isSubmitting}
                    onSelect={(selection) => {
                      const next = [...reactionRows];
                      next[index] = {
                        ...row,
                        selection,
                        emojiKey: selection.emojiKey,
                      };
                      setReactionRows(next);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select
                    value={row.roleId || undefined}
                    disabled={isSubmitting}
                    onValueChange={(roleId) => {
                      const next = [...reactionRows];
                      next[index] = { ...row, roleId };
                      setReactionRows(next);
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

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isSubmitting || reactionRows.length <= 1}
                    onClick={() =>
                      setReactionRows((prev) =>
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
                setReactionRows((prev) => [...prev, emptyReactionRow()])
              }
            >
              <Plus className="size-4" aria-hidden />
              Añadir emoji → rol
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Botón → Rol</CardTitle>
            <CardDescription>
              Se generará <code className="font-mono text-xs">autorole_&lt;roleId&gt;</code>{" "}
              automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {buttonMappings.map((mapping, index) => (
              <div
                key={`button-${index}`}
                className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select
                    value={mapping.roleId || undefined}
                    disabled={isSubmitting}
                    onValueChange={(roleId) => {
                      const next = [...buttonMappings];
                      next[index] = {
                        ...mapping,
                        roleId,
                        customId: roleId ? `autorole_${roleId}` : "",
                      };
                      setButtonMappings(next);
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
                  <Label>Etiqueta</Label>
                  <Input
                    value={mapping.label}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      const next = [...buttonMappings];
                      next[index] = { ...mapping, label: event.target.value };
                      setButtonMappings(next);
                    }}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Estilo</Label>
                  <Select
                    value={mapping.style}
                    disabled={isSubmitting}
                    onValueChange={(style) => {
                      const next = [...buttonMappings];
                      next[index] = {
                        ...mapping,
                        style: style as ButtonRoleMappingInput["style"],
                      };
                      setButtonMappings(next);
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
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() =>
                setButtonMappings((prev) => [...prev, emptyButtonMapping()])
              }
            >
              <Plus className="size-4" aria-hidden />
              Añadir botón → rol
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <Button type="submit" disabled={isSubmitting || !channelId}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {messageSource === "create"
            ? "Crear mensaje y guardar autoroles"
            : "Guardar autoroles"}
        </Button>

        {feedback.kind === "ok" && (
          <p className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            {feedback.message}
          </p>
        )}
        {feedback.kind === "error" && (
          <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400" role="alert">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {feedback.message}
          </p>
        )}
      </div>
    </form>
  );
}
