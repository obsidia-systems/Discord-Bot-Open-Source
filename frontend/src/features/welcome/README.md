# Feature: welcome

UI del dominio **Bienvenidas** (tarjeta PNG 1920×1080, canal, layout).

## Contenido

| Archivo | Rol |
|---------|-----|
| `WelcomeBuilder.tsx` | Panel de diseño + preview escalada |
| `api.ts` | Reexport de clientes welcome/uploads |
| `index.ts` | Barrel público |

## Rutas Astro

- `/dashboard/welcome` → `WelcomeBuilder`
- Stubs hermanos: `goodbye`, `ban`, `boosts` (ComingSoon en `pages/`)

## API

`fetchWelcomeSettings` / `saveWelcomeSettings` / `uploadBackgroundFile`. Backend: `modules/welcome`.
