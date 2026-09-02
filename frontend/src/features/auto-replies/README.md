# Feature: auto-replies

UI de **Auto-Replies**: si un mensaje coincide con un trigger, el bot responde.

No es Custom Commands (slash). No es Auto-Mod. No hay slash: se configura solo aquí.

## Contenido

| Archivo | Rol |
|---------|-----|
| `AutoRepliesDashboard.tsx` | Lista CRUD: trigger, modo, respuesta, canales, cooldown |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/automation/auto-replies`

## API

`fetchAutoReplies` / `createAutoReply` / `updateAutoReply` / `deleteAutoReply`. Backend: `modules/auto-replies` → `/api/auto-replies`. Límite `autoReplies` (25 en Gratis).
