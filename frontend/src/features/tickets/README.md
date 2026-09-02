# Feature: tickets

UI de **Tickets**: expediente en Postgres, canal privado en Discord.

No es Forms (solicitud de una vez). No es Action Logs (eso audita el servidor). Sin slash en A–C: paneles con botones, acciones en el canal y en la bandeja.

## Contenido

| Archivo | Rol |
|---------|-----|
| `TicketsDashboard.tsx` | Tabs Bandeja / Paneles / Ajustes. Timeline y transcript. |
| `index.ts` | Barrel público |

## Rutas Astro

- `/dashboard/support/settings` — tab Bandeja (y Ajustes)
- `/dashboard/support/panels` — tab Paneles

Misma app; el `initialTab` cambia la pestaña inicial.

## API

`/api/tickets` — settings, panels, bandeja, claim/wait/close/reopen. FeatureKey `tickets` (FREE). Tope operativo 50 abiertos / 1 por usuario, no paywall.
