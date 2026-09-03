import type {
  EconomyConfig,
  EconomyFundAction,
  EconomyLeaderboardEntry,
  GuildEmojiAsset,
} from "@adobos/shared";
import {
  clampStartBalance,
  clampTransferTax,
  defaultEconomyConfig,
} from "@adobos/shared";
import type { ColumnDef } from "@tanstack/react-table";
import {
  adjustEconomyFunds,
  fetchEconomyConfig,
  fetchEconomyLeaderboard,
  fetchGuildAssets,
  resolvePublicAssetUrl,
  saveEconomyConfig,
  uploadImageFile,
} from "@/lib/api";
import {
  DiscordEmojiPicker,
  type DiscordEmojiSelection,
} from "@/components/shared/DiscordEmojiPicker";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  CircleDollarSign,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TabId = "settings" | "leaderboard";

const LEADERBOARD_LIMIT = 100;

function configFingerprint(config: EconomyConfig): string {
  return JSON.stringify({
    isActive: config.isActive,
    currencyName: config.currencyName,
    currencySymbol: config.currencySymbol,
    startBalance: config.startBalance,
    transferTax: config.transferTax,
  });
}

function isImageSymbol(symbol: string): boolean {
  const s = symbol.trim();
  return (
    s.startsWith("/uploads/") ||
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("blob:")
  );
}

function selectionFromSymbol(
  symbol: string,
  emojis: GuildEmojiAsset[],
): DiscordEmojiSelection | null {
  const s = symbol.trim();
  if (!s) return null;
  if (isImageSymbol(s)) {
    return {
      emojiKey: `image:${s}`,
      display: "Imagen",
      imageUrl: resolvePublicAssetUrl(s),
    };
  }
  const mention = /^<(a)?:([\w~]+):(\d+)>$/.exec(s);
  if (mention) {
    const id = mention[3]!;
    const emoji = emojis.find((e) => e.id === id);
    return {
      emojiKey: `custom:${id}`,
      display: emoji?.mention ?? s,
      mention: emoji?.mention ?? s,
      imageUrl: emoji?.url,
    };
  }
  return {
    emojiKey: `unicode:${s}`,
    display: s,
  };
}

function symbolFromSelection(selection: DiscordEmojiSelection): string {
  if (selection.emojiKey.startsWith("unicode:")) {
    return selection.display;
  }
  if (selection.mention) return selection.mention;
  if (selection.imageUrl && !selection.emojiKey.startsWith("custom:")) {
    return selection.imageUrl;
  }
  return selection.display;
}

