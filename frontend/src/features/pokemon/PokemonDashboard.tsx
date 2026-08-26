import type {
  GuildChannelAsset,
  GuildRoleAsset,
  PokemonCommandName,
  PokemonConfig,
  PokemonGeneration,
} from "@adobos/shared";
import {
  POKEMON_COMMAND_LABELS,
  POKEMON_COMMAND_NAMES,
  POKEMON_GENERATIONS,
  defaultPokemonConfig,
} from "@adobos/shared";
import {
  fetchGuildAssets,
  fetchPokemonConfig,
  savePokemonConfig,
} from "@/lib/api";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
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
import { PokemonStatusMonitor } from "./PokemonStatusMonitor";

type TabId = "general" | "privacy" | "commands";

const CHANNEL_TYPES = new Set([0, 5, 15]);

function fingerprint(config: PokemonConfig): string {
  return JSON.stringify(config);
}

export function PokemonDashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>("general");
  const [config, setConfig] = useState<PokemonConfig>(defaultPokemonConfig());
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const dirty = useMemo(
    () => fingerprint(config) !== savedFingerprint,
    [config, savedFingerprint],
  );

  const textChannels = useMemo(
    () =>
      channels
        .filter((ch) => CHANNEL_TYPES.has(ch.type))
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          parentId: ch.parentId ?? null,
        })),
    [channels],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pokemon, assets] = await Promise.all([
          fetchPokemonConfig(),
          fetchGuildAssets().catch(() => null),
        ]);
        if (cancelled) return;
        setConfig(pokemon);
        setSavedFingerprint(fingerprint(pokemon));
        setChannels(assets?.channels ?? []);
        setRoles(assets?.roles ?? []);
      } catch (error) {
        if (!cancelled) {
          setToast({
            variant: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo cargar el plugin Pokémon.",
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
      const next = await savePokemonConfig({
        isActive: config.isActive,
        defaultGeneration: config.defaultGeneration,
        language: config.language,
        embedColor: config.embedColor,
        forceEphemeral: config.forceEphemeral,
        allowedChannels: config.allowedChannels,
        allowedRoles: config.allowedRoles,
        commands: config.commands,
      });
      setConfig(next);
      setSavedFingerprint(fingerprint(next));
      setToast({
        variant: "success",
        message: "Configuración de Pokémon guardada.",
      });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el plugin Pokémon.",
      });
    } finally {
      setSaving(false);
    }
  }

  function setCommandEnabled(name: PokemonCommandName, enabled: boolean): void {
    setConfig((c) => ({
      ...c,
      commands: { ...c.commands, [name]: enabled },
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Cargando plugin Pokémon…
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
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
              <TabsTrigger
                active={tab === "general"}
                onClick={() => setTab("general")}
              >
                General
              </TabsTrigger>
              <TabsTrigger
                active={tab === "privacy"}
                onClick={() => setTab("privacy")}
              >
                Privacidad
              </TabsTrigger>
              <TabsTrigger
                active={tab === "commands"}
                onClick={() => setTab("commands")}
              >
                Comandos
              </TabsTrigger>
            </TabsList>

            {tab === "general" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Activar Plugin Pokémon
                      </CardTitle>
                      <CardDescription>
                        Interruptor maestro. Si está apagado, los slash no
                        responden.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="poke-active">Plugin activo</Label>
                        <Switch
                          id="poke-active"
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
                        Preferencias globales
                      </CardTitle>
                      <CardDescription>
                        Generación, idioma de PokéAPI y color de embeds.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="poke-gen">Generación por defecto</Label>
                        <Select
                          value={String(config.defaultGeneration)}
                          onValueChange={(value) =>
                            setConfig((c) => ({
                              ...c,
                              defaultGeneration: Number(
                                value,
                              ) as PokemonGeneration,
                            }))
                          }
                        >
                          <SelectTrigger id="poke-gen">
                            <SelectValue placeholder="Generación" />
                          </SelectTrigger>
                          <SelectContent>
                            {POKEMON_GENERATIONS.map((gen) => (
                              <SelectItem key={gen} value={String(gen)}>
                                Gen {gen}
                                {gen === 9 ? " (actual)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="poke-lang">Idioma de la API</Label>
                        <Select
                          value={config.language}
                          onValueChange={(value) =>
                            setConfig((c) => ({
                              ...c,
                              language: value === "en" ? "en" : "es",
                            }))
                          }
                        >
                          <SelectTrigger id="poke-lang">
                            <SelectValue placeholder="Idioma" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="es">Español (es)</SelectItem>
                            <SelectItem value="en">English (en)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="poke-color">
                          Color de embeds (fallback)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Se usa si no se puede detectar el color del tipo
                          primario.
                        </p>
                        <div className="flex items-center gap-3">
                          <Input
                            id="poke-color"
                            type="color"
                            className="h-10 w-14 cursor-pointer p-1"
                            value={config.embedColor}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                embedColor: e.target.value.toUpperCase(),
                              }))
                            }
                          />
                          <Input
                            type="text"
                            value={config.embedColor}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                embedColor: e.target.value,
                              }))
                            }
                            placeholder="#EF4444"
                            className="font-mono uppercase"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "privacy" ? (
              <TabsContent>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Anti-Sniping</CardTitle>
                      <CardDescription>
                        Fuerza respuestas solo visibles para quien ejecuta el
                        comando.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="poke-ephemeral">
                            Forzar respuestas efímeras
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Anti-sniping: solo el autor ve la respuesta
                            (recomendado ON).
                          </p>
                        </div>
                        <Switch
                          id="poke-ephemeral"
                          checked={config.forceEphemeral}
                          onCheckedChange={(checked) =>
                            setConfig((c) => ({
                              ...c,
                              forceEphemeral: checked,
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Roles permitidos
                      </CardTitle>
                      <CardDescription>
                        Lista blanca. Vacía = cualquiera del servidor puede usar
                        los comandos del módulo.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RoleMultiSelect
                        id="poke-roles"
                        label="Roles"
                        placeholder="Seleccionar roles…"
                        roles={roles}
                        value={config.allowedRoles}
                        onChange={(next) =>
                          setConfig((c) => ({
                            ...c,
                            allowedRoles: next,
                          }))
                        }
                        emptyHint="Sin roles cargados. Comprueba que el bot esté en el servidor."
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Canales permitidos
                      </CardTitle>
                      <CardDescription>
                        Lista blanca. Vacía = el bot escucha en todos los
                        canales.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChannelMultiSelect
                        id="poke-channels"
                        label="Canales"
                        placeholder="Seleccionar canales…"
                        channels={textChannels}
                        value={config.allowedChannels}
                        onChange={(next) =>
                          setConfig((c) => ({
                            ...c,
                            allowedChannels: next,
                          }))
                        }
                        emptyHint="Sin canales cargados. Comprueba que el bot esté en el servidor."
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ) : null}

            {tab === "commands" ? (
              <TabsContent>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Submódulos / comandos
                    </CardTitle>
                    <CardDescription>
                      Enciende o apaga cada slash de forma independiente.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {POKEMON_COMMAND_NAMES.map((name) => (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2.5"
                      >
                        <div>
                          <Label htmlFor={`cmd-${name}`} className="font-medium">
                            {POKEMON_COMMAND_LABELS[name]}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Parámetro <code>pokemon</code> con autocomplete.
                          </p>
                        </div>
                        <Switch
                          id={`cmd-${name}`}
                          checked={config.commands[name]}
                          onCheckedChange={(checked) =>
                            setCommandEnabled(name, checked)
                          }
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-4">
            <PokemonStatusMonitor config={config} />
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
              Guardar Configuración
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
