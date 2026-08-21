import type {
  EconomyShopItem,
  EconomyShopRewards,
  GuildChannelAsset,
  GuildEmojiAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import {
  defaultEconomyShopItemDraft,
  defaultShopRewards,
  summarizeShopRewards,
} from "@adobos/shared";
import {
  createShopItem,
  deleteShopItem,
  fetchEconomyConfig,
  fetchGuildAssets,
  fetchShopItems,
  updateShopItem,
  uploadImageFile,
} from "@/lib/api";
import {
  DiscordEmojiPicker,
  type DiscordEmojiSelection,
} from "@/components/shared/DiscordEmojiPicker";
import { RoleColorDot } from "@/components/shared/RoleColorDot";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastBanner } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ImagePlus,
  Loader2,
  MessageSquareWarning,
  Pencil,
  Plus,
  Save,
  Shield,
  Store,
  Trash2,
  TrendingUp,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EconomyShopItemPreview, ShopItemIcon } from "./EconomyShopItemPreview";

type MainTab = "list" | "builder";
type BuilderTab = "appearance" | "rewards";

const CHANNEL_TEXT = 0;
const CHANNEL_CATEGORY = 4;

type DraftItem = Omit<EconomyShopItem, "createdAt" | "updatedAt">;

function roleDotColor(
  role: GuildRoleAsset | undefined,
): string | number | null {
  if (!role) return null;
  return role.hexColor ?? role.color ?? null;
}

