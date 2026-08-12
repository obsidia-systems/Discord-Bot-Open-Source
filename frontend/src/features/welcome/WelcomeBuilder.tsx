import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useDropzone } from "react-dropzone";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Save,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  GuildAssetsResponse,
  WelcomeSettingsResponse,
} from "@adobos/shared";
import {
  fetchGuildAssets,
  fetchWelcomeSettings,
  saveWelcomeSettings,
  uploadBackgroundFile,
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VariableListBase } from "@/components/shared/VariableListBase";
import { cn } from "@/lib/utils";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

type DesignTab = "fondo" | "avatar" | "texto";

const CARD_W = 1920;
const CARD_H = 1080;
const AVATAR_SIZE_MIN = 280;
const AVATAR_SIZE_MAX = 720;
const FONT_SIZE_MIN = 20;
const FONT_SIZE_MAX = 200;
const FONT_SIZE_DEFAULT = 64;
/** Misma familia que `ctx.font` en WelcomeCardBuilder. */
const CARD_FONT = "Inter, sans-serif";

const DEFAULT_BG =
  "https://images.unsplash.com/photo-1614850715649-1d0106293bd1?auto=format&fit=crop&w=1920&q=80";

const GALLERY = [
  {
    id: "sunset",
    label: "Atardecer",
    url: DEFAULT_BG,
  },
  {
    id: "city",
    label: "Ciudad",
    url: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1920&q=80",
  },
  {
    id: "forest",
    label: "Bosque",
    url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80",
  },
  {
    id: "abstract",
    label: "Abstracto",
    url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80",
  },
] as const;

const WELCOME_VARIABLES = [
  { token: "{user}", tip: "Mención (@usuario) en el mensaje Discord" },
  { token: "{username}", tip: "Nombre de usuario" },
  { token: "{displayname}", tip: "Apodo en el servidor" },
  { token: "{server}", tip: "Nombre del servidor" },
  { token: "{membercount}", tip: "Cantidad de miembros" },
] as const;

function previewReplace(text: string): string {
  return text
    .replaceAll("{user}", "@NuevoMiembro")
    .replaceAll("{username}", "NuevoMiembro")
    .replaceAll("{displayname}", "NuevoMiembro")
    .replaceAll("{displayName}", "NuevoMiembro")
    .replaceAll("{server}", "Adobos")
    .replaceAll("{membercount}", "128")
    .replaceAll("{memberCount}", "128");
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex items-center gap-1">
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
      <Slider
        id={id}
        min={min}
        max={max}
        step={1}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => onChange(next[0] ?? min)}
      />
    </div>
  );
}

