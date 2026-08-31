# Inventario de frontend

> `develop` @ `2c6d9db` · 29.569 LOC · Astro ^5.1.7 + React ^19.0.0 + Tailwind ^3.4.17
> Complemento de [AUDITORIA.md](../AUDITORIA.md) §2 y §4

## Auditoría de hidratación

*Esta sección cierra el hueco que quedó pendiente en la primera versión de la auditoría.*

```
$ grep -rhoE 'client:(load|visible|idle|only|media)' frontend/src --include="*.astro" | sort | uniq -c
     27 client:load
```

**27 de 27 directivas son `client:load`. Cero `client:visible`, cero `client:idle`, cero `client:only`, cero `client:media`.**

| Archivo | Línea | Directiva |
|---|---|---|
| `layouts/DashboardLayout.astro` | 21 | `client:load` |
| `pages/dashboard/index.astro` | 25 | `client:load` |
| `pages/dashboard/automation/custom-commands.astro` | 10 | `client:load` |
| `pages/dashboard/automation/default-commands.astro` | 10 | `client:load` |
| `pages/dashboard/automation/scheduled.astro` | 10 | `client:load` |
| `pages/dashboard/ban/index.astro` | 10 | `client:load` |
| `pages/dashboard/boost/index.astro` | 10 | `client:load` |
| `pages/dashboard/community/autoroles.astro` | 10 | `client:load` |
| `pages/dashboard/community/forms.astro` | 10 | `client:load` |
| `pages/dashboard/community/levels.astro` | 10 | `client:load` |
| `pages/dashboard/community/roles-builder.astro` | 10 | `client:load` |
| `pages/dashboard/economy/casino.astro` | 10 | `client:load` |
| `pages/dashboard/economy/jobs.astro` | 10 | `client:load` |
| `pages/dashboard/economy/settings.astro` | 10 | `client:load` |
| `pages/dashboard/economy/shop.astro` | 10 | `client:load` |
| `pages/dashboard/general/bot-profile.astro` | 10 | `client:load` |
| `pages/dashboard/general/commands.astro` | 10 | `client:load` |
| `pages/dashboard/leave/index.astro` | 10 | `client:load` |
| `pages/dashboard/messages/index.astro` | 10 | `client:load` |
| `pages/dashboard/messages/legacy.astro` | 10 | `client:load` |
| `pages/dashboard/moderation/action-logs.astro` | 10 | `client:load` |
| `pages/dashboard/moderation/auto-delete.astro` | 10 | `client:load` |
| `pages/dashboard/moderation/auto-mod.astro` | 10 | `client:load` |
| `pages/dashboard/moderation/index.astro` | 10 | `client:load` |
| `pages/dashboard/plugins/pokemon.astro` | 10 | `client:load` |
| `pages/dashboard/server-audit.astro` | 10 | `client:load` |
| `pages/dashboard/welcome/index.astro` | 10 | `client:load` |

### Impacto

`client:load` hidrata la isla **inmediatamente al cargar la página**, bloqueando el hilo principal. Como `DashboardLayout.astro:21` también lo usa, **cada página del dashboard hidrata dos islas de golpe**: el layout (navegación) y el panel de contenido.

Los peores casos son los paneles pesados, que descargan y ejecutan su árbol React completo antes de que la página sea interactiva:

- `ActionLogsDashboard.tsx` — tabla con TanStack Table, filtros, sheet de detalle
- `EconomyShopDashboard.tsx` — editor de artículos con drag & drop (`@hello-pangea/dnd`)
- `WelcomeBuilder.tsx` — editor de canvas con sliders, dropzone y previsualización
- `ServerAuditLog.tsx` — tabla de auditoría de Discord

### Corrección recomendada

| Caso | Directiva | Razón |
|---|---|---|
| Navegación del layout | `client:idle` | Necesaria, pero no antes del primer pintado |
| Panel principal de la página | `client:load` | Es el contenido; se justifica |
| Paneles secundarios y pestañas | `client:visible` | No se ven hasta hacer scroll o cambiar de tab |
| Pickers de emoji, dropzones, previsualizaciones | `client:visible` | Pesados y de uso ocasional |