function isImageIcon(icon: string): boolean {
  const s = icon.trim();
  return (
    s.startsWith("/uploads/") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

function selectionFromIcon(
  icon: string,
  emojis: GuildEmojiAsset[],
): DiscordEmojiSelection | null {
  const s = icon.trim();
  if (!s || isImageIcon(s)) return null;
  const mention = /^<(a)?:([\w~]+):(\d+)>$/.exec(s);
  if (mention) {
    const animated = Boolean(mention[1]);
    const id = mention[3]!;
    const emoji = emojis.find((e) => e.id === id);
    const cdn = `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=64`;
    return {
      emojiKey: `custom:${id}`,
      display: emoji?.mention ?? s,
      mention: emoji?.mention ?? s,
      imageUrl: emoji?.url ?? cdn,
    };
  }
  return { emojiKey: `unicode:${s}`, display: s };
}

function iconFromSelection(selection: DiscordEmojiSelection): string {
  if (selection.emojiKey.startsWith("unicode:")) return selection.display;
  if (selection.mention) return selection.mention;
  return selection.display;
}

function emptyDraft(): DraftItem {
  return defaultEconomyShopItemDraft();
}

function countActiveRewards(rewards: EconomyShopRewards): number {
  return summarizeShopRewards(rewards).length;
}

export function EconomyShopDashboard() {
  const [mainTab, setMainTab] = useState<MainTab>("list");
  const [builderTab, setBuilderTab] = useState<BuilderTab>("appearance");
  const [items, setItems] = useState<EconomyShopItem[]>([]);
  const [draft, setDraft] = useState<DraftItem>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currencyName, setCurrencyName] = useState("Adobos Coins");
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [emojis, setEmojis] = useState<GuildEmojiAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const [stockUnlimited, setStockUnlimited] = useState(true);
  const iconFileRef = useRef<HTMLInputElement>(null);

  const assignableRoles = useMemo(
    () =>
      roles
        .filter(
          (r) =>
            r.name !== "@everyone" && (!r.managed || r.premiumSubscriber),
        )
        .sort((a, b) => b.position - a.position),
    [roles],
  );

  const textChannels = useMemo(
    () =>
      channels
        .filter((c) => c.type === CHANNEL_TEXT)
        .sort((a, b) => a.position - b.position),
    [channels],
  );

  const categoryChannels = useMemo(
    () =>
      channels
        .filter((c) => c.type === CHANNEL_CATEGORY)
        .sort((a, b) => a.position - b.position),
    [channels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setToast(null);
    try {
      const [shopItems, economy, assets] = await Promise.all([
        fetchShopItems(),
        fetchEconomyConfig().catch(() => null),
        fetchGuildAssets().catch(() => null),
      ]);
      setItems(shopItems);
      if (economy) setCurrencyName(economy.currencyName);
      if (assets) {
        setRoles(assets.roles);
        setChannels(assets.channels);
        setEmojis(assets.emojis);
      }
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error al cargar la tienda.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(): void {
    setEditingId(null);
    setDraft(emptyDraft());
    setStockUnlimited(true);
    setBuilderTab("appearance");
    setMainTab("builder");
  }

  function openEdit(item: EconomyShopItem): void {
    setEditingId(item.id);
    setDraft({
      id: item.id,
      guildId: item.guildId,
      name: item.name,
      description: item.description,
      price: item.price,
      icon: item.icon,
      stock: item.stock,
      rewards: item.rewards ?? defaultShopRewards(),
      enabled: item.enabled,
      sortOrder: item.sortOrder,
    });
    setStockUnlimited(item.stock === null);
    setBuilderTab("appearance");
    setMainTab("builder");
  }

  function patchDraft(patch: Partial<DraftItem>): void {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function patchRewards(patch: Partial<EconomyShopRewards>): void {
    setDraft((d) => ({
      ...d,
      rewards: { ...d.rewards, ...patch },
    }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setToast(null);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        price: draft.price,
        icon: draft.icon,
        stock: stockUnlimited ? null : (draft.stock ?? 0),
        rewards: draft.rewards,
        enabled: draft.enabled,
        sortOrder: draft.sortOrder,
      };

      if (editingId) {
        await updateShopItem(editingId, payload);
        setToast({ variant: "success", message: "Ítem actualizado." });
      } else {
        await createShopItem(payload);
        setToast({ variant: "success", message: "Ítem creado." });
      }
      await load();
      setMainTab("list");
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("¿Eliminar este ítem de la tienda?")) return;
    try {
      await deleteShopItem(id);
      setToast({ variant: "success", message: "Ítem eliminado." });
      await load();
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error ? error.message : "No se pudo eliminar.",
      });
    }
  }

  async function handleIconUpload(
    file: File | null | undefined,
  ): Promise<void> {
    if (!file) return;
    setUploadingIcon(true);
    try {
      const result = await uploadImageFile(file);
      patchDraft({ icon: result.path });
    } catch (error) {
      setToast({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo subir la imagen.",
      });
    } finally {
      setUploadingIcon(false);
      if (iconFileRef.current) iconFileRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Cargando tienda…
      </div>
    );
  }

  const { rewards } = draft;

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
          {mainTab === "list" ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Store className="size-4 text-primary" />
                      Catálogo ({items.length})
                    </CardTitle>
                    <CardDescription>
                      Ítems canjeables con /shop y /buy.
                    </CardDescription>
                  </div>
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    Nuevo ítem
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Todavía no hay ítems. Crea el primero.
                    </p>
                    <Button
                      type="button"
                      className="mt-4"
                      onClick={openCreate}
                    >
                      <Plus className="size-4" />
                      Crear ítem
                    </Button>
                  </div>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-muted/10 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                            <ShopItemIcon
                              icon={item.icon}
                              className="size-5 shrink-0"
                            />
                            <span className="truncate">{item.name}</span>
                          </p>
                          {!item.enabled ? (
                            <Badge className="normal-case tracking-normal opacity-70">
                              Pausado
                            </Badge>
                          ) : null}
                          <Badge className="normal-case tracking-normal">
                            {countActiveRewards(item.rewards)} beneficio
                            {countActiveRewards(item.rewards) === 1
                              ? ""
                              : "s"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.price.toLocaleString("es-MX")} {currencyName} ·
                          Stock {item.stock === null ? "∞" : item.stock}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar"
                          onClick={() => void handleDelete(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <Tabs>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
                <TabsTrigger
                  active={builderTab === "appearance"}
                  onClick={() => setBuilderTab("appearance")}
                >
                  1. Apariencia
                </TabsTrigger>
                <TabsTrigger
                  active={builderTab === "rewards"}
                  onClick={() => setBuilderTab("rewards")}
                >
                  2. Recompensas
                </TabsTrigger>
              </TabsList>

              {builderTab === "appearance" ? (
                <TabsContent>
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Apariencia en /shop
                        </CardTitle>
                        <CardDescription>
                          {editingId
                            ? "Editando ítem existente."
                            : "Creando un ítem nuevo."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="item-name">Nombre</Label>
                            <Input
                              id="item-name"
                              value={draft.name}
                              onChange={(e) =>
                                patchDraft({ name: e.target.value })
                              }
                              placeholder="VIP Semanal"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="item-price">Precio</Label>
                            <Input
                              id="item-price"
                              type="number"
                              min={0}
                              value={draft.price}
                              onChange={(e) =>
                                patchDraft({
                                  price: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="item-desc">Descripción</Label>
                          <Textarea
                            id="item-desc"
                            value={draft.description}
                            onChange={(e) =>
                              patchDraft({ description: e.target.value })
                            }
                            rows={3}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Emoji o icono</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted/40">
                              <ShopItemIcon
                                icon={draft.icon || "🛒"}
                                className="size-6"
                              />
                            </div>
                            <DiscordEmojiPicker
                              serverEmojis={emojis}
                              value={selectionFromIcon(draft.icon, emojis)}
                              onSelect={(sel) =>
                                patchDraft({ icon: iconFromSelection(sel) })
                              }
                              disabled={uploadingIcon}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9"
                              disabled={uploadingIcon}
                              onClick={() => iconFileRef.current?.click()}
                            >
                              {uploadingIcon ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ImagePlus className="size-4" />
                              )}
                              Subir imagen
                            </Button>
                            <input
                              ref={iconFileRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) =>
                                void handleIconUpload(e.target.files?.[0])
                              }
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                          <div>
                            <p className="text-sm font-medium">Stock infinito</p>
                            <p className="text-xs text-muted-foreground">
                              Sin límite de compras.
                            </p>
                          </div>
                          <Switch
                            checked={stockUnlimited}
                            onCheckedChange={(next) => {
                              setStockUnlimited(next);
                              if (next) patchDraft({ stock: null });
                              else patchDraft({ stock: draft.stock ?? 10 });
                            }}
                          />
                        </div>
                        {!stockUnlimited ? (
                          <div className="space-y-2">
                            <Label htmlFor="item-stock">Límite de stock</Label>
                            <Input
                              id="item-stock"
                              type="number"
                              min={0}
                              value={draft.stock ?? 0}
                              onChange={(e) =>
                                patchDraft({
                                  stock: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                          <div>
                            <p className="text-sm font-medium">Ítem activo</p>
                            <p className="text-xs text-muted-foreground">
                              Visible en /shop si está activo.
                            </p>
                          </div>
                          <Switch
                            checked={draft.enabled}
                            onCheckedChange={(enabled) =>
                              patchDraft({ enabled })
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBuilderTab("rewards")}
                    >
                      Continuar a recompensas →
                    </Button>
                  </div>
                </TabsContent>
              ) : null}

              {builderTab === "rewards" ? (
                <TabsContent>
                  <div className="space-y-3">
                    <RewardToggleCard
                      icon={Shield}
                      title="Asignación de Rol"
                      description="Otorga un rol existente al comprador."
                      enabled={rewards.hasRole}
                      onEnabledChange={(hasRole) => patchRewards({ hasRole })}
                    >
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Rol</Label>
                          <Select
                            value={rewards.roleConfig.roleId || undefined}
                            onValueChange={(roleId) =>
                              patchRewards({
                                roleConfig: {
                                  ...rewards.roleConfig,
                                  roleId,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              {(() => {
                                const selected = assignableRoles.find(
                                  (r) => r.id === rewards.roleConfig.roleId,
                                );
                                return selected ? (
                                  <span className="flex min-w-0 items-center gap-2">
                                    <RoleColorDot
                                      color={roleDotColor(selected)}
                                    />
                                    <span className="truncate">
                                      @{selected.name}
                                    </span>
                                  </span>
                                ) : (
                                  <SelectValue placeholder="Seleccionar rol" />
                                );
                              })()}
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  <span className="flex items-center gap-2">
                                    <RoleColorDot
                                      color={roleDotColor(role)}
                                    />
                                    @{role.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                          <div>
                            <p className="text-sm font-medium">
                              ¿Es un rol temporal?
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Se retirará del miembro al expirar.
                            </p>
                          </div>
                          <Switch
                            checked={rewards.roleConfig.temporary}
                            onCheckedChange={(temporary) =>
                              patchRewards({
                                roleConfig: {
                                  ...rewards.roleConfig,
                                  temporary,
                                },
                              })
                            }
                          />
                        </div>
                        {rewards.roleConfig.temporary ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Duración</Label>
                              <Input
                                type="number"
                                min={1}
                                value={rewards.roleConfig.durationValue}
                                onChange={(e) =>
                                  patchRewards({
                                    roleConfig: {
                                      ...rewards.roleConfig,
                                      durationValue:
                                        Number(e.target.value) || 1,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unidad</Label>
                              <Select
                                value={rewards.roleConfig.durationUnit}
                                onValueChange={(durationUnit) =>
                                  patchRewards({
                                    roleConfig: {
                                      ...rewards.roleConfig,
                                      durationUnit:
                                        durationUnit === "days"
                                          ? "days"
                                          : "hours",
                                    },
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hours">Horas</SelectItem>
                                  <SelectItem value="days">Días</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </RewardToggleCard>

                    <RewardToggleCard
                      icon={Lock}
                      title="Canal Privado"
                      description="Crea un canal de texto solo para el comprador."
                      enabled={rewards.hasChannel}
                      onEnabledChange={(hasChannel) =>
                        patchRewards({ hasChannel })
                      }
                    >
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Nombre del canal</Label>
                          <Input
                            value={rewards.channelConfig.nameTemplate}
                            onChange={(e) =>
                              patchRewards({
                                channelConfig: {
                                  ...rewards.channelConfig,
                                  nameTemplate: e.target.value,
                                },
                              })
                            }
                            placeholder="privado-{username}"
                          />
                          <p className="text-xs text-muted-foreground">
                            Variables: {"{username}"}, {"{displayname}"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Categoría</Label>
                          <Select
                            value={
                              rewards.channelConfig.categoryId ?? "__auto__"
                            }
                            onValueChange={(v) =>
                              patchRewards({
                                channelConfig: {
                                  ...rewards.channelConfig,
                                  categoryId: v === "__auto__" ? null : v,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">
                                Zonas Privadas (auto)
                              </SelectItem>
                              {categoryChannels.map((ch) => (
                                <SelectItem key={ch.id} value={ch.id}>
                                  {ch.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                          <div>
                            <p className="text-sm font-medium">
                              ¿Es un canal temporal?
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Se eliminará al expirar.
                            </p>
                          </div>
                          <Switch
                            checked={rewards.channelConfig.temporary}
                            onCheckedChange={(temporary) =>
                              patchRewards({
                                channelConfig: {
                                  ...rewards.channelConfig,
                                  temporary,
                                },
                              })
                            }
                          />
                        </div>
                        {rewards.channelConfig.temporary ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Duración</Label>
                              <Input
                                type="number"
                                min={1}
                                value={rewards.channelConfig.durationValue}
                                onChange={(e) =>
                                  patchRewards({
                                    channelConfig: {
                                      ...rewards.channelConfig,
                                      durationValue:
                                        Number(e.target.value) || 1,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unidad</Label>
                              <Select
                                value={rewards.channelConfig.durationUnit}
                                onValueChange={(durationUnit) =>
                                  patchRewards({
                                    channelConfig: {
                                      ...rewards.channelConfig,
                                      durationUnit:
                                        durationUnit === "days"
                                          ? "days"
                                          : "hours",
                                    },
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hours">Horas</SelectItem>
                                  <SelectItem value="days">Días</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </RewardToggleCard>

                    <RewardToggleCard
                      icon={TrendingUp}
                      title="Multiplicadores"
                      description="Boost de XP o economía (puede ser temporal)."
                      enabled={rewards.hasBoost}
                      onEnabledChange={(hasBoost) =>
                        patchRewards({ hasBoost })
                      }
                    >
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select
                              value={rewards.boostConfig.module}
                              onValueChange={(module) =>
                                patchRewards({
                                  boostConfig: {
                                    ...rewards.boostConfig,
                                    module:
                                      module === "economy" ? "economy" : "xp",
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="xp">XP</SelectItem>
                                <SelectItem value="economy">Economía</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Factor</Label>
                            <Input
                              type="number"
                              min={1}
                              step={0.1}
                              value={rewards.boostConfig.multiplier}
                              onChange={(e) =>
                                patchRewards({
                                  boostConfig: {
                                    ...rewards.boostConfig,
                                    multiplier: Number(e.target.value) || 1,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-3">
                          <div>
                            <p className="text-sm font-medium">
                              ¿Es un boost temporal?
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Si no, el multiplicador permanece activo.
                            </p>
                          </div>
                          <Switch
                            checked={rewards.boostConfig.temporary}
                            onCheckedChange={(temporary) =>
                              patchRewards({
                                boostConfig: {
                                  ...rewards.boostConfig,
                                  temporary,
                                },
                              })
                            }
                          />
                        </div>
                        {rewards.boostConfig.temporary ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Duración</Label>
                              <Input
                                type="number"
                                min={1}
                                value={rewards.boostConfig.durationValue}
                                onChange={(e) =>
                                  patchRewards({
                                    boostConfig: {
                                      ...rewards.boostConfig,
                                      durationValue:
                                        Number(e.target.value) || 1,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unidad</Label>
                              <Select
                                value={rewards.boostConfig.durationUnit}
                                onValueChange={(durationUnit) =>
                                  patchRewards({
                                    boostConfig: {
                                      ...rewards.boostConfig,
                                      durationUnit:
                                        durationUnit === "days"
                                          ? "days"
                                          : "hours",
                                    },
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hours">Horas</SelectItem>
                                  <SelectItem value="days">Días</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </RewardToggleCard>

                    <RewardToggleCard
                      icon={MessageSquareWarning}
                      title="Entrega Manual (Staff)"
                      description="Notifica al staff para recompensas externas."
                      enabled={rewards.hasManual}
                      onEnabledChange={(hasManual) =>
                        patchRewards({ hasManual })
                      }
                    >
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Instrucciones</Label>
                          <Textarea
                            value={rewards.manualConfig.staffInstructions}
                            onChange={(e) =>
                              patchRewards({
                                manualConfig: {
                                  ...rewards.manualConfig,
                                  staffInstructions: e.target.value,
                                },
                              })
                            }
                            rows={3}
                            placeholder="Dar 100k en Minecraft…"
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Canal de logs</Label>
                            <Select
                              value={
                                rewards.manualConfig.logChannelId || undefined
                              }
                              onValueChange={(logChannelId) =>
                                patchRewards({
                                  manualConfig: {
                                    ...rewards.manualConfig,
                                    logChannelId,
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar canal" />
                              </SelectTrigger>
                              <SelectContent>
                                {textChannels.map((ch) => (
                                  <SelectItem key={ch.id} value={ch.id}>
                                    #{ch.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Rol del staff</Label>
                            <Select
                              value={
                                rewards.manualConfig.pingRoleId || undefined
                              }
                              onValueChange={(pingRoleId) =>
                                patchRewards({
                                  manualConfig: {
                                    ...rewards.manualConfig,
                                    pingRoleId,
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                {(() => {
                                  const selected = assignableRoles.find(
                                    (r) =>
                                      r.id === rewards.manualConfig.pingRoleId,
                                  );
                                  return selected ? (
                                    <span className="flex min-w-0 items-center gap-2">
                                      <RoleColorDot
                                        color={roleDotColor(selected)}
                                      />
                                      <span className="truncate">
                                        @{selected.name}
                                      </span>
                                    </span>
                                  ) : (
                                    <SelectValue placeholder="@Staff" />
                                  );
                                })()}
                              </SelectTrigger>
                              <SelectContent>
                                {assignableRoles.map((role) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    <span className="flex items-center gap-2">
                                      <RoleColorDot
                                        color={roleDotColor(role)}
                                      />
                                      @{role.name}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </RewardToggleCard>
                  </div>
                </TabsContent>
              ) : null}
            </Tabs>
          )}
        </div>

        <Card className="sticky top-4 self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vista previa</CardTitle>
            <CardDescription>
              Embed de /shop y beneficios activos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <EconomyShopItemPreview
              item={{
                name: draft.name,
                description: draft.description,
                price: draft.price,
                icon: draft.icon,
                stock: stockUnlimited ? null : (draft.stock ?? 0),
                rewards: draft.rewards,
              }}
              currencyName={currencyName}
            />
            {mainTab === "builder" ? (
              <>
                <Button
                  type="button"
                  className="w-full"
                  disabled={saving || !draft.name.trim()}
                  onClick={() => void handleSave()}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {editingId ? "Guardar cambios" : "Crear ítem"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setMainTab("list")}
                >
                  Volver al listado
                </Button>
              </>
            ) : (
              <Button type="button" className="w-full" onClick={openCreate}>
                <Plus className="size-4" />
                Nuevo ítem
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RewardToggleCard({
  icon: Icon,
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Card className={cn(enabled && "border-primary/40")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label={`Activar ${title}`}
          />
        </div>
      </CardHeader>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          enabled ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          {enabled ? (
            <CardContent className="border-t border-border pt-4">
              {children}
            </CardContent>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
