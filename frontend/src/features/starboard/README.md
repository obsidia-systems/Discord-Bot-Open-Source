# Feature: starboard

UI de **Starboard**: un tablón por servidor. Reacciones hasta el umbral → copia en el canal elegido.

No es Action Logs. No hay slash: se configura solo aquí.

## Contenido

| Archivo | Rol |
|---------|-----|
| `StarboardDashboard.tsx` | Canal, umbral, emojis, self-star, bots, ignorados |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/community/starboard`

## API

`fetchStarboard` / `saveStarboardSettings`. Backend: `modules/starboard` → `/api/starboard`.