`emoji-picker-react` y `@hello-pangea/dnd` son las dos dependencias más pesadas del bundle y ambas se cargan hoy de forma inmediata en las páginas que las usan. Moverlas a `client:visible` es la mejora de TTI de mejor relación esfuerzo/resultado del frontend.

---

## Configuración de Astro

`frontend/astro.config.mjs`:

- `output: "static"` — genera HTML plano en `dist/`, copiado a `backend/public/` por el script `build` de la raíz
- Integraciones: `@astrojs/react`, `@astrojs/tailwind` (`applyBaseStyles: false`)
- Alias `@` → `frontend/src`
- Proxy de desarrollo: `/api` y `/uploads` → `http://127.0.0.1:3000`
- HMR configurado para Docker/OrbStack (`clientPort: 4321`, `usePolling: true`)

> **Bloqueante para SaaS:** con `output: "static"` no hay servidor que resuelva la sesión antes de pintar. Un dashboard multi-tenant necesita saber quién es el usuario y qué guilds administra. Habrá que pasar a `output: "server"` con adaptador, o resolver la sesión íntegramente en el cliente contra la API (peor UX, flash de contenido no autenticado).

---

## Páginas — 44 rutas Astro

### Operativas (35)

| Ruta | Feature que monta |
|---|---|
| `/` | Landing |
| `/dashboard` | `DashboardHome`, `StatusIsland` |
| `/dashboard/general/bot-profile` | `BotProfileBuilder`, `BotProfilePreview` |
| `/dashboard/general/commands` | `SystemCommandsDashboard` |
| `/dashboard/messages` | `MessageSender`, `EmbedBuilder`, `ButtonBuilder`, `EmbedLibraryPanel` |
| `/dashboard/messages/legacy` | Versión anterior del constructor |
| `/dashboard/welcome` · `/dashboard/welcomes` · `/dashboard/bienvenidas` | `WelcomeBuilder` |
| `/dashboard/welcome/goodbye` · `/dashboard/leave` | `CanvasEventBuilder` (leave) |
| `/dashboard/welcome/ban` · `/dashboard/ban` | `CanvasEventBuilder` (ban) |
| `/dashboard/welcome/boosts` · `/dashboard/boost` | `CanvasEventBuilder` (boost) |
| `/dashboard/moderation` | `ModerationTools`, `ActiveSanctionsPanel` |
| `/dashboard/moderation/action-logs` | `ActionLogsDashboard` (+ config, history, detail sheet) |
| `/dashboard/moderation/auto-mod` | `AutoModDashboard` |
| `/dashboard/moderation/auto-delete` | `AutoDeleteDashboard` |
| `/dashboard/server-audit` | `ServerAuditLog`, `AuditEventDetails` |
| `/dashboard/autoroles` · `/dashboard/community/autoroles` | `AutoRoleBuilder` |
| `/dashboard/community/roles-builder` | `RolesBuilderDashboard` |
| `/dashboard/community/levels` | `LevelsDashboard`, `LevelsEmbedPreview` |
| `/dashboard/community/forms` | `FormsDashboard` |
| `/dashboard/economy` · `/economy/settings` | `EconomySettingsDashboard` |
| `/dashboard/economy/shop` | `EconomyShopDashboard`, `EconomyShopItemPreview` |
| `/dashboard/economy/jobs` | `EconomyJobsDashboard`, `EconomyJobsDiscordPreview` |
| `/dashboard/economy/casino` | `EconomyCasinoDashboard`, `EconomyCasinoDiscordPreview` |
| `/dashboard/economy/income` | Config de ingresos |
| `/dashboard/automation/scheduled` | `ScheduledDashboard`, `TimezoneCombobox` |
| `/dashboard/automation/custom-commands` | `CustomCommandsDashboard` |
| `/dashboard/automation/default-commands` | `SystemCommandsDashboard` |
| `/dashboard/plugins/pokemon` | `PokemonDashboard`, `PokemonStatusMonitor` |

