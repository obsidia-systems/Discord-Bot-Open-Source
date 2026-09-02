# Feature: bot-profile

UI de **Bot Profile**: apodo y avatar del bot como miembro de este servidor.

GET es gratis. Guardar requiere plan Pro (`branding`). No cambia username ni avatar de la aplicación. No hay editor de presencia (Playing es global al bot).

## Contenido

| Archivo | Rol |
|---------|-----|
| `BotProfileBuilder.tsx` | Formulario + gate de branding |
| `BotProfilePreview.tsx` | Preview del miembro |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/general/bot-profile`

## API

`fetchBotGuildProfile` / `saveBotGuildProfile`. Backend: `modules/bot-profile` → `/api/bot/guild-profile`.
