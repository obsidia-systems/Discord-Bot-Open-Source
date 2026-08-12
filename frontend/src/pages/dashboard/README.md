# Dashboard routes

Rutas del panel (`/dashboard/...`). Agrupadas por dominio funcional, alineadas con `src/features/` y el menú en `src/lib/nav.ts`.

| Carpeta | URL base | Feature / estado |
|---------|----------|------------------|
| *(root)* `index.astro` | `/dashboard` | `features/dashboard` |
| `general/` | `/dashboard/general/...` | Perfil bot (stub) |
| `messages/` | `/dashboard/messages` | `features/messages` |
| `welcome/` | `/dashboard/welcome` | `features/welcome` |
| `moderation/` | `/dashboard/moderation` | `features/moderation` (stub) |
| `community/` | `/dashboard/community/...` | `features/autoroles` + stubs |
| `automation/` | `/dashboard/automation/...` | stubs |
| `economy/` | `/dashboard/economy` | `features/economy` (stub) |
| `plugins/` | `/dashboard/plugins/...` | stubs de integraciones |

Al añadir una ruta: crear thin page aquí + entrada en `lib/nav.ts` + (si aplica) UI en `features/<id>/`.
