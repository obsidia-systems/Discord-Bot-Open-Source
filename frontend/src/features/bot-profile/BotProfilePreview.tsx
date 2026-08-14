import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface BotProfilePreviewProps {
  displayName: string;
  username: string;
  tag?: string;
  avatarUrl: string;
  usingGlobalAvatar: boolean;
  guildName?: string;
}

/** Simulación del popout de miembro de Discord (perfil en este servidor). */
export function BotProfilePreview({
  displayName,
  username,
  tag,
  avatarUrl,
  usingGlobalAvatar,
  guildName,
}: BotProfilePreviewProps) {
  const name = displayName.trim() || username.trim() || "Bot";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista previa</CardTitle>
        <CardDescription>
          Perfil del bot como miembro
          {guildName ? ` en #${guildName}` : " en este servidor"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border/80 bg-[#111214] shadow-lg">
          <div
            className="h-16 w-full bg-gradient-to-r from-[#5865f2]/80 to-[#eb459e]/60 sm:h-20"
            aria-hidden
          />

          <div className="relative px-4 pb-4 pt-0">
            <div className="-mt-10 inline-block">
              <div className="relative">
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-[80px] rounded-full border-[6px] border-[#111214] bg-muted object-cover"
                />
                <span
                  className="absolute bottom-1 right-1 size-4 rounded-full border-[3px] border-[#111214] bg-[#23a55a]"
                  title="online"
                  aria-label="Estado: online"
                />
              </div>
            </div>

            <div className="mt-3 space-y-3 rounded-lg bg-[#232428] px-3 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-semibold leading-none text-white">
                    {name}
                  </p>
                  <Badge className="border-transparent bg-[#5865f2] px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-white">
                    Bot
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-[#b5bac1]">
                  {tag || `@${username}`}
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                {usingGlobalAvatar ? (
                  <Badge className="border-white/10 bg-white/5 text-[10px] font-medium normal-case tracking-normal text-[#b5bac1]">
                    Avatar Global por Defecto
                  </Badge>
                ) : (
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] font-medium normal-case tracking-normal text-emerald-300">
                    Avatar de este servidor
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
