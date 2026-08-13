import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Save,
  XCircle,
} from "lucide-react";
import type {
  BotActivityTypeName,
  BotPresenceStatus,
  BotProfileResponse,
} from "@adobos/shared";
import { fetchBotProfile, saveBotProfile } from "@/lib/api";
import { AvatarCircleUpload } from "@/components/shared/AvatarCircleUpload";
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
import { BotProfilePreview } from "./BotProfilePreview";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const STATUS_OPTIONS: { value: BotPresenceStatus; label: string }[] = [
  { value: "online", label: "En línea" },
  { value: "idle", label: "Ausente" },
  { value: "dnd", label: "No molestar" },
  { value: "invisible", label: "Invisible" },
];

const ACTIVITY_OPTIONS: { value: BotActivityTypeName; label: string }[] = [
  { value: "Playing", label: "Jugando a" },
  { value: "Watching", label: "Viendo" },
  { value: "Listening", label: "Escuchando" },
  { value: "Competing", label: "Compitiendo en" },
  { value: "Streaming", label: "Transmitiendo" },
  { value: "Custom", label: "Personalizado" },
];

function accentToCss(accentColor: number | null): string {
  if (accentColor == null || accentColor < 0) {
    return "linear-gradient(135deg, hsl(320 90% 45%), hsl(265 80% 40%))";
  }
  return `#${accentColor.toString(16).padStart(6, "0")}`;
}

function applyProfileToForm(
  data: BotProfileResponse,
  setters: {
    setUsername: (v: string) => void;
    setStatus: (v: BotPresenceStatus) => void;
    setActivityType: (v: BotActivityTypeName) => void;
    setActivityName: (v: string) => void;
    setStreamUrl: (v: string) => void;
    setState: (v: string) => void;
    setAvatarPreview: (v: string | null) => void;
    setAvatarFile: (v: File | null) => void;
  },
): void {
  setters.setUsername(data.username);
  setters.setStatus(data.status);
  setters.setActivityType(data.activity?.type ?? "Playing");
  setters.setActivityName(data.activity?.name ?? "");
  setters.setStreamUrl(data.activity?.url ?? "");
  setters.setState(data.activity?.state ?? "");
  setters.setAvatarPreview(data.avatarUrl);
  setters.setAvatarFile(null);
}

