import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldOff, TimerOff } from "lucide-react";
import type {
  ModActiveBanItem,
  ModActiveTimeoutItem,
} from "@adobos/shared";
import {
  executeModAction,
  fetchActiveBans,
  fetchActiveTimeouts,
} from "@/lib/api";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";

type SanctionSubTab = "bans" | "timeouts";

type PendingRevoke =
  | { kind: "unban"; item: ModActiveBanItem }
  | { kind: "untimeout"; item: ModActiveTimeoutItem };

function formatRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export interface ActiveSanctionsPanelProps {
  selectedUserId: string | null;
  onSelectUser: (user: {
    id: string;
    label: string;
    description: string;
    avatarUrl: string;
  }) => void;
  disabled?: boolean;
}

export function ActiveSanctionsPanel({
  selectedUserId,
  onSelectUser,
  disabled = false,
}: ActiveSanctionsPanelProps) {
  const [subTab, setSubTab] = useState<SanctionSubTab>("bans");
  const [bans, setBans] = useState<ModActiveBanItem[]>([]);
  const [timeouts, setTimeouts] = useState<ModActiveTimeoutItem[]>([]);
  const [loadingBans, setLoadingBans] = useState(true);
  const [loadingTimeouts, setLoadingTimeouts] = useState(true);
  const [pending, setPending] = useState<PendingRevoke | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const loadBans = useCallback(async () => {
    setLoadingBans(true);
    try {
      const data = await fetchActiveBans();
      setBans(data.bans);
    } catch (error: unknown) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't load the bans.",
      });
      setBans([]);
    } finally {
      setLoadingBans(false);
    }
  }, []);

  const loadTimeouts = useCallback(async () => {
    setLoadingTimeouts(true);
    try {
      const data = await fetchActiveTimeouts();
      setTimeouts(data.timeouts);
    } catch (error: unknown) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't load the timeouts.",
      });
      setTimeouts([]);
    } finally {
      setLoadingTimeouts(false);
    }
  }, []);

  useEffect(() => {
    void loadBans();
    void loadTimeouts();
  }, [loadBans, loadTimeouts]);

  async function confirmRevoke(): Promise<void> {
    if (!pending) return;
    setConfirming(true);
    try {
      const result = await executeModAction({
        action: pending.kind,
        userId: pending.item.id,
        reason:
          pending.kind === "unban"
            ? "Unbanned from dashboard (Active sanctions)"
            : "Timeout removed from dashboard (Active sanctions)",
        dmMode: "none",
      });

      if (pending.kind === "unban") {
        setBans((prev) => prev.filter((item) => item.id !== pending.item.id));
      } else {
        setTimeouts((prev) =>
          prev.filter((item) => item.id !== pending.item.id),
        );
      }

      setToast({ variant: "success", message: result.message });
      setPending(null);
    } catch (error: unknown) {
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "Couldn't revoke.",
      });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs>
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger
            active={subTab === "bans"}
            onClick={() => setSubTab("bans")}
          >
            Active bans
            {!loadingBans ? ` (${bans.length})` : ""}
          </TabsTrigger>
          <TabsTrigger
            active={subTab === "timeouts"}
            onClick={() => setSubTab("timeouts")}
          >
            Active timeouts
            {!loadingTimeouts ? ` (${timeouts.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {subTab === "bans" ? (
          <TabsContent className="space-y-2">
            {loadingBans ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading bans…
              </div>
            ) : bans.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No active bans.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border">
                {bans.map((ban) => {
                  const selected = selectedUserId === ban.id;
                  return (
                    <li key={ban.id}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 transition-colors",
                          selected ? "bg-primary/10" : "hover:bg-muted/30",
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          disabled={disabled || confirming}
                          onClick={() =>
                            onSelectUser({
                              id: ban.id,
                              label: ban.displayName,
                              description: `@${ban.username}`,
                              avatarUrl: ban.avatarUrl,
                            })
                          }
                        >
                          <UserAvatar
                            src={ban.avatarUrl}
                            name={ban.displayName}
                            className="size-8"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {ban.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {ban.reason || "No reason recorded"}
                            </p>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled || confirming}
                          onClick={() =>
                            setPending({ kind: "unban", item: ban })
                          }
                        >
                          <ShieldOff className="size-3.5" aria-hidden />
                          Unban
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        ) : null}

        {subTab === "timeouts" ? (
          <TabsContent className="space-y-2">
            {loadingTimeouts ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading timeouts…
              </div>
            ) : timeouts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No active timeouts.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border">
                {timeouts.map((item) => {
                  const selected = selectedUserId === item.id;
                  return (
                    <li key={item.id}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 transition-colors",
                          selected ? "bg-primary/10" : "hover:bg-muted/30",
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          disabled={disabled || confirming}
                          onClick={() =>
                            onSelectUser({
                              id: item.id,
                              label: item.displayName,
                              description: `@${item.username}`,
                              avatarUrl: item.avatarUrl,
                            })
                          }
                        >
                          <UserAvatar
                            src={item.avatarUrl}
                            name={item.displayName}
                            className="size-8"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {item.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              Left: {formatRemaining(item.remainingSeconds)} ·
                              until{" "}
                              {new Date(item.timedOutUntil).toLocaleString(
                                "en-US",
                                { timeStyle: "short", dateStyle: "short" },
                              )}
                            </p>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled || confirming}
                          onClick={() =>
                            setPending({ kind: "untimeout", item })
                          }
                        >
                          <TimerOff className="size-3.5" aria-hidden />
                          Remove timeout
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <AlertDialog
        open={pending != null}
        title={
          pending?.kind === "unban" ? "Unban user?" : "Remove timeout?"
        }
        description={
          pending ? (
            <>
              You're about to{" "}
              {pending.kind === "unban" ? "unban" : "remove the timeout from"}{" "}
              <strong>{pending.item.displayName}</strong> (@
              {pending.item.username}). This action takes effect immediately in
              Discord.
            </>
          ) : null
        }
        confirmLabel={
          pending?.kind === "unban" ? "Unban" : "Remove timeout"
        }
        tone="destructive"
        confirming={confirming}
        onCancel={() => {
          if (!confirming) setPending(null);
        }}
        onConfirm={() => {
          void confirmRevoke();
        }}
      />

      <ToastBanner
        message={toast?.message ?? null}
        variant={toast?.variant ?? "error"}
        onDismiss={dismissToast}
      />
    </div>
  );
}
