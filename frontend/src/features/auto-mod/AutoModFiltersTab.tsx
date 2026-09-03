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
        Words, invites, and mentions sync with Discord's native AutoMod on
        save: the message never reaches the channel. Zalgo, caps, flood, and
        bursts are handled by the bot. The Manage Server permission is
        required.
      </p>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Text filters</CardTitle>
          <CardDescription>
            Heuristic detection over the message content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterToggle
            id="zalgo"
            label="Zalgo"
            description="Blocks text with too many combining marks."
            checked={filters.zalgo}
            onCheckedChange={(zalgo) => onChange({ zalgo })}
          />
          <FilterToggle
            id="excessCaps"
            label="Excess caps"
            description="Configurable caps threshold in the message."
            checked={filters.excessCaps}
            onCheckedChange={(excessCaps) => onChange({ excessCaps })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="capsPercentage">Maximum percentage (%)</Label>
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
                  Minimum length (characters)
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
            label="Banned words"
            description="Blocks in Discord (native) and in the bot. Whole word."
            checked={filters.bannedWordsEnabled}
            onCheckedChange={(bannedWordsEnabled) =>
              onChange({ bannedWordsEnabled })
            }
          >
            <TagListInput
              id="bannedWordsInput"
              label="List"
              values={filters.bannedWords}
              onChange={(bannedWords) => onChange({ bannedWords })}
              placeholder="Type a word and press Enter..."
              emptyHint="Add words with Enter. They are saved as tags."
              maxItems={AUTO_MOD_MAX_BANNED_WORDS}
            />
          </FilterToggle>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Link filters</CardTitle>
          <CardDescription>
            Discord invites and URLs outside the allowlist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterToggle
            id="antiInvites"
            label="Anti-Discord-invites"
            description="Nativo + bot. Cubre gg, discord.com/invite, ptb/canary, discord.new, spoilers y leet."
            checked={filters.antiInvites}
            onCheckedChange={(antiInvites) => onChange({ antiInvites })}
          />
          <FilterToggle
            id="antiLinks"
            label="Anti-Links (allowlist)"
            description="Bot only (Discord has no allowlist for generic hosts)."
            checked={filters.antiLinks}
            onCheckedChange={(antiLinks) => onChange({ antiLinks })}
          >
            <TagListInput
              id="allowedLinksInput"
              label="Allowed links"
              values={filters.allowedLinks}
              onChange={(allowedLinks) => onChange({ allowedLinks })}
              placeholder="domain.com and Enter..."
              emptyHint="Add domains with Enter (e.g. youtube.com)."
              maxItems={AUTO_MOD_MAX_ALLOWED_LINKS}
            />
          </FilterToggle>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Spam filters</CardTitle>
          <CardDescription>
            Bursts, repetition, mentions, and walls of text.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterToggle
            id="messageSpam"
            label="Message spam"
            description="≥5 messages from the same user in 4 seconds."
            checked={filters.messageSpam}
            onCheckedChange={(messageSpam) => onChange({ messageSpam })}
          />
          <FilterToggle
            id="repeatedText"
            label="Repeated text"
            description="Same content ≥3 times in 12 seconds."
            checked={filters.repeatedText}
            onCheckedChange={(repeatedText) => onChange({ repeatedText })}
          />
          <FilterToggle
            id="mentionSpam"
            label="Mention spam"
            description="Native Discord rule (includes mention-raid protection)."
            checked={filters.mentionSpam}
            onCheckedChange={(mentionSpam) => onChange({ mentionSpam })}
            headerExtra={
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1">
                <Label
                  htmlFor="mentionLimit"
                  className="whitespace-nowrap text-[11px] font-normal text-muted-foreground"
                >
                  Max.
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
            label="Walls of text (Text Flood)"
            description="Messages that are too long or have too many line breaks."
            checked={filters.textFlood}
            onCheckedChange={(textFlood) => onChange({ textFlood })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="floodMaxChars">Character limit</Label>
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
                <Label htmlFor="floodMaxLines">Line break limit</Label>
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
