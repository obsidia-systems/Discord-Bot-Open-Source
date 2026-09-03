import type { Reminder, ReminderSettings } from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchReminders(): Promise<{
  settings: ReminderSettings;
  reminders: Reminder[];
}> {
  const response = await apiFetch(`/api/reminders`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load Reminders (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<{
    settings: ReminderSettings;
    reminders: Reminder[];
  }>;
}

export async function saveReminderSettings(input: {
  timezone?: string;
  enabled?: boolean;
}): Promise<ReminderSettings> {
  const response = await apiFetch(`/api/reminders/settings`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save Reminders (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { settings: ReminderSettings };
  return json.settings;
}

export async function deleteReminder(id: number): Promise<void> {
  const response = await apiFetch(`/api/reminders/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't cancel the reminder (${response.status})`,
      ),
    );
  }
}