### Placeholders `ComingSoon` (9)

| Ruta | Módulo previsto | Prioridad de mercado |
|---|---|---|
| `/dashboard/support/panels` | Tickets | **Alta** — los 6 competidores lo tienen |
| `/dashboard/support/settings` | Tickets | **Alta** |
| `/dashboard/community/giveaways` | Sorteos | **Alta** — 5 de 6 lo tienen |
| `/dashboard/plugins/alerts` | Alertas Twitch/YouTube/TikTok | Media |
| `/dashboard/plugins/minecraft` | Integración Crafty Controller | Baja (nicho) |
| `/dashboard/plugins/osu` | Integración osu! | Baja (nicho) |
| `/dashboard/plugins/valorant` | Tienda y trackers | Baja (nicho) |
| `/dashboard/plugins/gachas` | Genshin, WuWa, NTE | Baja (nicho) |
| `/dashboard/plugins/free-games` | Epic / Steam | Baja |

> **Decisión requerida:** son nueve entradas de navegación que no llevan a ninguna parte. O se implementan o se ocultan de `frontend/src/lib/nav.ts` hasta que existan. Para un producto que va a cobrar, un menú lleno de callejones sin salida daña la percepción de madurez.

### Rutas duplicadas

Varias vistas están accesibles por dos rutas (`/dashboard/welcome` y `/dashboard/welcomes` y `/dashboard/bienvenidas`; `/dashboard/autoroles` y `/dashboard/community/autoroles`; `/dashboard/economy` y `/dashboard/economy/settings`). Sedimento de reorganizaciones de navegación. Consolidar y dejar redirecciones.

---

## Features — 18 carpetas

Simétricas a `backend/src/modules/`, según la «regla Lego» del README.

| Feature | Componentes principales |
|---|---|
| `action-logs` | `ActionLogsDashboard`, `ActionLogsConfigTab`, `ActionLogsHistoryTab`, `ActionLogDetailsSheet`, `ActionLogDiscordPreview`, `labels.ts` |
| `auto-delete` | `AutoDeleteDashboard` |
| `auto-mod` | `AutoModDashboard` |
| `autoroles` | `AutoRoleBuilder` |
| `bot-profile` | `BotProfileBuilder`, `BotProfilePreview` |
| `canvas-events` | `CanvasEventBuilder`, `builders.tsx`, `configs.ts` |
| `custom-commands` | `CustomCommandsDashboard` |
| `dashboard` | `DashboardHome`, `StatusIsland` |
| `economy` | `EconomySettingsDashboard`, `EconomyShopDashboard`, `EconomyJobsDashboard`, `EconomyCasinoDashboard`, + 3 previews de Discord |
| `forms` | `FormsDashboard` |
| `levels` | `LevelsDashboard`, `LevelsEmbedPreview` |
| `messages` | `MessageSender`, `EmbedBuilder`, `ButtonBuilder`, `EmbedLibraryPanel` |
| `moderation` | `ModerationTools`, `ServerAuditLog`, `AuditEventDetails`, `ActiveSanctionsPanel`, `auditChangeFormat.ts` |
| `pokemon` | `PokemonDashboard`, `PokemonStatusMonitor` |
| `roles-builder` | `RolesBuilderDashboard` |
| `scheduled-messages` | `ScheduledDashboard`, `TimezoneCombobox` |
| `system-commands` | `SystemCommandsDashboard` |
| `welcome` | `WelcomeBuilder`, `api.ts` |

> Los componentes `*DiscordPreview` (economía, action-logs, levels) que replican el aspecto de un embed de Discord en el panel son un acierto de UX poco común en la categoría: el administrador ve exactamente lo que verá su comunidad.

---

## Componentes

### `components/ui/` — 22 primitivos Shadcn

`accordion` · `alert-dialog` · `avatar` · `badge` · `button` · `card` · `checkbox` · `data-table` · `dialog` · `input` · `label` · `popover` · `scroll-area` · `select` · `separator` · `sheet` · `slider` · `switch` · `tabs` · `textarea` · `toast` · `tooltip`

