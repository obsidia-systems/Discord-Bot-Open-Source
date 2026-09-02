import type { Reminder, ReminderSettings } from "@adobos/shared";
import {
  deleteReminder,
  fetchReminders,
  saveReminderSettings,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ToastBanner } from "@/components/ui/toast";
import { TimezoneCombobox } from "@/features/scheduled-messages/TimezoneCombobox";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function RemindersDashboard() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [rows, setRows] = useState<Reminder[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await fetchReminders();
      setSettings(config.settings);
      setRows(config.reminders);
      setTimezone(config.settings.timezone);
      setEnabled(config.settings.enabled);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
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
      const next = await saveReminderSettings({ timezone, enabled });
      setSettings(next);
      setTimezone(next.timezone);
      setEnabled(next.enabled);
      setSuccess("Ajustes guardados.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number): Promise<void> {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteReminder(id);
      setSuccess(`Cancelado #${id}.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Cargando Reminders…
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
          <CardTitle>Avisos personales</CardTitle>
          <CardDescription>
            El miembro usa <code>/remind in</code> o <code>/remind at</code>.
            El bot avisa por DM; si está cerrado, menciona en el canal. No
            publica anuncios: eso es Scheduled Messages. Pendientes: {rows.length}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Activo
          </label>
          <TimezoneCombobox value={timezone} onChange={setTimezone} />
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pendientes</CardTitle>
          <CardDescription>
            Staff puede cancelar cualquiera. El dueño usa{" "}
            <code>/remind cancel</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nadie tiene un aviso pendiente.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/80 px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    #{row.id} · {formatDue(row.dueAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Usuario {row.userId}
                  </p>
                  <p className="text-sm break-words">{row.message}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void onDelete(row.id)}
                >
                  <Trash2 className="size-4" />
                  Cancelar
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
