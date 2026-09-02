# Feature: reminders

UI de **Reminders**: timezone del servidor y lista de pendientes. Los avisos se crean con `/remind`.

No es Scheduled Messages (eso publica en un canal).

## Contenido

| Archivo | Rol |
|---------|-----|
| `RemindersDashboard.tsx` | Enable, timezone, cancelar pendientes |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/automation/reminders`

## API

`fetchReminders` / `saveReminderSettings` / `deleteReminder`. Backend: `modules/reminders` → `/api/reminders`. Slash: `/remind`.
