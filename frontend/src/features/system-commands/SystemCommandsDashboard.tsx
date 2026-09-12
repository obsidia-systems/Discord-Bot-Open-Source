import type {
  GuildChannelAsset,
  GuildRoleAsset,
  SystemCommandCategory,
  SystemCommandConfig,
} from "@adobos/shared";
import {
  SYSTEM_COMMAND_CATEGORY_LABELS,
  SYSTEM_COMMAND_PARAM_TYPE_LABELS,
  formatSystemCommandSyntax,
} from "@adobos/shared";
import {
  fetchGuildAssets,
  fetchSystemCommands,
  saveSystemCommands,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  CircleDollarSign,
  Gavel,
  LayoutDashboard,
  Loader2,
  Power,
  PowerOff,
  Save,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { queryKeys } from "@/lib/query/keys";
import { useGuildQuery } from "@/lib/query/useGuildQuery";
import { useEffect, useMemo, useState } from "react";

type CategoryFilter = "all" | SystemCommandCategory;

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "general", label: SYSTEM_COMMAND_CATEGORY_LABELS.general },
  { id: "moderation", label: SYSTEM_COMMAND_CATEGORY_LABELS.moderation },
  { id: "community", label: SYSTEM_COMMAND_CATEGORY_LABELS.community },
  { id: "economy", label: SYSTEM_COMMAND_CATEGORY_LABELS.economy },
];

const CATEGORY_STYLES: Partial<Record<
  SystemCommandCategory,
  { badge: string; icon: typeof Gavel; iconColor: string; iconSurface: string }
>> = {
  general: {
    badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    icon: LayoutDashboard,
    iconColor: "text-slate-600 dark:text-slate-300",
    iconSurface: "border-slate-500/30 bg-slate-500/10",
  },
  moderation: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    icon: Gavel,
    iconColor: "text-red-700 dark:text-red-300",
    iconSurface: "border-red-500/30 bg-red-500/10",
  },
  community: {
    badge:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    icon: Users,
    iconColor: "text-violet-700 dark:text-violet-300",
    iconSurface: "border-violet-500/30 bg-violet-500/10",
  },
  economy: {
    badge:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: CircleDollarSign,
    iconColor: "text-emerald-700 dark:text-emerald-300",
    iconSurface: "border-emerald-500/30 bg-emerald-500/10",
  },
};

