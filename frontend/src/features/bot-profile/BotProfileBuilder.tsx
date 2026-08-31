import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import type { BotGuildProfileResponse } from "@adobos/shared";
import {
  fetchBotGuildProfile,
  saveBotGuildProfile,
} from "@/lib/api";
import { resolvePublicAssetUrl } from "@/lib/api/client";
import {
  HybridImageInput,
  type HybridImageValue,
} from "@/components/shared/HybridImageInput";
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
import { useEntitlements } from "@/features/entitlements/useEntitlements";
import { BotProfilePreview } from "./BotProfilePreview";

type Feedback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function resolvePreviewSrc(value: HybridImageValue): string | null {
  if (value instanceof File) return null;
  if (typeof value === "string" && value.trim()) {
    return resolvePublicAssetUrl(value.trim());
  }
  return null;
}

export function BotProfileBuilder() {
  const { can, loading: entitlementsLoading } = useEntitlements();
  const brandingUnlocked = can("branding");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [profile, setProfile] = useState<BotGuildProfileResponse | null>(null);

  const [nickname, setNickname] = useState("");
  const [avatarValue, setAvatarValue] = useState<HybridImageValue>(null);
  const [objectPreview, setObjectPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      setFeedback({ kind: "idle" });
      try {
        const data = await fetchBotGuildProfile();
        if (cancelled) return;
        setProfile(data);
        setNickname(data.nickname);
        setAvatarValue(data.serverAvatarURL);
      } catch (error: unknown) {
        if (cancelled) return;
        setFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo cargar el perfil del servidor",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!(avatarValue instanceof File)) {
      setObjectPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarValue);
    setObjectPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarValue]);

  const isSubmitting = feedback.kind === "loading";

  const previewAvatar = useMemo(() => {
    if (objectPreview) return objectPreview;
    const fromHybrid = resolvePreviewSrc(avatarValue);
    if (fromHybrid) return fromHybrid;
    return profile?.globalAvatarURL ?? "/favicon.svg";
  }, [avatarValue, objectPreview, profile?.globalAvatarURL]);

  const usingGlobalAvatar = useMemo(() => {
    if (avatarValue instanceof File) return false;
    if (typeof avatarValue === "string" && avatarValue.trim()) return false;
    return true;
  }, [avatarValue]);

  const previewDisplayName = nickname.trim() || profile?.username || "Bot";

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!brandingUnlocked) return;
    setFeedback({ kind: "loading" });
    try {
      const trimmedNick = nickname.trim();
      const payload: Parameters<typeof saveBotGuildProfile>[0] = {
        nickname: trimmedNick,
        clearNickname: trimmedNick.length === 0,
      };

      if (avatarValue instanceof File) {
        payload.serverAvatarFile = avatarValue;
      } else if (
        avatarValue === null ||
        (typeof avatarValue === "string" && !avatarValue.trim())
      ) {
        if (profile?.hasServerAvatar) payload.clearServerAvatar = true;
      } else if (typeof avatarValue === "string") {
        const nextUrl = avatarValue.trim();
        if (nextUrl !== (profile?.serverAvatarURL ?? "")) {
          payload.serverAvatarUrl = nextUrl;
        }
      }

      const result = await saveBotGuildProfile(payload);

      setProfile(result.profile);
      setNickname(result.profile.nickname);
      setAvatarValue(result.profile.serverAvatarURL);
      setFeedback({
        kind: "ok",
        message:
          result.message || "Perfil del bot actualizado para este servidor",
      });
    } catch (error: unknown) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error al guardar el perfil del servidor",
      });
    }
  }

  function resetNickname(): void {
    setNickname("");
  }

  function clearServerAvatar(): void {
    setAvatarValue(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando perfil del bot en el servidor…
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Perfil de Miembro en este Servidor</CardTitle>
              <CardDescription>
                Solo apodo y avatar locales. La identidad global del bot no se
                modifica desde aquí (multi-servidor / SaaS).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!brandingUnlocked && !entitlementsLoading ? (
                <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                  El branding por servidor (apodo y avatar) forma parte del plan
                  Pro.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="bot-guild-nickname">Apodo en el Servidor</Label>
                <Input
                  id="bot-guild-nickname"
                  value={nickname}
                  maxLength={32}
                  disabled={isSubmitting || !brandingUnlocked}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder={profile?.username ?? "Apodo visible en el servidor"}
                />
                <p className="text-xs text-muted-foreground">
                  Así aparece el bot en la lista de miembros. Vacío = username
                  global.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || !nickname}
                  onClick={resetNickname}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restablecer apodo
                </Button>
              </div>

              <div className="space-y-3 border-t border-border/70 pt-6">
                <HybridImageInput
                  id="bot-guild-avatar"
                  label="Avatar del Servidor"
                  value={avatarValue}
                  onChange={setAvatarValue}
                  disabled={isSubmitting || !brandingUnlocked}
                  uploadImmediately
                  placeholder="https://… o sube una imagen"
                  maxSizeMb={8}
                />
                <p className="text-xs text-muted-foreground">
                  Avatar exclusivo de este servidor. Si lo eliminas, se usa el
                  avatar global por defecto.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || usingGlobalAvatar}
                  onClick={clearServerAvatar}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Eliminar avatar del servidor
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting || !profile || !brandingUnlocked}>
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
            displayName={previewDisplayName}
            username={profile?.username ?? ""}
            tag={profile?.tag}
            avatarUrl={previewAvatar}
            usingGlobalAvatar={usingGlobalAvatar}
            guildName={profile?.guildName}
          />
        </div>
      </div>
    </form>
  );
}
