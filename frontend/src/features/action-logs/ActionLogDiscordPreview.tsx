import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Placeholder tipográfico para variables de plantilla en la preview. */
function Tpl({ children }: { children: string }) {
  return (
    <span className="rounded bg-[#3c3f45]/80 px-0.5 font-mono text-[10px] text-[#f0b232]">
      {`{${children}}`}
    </span>
  );
}

export interface ActionLogDiscordPreviewProps {
  /** Nombre visible del webhook (`${apodo|username} Audit`). */
  webhookDisplayName?: string;
  /** Avatar del bot en el servidor o global. */
  webhookAvatarUrl?: string | null;
}

/**
 * Showcase técnico del webhook de Action Logs.
 * Author = ejecutor + ID · Footer = afectado + avatar.
 */
export function ActionLogDiscordPreview({
  webhookDisplayName = "Adobos Audit",
  webhookAvatarUrl = null,
}: ActionLogDiscordPreviewProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 pb-2 pt-4">
        <CardTitle className="text-sm">Ejemplo de registro en Discord</CardTitle>
        <CardDescription className="text-xs">
          Estilo técnico del webhook (plantilla de ejemplo).
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <div className="overflow-hidden rounded-md bg-[#313338] p-2.5 text-[11px] leading-snug text-[#dbdee1] shadow-inner">
          <div className="flex gap-2">
            {webhookAvatarUrl ? (
              <img
                src={webhookAvatarUrl}
                alt=""
                className="mt-0.5 size-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="mt-0.5 size-8 shrink-0 rounded-full bg-gradient-to-br from-primary to-fuchsia-700"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold text-white">
                  {webhookDisplayName}
                </span>
                <span className="rounded bg-[#5865f2] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                  App
                </span>
                <span className="text-[10px] text-[#949ba4]">Hoy a las 12:00</span>
              </div>

              <div
                className="mt-1.5 overflow-hidden rounded bg-[#2b2d31]"
                style={{ borderLeft: "4px solid #ED4245" }}
              >
                <div className="space-y-2 px-2.5 py-2">
                  {/* Author: ejecutor + ID */}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div
                      className="size-4 shrink-0 rounded-full bg-[#4e5058]"
                      aria-hidden
                      title="Avatar del ejecutor"
                    />
                    <span className="truncate text-[11px] font-semibold text-white">
                      <Tpl>usuario_ejecutor</Tpl>
                      <span className="font-normal text-[#b5bac1]">
                        {" "}
                        (ID: <Tpl>id_ejecutor</Tpl>)
                      </span>
                    </span>
                  </div>

                  <p className="text-[12px] text-[#dbdee1]">
                    <strong className="font-semibold text-white">Acción:</strong>{" "}
                    Mensaje Eliminado
                  </p>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-[#b5bac1]">
                        Canal
                      </p>
                      <p className="truncate text-[11px] text-[#00a8fc]">
                        <Tpl>canal_afectado</Tpl>
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-[#b5bac1]">
                        Afectado
                      </p>
                      <p className="truncate text-[11px] text-[#00a8fc]">
                        <Tpl>usuario_afectado</Tpl>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-[#b5bac1]">
                      Contenido original
                    </p>
                    <div className="border-l-2 border-[#4e5058] pl-2 font-mono text-[10px] text-[#dbdee1]">
                      <Tpl>contenido_del_mensaje_eliminado</Tpl>
                    </div>
                  </div>

                  {/* Footer: avatar afectado + ID */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <div
                      className="size-3.5 shrink-0 rounded-full bg-[#5865f2]/80"
                      aria-hidden
                      title="Avatar del afectado"
                    />
                    <p className="font-mono text-[9px] text-[#949ba4]">
                      Afectado ID: <Tpl>id_afectado</Tpl>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