const CHANNEL_TYPES = new Set([0, 2, 5, 13, 15]);

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function CommandsSkeleton() {
  const block = (className: string) => (
    <div
      className={`motion-safe:animate-pulse rounded-sm bg-muted/70 ${className}`}
      aria-hidden="true"
    />
  );

  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite" aria-label="Loading commands">
      <span className="sr-only">Loading commands…</span>
      <header className="space-y-3">
        {block("h-3 w-32")}
        {block("h-9 w-52")}
        {block("h-4 w-full max-w-[40rem]")}
        {block("h-4 w-3/4 max-w-[32rem]")}
      </header>
      <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/55 p-3 sm:flex-row">
        {block("h-10 w-full sm:max-w-sm")}
        {block("h-10 w-full sm:w-72")}
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border/70 p-4 last:border-0">
            {block("size-9 shrink-0 rounded-md")}
            <div className="min-w-0 flex-1 space-y-2">
              {block("h-4 w-32")}
              {block("h-3 w-full max-w-[28rem]")}
            </div>
            {block("hidden h-6 w-20 sm:block")}
            {block("h-9 w-24")}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemCommandsDashboard() {
  const [commands, setCommands] = useState<SystemCommandConfig[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [configuringName, setConfiguringName] = useState<string | null>(null);
  const [configuringSnapshot, setConfiguringSnapshot] =
    useState<SystemCommandConfig | null>(null);
  const [bulkRoles, setBulkRoles] = useState<string[]>([]);
  const [bulkChannels, setBulkChannels] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const configuring = useMemo(
    () => commands.find((c) => c.name === configuringName) ?? null,
    [commands, configuringName],
  );

  const selectableChannels = useMemo(
    () =>
      channels
        .filter((ch) => CHANNEL_TYPES.has(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const listQuery = useGuildQuery(queryKeys.systemCommands, async () => {
    const [list, assets] = await Promise.all([
      fetchSystemCommands(),
      fetchGuildAssets(),
    ]);
    return { list, assets };
  });

  useEffect(() => {
    if (!listQuery.data) return;
    setCommands(listQuery.data.list);
    setRoles(listQuery.data.assets.roles ?? []);
    setChannels(listQuery.data.assets.channels ?? []);
    setLoading(false);
    setToast(null);
  }, [listQuery.data]);

  useEffect(() => {
    if (listQuery.isError) {
      setToast({
        variant: "error",
        message:
          listQuery.error instanceof Error
            ? listQuery.error.message
            : "Couldn't load system commands.",
      });
      setLoading(false);
    }
  }, [listQuery.isError, listQuery.error]);

  useEffect(() => {
    setBulkRoles([]);
    setBulkChannels([]);
  }, [category]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return commands.filter((cmd) => {
      if (category !== "all" && cmd.category !== category) return false;
      if (!q) return true;
      return (
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
      );
    });
  }, [commands, category, debouncedQuery]);

  function commandPayload(nextCommands: SystemCommandConfig[]) {
    return nextCommands.map((c) => ({
      commandName: c.name,
      enabled: c.enabled,
      allowedRoles: c.allowedRoles,
      ignoredChannels: c.ignoredChannels ?? [],
      ephemeral: c.ephemeral,
    }));
  }

  async function persistCommands(
    nextCommands: SystemCommandConfig[],
    successMessage: string,
    rollbackCommands?: SystemCommandConfig[],
  ): Promise<boolean> {
    setSaving(true);
    setToast(null);
    try {
      const next = await saveSystemCommands(commandPayload(nextCommands));
      setCommands(next);
      setToast({ variant: "success", message: successMessage });
      return true;
    } catch (error) {
      if (rollbackCommands) setCommands(rollbackCommands);
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Couldn't save.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleToggle(name: string, enabled: boolean): void {
    const previous = commands;
    const next = commands.map((command) =>
      command.name === name ? { ...command, enabled } : command,
    );
    setCommands(next);
    void persistCommands(next, "Command status updated.", previous);
  }

  function enableCategory(cat: SystemCommandCategory, enabled: boolean): void {
    const previous = commands;
    const next = commands.map((command) =>
      command.category === cat ? { ...command, enabled } : command,
    );
    setCommands(next);
    void persistCommands(
      next,
      `${SYSTEM_COMMAND_CATEGORY_LABELS[cat]} commands updated.`,
      previous,
    );
  }

  function applyBulkToCategory(cat: SystemCommandCategory): void {
    const previous = commands;
    const next = commands.map((command) =>
      command.category === cat
        ? {
            ...command,
            allowedRoles:
              bulkRoles.length > 0
                ? uniqueIds([...command.allowedRoles, ...bulkRoles])
                : command.allowedRoles,
            ignoredChannels:
              bulkChannels.length > 0
                ? uniqueIds([
                    ...(command.ignoredChannels ?? []),
                    ...bulkChannels,
                  ])
                : (command.ignoredChannels ?? []),
          }
        : command,
    );
    setCommands(next);
    void persistCommands(
      next,
      `${SYSTEM_COMMAND_CATEGORY_LABELS[cat]} permissions updated.`,
      previous,
    );
  }

  function patchCommand(
    name: string,
    patch: Partial<
      Pick<
        SystemCommandConfig,
        "allowedRoles" | "ignoredChannels" | "ephemeral"
      >
    >,
  ): void {
    setCommands((prev) =>
      prev.map((command) =>
        command.name === name ? { ...command, ...patch } : command,
      ),
    );
  }

  function closeConfiguration(): void {
    if (configuringSnapshot) {
      setCommands((prev) =>
        prev.map((command) =>
          command.name === configuringSnapshot.name
            ? configuringSnapshot
            : command,
        ),
      );
    }
    setConfiguringName(null);
    setConfiguringSnapshot(null);
  }

  async function saveConfiguration(): Promise<void> {
    if (!configuring) return;
    const saved = await persistCommands(
      commands,
      `/${configuring.name} settings saved.`,
    );
    if (saved) {
      setConfiguringName(null);
      setConfiguringSnapshot(null);
    }
  }

  if (loading) {
    return <CommandsSkeleton />;
  }

  const enabledCommandCount = commands.filter((command) => command.enabled).length;
  const restrictedCommandCount = commands.filter(
    (command) =>
      command.allowedRoles.length > 0 ||
      (command.ignoredChannels ?? []).length > 0,
  ).length;
  const activeAreaCount = new Set(
    commands
      .filter((command) => command.enabled)
      .map((command) => command.category),
  ).size;
  const enabledPercentage = commands.length
    ? Math.round((enabledCommandCount / commands.length) * 100)
    : 0;
  const activeCategoryIndex = Math.max(
    0,
    CATEGORY_FILTERS.findIndex((filter) => filter.id === category),
  );

  return (
    <div className="relative flex flex-col gap-6">
      {toast ? (
        <ToastBanner
          variant={toast.variant}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            General / Commands
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
            System Commands
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Control which built-in commands are available in this server and
            who can use them.
          </p>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          Commands are registered globally
        </div>
      </header>

      <div className="grid grid-cols-1 divide-y divide-border/70 rounded-lg border border-border/70 bg-card/55 sm:grid-cols-[1.35fr_1fr_1fr] sm:divide-x sm:divide-y-0">
        <div className="min-w-0 px-4 py-4 sm:px-5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Enabled commands
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {enabledPercentage}%
            </p>
          </div>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-primary">
            {enabledCommandCount} <span className="text-muted-foreground">/ {commands.length}</span>
          </p>
          <div
            className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Enabled commands"
            aria-valuemin={0}
            aria-valuemax={commands.length}
            aria-valuenow={enabledCommandCount}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${enabledPercentage}%` }}
            />
          </div>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Restricted
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
            {restrictedCommandCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            With role or channel rules
          </p>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Active areas
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
            {activeAreaCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sidebar categories in use
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or description…"
            className="pl-9"
            aria-label="Search commands"
          />
        </div>
        <div className="w-full overflow-x-auto lg:w-auto">
          <Tabs>
            <TabsList className="relative grid h-10 min-w-[30rem] grid-cols-5 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-inset)] p-0.5 text-[var(--text-muted)]">
              <span
                className="pointer-events-none absolute inset-y-0.5 left-0.5 z-0 rounded-[var(--radius-xs)] border border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-[var(--shadow-hard-neutral-hover)] transition-[transform,background-color,border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-snap)] motion-reduce:transition-none"
                style={{
                  width: "calc((100% - 0.25rem) / 5)",
                  transform: `translateX(${activeCategoryIndex * 100}%)`,
                }}
                aria-hidden="true"
              />
              {CATEGORY_FILTERS.map((f) => (
                <TabsTrigger
                  key={f.id}
                  active={category === f.id}
                  className={cn(
                    "relative z-10 h-9 rounded-[var(--radius-xs)] px-3 font-sans text-xs font-medium normal-case tracking-normal transition-[color,background-color] duration-[var(--dur-fast)]",
                    category === f.id
                      ? "bg-transparent text-[var(--text-primary)] shadow-none"
                      : "bg-transparent text-[var(--text-muted)] hover:bg-transparent hover:text-[var(--text-primary)]",
                  )}
                  onClick={() => setCategory(f.id)}
                >
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {category !== "all" ? (
        <Card className="mb-2 border-primary/20 bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Bulk Actions for {SYSTEM_COMMAND_CATEGORY_LABELS[category]}
            </CardTitle>
            <CardDescription>
              Changes are staged locally for this category. Save when you are
              ready to persist them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => enableCategory(category, true)}
                disabled={saving}
              >
                <Power className="size-4" />
                Enable All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => enableCategory(category, false)}
                disabled={saving}
              >
                <PowerOff className="size-4" />
                Disable All
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <RoleMultiSelect
                label="Apply Allowed Role to the whole category"
                placeholder="Select roles…"
                roles={roles}
                value={bulkRoles}
                onChange={setBulkRoles}
                emptyHint="No roles selected to apply."
              />
              <ChannelMultiSelect
                label="Apply Ignored Channel to the whole category"
                placeholder="Select channels…"
                channels={selectableChannels}
                value={bulkChannels}
                onChange={setBulkChannels}
                emptyHint="No channels selected to apply."
              />
            </div>
            <Button
              type="button"
              onClick={() => applyBulkToCategory(category)}
              disabled={
                saving || (bulkRoles.length === 0 && bulkChannels.length === 0)
              }
            >
              Apply to the category
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No commands match the filter.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          {filtered.map((cmd) => {
            const style = CATEGORY_STYLES[cmd.category] ?? CATEGORY_STYLES.general!;
            const Icon = style.icon;
      return (
        <div
          key={cmd.name}
          className={cn(
            "flex flex-col gap-2 border-b border-border/70 p-2 transition-colors last:border-0 sm:flex-row sm:items-center sm:gap-3",
            !cmd.enabled && "bg-muted/15",
          )}
              >
                <div
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md border",
                    style.iconSurface,
                    style.iconColor,
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      /{cmd.name}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-4 text-muted-foreground">
                    {cmd.description}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <Badge
                    className={cn(
                      "font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
                      style.badge,
                    )}
                  >
                    {SYSTEM_COMMAND_CATEGORY_LABELS[cmd.category]}
                  </Badge>
                  <Switch
                    checked={cmd.enabled}
                    disabled={saving}
                    onCheckedChange={(enabled) => handleToggle(cmd.name, enabled)}
                    aria-label={`${cmd.enabled ? "Disable" : "Enable"} /${cmd.name}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Configure /${cmd.name}`}
                    title={`Configure /${cmd.name}`}
                    disabled={saving}
                    onClick={() => {
                      setConfiguringName(cmd.name);
                      setConfiguringSnapshot(cmd);
                    }}
                  >
                    <Settings className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet
        open={Boolean(configuring)}
        onOpenChange={(open) => {
          if (!open) closeConfiguration();
        }}
        title={
          configuring ? (
            <span className="font-mono">/{configuring.name}</span>
          ) : (
            "Command"
          )
        }
        description={configuring?.description}
        footer={
          <Button
            type="button"
            className="w-full"
            onClick={() => void saveConfiguration()}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        }
      >
        {configuring ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Syntax and parameters</h3>
              <code className="block overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
                {formatSystemCommandSyntax(configuring)}
              </code>
              {(configuring.parameters ?? configuring.options).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This command takes no parameters.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Parameter</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Usage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(configuring.parameters ?? configuring.options).map(
                        (param) => (
                          <tr
                            key={param.name}
                            className="border-t border-border"
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              {param.name}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {SYSTEM_COMMAND_PARAM_TYPE_LABELS[param.type]}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                className={cn(
                                  "normal-case tracking-normal",
                                  param.required
                                    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                                    : "border-border bg-muted text-muted-foreground",
                                )}
                              >
                                {param.required ? "Required" : "Optional"}
                              </Badge>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-4 border-t border-border pt-5">
              <h3 className="text-sm font-semibold">Permissions</h3>
              <RoleMultiSelect
                label="Authorized roles"
                placeholder="Any member (empty)…"
                roles={roles}
                value={configuring.allowedRoles}
                onChange={(allowedRoles) =>
                  patchCommand(configuring.name, { allowedRoles })
                }
                emptyHint={
                  configuring.requiresAdminByDefault
                    ? "No roles: Discord moderation permission is required."
                    : "No roles: any member can use it."
                }
              />
              <ChannelMultiSelect
                label="Ignored Channels"
                placeholder="No channels ignored…"
                channels={selectableChannels}
                value={configuring.ignoredChannels ?? []}
                onChange={(ignoredChannels) =>
                  patchCommand(configuring.name, { ignoredChannels })
                }
                emptyHint="Empty: the command can be used in all channels."
              />
              {configuring.supportsEphemeral ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                  <Label
                    htmlFor={`ephemeral-${configuring.name}`}
                    className="text-sm leading-snug"
                  >
                    Ephemeral response
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Only visible to whoever runs the command.
                    </span>
                  </Label>
                  <Switch
                    id={`ephemeral-${configuring.name}`}
                    checked={configuring.ephemeral}
                    onCheckedChange={(ephemeral) =>
                      patchCommand(configuring.name, { ephemeral })
                    }
                  />
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </Sheet>

    </div>
  );
}
