import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  ActionLogsConfig,
  GuildChannelAsset,
  GuildRoleAsset,
} from "@adobos/shared";
import {
  defaultActionLogChannelsMapping,
  defaultActionLogEnabledEvents,
} from "@adobos/shared";
import {
  fetchActionLogsConfig,
  fetchBotGuildProfile,
  fetchGuildAssets,
  saveActionLogsConfig,
  sendActionLogsTest,
} from "@/lib/api";
import { HeaderEnableSwitch } from "@/components/shared/HeaderEnableSwitch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastBanner } from "@/components/ui/toast";
import { ActionLogsConfigTab } from "./ActionLogsConfigTab";
import { ActionLogsHistoryTab } from "./ActionLogsHistoryTab";

type TabId = "config" | "history";

function emptyConfig(): ActionLogsConfig {
  return {
    guildId: "",
    enabled: false,
    routingMode: "SIMPLE",
    globalChannelId: null,
    channelsMapping: defaultActionLogChannelsMapping(),
    ignoredChannels: [],
    ignoredRoles: [],
    ignoreBots: true,
    enabledEvents: defaultActionLogEnabledEvents(),
    dataRetentionDays: 14,
    updatedAt: new Date().toISOString(),
  };
}

function configFingerprint(config: ActionLogsConfig): string {
  return JSON.stringify({
    enabled: config.enabled,
    routingMode: config.routingMode,
    globalChannelId: config.globalChannelId,
    channelsMapping: config.channelsMapping,
    ignoredChannels: [...config.ignoredChannels].sort(),
    ignoredRoles: [...config.ignoredRoles].sort(),
    ignoreBots: config.ignoreBots,
    enabledEvents: config.enabledEvents,
    dataRetentionDays: config.dataRetentionDays,
  });
}

/** Isla principal: Configuración y Filtros + Historial de Registros. */
export function ActionLogsDashboard() {
  const [tab, setTab] = useState<TabId>("config");
  const [config, setConfig] = useState<ActionLogsConfig>(emptyConfig);
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    configFingerprint(emptyConfig()),
  );
  const [channels, setChannels] = useState<GuildChannelAsset[]>([]);
  const [roles, setRoles] = useState<GuildRoleAsset[]>([]);
  const [webhookDisplayName, setWebhookDisplayName] =
    useState("Adobos Audit");
  const [webhookAvatarUrl, setWebhookAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty = useMemo(
    () => configFingerprint(config) !== savedFingerprint,
    [config, savedFingerprint],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, assets, profile] = await Promise.all([
        fetchActionLogsConfig(),
        fetchGuildAssets(),
        fetchBotGuildProfile().catch(() => null),
      ]);
      setConfig(cfgRes.config);
      setSavedFingerprint(configFingerprint(cfgRes.config));
      setChannels(assets.channels);
      setRoles(assets.roles);
      if (profile) {
        const nick = profile.nickname?.trim();
        const baseName = nick || profile.username || "Adobos";
        setWebhookDisplayName(`${baseName} Audit`);
        setWebhookAvatarUrl(
          profile.serverAvatarURL || profile.globalAvatarURL || null,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load Action Logs",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await saveActionLogsConfig({
        enabled: config.enabled,
        routingMode: config.routingMode,
        globalChannelId: config.globalChannelId,
        channelsMapping: config.channelsMapping,
        ignoredChannels: config.ignoredChannels,
        ignoredRoles: config.ignoredRoles,
        ignoreBots: config.ignoreBots,
        enabledEvents: config.enabledEvents,
        dataRetentionDays: config.dataRetentionDays,
      });
      setConfig(res.config);
      setSavedFingerprint(configFingerprint(res.config));
      setSuccess("Configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await sendActionLogsTest();
      setSuccess(
        `Test embed sent to <#${res.channelId}> (message ${res.messageId}).`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send the test",
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Action Logs…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderEnableSwitch
        idPrefix="action-logs"
        checked={config.enabled}
        disabled={saving}
        onCheckedChange={(enabled) =>
          setConfig((prev) => ({ ...prev, enabled }))
        }
      />

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

      <Tabs>
        <TabsList>
          <TabsTrigger
            active={tab === "config"}
            onClick={() => setTab("config")}
          >
            Configuration and Filters
          </TabsTrigger>
          <TabsTrigger
            active={tab === "history"}
            onClick={() => setTab("history")}
          >
            Log History
          </TabsTrigger>
        </TabsList>

        {tab === "config" ? (
          <TabsContent>
            <ActionLogsConfigTab
              config={config}
              channels={channels}
              roles={roles}
              dirty={dirty}
              saving={saving}
              testing={testing}
              webhookDisplayName={webhookDisplayName}
              webhookAvatarUrl={webhookAvatarUrl}
              onChange={setConfig}
              onSave={() => void handleSave()}
              onTest={() => void handleTest()}
            />
          </TabsContent>
        ) : (
          <TabsContent>
            <ActionLogsHistoryTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
