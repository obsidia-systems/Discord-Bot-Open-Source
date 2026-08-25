import type { EconomyCasinoConfig, EconomyConfig } from "@adobos/shared";
import {
  CASINO_DECK_COUNTS,
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
        setConfig(casino);
        setSavedFingerprint(fingerprint(casino));
        if (economy?.currencyName) setCurrencyName(economy.currencyName);
      } catch (error) {
        if (!cancelled) {
          setToast({
            variant: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo cargar el casino.",
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
      });
      setConfig(next);
      setSavedFingerprint(fingerprint(next));
      setToast({
        variant: "success",
        message: "Configuración del casino guardada.",
      });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el casino.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Cargando casino…
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
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
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
                Ruleta
              </TabsTrigger>
              <TabsTrigger
                active={tab === "blackjack"}
                onClick={() => setTab("blackjack")}
              >
                Blackjack
              </TabsTrigger>
            </TabsList>

            {tab === "global" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Activar Casino</CardTitle>
                      <CardDescription>
                        Interruptor maestro. Si está apagado, los comandos de
                        juego no aceptan apuestas.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="casino-active">Casino activo</Label>
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
                        Límites de Apuesta
                      </CardTitle>
                      <CardDescription>
                        Aplican a `/coinflip`, `/roulette` y `/blackjack`.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="min-bet">Apuesta mínima</Label>
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
                        <Label htmlFor="max-bet">Apuesta máxima</Label>
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
                        Cara o cruz. Placeholders:{" "}
                        <code className="text-xs">{"{side}"}</code>,{" "}
                        <code className="text-xs">{"{payout}"}</code>,{" "}
                        <code className="text-xs">{"{currency}"}</code>.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="cf-mult">
                          Multiplicador de ganancia
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
                        <Label htmlFor="cf-win">Mensaje de victoria</Label>
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
                        Reglas de la mesa
                      </CardTitle>
                      <CardDescription>
                        Ritmo de juego y opción de arriesgar la ganancia.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="cf-double">
                            Permitir Doble o Nada
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            El jugador puede arriesgar su ganancia actual.
                          </p>
                        </div>
                        <Switch
                          id="cf-double"
                          checked={config.coinflip.allowDoubleOrNothing}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({
                              ...c,
                              coinflip: {
                                ...c.coinflip,
                                allowDoubleOrNothing: checked,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cf-cd">Cooldown entre tiros</Label>
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
                          Segundos que debe esperar cada usuario entre jugadas.
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
                      <CardTitle className="text-base">Ruleta</CardTitle>
                      <CardDescription>
                        Multiplicadores base por tipo de apuesta.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="ro-color">Color (Rojo/Negro)</Label>
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
                        <Label htmlFor="ro-green">Verde</Label>
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
                        <Label htmlFor="ro-num">Número exacto</Label>
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
                      <CardTitle className="text-base">Mesa en vivo</CardTitle>
                      <CardDescription>
                        Ventana de apuestas e historial en el embed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ro-time">Tiempo de apuestas</Label>
                        <Input
                          id="ro-time"
                          type="number"
                          min={0}
                          step={1}
                          value={config.roulette.bettingTimeSeconds}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              roulette: {
                                ...c.roulette,
                                bettingTimeSeconds: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Segundos que la mesa permanece abierta tras el primer
                          `/roulette`.
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="ro-history">
                            Mostrar historial de números
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Últimos 5 resultados en el embed de la mesa.
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
                        Pagos y double down en la primera decisión.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="bj-double">Permitir «Doblar»</Label>
                          <p className="text-xs text-muted-foreground">
                            Double Down en la primera decisión.
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
                      <div className="space-y-2">
                        <Label htmlFor="bj-mult">
                          Multiplicador de Blackjack natural
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
                        <Label htmlFor="bj-decks">Cantidad de barajas</Label>
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
                            <SelectValue placeholder="Barajas" />
                          </SelectTrigger>
                          <SelectContent>
                            {CASINO_DECK_COUNTS.map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} {n === 1 ? "baraja" : "barajas"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="bj-soft17">
                            El crupier se planta en 17 suave
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Regla estándar de casino (stand on soft 17).
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
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Vista previa</CardTitle>
                <CardDescription>
                  Simulación del embed en Discord según la pestaña activa.
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
              Guardar Configuración del Casino
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
