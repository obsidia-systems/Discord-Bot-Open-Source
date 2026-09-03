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
  normalizeCustomCommandOptions,
} from "@adobos/shared";
import {
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Terminal,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { useEntitlements } from "@/features/entitlements/useEntitlements";
import {
  createCustomCommand,
  deleteCustomCommand,
  fetchCustomCommands,
  fetchGuildAssets,
  resolvePublicAssetUrl,
  syncCustomCommands,
  toggleCustomCommand,
  updateCustomCommand,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type MainTab = "list" | "builder";
type BuilderTab = "general" | "options" | "permissions";

type DraftState = {
  name: string;
  description: string;
  responseData: CustomCommandResponseData;
  options: CustomCommandOptions;
  permissions: CustomCommandPermissions;
  useEmbed: boolean;
  isActive: boolean;
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
    isActive: true,
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
    options: normalizeCustomCommandOptions(command.options),
    permissions: {
      allowedRoleIds: [...command.permissions.allowedRoleIds],
      ignoredRoleIds: [...command.permissions.ignoredRoleIds],
      allowedChannelIds: [...command.permissions.allowedChannelIds],
      ignoredChannelIds: [...command.permissions.ignoredChannelIds],
    },
    useEmbed: Boolean(command.responseData.embed),
    isActive: command.isActive,
  };
}

function MiniEmbedPreview({ embed }: { embed: CustomCommandEmbed }) {
  const image = embed.imageUrl ? resolvePublicAssetUrl(embed.imageUrl) : null;
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1]">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: embed.color || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <p className="text-sm font-semibold text-white">
            {embed.title || "Untitled"}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">
            {embed.description || "No description"}
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
        <CardTitle className="text-base">Variables Reference</CardTitle>
        <CardDescription>
          Click to copy a token to the clipboard.
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
  const { limitOf, isUnlimited } = useEntitlements();
  const [mainTab, setMainTab] = useState<MainTab>("list");
  const [builderTab, setBuilderTab] = useState<BuilderTab>("general");
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const customCap = limitOf("customCommands");
  const atCustomLimit =
    !isUnlimited("customCommands") && commands.length >= customCap;

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
          : "Couldn't load the commands.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    if (atCustomLimit) {
      setError(
        `You've reached this plan's limit of ${customCap} Custom Commands.`,
      );
      return;
    }
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
      setError("Invalid name: only lowercase, numbers, _ and - (max. 32).");
      return;
    }
    if (!draft.description.trim()) {
      setError("The description is required.");
      return;
    }
    const responseData: CustomCommandResponseData = {
      content: draft.responseData.content,
      embed: draft.useEmbed
        ? (draft.responseData.embed ?? defaultCustomCommandEmbed())
        : null,
    };
    if (!responseData.content.trim() && !responseData.embed) {
      setError("Add response text or enable the embed.");
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
        isActive: draft.isActive,
      };
      if (editingId == null) {
        if (atCustomLimit) {
          setError(
            `You've reached this plan's limit of ${customCap} Custom Commands.`,
          );
          setSaving(false);
          return;
        }
        const res = await createCustomCommand(body);
        setEditingId(res.command.id);
        setDraft(commandToDraft(res.command));
        setSuccess(`Command /${res.command.name} saved.`);
        if (res.synced === false) {
          setError(
            res.warning ??
              "Saved in the dashboard, but Discord wasn't updated. Use Re-sync.",
          );
        }
      } else {
        const res = await updateCustomCommand(editingId, body);
        setDraft(commandToDraft(res.command));
        setSuccess(`Command /${res.command.name} saved.`);
        if (res.synced === false) {
          setError(
            res.warning ??
              "Saved in the dashboard, but Discord wasn't updated. Use Re-sync.",
          );
        }
      }
      await load();
      setMainTab("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (command: CustomCommand, isActive: boolean) => {
    setTogglingId(command.id);
    setError(null);
    try {
      const res = await toggleCustomCommand(command.id, isActive);
      setCommands((prev) =>
        prev.map((c) => (c.id === command.id ? res.command : c)),
      );
      if (res.synced === false) {
        setError(
          res.warning ??
            "Status saved, but Discord wasn't updated. Use Re-sync.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't change the status.",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await syncCustomCommands();
      setSuccess(`Synced ${res.count} slash commands with Discord.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sync.");
    } finally {
      setSyncing(false);
    }
  };

  const onDelete = async (command: CustomCommand) => {
    if (
      !window.confirm(
        `Delete \`/${command.name}\`? It will also be removed from Discord.`,
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
      setSuccess(`Command /${command.name} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading Custom Commands…
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
                My Commands
              </TabsTrigger>
              <TabsTrigger
                type="button"
                active={mainTab === "builder"}
                onClick={() => {
                  if (mainTab !== "builder") openCreate();
                }}
              >
                Create/Edit
              </TabsTrigger>
            </TabsList>

            {mainTab === "list" ? (
              <TabsContent className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {commands.length === 0
                      ? "No commands yet."
                      : `${commands.length}${isUnlimited("customCommands") ? "" : ` / ${customCap}`} command${commands.length === 1 ? "" : "s"}`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={syncing}
                      onClick={() => void onSync()}
                    >
                      {syncing ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="size-4" aria-hidden />
                      )}
                      Re-sync
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={openCreate}
                      disabled={atCustomLimit}
                    >
                      <Plus className="size-4" aria-hidden />
                      New
                    </Button>
                  </div>
                </div>

                {commands.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
                    <Terminal className="size-8 text-primary/70" aria-hidden />
                    <p className="text-sm font-medium">
                      No Custom Commands
                    </p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Create slash commands like{" "}
                      <code className="rounded bg-muted px-1">/rules</code> with
                      text, embeds, and variables.
                    </p>
                    <Button type="button" onClick={openCreate}>
                      Create command
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
                                  <Badge>Silent</Badge>
                                ) : null}
                                {command.options.dmResponse ? (
                                  <Badge>DM</Badge>
                                ) : null}
                                <Badge
                                  className={
                                    command.isActive
                                      ? "border-primary/40 bg-primary/15 text-primary"
                                      : undefined
                                  }
                                >
                                  {command.isActive ? "Active" : "Paused"}
                                </Badge>
                              </div>
                              <p className="truncate text-sm text-muted-foreground">
                                {command.description}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={command.isActive}
                                  disabled={togglingId === command.id}
                                  onCheckedChange={(checked) =>
                                    void onToggle(command, checked)
                                  }
                                  aria-label={
                                    command.isActive
                                      ? "Disable command"
                                      : "Enable command"
                                  }
                                />
                                <span className="text-xs text-muted-foreground">
                                  {togglingId === command.id
                                    ? "…"
                                    : command.isActive
                                      ? "ON"
                                      : "OFF"}
                                </span>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(command)}
                              >
                                <Pencil className="size-3.5" aria-hidden />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void onDelete(command)}
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
                      Options
                    </TabsTrigger>
                    <TabsTrigger
                      type="button"
                      active={builderTab === "permissions"}
                      onClick={() => setBuilderTab("permissions")}
                    >
                      Permissions
                    </TabsTrigger>
                  </TabsList>

                  {builderTab === "general" ? (
                    <TabsContent className="mt-4 space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Slash identity
                          </CardTitle>
                          <CardDescription>
                            Name and description shown in Discord.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="cc-name">Name</Label>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">/</span>
                              <Input
                                id="cc-name"
                                value={draft.name}
                                maxLength={32}
                                placeholder="rules"
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
                              Only lowercase, numbers, hyphens, and underscores
                              (max. 32). Regex:{" "}
                              <code className="rounded bg-muted px-1">
                                {CUSTOM_COMMAND_NAME_REGEX.source}
                              </code>
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="cc-desc">Description</Label>
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
                          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">
                                Active in Discord
                              </p>
                              <p className="text-xs text-muted-foreground">
                                OFF removes the slash command without deleting it.
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
                          <CardTitle className="text-base">Response</CardTitle>
                          <CardDescription>
                            Plain text and/or embed. Use variables from the
                            right column.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="cc-content">Text</Label>
                            <Textarea
                              id="cc-content"
                              rows={4}
                              value={draft.responseData.content}
                              maxLength={2000}
                              placeholder="Hi {user}! Welcome to {server}."
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
                                Include embed
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Mini Discord embed builder.
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
                                      ? (prev.responseData.embed ??
                                        defaultCustomCommandEmbed())
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
                                  <Label>Title</Label>
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
                                <Label>Description</Label>
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
                                <Label>Image URL (optional)</Label>
                                <Input
                                  type="url"
                                  placeholder="https://… o /uploads/…"
                                  value={
                                    draft.responseData.embed?.imageUrl ?? ""
                                  }
                                  onChange={(e) =>
                                    patchEmbed({
                                      imageUrl: e.target.value.trim() || null,
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
                          <CardTitle className="text-base">Options</CardTitle>
                          <CardDescription>
                            Behavior when the command runs.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(
                            [
                              {
                                key: "ephemeral" as const,
                                label: "Silent response",
                                help: "Only the user who runs it sees the response (ephemeral).",
                              },
                              {
                                key: "dmResponse" as const,
                                label: "Response by DM",
                                help: "Sends the content to DMs instead of the channel.",
                              },
                              {
                                key: "autoDelete" as const,
                                label: "Auto-delete response",
                                help: "Deletes the bot's response after 15 seconds.",
                              },
                              {
                                key: "disableMentions" as const,
                                label: "Disable pings",
                                help: "Nobody gets a notification, not even {user}.",
                              },
                              {
                                key: "allowEveryone" as const,
                                label: "Allow @everyone / @here",
                                help: "Only then do {everyone} and {here} notify. Off by default.",
                              },
                              {
                                key: "acceptText" as const,
                                label: "Text option",
                                help: "Adds /command text:… and the {text} token.",
                              },
                              {
                                key: "acceptUser" as const,
                                label: "User option",
                                help: "Adds /command user:@… and the {target} token.",
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
                              Cooldown (seconds)
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
                              0 = no limit between uses per user.
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
                          <CardTitle className="text-base">Permissions</CardTitle>
                          <CardDescription>
                            Empty = no restriction. Ignored takes priority over
                            allowed.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                          <RoleMultiSelect
                            label="Allowed roles"
                            roles={roleOptions}
                            value={draft.permissions.allowedRoleIds}
                            onChange={(allowedRoleIds) =>
                              patchPermissions({ allowedRoleIds })
                            }
                          />
                          <RoleMultiSelect
                            label="Ignored roles"
                            roles={roleOptions}
                            value={draft.permissions.ignoredRoleIds}
                            onChange={(ignoredRoleIds) =>
                              patchPermissions({ ignoredRoleIds })
                            }
                          />
                          <ChannelMultiSelect
                            label="Allowed channels"
                            channels={channelOptions}
                            value={draft.permissions.allowedChannelIds}
                            onChange={(allowedChannelIds) =>
                              patchPermissions({ allowedChannelIds })
                            }
                          />
                          <ChannelMultiSelect
                            label="Ignored channels"
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
                    Save and sync
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
                    Cancel
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