export function BotProfileBuilder() {
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [profile, setProfile] = useState<BotProfileResponse | null>(null);

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<BotPresenceStatus>("online");
  const [activityType, setActivityType] =
    useState<BotActivityTypeName>("Playing");
  const [activityName, setActivityName] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [state, setState] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const formSetters = useMemo(
    () => ({
      setUsername,
      setStatus,
      setActivityType,
      setActivityName,
      setStreamUrl,
      setState,
      setAvatarPreview,
      setAvatarFile,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      setFeedback({ kind: "idle" });
      try {
        const data = await fetchBotProfile();
        if (cancelled) return;
        setProfile(data);
        applyProfileToForm(data, formSetters);
      } catch (error: unknown) {
        if (cancelled) return;
        setFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo cargar el perfil",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [formSetters]);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const bannerColor = useMemo(
    () => accentToCss(profile?.accentColor ?? null),
    [profile?.accentColor],
  );

  const portalUrl = profile?.applicationId
    ? `https://discord.com/developers/applications/${profile.applicationId}/information`
    : "https://discord.com/developers/applications";

  const isSubmitting = feedback.kind === "loading";
  const previewAvatar = avatarPreview ?? profile?.avatarUrl ?? "/favicon.svg";

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFeedback({ kind: "loading" });
    try {
      const clearActivity = activityName.trim().length === 0;
      const result = await saveBotProfile({
        username: username.trim(),
        status,
        activityType,
        activityName: activityName.trim(),
        streamUrl: streamUrl.trim(),
        state: state.trim(),
        clearActivity,
        avatarFile,
      });
      setProfile(result.profile);
      applyProfileToForm(result.profile, formSetters);

      const parts: string[] = [];
      if (result.changed.avatar) parts.push("avatar");
      if (result.changed.username) parts.push("nombre");
      if (result.changed.presence) parts.push("presencia");
      setFeedback({
        kind: "ok",
        message:
          parts.length > 0
            ? `Cambios aplicados: ${parts.join(", ")}.`
            : "Perfil sincronizado.",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Error al guardar el perfil",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando perfil del bot…
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Configuración del perfil</CardTitle>
              <CardDescription>
                Identidad y presencia persistente (SQLite). Bio/banner solo en el
                Developer Portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Identidad
                </h3>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <AvatarCircleUpload
                    src={previewAvatar}
                    disabled={isSubmitting}
                    onFile={(file) => {
                      if (!file) {
                        setAvatarFile(null);
                        setAvatarPreview(profile?.avatarUrl ?? null);
                        return;
                      }
                      setAvatarFile(file);
                    }}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor="bot-username">Nombre de usuario</Label>
                      <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mr-1 size-3" aria-hidden />
                        Cuidado
                      </Badge>
                    </div>
                    <Input
                      id="bot-username"
                      value={username}
                      maxLength={32}
                      disabled={isSubmitting}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="AdobosBot"
                    />
                    <p className="text-xs text-muted-foreground">
                      Máx. 32 caracteres. Discord limita cambios de nombre
                      (~2/hora).
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t border-border/70 pt-6">
                <h3 className="text-sm font-semibold text-foreground">
                  Presencia
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select
                      value={status}
                      disabled={isSubmitting}
                      onValueChange={(value) =>
                        setStatus(value as BotPresenceStatus)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Estado…" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de actividad</Label>
                    <Select
                      value={activityType}
                      disabled={isSubmitting}
                      onValueChange={(value) =>
                        setActivityType(value as BotActivityTypeName)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="activity-name">Nombre de actividad</Label>
                  <Input
                    id="activity-name"
                    value={activityName}
                    maxLength={128}
                    disabled={isSubmitting}
                    onChange={(event) => setActivityName(event.target.value)}
                    placeholder="Adobos Bot · /ayuda"
                  />
                  <p className="text-xs text-muted-foreground">
                    Vacío al guardar = quitar actividad. Se restaura al reiniciar
                    el bot.
                  </p>
                </div>

                {activityType === "Streaming" ? (
                  <div className="space-y-2">
                    <Label htmlFor="stream-url">URL de transmisión</Label>
                    <Input
                      id="stream-url"
                      value={streamUrl}
                      disabled={isSubmitting}
                      onChange={(event) => setStreamUrl(event.target.value)}
                      placeholder="https://twitch.tv/… o https://youtube.com/…"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="rp-state">State</Label>
                  <Input
                    id="rp-state"
                    value={state}
                    maxLength={128}
                    disabled={isSubmitting || activityType === "Custom"}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="Línea extra bajo la actividad (opcional)"
                  />
                </div>
              </section>
            </CardContent>
          </Card>

          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bio y banner</CardTitle>
              <CardDescription>
                About Me y banner solo se editan en el Developer Portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="size-4" aria-hidden />
                Abrir Portal de Devs
              </a>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting || !profile}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Aplicando…
                </>
              ) : (
                <>
                  <Save className="mr-2 size-4" />
                  Guardar cambios
                </>
              )}
            </Button>

            {feedback.kind === "ok" ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                {feedback.message}
              </p>
            ) : null}
            {feedback.kind === "error" ? (
              <p className="flex items-center gap-1.5 text-sm text-red-700 dark:text-red-400">
                <XCircle className="size-4 shrink-0" />
                {feedback.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <BotProfilePreview
            username={username}
            tag={profile?.tag}
            avatarUrl={previewAvatar}
            bannerUrl={profile?.bannerUrl ?? null}
            status={status}
            activityType={activityType}
            activityName={activityName}
            state={state}
            bannerColor={bannerColor}
          />
        </div>
      </div>
    </form>
  );
}
