import type {
  BotActivityTypeName,
  BotPresenceStatus,
} from "@adobos/shared";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<BotPresenceStatus, string> = {
  online: "bg-[#23a55a]",
  idle: "bg-[#f0b232]",
  dnd: "bg-[#f23f43]",
  invisible: "bg-[#80848e]",
};

const ACTIVITY_LABEL: Record<BotActivityTypeName, string> = {
  Playing: "Jugando a",
  Watching: "Viendo",
  Listening: "Escuchando",
  Competing: "Compitiendo en",
  Streaming: "Transmitiendo",
  Custom: "Estado personalizado",
};

export interface BotProfilePreviewProps {
  username: string;
  tag?: string;
  avatarUrl: string;
  bannerUrl: string | null;
  status: BotPresenceStatus;
  activityType: BotActivityTypeName;
  activityName: string;
  state: string;
  bannerColor: string;
}

export function BotProfilePreview({
  username,
  tag,
  avatarUrl,
  bannerUrl,
  status,
  activityType,
  activityName,
  state,
  bannerColor,
}: BotProfilePreviewProps) {
  const displayName = username.trim() || "Bot";
  const activityText = activityName.trim();
  const stateText = state.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista previa</CardTitle>
        <CardDescription>
          Simulación del perfil en Discord.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border/80 bg-[#111214] shadow-lg">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="h-20 w-full object-cover sm:h-24"
            />
          ) : (
            <div
              className="h-20 w-full sm:h-24"
              style={{ background: bannerColor }}
              aria-hidden
            />
          )}

          <div className="relative px-4 pb-4 pt-0">
            <div className="-mt-10 inline-block">
              <div className="relative">
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-[80px] rounded-full border-[6px] border-[#111214] bg-muted object-cover"
                />
                <span
                  className={cn(
                    "absolute bottom-1 right-1 size-4 rounded-full border-[3px] border-[#111214]",
                    STATUS_DOT[status],
                  )}
                  title={status}
                  aria-label={`Estado: ${status}`}
                />
              </div>
            </div>

            <div className="mt-3 space-y-3 rounded-lg bg-[#232428] px-3 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-semibold leading-none text-white">
                    {displayName}
                  </p>
                  <Badge className="border-transparent bg-[#5865f2] px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-white">
                    App
                  </Badge>
                </div>
                {tag ? (
                  <p className="mt-1.5 text-xs text-[#b5bac1]">{tag}</p>
                ) : null}
              </div>

              {activityText ? (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                    {ACTIVITY_LABEL[activityType]}
                  </p>
                  <div className="mt-2 rounded-md bg-[#1e1f22] px-2.5 py-2">
                    <p className="truncate text-sm font-semibold text-[#f2f3f5]">
                      {activityText}
                    </p>
                    {stateText ? (
                      <p className="mt-0.5 truncate text-xs text-[#b5bac1]">
                        {stateText}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="border-t border-white/10 pt-3 text-xs text-[#949ba4]">
                  Sin actividad configurada
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