function CurrencyMark({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const s = symbol.trim() || "🪙";
  if (isImageSymbol(s)) {
    return (
      <img
        src={resolvePublicAssetUrl(s)}
        alt=""
        className={cn("inline-block size-4 shrink-0 object-contain", className)}
      />
    );
  }
  const mention = /^<(a)?:([\w~]+):(\d+)>$/.exec(s);
  if (mention) {
    const animated = Boolean(mention[1]);
    const id = mention[3]!;
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=32&quality=lossless`;
    return (
      <img
        src={url}
        alt=""
        className={cn("inline-block size-4 shrink-0 object-contain", className)}
      />
    );
  }
  return (
    <span className={cn("inline leading-none", className)} aria-hidden>
      {s}
    </span>
  );
}

function formatMoneyAmount(value: number): string {
  return value.toLocaleString("en-US");
}

export function EconomySettingsDashboard() {
  const [tab, setTab] = useState<TabId>("settings");
  const [config, setConfig] = useState<EconomyConfig>(() =>
    defaultEconomyConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(defaultEconomyConfig()),
  );
  const [leaderboard, setLeaderboard] = useState<EconomyLeaderboardEntry[]>(
    [],
  );
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<EconomyLeaderboardEntry | null>(
    null,
  );
  const [editTarget, setEditTarget] = useState<"wallet" | "bank">("wallet");
  const [editAction, setEditAction] = useState<EconomyFundAction>("add");
  const [editAmount, setEditAmount] = useState("100");
  const [editSaving, setEditSaving] = useState(false);

  const [serverEmojis, setServerEmojis] = useState<GuildEmojiAsset[]>([]);
  const [uploadingSymbol, setUploadingSymbol] = useState(false);
  const symbolFileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () => configFingerprint(config) !== savedFingerprint,
    [config, savedFingerprint],
  );

  const symbolSelection = useMemo(
    () => selectionFromSymbol(config.currencySymbol, serverEmojis),
    [config.currencySymbol, serverEmojis],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const [next, assets] = await Promise.all([
        fetchEconomyConfig(),
        fetchGuildAssets().catch(() => null),
      ]);
      setConfig(next);
      setSavedFingerprint(configFingerprint(next));
      if (assets?.emojis) setServerEmojis(assets.emojis);
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't load the economy.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetchEconomyLeaderboard(LEADERBOARD_LIMIT);
      setLeaderboard(res.entries);
      setLeaderboardTotal(res.total);
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't load the leaderboard.",
      });
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "leaderboard") void loadLeaderboard();
  }, [tab, loadLeaderboard]);

  function openEditFunds(entry: EconomyLeaderboardEntry): void {
    setEditEntry(entry);
    setEditTarget("wallet");
    setEditAction("add");
    setEditAmount("100");
    setEditOpen(true);
  }

  async function submitEditFunds(): Promise<void> {
    if (!editEntry) return;
    const amount = Number(editAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setToast({
        variant: "error",
        message: "Enter a valid amount (≥ 0).",
      });
      return;
    }
    setEditSaving(true);
    try {
      await adjustEconomyFunds({
        userId: editEntry.userId,
        target: editTarget,
        action: editAction,
        amount,
      });
      setEditOpen(false);
      setToast({ variant: "success", message: "Fondos actualizados." });
      await loadLeaderboard();
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't adjust the funds.",
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setToast(null);
    try {
      const next = await saveEconomyConfig({
        isActive: config.isActive,
        currencyName: config.currencyName,
        currencySymbol: config.currencySymbol,
        startBalance: clampStartBalance(config.startBalance),
        transferTax: clampTransferTax(config.transferTax),
      });
      setConfig(next);
      setSavedFingerprint(configFingerprint(next));
      setToast({ variant: "success", message: "Configuration saved." });
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

  async function handleSymbolImageUpload(
    file: File | null | undefined,
  ): Promise<void> {
    if (!file) return;
    setUploadingSymbol(true);
    setToast(null);
    try {
      const result = await uploadImageFile(file);
      setConfig((c) => ({ ...c, currencySymbol: result.path }));
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't upload the currency image.",
      });
    } finally {
      setUploadingSymbol(false);
      if (symbolFileRef.current) symbolFileRef.current.value = "";
    }
  }

  const leaderboardColumns = useMemo<
    ColumnDef<EconomyLeaderboardEntry, unknown>[]
  >(
    () => [
      {
        accessorKey: "rank",
        header: "#",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.rank}
          </span>
        ),
        meta: { className: "w-12" },
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <UserAvatar
                src={e.avatarUrl}
                name={e.displayName}
                className="size-7"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  @{e.username}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "wallet",
        header: "Wallet",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            <CurrencyMark symbol={config.currencySymbol} />
            {formatMoneyAmount(row.original.wallet)}
          </span>
        ),
        meta: { className: "w-28" },
      },
      {
        accessorKey: "bank",
        header: "Bank",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            <CurrencyMark symbol={config.currencySymbol} />
            {formatMoneyAmount(row.original.bank)}
          </span>
        ),
        meta: { className: "w-28" },
      },
      {
        accessorKey: "total",
        header: "Net worth",
        cell: ({ row }) => (
          <Badge className="inline-flex items-center gap-1.5 normal-case tracking-normal font-mono text-xs">
            <CurrencyMark symbol={config.currencySymbol} />
            {formatMoneyAmount(row.original.total)}
          </Badge>
        ),
        meta: { className: "w-32" },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => openEditFunds(row.original)}
          >
            <Pencil className="size-3.5" />
            Edit Funds
          </Button>
        ),
        meta: { className: "w-36" },
      },
    ],
    [config.currencySymbol],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading economy…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <ToastBanner
          variant={toast.variant}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
              <TabsTrigger
                active={tab === "settings"}
                onClick={() => setTab("settings")}
              >
                General Settings
              </TabsTrigger>
              <TabsTrigger
                active={tab === "leaderboard"}
                onClick={() => setTab("leaderboard")}
              >
                Leaderboard
              </TabsTrigger>
            </TabsList>

            {tab === "settings" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Currency Identity
                      </CardTitle>
                      <CardDescription>
                        Name and symbol members will see in commands and
                        leaderboards.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="currency-name">Name</Label>
                        <Input
                          id="currency-name"
                          value={config.currencyName}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              currencyName: e.target.value,
                            }))
                          }
                          placeholder="Adobos Coins"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Symbol or emoji</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                            <CurrencyMark
                              symbol={config.currencySymbol}
                              className="size-6 text-lg"
                            />
                          </div>
                          <DiscordEmojiPicker
                            serverEmojis={serverEmojis}
                            value={
                              isImageSymbol(config.currencySymbol)
                                ? null
                                : symbolSelection
                            }
                            onSelect={(selection) =>
                              setConfig((c) => ({
                                ...c,
                                currencySymbol: symbolFromSelection(selection),
                              }))
                            }
                            disabled={uploadingSymbol}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9"
                            disabled={uploadingSymbol}
                            onClick={() => symbolFileRef.current?.click()}
                          >
                            {uploadingSymbol ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <ImagePlus className="size-4" />
                            )}
                            Upload image
                          </Button>
                          {config.currencySymbol.trim() ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              aria-label="Remove symbol"
                              disabled={uploadingSymbol}
                              onClick={() =>
                                setConfig((c) => ({
                                  ...c,
                                  currencySymbol: "🪙",
                                }))
                              }
                            >
                              <X className="size-4" />
                            </Button>
                          ) : null}
                          <input
                            ref={symbolFileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) =>
                              void handleSymbolImageUpload(
                                e.target.files?.[0],
                              )
                            }
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Pick a native or server emoji, or upload an
                          image to represent your currency.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Base Economy</CardTitle>
                      <CardDescription>
                        Starting balance for new users and the bank's tax
                        on transfers (`/pay`).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="start-balance">Starting balance</Label>
                        <Input
                          id="start-balance"
                          type="number"
                          min={0}
                          step={1}
                          value={config.startBalance}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              startBalance: clampStartBalance(
                                Number(e.target.value),
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="transfer-tax">
                          Transfer tax (%)
                        </Label>
                        <Input
                          id="transfer-tax"
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={config.transferTax}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              transferTax: clampTransferTax(
                                Number(e.target.value),
                              ),
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "leaderboard" ? (
              <TabsContent>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">
                          Leaderboard (Top {LEADERBOARD_LIMIT})
                        </CardTitle>
                        <CardDescription>
                          {leaderboardTotal > 0
                            ? `${Math.min(leaderboard.length, LEADERBOARD_LIMIT)} of ${leaderboardTotal} users with a balance.`
                            : "Users sorted by total net worth (wallet + bank)."}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={leaderboardLoading}
                        onClick={() => void loadLeaderboard()}
                      >
                        {leaderboardLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {leaderboardLoading && leaderboard.length === 0 ? (
                      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading leaderboard…
                      </div>
                    ) : (
                      <DataTable
                        columns={leaderboardColumns}
                        data={leaderboard}
                        emptyMessage="Nobody has a balance yet."
                        minWidthClassName="min-w-[720px]"
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <Card className="sticky top-4 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CircleDollarSign className="size-4 text-primary" />
              Status Monitor
            </CardTitle>
            <CardDescription>
              Live summary of the server's economy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
              <div>
                <p className="text-sm font-medium">Overall status</p>
                <p className="text-xs text-muted-foreground">
                  {config.isActive ? "Economy active" : "Economy paused"}
                </p>
              </div>
              <Switch
                checked={config.isActive}
                onCheckedChange={(isActive) =>
                  setConfig((c) => ({ ...c, isActive }))
                }
                aria-label="Enable economy"
              />
            </div>

            <div className="space-y-1 rounded-md border border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">Currency</p>
              <p className="flex items-center gap-2 text-sm font-medium">
                <CurrencyMark
                  symbol={config.currencySymbol}
                  className="size-5 text-base"
                />
                {config.currencyName || "—"}
              </p>
            </div>

            <div className="space-y-1 rounded-md border border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">Current tax</p>
              <p className="font-mono text-sm font-medium">
                {config.transferTax}%
              </p>
            </div>

            <div className="space-y-1 rounded-md border border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">Starting balance</p>
              <p className="inline-flex items-center gap-1.5 font-mono text-sm font-medium">
                <CurrencyMark symbol={config.currencySymbol} />
                {formatMoneyAmount(config.startBalance)}
              </p>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save configuration
            </Button>
            {dirty ? (
              <p className="text-center text-xs text-muted-foreground">
                You have unsaved changes.
              </p>
            ) : (
              <p
                className={cn(
                  "text-center text-xs",
                  "text-emerald-600 dark:text-emerald-400",
                )}
              >
                All saved.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={
          editEntry
            ? `Edit funds — ${editEntry.displayName}`
            : "Edit funds"
        }
        description="Admin override on wallet or bank."
        className="max-w-md"
      >
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    label: "Add to Wallet",
                    target: "wallet" as const,
                    action: "add" as const,
                  },
                  {
                    label: "Remove from Wallet",
                    target: "wallet" as const,
                    action: "remove" as const,
                  },
                  {
                    label: "Add to Bank",
                    target: "bank" as const,
                    action: "add" as const,
                  },
                  {
                    label: "Remove from Bank",
                    target: "bank" as const,
                    action: "remove" as const,
                  },
                ] as const
              ).map((opt) => {
                const active =
                  editTarget === opt.target && editAction === opt.action;
                return (
                  <Button
                    key={opt.label}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => {
                      setEditTarget(opt.target);
                      setEditAction(opt.action);
                    }}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Amount</Label>
            <Input
              id="edit-amount"
              type="number"
              min={0}
              step={1}
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editSaving}
              onClick={() => void submitEditFunds()}
            >
              {editSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Apply
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
