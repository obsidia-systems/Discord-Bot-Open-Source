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
          <CardTitle className="text-base">Exclusions</CardTitle>
          <CardDescription>
            Immune roles and channels where Auto-Mod doesn't act. Ignored
            roles/channels are also sent to native AutoMod (Discord cap: 20
            roles, 50 channels).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterToggle
            id="skipStaff"
            label="Ignore staff"
            description="Applies to the bot (Administrator / Manage Messages). In native, add those roles to Immune roles."
            checked={config.skipStaff}
            onCheckedChange={(skipStaff) => onPatch({ skipStaff })}
          />
          <RoleMultiSelect
            label="Immune roles"
            roles={assignableRoles}
            value={config.ignoredRoles}
            onChange={(ignoredRoles) => onPatch({ ignoredRoles })}
          />
          <ChannelMultiSelect
            label="Ignored channels / categories"
            channels={ignoreChannels}
            value={config.ignoredChannels}
            onChange={(ignoredChannels) => onPatch({ ignoredChannels })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Security alert channel
          </CardTitle>
          <CardDescription>
            If empty, the global Action Logs channel is used.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="logChannel">Alert channel</Label>
            <Select
              value={config.logChannelId ?? "__none__"}
              onValueChange={(value) =>
                onPatch({
                  logChannelId: value === "__none__" ? null : value,
                })
              }
            >
              <SelectTrigger id="logChannel">
                <SelectValue placeholder="Use Action Logs fallback" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  Use Action Logs fallback
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
