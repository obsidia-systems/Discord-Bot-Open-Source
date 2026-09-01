import type { AutoModFilters } from "@adobos/shared";
import {
  AUTO_MOD_MAX_ALLOWED_LINKS,
  AUTO_MOD_MAX_BANNED_WORDS,
} from "@adobos/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FilterToggle, TagListInput } from "./AutoModUi";

export function AutoModFiltersTab({
  filters,
  onChange,
}: {
  filters: AutoModFilters;
  onChange: (partial: Partial<AutoModFilters>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Palabras, invitaciones y menciones se sincronizan con AutoMod nativo de
        Discord al guardar: el mensaje no llega al canal. Zalgo, mayúsculas,
        flood y ráfagas las cubre el bot. Hace falta el permiso Administrar
        servidor.
      </p>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros de texto</CardTitle>
          <CardDescription>
            Detección heurística sobre el contenido del mensaje.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterToggle
            id="zalgo"
            label="Zalgo"
            description="Bloquea texto con demasiados combining marks."
            checked={filters.zalgo}
            onCheckedChange={(zalgo) => onChange({ zalgo })}
          />
          <FilterToggle
            id="excessCaps"
            label="Exceso de mayúsculas"
            description="Umbral configurable de mayúsculas en el mensaje."
            checked={filters.excessCaps}
            onCheckedChange={(excessCaps) => onChange({ excessCaps })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="capsPercentage">Porcentaje máximo (%)</Label>
                <Input
                  id="capsPercentage"
                  type="number"
                  min={1}
                  max={100}
                  value={filters.capsPercentage}
                  onChange={(e) =>
                    onChange({
                      capsPercentage: Number(e.target.value) || 70,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capsMinLength">
                  Longitud mínima (caracteres)
                </Label>
                <Input
                  id="capsMinLength"
                  type="number"
                  min={1}
                  max={500}
                  value={filters.capsMinLength}
                  onChange={(e) =>
                    onChange({
                      capsMinLength: Number(e.target.value) || 8,
                    })
                  }
                />
              </div>
            </div>
          </FilterToggle>
          <FilterToggle
            id="bannedWords"
            label="Palabras prohibidas"
            description="Bloquea en Discord (nativo) y en el bot. Palabra entera."
            checked={filters.bannedWordsEnabled}
            onCheckedChange={(bannedWordsEnabled) =>
              onChange({ bannedWordsEnabled })
            }
          >
            <TagListInput
              id="bannedWordsInput"
              label="Lista"
              values={filters.bannedWords}
              onChange={(bannedWords) => onChange({ bannedWords })}
              placeholder="Escribe una palabra y presiona Enter..."
              emptyHint="Añade palabras con Enter. Se guardan como etiquetas."
              maxItems={AUTO_MOD_MAX_BANNED_WORDS}
            />
          </FilterToggle>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros de enlaces</CardTitle>
          <CardDescription>
            Invitaciones de Discord y URLs fuera de lista blanca.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterToggle
            id="antiInvites"
            label="Anti-Invitaciones de Discord"
            description="Nativo + bot. Cubre gg, discord.com/invite, ptb/canary, discord.new, spoilers y leet."
            checked={filters.antiInvites}
            onCheckedChange={(antiInvites) => onChange({ antiInvites })}
          />
          <FilterToggle
            id="antiLinks"
            label="Anti-Links (lista blanca)"
            description="Solo el bot (Discord no tiene allowlist de hosts genéricos)."
            checked={filters.antiLinks}
            onCheckedChange={(antiLinks) => onChange({ antiLinks })}
          >
            <TagListInput
              id="allowedLinksInput"
              label="Enlaces permitidos"
              values={filters.allowedLinks}
              onChange={(allowedLinks) => onChange({ allowedLinks })}
              placeholder="dominio.com y Enter..."
              emptyHint="Añade dominios con Enter (ej. youtube.com)."
              maxItems={AUTO_MOD_MAX_ALLOWED_LINKS}
            />
          </FilterToggle>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros de spam</CardTitle>
          <CardDescription>
            Ráfagas, repetición, menciones y muros de texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterToggle
            id="messageSpam"
            label="Spam de mensajes"
            description="≥5 mensajes del mismo usuario en 4 segundos."
            checked={filters.messageSpam}
            onCheckedChange={(messageSpam) => onChange({ messageSpam })}
          />
          <FilterToggle
            id="repeatedText"
            label="Texto repetido"
            description="Mismo contenido ≥3 veces en 12 segundos."
            checked={filters.repeatedText}
            onCheckedChange={(repeatedText) => onChange({ repeatedText })}
          />
          <FilterToggle
            id="mentionSpam"
            label="Spam de menciones"
            description="Regla nativa de Discord (incluye protección ante raid de menciones)."
            checked={filters.mentionSpam}
            onCheckedChange={(mentionSpam) => onChange({ mentionSpam })}
            headerExtra={
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1">
                <Label
                  htmlFor="mentionLimit"
                  className="whitespace-nowrap text-[11px] font-normal text-muted-foreground"
                >
                  Máx.
                </Label>
                <Input
                  id="mentionLimit"
                  type="number"
                  min={1}
                  max={50}
                  value={filters.mentionSpamLimit}
                  onChange={(e) =>
                    onChange({
                      mentionSpamLimit: Number(e.target.value) || 5,
                    })
                  }
                  className="h-7 w-14 border-0 bg-transparent px-1 text-center shadow-none focus-visible:ring-0"
                />
              </div>
            }
          />
          <FilterToggle
            id="textFlood"
            label="Muros de texto (Text Flood)"
            description="Mensajes demasiado largos o con demasiados saltos de línea."
            checked={filters.textFlood}
            onCheckedChange={(textFlood) => onChange({ textFlood })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="floodMaxChars">Límite de caracteres</Label>
                <Input
                  id="floodMaxChars"
                  type="number"
                  min={50}
                  max={4000}
                  value={filters.floodMaxChars}
                  onChange={(e) =>
                    onChange({
                      floodMaxChars: Number(e.target.value) || 800,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="floodMaxLines">Límite de saltos de línea</Label>
                <Input
                  id="floodMaxLines"
                  type="number"
                  min={1}
                  max={100}
                  value={filters.floodMaxLines}
                  onChange={(e) =>
                    onChange({
                      floodMaxLines: Number(e.target.value) || 6,
                    })
                  }
                />
              </div>
            </div>
          </FilterToggle>
        </CardContent>
      </Card>
    </div>
  );
}