export function WelcomeBuilder() {
  const [assets, setAssets] = useState<GuildAssetsResponse | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState(DEFAULT_BG);
  const [bgFilepath, setBgFilepath] = useState<string | null>(null);
  const [blurAmount, setBlurAmount] = useState(4);
  const [primaryText, setPrimaryText] = useState("¡Bienvenido!");
  const [secondaryText, setSecondaryText] = useState("{username}");
  const [messageContent, setMessageContent] = useState("{user}");
  const [avatarX, setAvatarX] = useState(Math.round(CARD_W / 2));
  const [avatarY, setAvatarY] = useState(380);
  const [avatarSize, setAvatarSize] = useState(AVATAR_SIZE_MIN);
  const [textX, setTextX] = useState(Math.round(CARD_W / 2));
  const [textY, setTextY] = useState(560);
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT);
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [uploading, setUploading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [previewScale, setPreviewScale] = useState(1);
  const [designTab, setDesignTab] = useState<DesignTab>("fondo");
  const previewFrameRef = useRef<HTMLDivElement>(null);

  const isSubmitting = feedback.kind === "loading";

  const previewBg = bgFilepath || backgroundUrl || DEFAULT_BG;
  const previewPrimary = useMemo(
    () => previewReplace(primaryText || "¡Bienvenido!"),
    [primaryText],
  );
  const previewSecondary = useMemo(
    () => previewReplace(secondaryText || "{username}"),
    [secondaryText],
  );
  const secondaryFontSize = Math.max(12, Math.round(fontSize * 0.55));

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
  }, [loadingSettings]);

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
    setBackgroundUrl(settings.backgroundUrl || DEFAULT_BG);
    setBgFilepath(settings.bgFilepath);
    setBlurAmount(settings.blurAmount);
    setPrimaryText(settings.primaryText);
    setSecondaryText(settings.secondaryText);
    setMessageContent(settings.messageContent);
    setAvatarX(settings.avatarX);
    setAvatarY(settings.avatarY);
    setAvatarSize(settings.avatarSize ?? AVATAR_SIZE_MIN);
    setTextX(settings.textX);
    setTextY(settings.textY);
    setFontSize(settings.fontSize ?? FONT_SIZE_DEFAULT);
    setTextColor(settings.textColor || "#FFFFFF");
  }

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;

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
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 5 * 1024 * 1024,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    disabled: isSubmitting || uploading,
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!guildId || !channelId) {
      setFeedback({
        kind: "error",
        message: "Selecciona un canal de bienvenida.",
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
        primaryText,
        secondaryText,
        messageContent,
        avatarX,
        avatarY,
        avatarSize,
        textX,
        textY,
        fontSize,
        textColor,
      });
      setFeedback({
        kind: "ok",
        message: isEnabled
          ? "Tarjeta de bienvenida guardada y activa."
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Módulo de bienvenidas</CardTitle>
          <CardDescription>
            Genera una tarjeta PNG automática cuando alguien entra al servidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "flex flex-col gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-center sm:justify-between",
              isEnabled ? "border-primary/30 bg-primary/5" : "bg-muted/30",
            )}
          >
            <div className="space-y-1">
              <p className="font-display text-lg font-semibold">
                {isEnabled ? "Módulo habilitado" : "Módulo deshabilitado"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isEnabled
                  ? "Se enviará la tarjeta al canal elegido en cada nuevo miembro."
                  : "La configuración se guarda, pero no se envía nada todavía."}
              </p>
              {assets && (
                <p className="text-xs text-muted-foreground">
                  Servidor: {assets.guildName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="welcome-enabled" className="text-sm font-medium">
                {isEnabled ? "ON" : "OFF"}
              </Label>
              <Switch
                id="welcome-enabled"
                checked={isEnabled}
                disabled={isSubmitting}
                onCheckedChange={setIsEnabled}
                className="h-8 w-14 [&>span]:size-7 [&>span]:data-[state=checked]:translate-x-6"
              />
            </div>
          </div>
          {assetsError && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              {assetsError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: canal + diseño por pestañas */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Canal destino</CardTitle>
              <CardDescription>
                El bot publicará la tarjeta aquí.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="welcome-channel">Canal</Label>
                {assets && assets.channels.length > 0 ? (
                  <Select
                    value={channelId || undefined}
                    disabled={isSubmitting}
                    onValueChange={setChannelId}
                  >
                    <SelectTrigger id="welcome-channel">
                      <SelectValue placeholder="Selecciona un canal…" />
                    </SelectTrigger>
                    <SelectContent>
                      {assets.channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay canales disponibles.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Diseño de la tarjeta</CardTitle>
              <CardDescription>
                Fondo, avatar y texto sobre un lienzo 1920×1080.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs>
                <TabsList className="grid h-auto w-full grid-cols-3">
                  <TabsTrigger
                    active={designTab === "fondo"}
                    onClick={() => setDesignTab("fondo")}
                  >
                    Fondo
                  </TabsTrigger>
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

                {designTab === "fondo" && (
                  <TabsContent className="space-y-5">
                    <div className="space-y-2">
                      <Label>Fondo (arrastrar y soltar)</Label>
                      <div
                        {...getRootProps()}
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
                          isDragActive
                            ? "border-primary bg-primary/10"
                            : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40",
                          (uploading || isSubmitting) &&
                            "pointer-events-none opacity-60",
                        )}
                      >
                        <input {...getInputProps()} />
                        {uploading ? (
                          <Loader2 className="size-8 animate-spin text-primary" />
                        ) : (
                          <Upload
                            className="size-8 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                        <p className="text-sm font-medium">
                          {isDragActive
                            ? "Suelta la imagen aquí…"
                            : "Arrastra una imagen o haz clic para seleccionar"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG o WEBP · máx. 5MB
                        </p>
                        {bgFilepath && (
                          <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-primary">
                            <ImagePlus className="size-3.5" aria-hidden />
                            {bgFilepath}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Galería rápida (opcional)</Label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {GALLERY.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => {
                              setBackgroundUrl(item.url);
                              setBgFilepath(null);
                            }}
                            className={cn(
                              "overflow-hidden rounded-md border text-left transition-all",
                              !bgFilepath && backgroundUrl === item.url
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-border hover:border-primary/40",
                            )}
                          >
                            <img
                              src={item.url}
                              alt={item.label}
                              className="aspect-video w-full object-cover"
                            />
                            <span className="block px-2 py-1 text-[11px] text-muted-foreground">
                              {item.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <AxisSlider
                      id="blurAmount"
                      label="Desenfoque"
                      value={blurAmount}
                      min={0}
                      max={10}
                      disabled={isSubmitting}
                      onChange={setBlurAmount}
                    />
                  </TabsContent>
                )}

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
                  </TabsContent>
                )}

                {designTab === "texto" && (
                  <TabsContent className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="primaryText">Texto principal</Label>
                      <Input
                        id="primaryText"
                        value={primaryText}
                        maxLength={80}
                        disabled={isSubmitting}
                        onChange={(event) => setPrimaryText(event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondaryText">Texto secundario</Label>
                      <Input
                        id="secondaryText"
                        value={secondaryText}
                        maxLength={100}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          setSecondaryText(event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="messageContent">
                        Mensaje Discord (opcional)
                      </Label>
                      <Textarea
                        id="messageContent"
                        value={messageContent}
                        maxLength={500}
                        disabled={isSubmitting}
                        placeholder="{user} llegó al servidor. Ahora somos {membercount}."
                        rows={3}
                        className="resize-y"
                        onChange={(event) =>
                          setMessageContent(event.target.value)
                        }
                      />
                    </div>

                    <AxisSlider
                      id="textX"
                      label="Texto X"
                      value={textX}
                      max={CARD_W}
                      disabled={isSubmitting}
                      onChange={setTextX}
                    />
                    <AxisSlider
                      id="textY"
                      label="Texto Y"
                      value={textY}
                      max={CARD_H}
                      disabled={isSubmitting}
                      onChange={setTextY}
                    />
                    <AxisSlider
                      id="fontSize"
                      label="Tamaño de letra"
                      value={fontSize}
                      min={FONT_SIZE_MIN}
                      max={FONT_SIZE_MAX}
                      disabled={isSubmitting}
                      onChange={setFontSize}
                    />

                    <div className="space-y-2">
                      <Label htmlFor="textColor">Color del texto</Label>
                      <div className="flex gap-2">
                        <Input
                          id="textColor"
                          value={textColor}
                          disabled={isSubmitting}
                          onChange={(event) => setTextColor(event.target.value)}
                          placeholder="#FFFFFF"
                        />
                        <input
                          type="color"
                          aria-label="Selector de color del texto"
                          className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                          value={
                            /^#[0-9a-fA-F]{6}$/.test(textColor)
                              ? textColor
                              : "#FFFFFF"
                          }
                          disabled={isSubmitting}
                          onChange={(event) => setTextColor(event.target.value)}
                        />
                      </div>
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              disabled={isSubmitting || !channelId || uploading}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Guardar tarjeta de bienvenida
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

        {/* Columna derecha sticky: preview + variables */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Vista previa</CardTitle>
              <CardDescription>
                Lienzo 1920×1080 · Inter · sin wrap (igual que Discord).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5 pt-0">
              <div
                ref={previewFrameRef}
                className="relative w-full overflow-hidden rounded-md border border-border bg-stone-950 p-0"
                style={{ height: CARD_H * previewScale }}
              >
                <div
                  className="relative origin-top-left overflow-hidden"
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    transform: `scale(${previewScale})`,
                    backgroundImage: `url(${previewBg})`,
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
                    className="absolute overflow-hidden rounded-full border-8 border-white/90 bg-primary"
                    style={{
                      left: avatarX - avatarSize / 2,
                      top: avatarY - avatarSize / 2,
                      width: avatarSize,
                      height: avatarSize,
                    }}
                  >
                    <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary to-amber-700 text-5xl font-semibold text-white">
                      N
                    </div>
                  </div>

                  {/* Una sola línea: fillText no hace wrap */}
                  <div
                    className="absolute overflow-visible whitespace-nowrap"
                    style={{
                      left: textX,
                      top: textY,
                      color: textColor,
                    }}
                  >
                    <p
                      className="m-0 font-bold leading-none"
                      style={{
                        fontFamily: CARD_FONT,
                        fontSize,
                      }}
                    >
                      {previewPrimary}
                    </p>
                    <p
                      className="m-0 leading-none opacity-90"
                      style={{
                        fontFamily: CARD_FONT,
                        fontSize: secondaryFontSize,
                        marginTop: 16,
                      }}
                    >
                      {previewSecondary}
                    </p>
                  </div>
                </div>
              </div>
              {messageContent.trim() && (
                <p className="text-sm text-muted-foreground">
                  Mensaje:{" "}
                  <span className="text-foreground">
                    {previewReplace(messageContent)}
                  </span>
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Si el texto se corta al borde, baja el tamaño o mueve Texto X a
                la izquierda: la PNG de Discord se comporta igual.
              </p>
            </CardContent>
          </Card>

          <VariableListBase items={WELCOME_VARIABLES} />
        </div>
      </div>
    </form>
  );
}
