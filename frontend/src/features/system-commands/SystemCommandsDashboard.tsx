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
  ClipboardList,
  Eye,
  Gavel,
  Loader2,
  Power,
  PowerOff,
  Save,
  Search,
  Terminal,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type CategoryFilter = "all" | SystemCommandCategory;

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "moderation", label: SYSTEM_COMMAND_CATEGORY_LABELS.moderation },
  { id: "levels", label: SYSTEM_COMMAND_CATEGORY_LABELS.levels },
  { id: "economy", label: SYSTEM_COMMAND_CATEGORY_LABELS.economy },
  { id: "utilities", label: SYSTEM_COMMAND_CATEGORY_LABELS.utilities },
];

const CATEGORY_STYLES: Record<
  SystemCommandCategory,
  { badge: string; icon: typeof Gavel }
> = {
  moderation: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    icon: Gavel,
  },
  levels: {
    badge:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    icon: TrendingUp,
  },
  economy: {
    badge:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: CircleDollarSign,
  },
  forms: {
    badge:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    icon: ClipboardList,
  },
  utilities: {
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    icon: Wrench,
  },
};

const CHANNEL_TYPES = new Set([0, 2, 5, 13, 15]);

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function commandsFingerprint(commands: SystemCommandConfig[]): string {
  return JSON.stringify(
    commands.map((c) => ({
      commandName: c.name,
      enabled: c.enabled,
      allowedRoles: [...c.allowedRoles].sort(),
      ignoredChannels: [...(c.ignoredChannels ?? [])].sort(),
      ephemeral: c.ephemeral,
    })),
  );
}

export function SystemCommandsDashboard() {
  const [commands, setCommands] = useState<SystemCommandConfig[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [configuringName, setConfiguringName] = useState<string | null>(null);
  const [bulkRoles, setBulkRoles] = useState<string[]>([]);
  const [bulkChannels, setBulkChannels] = useState<string[]>([]);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const dirty = useMemo(
    () => commandsFingerprint(commands) !== savedFingerprint,
    [commands, savedFingerprint],
  );

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

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const [list, assets] = await Promise.all([
        fetchSystemCommands(),
        fetchGuildAssets(),
      ]);
      setCommands(list);
      setSavedFingerprint(commandsFingerprint(list));
      setRoles(assets.roles ?? []);
      setChannels(assets.channels ?? []);
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't load system commands.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setBulkRoles([]);
    setBulkChannels([]);
  }, [category]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((cmd) => {
      if (category !== "all" && cmd.category !== category) return false;
      if (!q) return true;
      return (
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
      );
    });
  }, [commands, category, query]);

  function patchCommand(
    name: string,
    patch: Partial<
      Pick<
        SystemCommandConfig,
        "enabled" | "allowedRoles" | "ignoredChannels" | "ephemeral"
      >
    >,
  ): void {
    setCommands((prev) =>
      prev.map((c) => (c.name === name ? { ...c, ...patch } : c)),
    );
  }

  function patchCategoryCommands(
    cat: SystemCommandCategory,
    mapper: (cmd: SystemCommandConfig) => SystemCommandConfig,
  ): void {
    setCommands((prev) =>
      prev.map((c) => (c.category === cat ? mapper(c) : c)),
    );
  }

  function enableCategory(cat: SystemCommandCategory, enabled: boolean): void {
    patchCategoryCommands(cat, (c) => ({ ...c, enabled }));
  }

  function applyBulkToCategory(cat: SystemCommandCategory): void {
    patchCategoryCommands(cat, (c) => ({
      ...c,
      allowedRoles:
        bulkRoles.length > 0
          ? uniqueIds([...c.allowedRoles, ...bulkRoles])
          : c.allowedRoles,
      ignoredChannels:
        bulkChannels.length > 0
          ? uniqueIds([...(c.ignoredChannels ?? []), ...bulkChannels])
          : (c.ignoredChannels ?? []),
    }));
    setToast({
      variant: "success",
      message: `Cambios aplicados a ${SYSTEM_COMMAND_CATEGORY_LABELS[cat]}. Recuerda guardar.`,
    });
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setToast(null);
    try {
      const next = await saveSystemCommands(
        commands.map((c) => ({
          commandName: c.name,
          enabled: c.enabled,
          allowedRoles: c.allowedRoles,
          ignoredChannels: c.ignoredChannels ?? [],
          ephemeral: c.ephemeral,
        })),
      );
      setCommands(next);
      setSavedFingerprint(commandsFingerprint(next));
      setToast({ variant: "success", message: "Changes saved." });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Couldn't save.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading commands…
      </div>
    );
  }

  return (
    <div className="relative space-y-6 pb-24">
      {toast ? (
        <ToastBanner
          variant={toast.variant}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <header className="space-y-1 lg:hidden">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            System Commands
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Control which built-in commands are active and which roles are
          allowed to use them.
        </p>
      </header>

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
        <Tabs>
          <TabsList className="h-auto flex-wrap justify-start">
            {CATEGORY_FILTERS.map((f) => (
              <TabsTrigger
                key={f.id}
                active={category === f.id}
                className="text-xs sm:text-sm"
                onClick={() => setCategory(f.id)}
              >
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {category !== "all" ? (
        <Card className="mb-2 border-primary/20 bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Bulk Actions for {SYSTEM_COMMAND_CATEGORY_LABELS[category]}
            </CardTitle>
            <CardDescription>
              Affects only the commands in this category in local state.
              Press Save Changes to persist.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => enableCategory(category, true)}
              >
                <Power className="size-4" />
                Enable All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => enableCategory(category, false)}
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
              disabled={bulkRoles.length === 0 && bulkChannels.length === 0}
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cmd) => {
            const style = CATEGORY_STYLES[cmd.category];
            const Icon = style.icon;
            return (
              <Card
                key={cmd.name}
                className={cn("flex flex-col", !cmd.enabled && "opacity-70")}
              >
                <CardHeader className="space-y-2 pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <Badge
                        className={cn(
                          "gap-1 font-normal normal-case tracking-normal",
                          style.badge,
                        )}
                      >
                        <Icon className="size-3" />
                        {SYSTEM_COMMAND_CATEGORY_LABELS[cmd.category]}
                      </Badge>
                      <CardTitle className="font-mono text-base">
                        /{cmd.name}
                      </CardTitle>
                    </div>
                    <Switch
                      checked={cmd.enabled}
                      onCheckedChange={(enabled) =>
                        patchCommand(cmd.name, { enabled })
                      }
                      aria-label={`Enable /${cmd.name}`}
                    />
                  </div>
                  <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                    {cmd.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setConfiguringName(cmd.name)}
                  >
                    <Eye className="size-4" />
                    Configure Command
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={Boolean(configuring)}
        onOpenChange={(open) => {
          if (!open) setConfiguringName(null);
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
            onClick={() => setConfiguringName(null)}
          >
            Save command changes
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

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
          (!dirty || configuring) && "pointer-events-none opacity-0",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            You have unsaved changes.
          </p>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
