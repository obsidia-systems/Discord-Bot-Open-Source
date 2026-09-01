import type { AutoModConfig, GuildChannelAsset, GuildRoleAsset } from "@adobos/shared";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { RoleMultiSelect } from "@/components/shared/RoleMultiSelect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterToggle } from "./AutoModUi";

export function AutoModExclusionsTab({
  config,
  assignableRoles,
  ignoreChannels,
  textChannels,
  onPatch,
}: {
  config: AutoModConfig;
  assignableRoles: GuildRoleAsset[];
  ignoreChannels: GuildChannelAsset[];
  textChannels: GuildChannelAsset[];
  onPatch: (partial: Partial<AutoModConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exclusiones</CardTitle>
          <CardDescription>
            Roles inmunes y canales donde Auto-Mod no actúa. Los roles/canales
            ignorados también se envían a AutoMod nativo (tope Discord: 20
            roles, 50 canales).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterToggle
            id="skipStaff"
            label="Ignorar staff"
            description="Aplica al bot (Administrator / Manage Messages). En nativo, añade esos roles a Roles inmunes."
            checked={config.skipStaff}
            onCheckedChange={(skipStaff) => onPatch({ skipStaff })}
          />
          <RoleMultiSelect
            label="Roles inmunes"
            roles={assignableRoles}
            value={config.ignoredRoles}
            onChange={(ignoredRoles) => onPatch({ ignoredRoles })}
          />
          <ChannelMultiSelect
            label="Canales / categorías ignorados"
            channels={ignoreChannels}
            value={config.ignoredChannels}
            onChange={(ignoredChannels) => onPatch({ ignoredChannels })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Canal de alertas de seguridad
          </CardTitle>
          <CardDescription>
            Si está vacío, se usa el canal global de Action Logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="logChannel">Canal de alertas</Label>
            <Select
              value={config.logChannelId ?? "__none__"}
              onValueChange={(value) =>
                onPatch({
                  logChannelId: value === "__none__" ? null : value,
                })
              }
            >
              <SelectTrigger id="logChannel">
                <SelectValue placeholder="Usar fallback Action Logs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  Usar fallback Action Logs
                </SelectItem>
                {textChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
