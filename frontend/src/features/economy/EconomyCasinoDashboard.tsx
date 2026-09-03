import type { EconomyCasinoConfig, EconomyConfig } from "@adobos/shared";
import {
  CASINO_DECK_COUNTS,
  defaultCasinoBlackjack,
  defaultCasinoSlots,
  defaultEconomyCasinoConfig,
} from "@adobos/shared";
import {
  fetchEconomyCasinoConfig,
  fetchEconomyConfig,
  saveEconomyCasinoConfig,
} from "@/lib/api";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  EconomyCasinoDiscordPreview,
  type EconomyCasinoSimulatorTab,
} from "./EconomyCasinoDiscordPreview";

type TabId = EconomyCasinoSimulatorTab;

function fingerprint(config: EconomyCasinoConfig): string {
  return JSON.stringify(config);
}

export function EconomyCasinoDashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>("global");
  const [config, setConfig] = useState<EconomyCasinoConfig>(
    defaultEconomyCasinoConfig(),
  );
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [currencyName, setCurrencyName] = useState("monedas");
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const dirty = useMemo(
    () => fingerprint(config) !== savedFingerprint,
    [config, savedFingerprint],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [casino, economy] = await Promise.all([
          fetchEconomyCasinoConfig(),
          fetchEconomyConfig().catch((): EconomyConfig | null => null),
        ]);
        if (cancelled) return;
        const merged = {
          ...casino,
          blackjack: {
            ...defaultCasinoBlackjack(),
            ...casino.blackjack,
          },
          slots: {
            ...defaultCasinoSlots(),
            ...casino.slots,
          },
        };
        setConfig(merged);
        setSavedFingerprint(fingerprint(merged));
        if (economy?.currencyName) setCurrencyName(economy.currencyName);
      } catch (error) {
        if (!cancelled) {
          setToast({
            variant: "error",
            message:
              error instanceof Error
                ? error.message
                : "Couldn't load the casino.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setToast(null);
    try {
      const next = await saveEconomyCasinoConfig({
        isActive: config.isActive,
        minBet: config.minBet,
        maxBet: config.maxBet,
        coinflip: config.coinflip,
        roulette: config.roulette,
        blackjack: config.blackjack,
        slots: config.slots,
      });
      setConfig(next);
      setSavedFingerprint(fingerprint(next));
      setToast({
        variant: "success",
        message: "Casino configuration saved.",
      });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't save the casino.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading casino…
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Tabs>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
              <TabsTrigger
                active={tab === "global"}
                onClick={() => setTab("global")}
              >
                General
              </TabsTrigger>
              <TabsTrigger
                active={tab === "coinflip"}
                onClick={() => setTab("coinflip")}
              >
                Coinflip
              </TabsTrigger>
              <TabsTrigger
                active={tab === "roulette"}
                onClick={() => setTab("roulette")}
              >
                Roulette
              </TabsTrigger>
              <TabsTrigger
                active={tab === "blackjack"}
                onClick={() => setTab("blackjack")}
              >
                Blackjack
              </TabsTrigger>
              <TabsTrigger
                active={tab === "slots"}
                onClick={() => setTab("slots")}
              >
                Slots
              </TabsTrigger>
            </TabsList>

            {tab === "global" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Enable Casino</CardTitle>
                      <CardDescription>
                        Master switch. If off, the game commands don't accept
                        bets.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="casino-active">Casino active</Label>
                        <Switch
                          id="casino-active"
                          checked={config.isActive}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({ ...c, isActive: checked }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Bet Limits
                      </CardTitle>
                      <CardDescription>
                        Aplican a `/coinflip`, `/roulette`, `/blackjack` y `/slots`.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="min-bet">Minimum bet</Label>
                        <Input
                          id="min-bet"
                          type="number"
                          min={0}
                          step={1}
                          value={config.minBet}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              minBet: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max-bet">Maximum bet</Label>
                        <Input
                          id="max-bet"
                          type="number"
                          min={0}
                          step={1}
                          value={config.maxBet}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              maxBet: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "coinflip" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Coinflip</CardTitle>
                      <CardDescription>
                        Heads or tails. Placeholders:{" "}
                        <code className="text-xs">{"{side}"}</code>,{" "}
                        <code className="text-xs">{"{payout}"}</code>,{" "}
                        <code className="text-xs">{"{currency}"}</code>.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cf-mult">
                          Win multiplier
                        </Label>
                        <Input
                          id="cf-mult"
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={config.coinflip.multiplier}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              coinflip: {
                                ...c.coinflip,
                                multiplier: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cf-win">Win message</Label>
                        <Input
                          id="cf-win"
                          value={config.coinflip.winMessage}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              coinflip: {
                                ...c.coinflip,
                                winMessage: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Game pace
                      </CardTitle>
                      <CardDescription>
                        Wait seconds between each coinflip.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cf-cd">Cooldown between flips</Label>
                        <Input
                          id="cf-cd"
                          type="number"
                          min={0}
                          step={1}
                          value={config.coinflip.cooldownSeconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              coinflip: {
                                ...c.coinflip,
                                cooldownSeconds: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Seconds each user must wait between plays.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "roulette" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Roulette</CardTitle>
                      <CardDescription>
                        Base multipliers per bet type.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="ro-color">Color (Red/Black)</Label>
                        <Input
                          id="ro-color"
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={config.roulette.colorMultiplier}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              roulette: {
                                ...c.roulette,
                                colorMultiplier: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ro-green">Green</Label>
                        <Input
                          id="ro-green"
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={config.roulette.greenMultiplier}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              roulette: {
                                ...c.roulette,
                                greenMultiplier: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ro-num">Exact number</Label>
                        <Input
                          id="ro-num"
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={config.roulette.numberMultiplier}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              roulette: {
                                ...c.roulette,
                                numberMultiplier: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Table</CardTitle>
                      <CardDescription>
                        Cooldown between spins and history in the embed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ro-cd">Cooldown between spins</Label>
                        <Input
                          id="ro-cd"
                          type="number"
                          min={0}
                          step={1}
                          value={config.roulette.cooldownSeconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              roulette: {
                                ...c.roulette,
                                cooldownSeconds: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Seconds each user must wait between
                          `/roulette`.
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="ro-history">
                            Show number history
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Last 5 results in the table embed.
                          </p>
                        </div>
                        <Switch
                          id="ro-history"
                          checked={config.roulette.showNumberHistory}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({
                              ...c,
                              roulette: {
                                ...c.roulette,
                                showNumberHistory: checked,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "blackjack" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Blackjack</CardTitle>
                      <CardDescription>
                        Payouts and double down on the first decision.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="bj-double">Allow "Double"</Label>
                          <p className="text-xs text-muted-foreground">
                            Double Down on the first decision.
                          </p>
                        </div>
                        <Switch
                          id="bj-double"
                          checked={config.blackjack.allowDoubleDown}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({
                              ...c,
                              blackjack: {
                                ...c.blackjack,
                                allowDoubleDown: checked,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="bj-split">Allow "Split"</Label>
                          <p className="text-xs text-muted-foreground">
                            Split a pair (same rank) if there's a balance for the
                            second bet.
                          </p>
                        </div>
                        <Switch
                          id="bj-split"
                          checked={config.blackjack.allowSplit}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({
                              ...c,
                              blackjack: {
                                ...c.blackjack,
                                allowSplit: checked,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bj-mult">
                          Natural blackjack multiplier
                        </Label>
                        <Input
                          id="bj-mult"
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={config.blackjack.blackjackMultiplier}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              blackjack: {
                                ...c.blackjack,
                                blackjackMultiplier:
                                  Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Reglas de mesa</CardTitle>
                      <CardDescription>
                        Zapato y comportamiento del crupier.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="bj-decks">Number of decks</Label>
                        <Select
                          value={String(config.blackjack.deckCount)}
                          onValueChange={(value) =>
                            setConfig((c) => ({
                              ...c,
                              blackjack: {
                                ...c.blackjack,
                                deckCount: Number(value) as
                                  | 1
                                  | 2
                                  | 4
                                  | 6
                                  | 8,
                              },
                            }))
                          }
                        >
                          <SelectTrigger id="bj-decks">
                            <SelectValue placeholder="Decks" />
                          </SelectTrigger>
                          <SelectContent>
                            {CASINO_DECK_COUNTS.map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} {n === 1 ? "deck" : "decks"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="bj-soft17">
                            The dealer stands on soft 17
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Standard casino rule (stand on soft 17).
                          </p>
                        </div>
                        <Switch
                          id="bj-soft17"
                          checked={config.blackjack.standOnSoft17}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({
                              ...c,
                              blackjack: {
                                ...c.blackjack,
                                standOnSoft17: checked,
                              },
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "slots" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Slots</CardTitle>
                      <CardDescription>
                        Three reels, CSPRNG. Pair = 2 of 3 matching (×1.7).
                        Documented house edge ≈ 5.6%.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="sl-cd">Cooldown between spins</Label>
                        <Input
                          id="sl-cd"
                          type="number"
                          min={0}
                          step={1}
                          value={config.slots.cooldownSeconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              slots: {
                                ...c.slots,
                                cooldownSeconds: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Seconds between each `/slots` per user.
                        </p>
                      </div>
                      <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">Payouts</p>
                        <p>Pair (2 of 3) ×1.7 · 🍒🍒🍒 ×3 · 🍋🍋🍋 ×4</p>
                        <p>🍊 ×5 · 🍇 ×8 · 🔔 ×12 · ⭐ ×20 · 7️⃣ ×40 · 💎 ×80</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
                <CardDescription>
                  Simulation of the Discord embed based on the active tab.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EconomyCasinoDiscordPreview
                  config={config}
                  currencyName={currencyName}
                  tab={tab}
                />
              </CardContent>
            </Card>
            <Button
              className="w-full"
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Casino Configuration
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
