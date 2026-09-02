import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  GuildAssetsResponse,
  WelcomeSettingsResponse,
  WelcomeTextAlign,
  WelcomeTextLayer,
  WelcomeTextWeight,
} from "@adobos/shared";
import {
  applyWelcomeVariables,
  defaultWelcomeTextLayers,
  isWelcomeSendChannelType,
  newWelcomeTextLayer,
  WELCOME_AVATAR_SIZE_MAX,
  WELCOME_AVATAR_SIZE_MIN,
  WELCOME_CARD_FALLBACK_GRADIENT,
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
  WELCOME_FONT_SIZE_MAX,
  WELCOME_FONT_SIZE_MIN,
  WELCOME_TEXT_LAYERS_MAX,
} from "@adobos/shared";
import {
  fetchGuildAssets,
  fetchWelcomeSettings,
  saveWelcomeSettings,
  uploadBackgroundFile,
} from "@/lib/api";
import { BackgroundImageUpload } from "@/components/shared/BackgroundImageUpload";
import { HeaderEnableSwitch } from "@/components/shared/HeaderEnableSwitch";
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
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VariableListBase } from "@/components/shared/VariableListBase";
import { cn } from "@/lib/utils";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

type DesignTab = "avatar" | "texto";

const CARD_W = WELCOME_CARD_WIDTH;
const CARD_H = WELCOME_CARD_HEIGHT;
const AVATAR_SIZE_MIN = WELCOME_AVATAR_SIZE_MIN;
const AVATAR_SIZE_MAX = WELCOME_AVATAR_SIZE_MAX;
const FONT_SIZE_MIN = WELCOME_FONT_SIZE_MIN;
const FONT_SIZE_MAX = WELCOME_FONT_SIZE_MAX;
const CARD_FONT = "Inter, sans-serif";
const DEFAULT_LAYERS = defaultWelcomeTextLayers();

const PREVIEW_CTX = {
  userMention: "@NuevoMiembro",
  username: "NuevoMiembro",
  displayName: "NuevoMiembro",
  serverName: "Adobos",
  memberCount: 128,
};

const WELCOME_VARIABLES = [
  {
    token: "{user}",
    tip: "Mención en el mensaje Discord; nombre visible en la tarjeta PNG",
  },
  { token: "{username}", tip: "Nombre de usuario" },
  { token: "{displayname}", tip: "Apodo en el servidor" },
  { token: "{server}", tip: "Nombre del servidor" },
  { token: "{membercount}", tip: "Cantidad de miembros" },
] as const;

function previewMessage(text: string): string {
  return applyWelcomeVariables(text, PREVIEW_CTX, "message");
}

function previewCard(text: string): string {
  return applyWelcomeVariables(text, PREVIEW_CTX, "card");
}

function isCardImageSrc(src: string): boolean {
  return /^(https?:\/\/|\/|data:)/.test(src);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function AxisSlider({
  id,
  label,
  value,
  max,
  min = 0,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  min?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Slider
          id={id}
          min={min}
          max={max}
          step={1}
          value={[value]}
          disabled={disabled}
          className="min-w-0 flex-1"
          onValueChange={(next) => onChange(next[0] ?? min)}
        />
        <div className="flex shrink-0 items-center gap-1">
          <Input
            id={`${id}-number`}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={value}
            disabled={disabled}
            aria-label={`${label} (píxeles)`}
            className="h-8 w-20 border-border/60 bg-muted/40 px-2 text-right font-mono text-xs tabular-nums shadow-none"
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(next)) return;
              onChange(clampInt(next, min, max));
            }}
          />
          <span className="text-[10px] text-muted-foreground">px</span>
        </div>
      </div>
    </div>
  );
}

