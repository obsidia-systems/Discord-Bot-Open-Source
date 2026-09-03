import type { GuildChannelAsset, GuildEmojiAsset } from "@adobos/shared";
import {
  STARBOARD_EMOJIS_MAX,
  STARBOARD_THRESHOLD_MAX,
  STARBOARD_THRESHOLD_MIN,
  clampStarboardThreshold,
  isStarboardDestinationChannelType,
} from "@adobos/shared";
import {
  fetchGuildAssets,
  fetchStarboard,
  saveStarboardSettings,
} from "@/lib/api";
import { ChannelMultiSelect } from "@/components/shared/ChannelMultiSelect";
import { DiscordEmojiPicker } from "@/components/shared/DiscordEmojiPicker";
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
import { Switch } from "@/components/ui/switch";
import { ToastBanner } from "@/components/ui/toast";
import { Loader2, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const NONE = "__none__";

function emojiLabel(key: string, emojis: GuildEmojiAsset[]): string {
  if (key.startsWith("unicode:")) return key.slice("unicode:".length);
  if (key.startsWith("custom:")) {
    const id = key.slice("custom:".length);
    const match = emojis.find((emoji) => emoji.id === id);
    return match?.mention ?? `emoji ${id}`;
  }
  return key;
}

function emojiImage(key: string, emojis: GuildEmojiAsset[]): string | null {
  if (!key.startsWith("custom:")) return null;
  const id = key.slice("custom:".length);
  return emojis.find((emoji) => emoji.id === id)?.url ?? null;
}

export function StarboardDashboard() {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [emojis, setEmojis] = useState<string[]>(["unicode:⭐"]);
  const [threshold, setThreshold] = useState(3);
  const [enabled, setEnabled] = useState(false);
  const [allowSelfStar, setAllowSelfStar] = useState(false);
  const [allowBots, setAllowBots] = useState(false);
  const [ignoreChannelIds, setIgnoreChannelIds] = useState<string[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [serverEmojis, setServerEmojis] = useState<GuildEmojiAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const destinationChannels = useMemo(
    () =>
      channels
        .filter((ch) => isStarboardDestinationChannelType(ch.type))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );
  const ignorableChannels = useMemo(
    () =>
      channels
        .filter((ch) => ch.type === 0 || ch.type === 5 || ch.type === 15)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [config, assets] = await Promise.all([
        fetchStarboard(),
        fetchGuildAssets(),
      ]);
      setChannelId(config.settings.channelId);
      setEmojis(config.settings.emojis);
      setThreshold(config.settings.threshold);
      setEnabled(config.settings.enabled);
      setAllowSelfStar(config.settings.allowSelfStar);
      setAllowBots(config.settings.allowBots);
      setIgnoreChannelIds(config.settings.ignoreChannelIds);
      setPostCount(config.postCount);
      setChannels(assets.channels);
      setServerEmojis(assets.emojis);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await saveStarboardSettings({
        channelId,
        emojis,
        threshold: clampStarboardThreshold(threshold),
        enabled,
        allowSelfStar,
        allowBots,
        ignoreChannelIds,
      });
      setChannelId(next.channelId);
      setEmojis(next.emojis);
      setThreshold(next.threshold);
      setEnabled(next.enabled);
      setAllowSelfStar(next.allowSelfStar);
      setAllowBots(next.allowBots);
      setIgnoreChannelIds(next.ignoreChannelIds);
      setSuccess("Settings saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  function addEmoji(key: string): void {
    if (emojis.includes(key) || emojis.length >= STARBOARD_EMOJIS_MAX) return;
    setEmojis([...emojis, key]);
  }

  function removeEmoji(key: string): void {
    if (emojis.length <= 1) return;
    setEmojis(emojis.filter((item) => item !== key));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Loading Starboard…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastBanner
        variant="error"
        message={error}
        onDismiss={() => setError(null)}
      />
      <ToastBanner
        variant="success"
        message={success}
        onDismiss={() => setSuccess(null)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Board</CardTitle>
          <CardDescription>
            When a message reaches the reaction threshold, it's copied here.
            This isn't Action Logs. Current posts: {postCount}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="starboard-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="starboard-enabled">Enabled</Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="starboard-channel">Board channel</Label>
            <Select
              value={channelId ?? NONE}
              onValueChange={(value) =>
                setChannelId(value === NONE ? null : value)
              }
              disabled={saving}
            >
              <SelectTrigger id="starboard-channel">
                <SelectValue placeholder="Pick a channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No channel</SelectItem>
                {destinationChannels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    #{ch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="starboard-threshold">
              Threshold ({STARBOARD_THRESHOLD_MIN}–{STARBOARD_THRESHOLD_MAX})
            </Label>
            <Input
              id="starboard-threshold"
              type="number"
              min={STARBOARD_THRESHOLD_MIN}
              max={STARBOARD_THRESHOLD_MAX}
              value={threshold}
              disabled={saving}
              onChange={(event) =>
                setThreshold(clampStarboardThreshold(event.target.value))
              }
              className="max-w-32"
            />
          </div>

          <div className="space-y-2">
            <Label>Emoji that count (max. {STARBOARD_EMOJIS_MAX})</Label>
            <div className="flex flex-wrap items-center gap-2">
              {emojis.map((key) => {
                const image = emojiImage(key, serverEmojis);
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    {image ? (
                      <img src={image} alt="" className="size-4" />
                    ) : (
                      <span>{emojiLabel(key, serverEmojis)}</span>
                    )}
                    {image ? (
                      <span className="text-muted-foreground">
                        {emojiLabel(key, serverEmojis)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={saving || emojis.length <= 1}
                      aria-label="Remove emoji"
                      onClick={() => removeEmoji(key)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                );
              })}
              <DiscordEmojiPicker
                serverEmojis={serverEmojis}
                disabled={saving || emojis.length >= STARBOARD_EMOJIS_MAX}
                onSelect={(selection) => addEmoji(selection.emojiKey)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Any of these emoji count toward the same threshold. A user
              counts once even if they use several.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="starboard-self"
              checked={allowSelfStar}
              onCheckedChange={setAllowSelfStar}
            />
            <Label htmlFor="starboard-self">Count the author's reaction</Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="starboard-bots"
              checked={allowBots}
              onCheckedChange={setAllowBots}
            />
            <Label htmlFor="starboard-bots">
              Count bots and bot messages
            </Label>
          </div>

          <ChannelMultiSelect
            id="starboard-ignore"
            label="Ignored channels"
            placeholder="Search channels…"
            channels={ignorableChannels}
            value={ignoreChannelIds}
            onChange={setIgnoreChannelIds}
            disabled={saving}
            emptyHint="None. The board channel never counts."
          />

          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
