# Feature: stream-alerts

UI de **Stream Alerts**: avisa en Discord cuando un canal de Twitch, YouTube o Kick pasa a en directo.

No es Action Logs. No hay slash: se configura solo aquí. TikTok queda fuera.

## Contenido

| Archivo | Rol |
|---------|-----|
| `StreamAlertsDashboard.tsx` | Lista CRUD: plataforma, handle, canal, rol, plantilla |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/plugins/alerts`

## API

`fetchStreamAlerts` / `createStreamAlert` / `updateStreamAlert` / `deleteStreamAlert`. Backend: `modules/stream-alerts` → `/api/stream-alerts`. Límite `streamAlerts` (2 en Gratis).