function HexColorField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#FFFFFF";
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#FFFFFF"
        />
        <input
          type="color"
          aria-label={label}
          className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
          value={safe}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function CanvasCardPreview({
  previewBg,
  blurAmount,
  avatarX,
  avatarY,
  avatarSize,
  avatarBorderWidth,
  avatarBorderColor,
  textLayers,
}: {
  previewBg: string;
  blurAmount: number;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  avatarBorderWidth: number;
  avatarBorderColor: string;
  textLayers: WelcomeTextLayer[];
}) {
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return;

    function updateScale(): void {
      if (!previewFrameRef.current) return;
      const width = previewFrameRef.current.clientWidth;
      setPreviewScale(width > 0 ? width / CARD_W : 1);
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={previewFrameRef}
      className="relative w-full overflow-hidden rounded-md border border-border bg-stone-950"
      style={{ height: CARD_H * previewScale }}
    >
      <div
        className="relative origin-top-left overflow-hidden"
        style={{
          width: CARD_W,
          height: CARD_H,
          transform: `scale(${previewScale})`,
          backgroundImage: isCardImageSrc(previewBg)
            ? `url(${previewBg})`
            : previewBg || WELCOME_CARD_FALLBACK_GRADIENT,
          backgroundSize: "100% 100%",
          backgroundPosition: "center",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.20), rgba(0,0,0,0.30) 55%, rgba(0,0,0,0.50))",
            backdropFilter:
              blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
            WebkitBackdropFilter:
              blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
          }}
        />

        <div
          className="absolute overflow-hidden rounded-full bg-primary"
          style={{
            left: avatarX - avatarSize / 2,
            top: avatarY - avatarSize / 2,
            width: avatarSize,
            height: avatarSize,
            boxShadow:
              avatarBorderWidth > 0
                ? `0 0 0 ${avatarBorderWidth}px ${avatarBorderColor}`
                : undefined,
          }}
        >
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary to-amber-700 text-5xl font-semibold text-white">
            N
          </div>
        </div>

        {textLayers.map((layer) => (
          <p
            key={layer.id}
            className="absolute m-0 overflow-visible whitespace-nowrap leading-none"
            style={{
              left: layer.x,
              top: layer.y,
              transform:
                layer.align === "center" ? "translateX(-50%)" : undefined,
              color: layer.color,
              fontFamily: CARD_FONT,
              fontSize: layer.fontSize,
              fontWeight: layer.weight === "bold" ? 700 : 400,
            }}
          >
            {previewCard(layer.text || " ")}
          </p>
        ))}
      </div>
    </div>
  );
}

