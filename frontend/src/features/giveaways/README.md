# Feature: giveaways

UI de **Giveaways**: sorteo con botón Participar. Las entradas están en Postgres, no en una reacción de Discord.

No es Scheduled Messages. No hay slash: se crea y se cierra aquí. Reroll gratis.

## Contenido

| Archivo | Rol |
|---------|-----|
| `GiveawaysDashboard.tsx` | Crear, lista, detalle (end / cancel / reroll / republicar), ajustes |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/community/giveaways`

## API

`/api/giveaways` — FeatureKey `giveaways` (FREE). Tope operativo 25 sorteos en curso.