### `components/shared/` — 16 compartidos

| Componente | Función |
|---|---|
| `AsyncSearchSelect.tsx` | Búsqueda remota con debounce |
| `AvatarCircleUpload.tsx` | Subida de avatar circular |
| `BackgroundImageUpload.tsx` | Subida de fondo de canvas |
| `ChannelMultiSelect.tsx` | Selector múltiple de canales |
| `RoleMultiSelect.tsx` | Selector múltiple de roles |
| `RoleColorDot.tsx` | Punto de color del rol |
| `ComingSoon.astro` | Placeholder de 9 páginas |
| `DiscordEmojiPicker.tsx` | Picker de emojis de la guild |
| `EmojiPicker.tsx` | Picker Unicode (`emoji-picker-react`) |
| `EmbedFormTemplate.tsx` | Formulario base de embed |
| `HeaderEnableSwitch.tsx` | Toggle de módulo en cabecera |
| `HybridImageInput.tsx` | URL o archivo |
| `ImageDropzone.tsx` | Zona de arrastre (`react-dropzone`) |
| `ThemeToggle.tsx` | Conmutador claro/oscuro |
| `UserAvatar.tsx` | Avatar de usuario de Discord |
| `VariableListBase.tsx` | Lista de variables `{user}`, `{server}`… |

### `components/nav/` y `components/custom/`

`NavSidebar.tsx`, `NavCategoryGroup.tsx`, `NavItem.tsx` · `custom/Sidebar.tsx`

> `custom/Sidebar.tsx` y `nav/NavSidebar.tsx` coexisten. Verificar cuál está en uso y borrar el otro.

---

## Capa de API — `lib/api/`

Barrel en `lib/api.ts` que reexporta 20 clientes por dominio: `client`, `health`, `messages`, `embed-library`, `embed-templates`, `autoroles`, `welcome`, `canvas-events`, `uploads`, `bot-profile`, `moderation`, `action-logs`, `auto-mod`, `auto-delete`, `forms`, `scheduled-messages`, `custom-commands`, `system-commands`, `levels`, `economy`, `roles-builder`, `pokemon`.

### El patrón del `guildId`

En los 20 clientes se repite:

```ts
export async function fetchWelcomeSettings(guildId?: string) {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  // …
}
```

**El `guildId` es opcional en toda la capa de API del frontend.** Cuando falta, el backend cae a `process.env.DISCORD_GUILD_ID`. Esto es coherente con el diseño mono-servidor actual y es incompatible con multi-tenant: en SaaS el `guildId` debe ser obligatorio y venir de la ruta (`/dashboard/:guildId/...`), no de un parámetro opcional.

### Sin selector de servidor

`grep -n "guild\|Guild" frontend/src/layouts/DashboardLayout.astro` → **0 resultados**. No existe conmutador de guild, ni contexto de guild, ni ruta parametrizada por guild. Es un panel de un solo servidor.

---

## Otros

- `hooks/useDebouncedValue.ts` — único hook propio
- `lib/nav.ts` — definición de la navegación (incluye las 9 entradas `ComingSoon`)
- `lib/theme.ts` — claro/oscuro
- `lib/parseDiscordEmojis.ts` — parseo de emojis personalizados
- `lib/utils.ts` — `cn()` de Shadcn
- `public/fonts/` — Inter Regular y Bold (duplicadas en `backend/assets/fonts/` para el canvas)
- Sin tests, sin Storybook, sin linter

## Riesgo de seguridad a verificar

`react-markdown` ^10.1.0 con `rehype-raw` ^7.0.0 están en las dependencias. **`rehype-raw` habilita el renderizado de HTML crudo dentro del markdown.** Si algún componente lo usa sobre contenido procedente de usuarios de Discord (descripciones de formularios, respuestas, contenido de mensajes en los logs), es un XSS almacenado. Auditar los puntos de uso y sanear con `rehype-sanitize` o eliminar `rehype-raw` donde la entrada no sea de confianza.