function TextLayerEditor({
  layer,
  index,
  open,
  disabled,
  onToggle,
  onChange,
  onRemove,
}: {
  layer: WelcomeTextLayer;
  index: number;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange: (next: WelcomeTextLayer) => void;
  onRemove: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
        onClick={onToggle}
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Capa {index + 1}
          {layer.text.trim() ? ` · ${layer.text}` : ""}
        </span>
        <span
          className="size-3 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: layer.color }}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-3 py-4">
          <div className="space-y-2">
            <Label htmlFor={`layer-text-${layer.id}`}>Contenido</Label>
            <Input
              id={`layer-text-${layer.id}`}
              value={layer.text}
              maxLength={200}
              disabled={disabled}
              placeholder="¡Bienvenido a {server}!"
              onChange={(event) =>
                onChange({ ...layer, text: event.target.value })
              }
            />
          </div>

          <AxisSlider
            id={`layer-x-${layer.id}`}
            label="X"
            value={layer.x}
            max={CARD_W}
            disabled={disabled}
            onChange={(x) => onChange({ ...layer, x })}
          />
          <AxisSlider
            id={`layer-y-${layer.id}`}
            label="Y"
            value={layer.y}
            max={CARD_H}
            disabled={disabled}
            onChange={(y) => onChange({ ...layer, y })}
          />
          <AxisSlider
            id={`layer-size-${layer.id}`}
            label="Tamaño"
            value={layer.fontSize}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            disabled={disabled}
            onChange={(fontSize) => onChange({ ...layer, fontSize })}
          />

          <HexColorField
            id={`layer-color-${layer.id}`}
            label="Color"
            value={layer.color}
            disabled={disabled}
            onChange={(color) => onChange({ ...layer, color })}
          />

          <div className="space-y-2">
            <Label>Peso</Label>
            <Select
              value={layer.weight}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({
                  ...layer,
                  weight: value as WelcomeTextWeight,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bold">Negrita</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Alineación</Label>
            <Select
              value={layer.align === "center" ? "center" : "left"}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({
                  ...layer,
                  align: value as WelcomeTextAlign,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="left">Izquierda</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full text-red-600 hover:bg-red-500/10 hover:text-red-600"
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
            Eliminar capa
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function WelcomeBuilder() {
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [bgFilepath, setBgFilepath] = useState<string | null>(null);
  const [blurAmount, setBlurAmount] = useState(4);
  const [messageContent, setMessageContent] = useState("{user}");
  const [avatarX, setAvatarX] = useState(Math.round(CARD_W / 2));
  const [avatarY, setAvatarY] = useState(380);
  const [avatarSize, setAvatarSize] = useState(AVATAR_SIZE_MIN);
  const [avatarBorderWidth, setAvatarBorderWidth] = useState(8);
  const [avatarBorderColor, setAvatarBorderColor] = useState("#FFFFFF");
  const [textLayers, setTextLayers] = useState<WelcomeTextLayer[]>(() =>
    DEFAULT_LAYERS.map((layer) => ({ ...layer })),
  );
  const [openLayerIds, setOpenLayerIds] = useState<string[]>([
    DEFAULT_LAYERS[0]!.id,
  ]);
  const [uploading, setUploading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [designTab, setDesignTab] = useState<DesignTab>("avatar");

  const isSubmitting = feedback.kind === "loading";
  const previewBg = bgFilepath || backgroundUrl || WELCOME_CARD_FALLBACK_GRADIENT;

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [guildAssets, settings] = await Promise.all([
          fetchGuildAssets(),
          fetchWelcomeSettings(),
        ]);
        if (cancelled) return;
        setAssets(guildAssets);
        setAssetsError(null);
        applySettings(settings);
      } catch (error: unknown) {
        if (cancelled) return;
        setAssetsError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar la configuración",
        );
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function applySettings(settings: WelcomeSettingsResponse): void {
    setGuildId(settings.guildId);
    setChannelId(settings.channelId ?? "");
    setIsEnabled(settings.isEnabled);
    setBackgroundUrl(settings.backgroundUrl || "");
    setBgFilepath(settings.bgFilepath);
    setBlurAmount(settings.blurAmount);
    setMessageContent(settings.messageContent);
    setAvatarX(settings.avatarX);
    setAvatarY(settings.avatarY);
    setAvatarSize(settings.avatarSize ?? AVATAR_SIZE_MIN);
    setAvatarBorderWidth(settings.avatarBorderWidth ?? 8);
    setAvatarBorderColor(settings.avatarBorderColor || "#FFFFFF");
    const layers =
      Array.isArray(settings.textLayers) && settings.textLayers.length > 0
        ? settings.textLayers
        : DEFAULT_LAYERS.map((layer) => ({ ...layer }));
    setTextLayers(layers);
    setOpenLayerIds(layers[0] ? [layers[0].id] : []);
  }

  function updateLayer(id: string, next: WelcomeTextLayer): void {
    setTextLayers((prev) => prev.map((layer) => (layer.id === id ? next : layer)));
  }

  function removeLayer(id: string): void {
    setTextLayers((prev) => prev.filter((layer) => layer.id !== id));
    setOpenLayerIds((prev) => prev.filter((openId) => openId !== id));
  }

  function addLayer(): void {
    const layer = newWelcomeTextLayer();
    setTextLayers((prev) => [...prev, layer]);
    setOpenLayerIds((prev) => [...prev, layer.id]);
  }

  async function handleBackgroundFile(file: File): Promise<void> {
    setUploading(true);
    setFeedback({ kind: "idle" });
    try {
      const result = await uploadBackgroundFile(file);
      setBgFilepath(result.path);
      setFeedback({
        kind: "ok",
        message: `Fondo subido: ${result.filename}`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error al subir",
      });
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!guildId) {
      setFeedback({
        kind: "error",
        message: "No se pudo resolver el servidor.",
      });
      return;
    }
    if (isEnabled && !channelId) {
      setFeedback({
        kind: "error",
        message: "Selecciona un canal de destino para activar el módulo.",
      });
      return;
    }

    setFeedback({ kind: "loading" });
    try {
      await saveWelcomeSettings({
        guildId,
        channelId,
        isEnabled,
        backgroundUrl,
        bgFilepath,
        blurAmount,
        messageContent,
        avatarX,
        avatarY,
        avatarSize,
        avatarBorderWidth,
        avatarBorderColor,
        textLayers,
      });
      setFeedback({
        kind: "ok",
        message: isEnabled
          ? "Welcome guardada y activa."
          : "Configuración guardada (módulo desactivado).",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  if (loadingSettings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Cargando configuración de bienvenidas…
      </div>
    );
  }

  const sendChannels = (assets?.channels ?? []).filter((channel) =>
    isWelcomeSendChannelType(channel.type),
  );

  const canvasPreview = (
    <CanvasCardPreview
      previewBg={previewBg}
      blurAmount={blurAmount}
      avatarX={avatarX}
      avatarY={avatarY}
      avatarSize={avatarSize}
      avatarBorderWidth={avatarBorderWidth}
      avatarBorderColor={avatarBorderColor}
      textLayers={textLayers}
    />
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <HeaderEnableSwitch
        idPrefix="welcome"
        checked={isEnabled}
        disabled={isSubmitting}
        onCheckedChange={setIsEnabled}
      />

      {assetsError && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {assetsError}
        </p>
      )}
      {assets && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Servidor: {assets.guildName} · módulo{" "}
          {isEnabled ? "habilitado" : "deshabilitado"}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Canal destino</CardTitle>
              <CardDescription>
                El bot publicará la bienvenida aquí.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="welcome-channel">Canal</Label>
                {sendChannels.length > 0 ? (
                  <Select
                    value={channelId || undefined}
                    disabled={isSubmitting}
                    onValueChange={setChannelId}
                  >
                    <SelectTrigger id="welcome-channel">
                      <SelectValue placeholder="Selecciona un canal…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sendChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay canales de texto o anuncios.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Diseño de la bienvenida</CardTitle>
              <CardDescription>
                Tarjeta PNG 1920×1080 con mensaje Discord opcional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 md:h-full">
                  <Label htmlFor="messageContent">Mensaje Discord</Label>
                  <Textarea
                    id="messageContent"
                    value={messageContent}
                    maxLength={500}
                    disabled={isSubmitting}
                    placeholder="{user} llegó al servidor. Ahora somos {membercount}."
                    className="h-full min-h-[8.5rem] resize-y md:min-h-0"
                    onChange={(event) => setMessageContent(event.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <BackgroundImageUpload
                    src={previewBg}
                    disabled={isSubmitting}
                    uploading={uploading}
                    onFile={(file) => {
                      void handleBackgroundFile(file);
                    }}
                  />
                  <AxisSlider
                    id="blurAmount"
                    label="Desenfoque"
                    value={blurAmount}
                    min={0}
                    max={10}
                    disabled={isSubmitting}
                    onChange={setBlurAmount}
                  />
                </div>
              </div>

              <Tabs>
                <TabsList className="grid h-auto w-full grid-cols-2">
                  <TabsTrigger
                    active={designTab === "avatar"}
                    onClick={() => setDesignTab("avatar")}
                  >
                    Avatar
                  </TabsTrigger>
                  <TabsTrigger
                    active={designTab === "texto"}
                    onClick={() => setDesignTab("texto")}
                  >
                    Texto
                  </TabsTrigger>
                </TabsList>

                {designTab === "avatar" && (
                  <TabsContent className="space-y-5">
                    <AxisSlider
                      id="avatarX"
                      label="Avatar X"
                      value={avatarX}
                      max={CARD_W}
                      disabled={isSubmitting}
                      onChange={setAvatarX}
                    />
                    <AxisSlider
                      id="avatarY"
                      label="Avatar Y"
                      value={avatarY}
                      max={CARD_H}
                      disabled={isSubmitting}
                      onChange={setAvatarY}
                    />
                    <AxisSlider
                      id="avatarSize"
                      label="Tamaño del avatar"
                      value={avatarSize}
                      max={AVATAR_SIZE_MAX}
                      min={AVATAR_SIZE_MIN}
                      disabled={isSubmitting}
                      onChange={setAvatarSize}
                    />
                    <AxisSlider
                      id="avatarBorderWidth"
                      label="Grosor del borde"
                      value={avatarBorderWidth}
                      min={0}
                      max={40}
                      disabled={isSubmitting}
                      onChange={setAvatarBorderWidth}
                    />
                    <HexColorField
                      id="avatarBorderColor"
                      label="Color del borde"
                      value={avatarBorderColor}
                      disabled={isSubmitting}
                      onChange={setAvatarBorderColor}
                    />
                  </TabsContent>
                )}

                {designTab === "texto" && (
                  <TabsContent className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Capas independientes con posición y estilo propios.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting || textLayers.length >= WELCOME_TEXT_LAYERS_MAX}
                        onClick={addLayer}
                      >
                        <Plus className="size-4" aria-hidden />
                        Agregar nuevo texto
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {textLayers.map((layer, index) => (
                        <TextLayerEditor
                          key={layer.id}
                          layer={layer}
                          index={index}
                          open={openLayerIds.includes(layer.id)}
                          disabled={isSubmitting}
                          onToggle={() =>
                            setOpenLayerIds((prev) =>
                              prev.includes(layer.id)
                                ? prev.filter((id) => id !== layer.id)
                                : [...prev, layer.id],
                            )
                          }
                          onChange={(next) => updateLayer(layer.id, next)}
                          onRemove={() => removeLayer(layer.id)}
                        />
                      ))}
                      {textLayers.length === 0 && (
                        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                          No hay capas. Agrega un texto para empezar.
                        </p>
                      )}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Guardar bienvenida
            </Button>

            {feedback.kind === "ok" && (
              <p
                className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                {feedback.message}
              </p>
            )}
            {feedback.kind === "error" && (
              <p
                className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400"
                role="alert"
              >
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {feedback.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Vista previa</CardTitle>
              <CardDescription>
                Lienzo 1920×1080 escalado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5 pt-0">
              {canvasPreview}
              {messageContent.trim() ? (
                <p className="text-sm text-muted-foreground">
                  Mensaje:{" "}
                  <span className="text-foreground">
                    {previewMessage(messageContent)}
                  </span>
                </p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Si el texto se corta, baja el tamaño. Con alineación al centro,
                X es el punto medio de la capa.
              </p>
            </CardContent>
          </Card>

          <VariableListBase items={WELCOME_VARIABLES} />
        </div>
      </div>
    </form>
  );
}
