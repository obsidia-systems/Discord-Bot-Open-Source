# Feature: welcome

UI del dominio **Welcome** (tarjeta PNG 1920×1080, canal de texto o anuncios, layout).

Leave, Ban y Boosts son el Lego **Canvas Events** (`features/canvas-events`), misma tarjeta, misma feature `welcome`.

## Contenido

| Archivo | Rol |
|---------|-----|
| `WelcomeBuilder.tsx` | Panel de diseño + preview escalada |
| `api.ts` | Reexport de clientes welcome/uploads |
| `index.ts` | Barrel público |

## Rutas Astro

- `/dashboard/welcome` → `WelcomeBuilder`
- `/dashboard/leave` → LeaveBuilder (Canvas Events)
- `/dashboard/ban` → BanBuilder (Canvas Events)
- `/dashboard/boost` → BoostBuilder (Canvas Events)

Los redirects `welcome/goodbye`, `welcome/ban` y `welcome/boosts` apuntan a esas rutas.

## API

`fetchWelcomeSettings` / `saveWelcomeSettings` / `uploadBackgroundFile`. Backend: `modules/welcome`. Canvas Events: `/api/bot/leave|ban|boost`.
