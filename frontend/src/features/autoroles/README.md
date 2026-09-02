# Feature: autoroles

UI del dominio **Autoroles**: menús (botones / select / reacciones) y roles al unirse.

## Contenido

| Archivo | Rol |
|---------|-----|
| `AutoRoleBuilder.tsx` | Registry, asistente compacto, auto-join |
| `index.ts` | Barrel público |

## Rutas Astro

- `/dashboard/community/autoroles` → `AutoRoleBuilder`
- `/dashboard/autoroles` redirige a la ruta anterior

## API

`fetchActiveAutoroles` / `createAutoroleCompact` / `updateAutoroleMapping` / `updateAutoroleContent` / `deleteAutorole` / `fetchAutoJoinRoles` / `saveAutoJoinRoles`. Backend: `modules/autoroles`.

Canal de publicación: texto o anuncios. El picker de roles omite managed (incluido Server Booster).
