# Inventario de API — 88 endpoints

> `develop` @ `2c6d9db` · Complemento de [AUDITORIA.md](../AUDITORIA.md) §2
>
> **⚠️ Ninguno de estos endpoints tiene autenticación.** No hay middleware de sesión, token ni API key en el repositorio. La columna «Aísla guild» indica si el endpoint acota su efecto a una guild concreta; `cliente` significa que el `guildId` llega del cliente sin verificar, y `NO` que la operación no tiene noción de guild en absoluto.

## Montaje

Los routers se registran vía `ctx.route()` desde cada módulo y los monta `core/http/createApp.ts`:

```
app.use(helmet({ contentSecurityPolicy: false }))   // CSP desactivada
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }))  // refleja cualquier origen
app.use(express.json({ limit: "1mb" }))
app.use("/api/health", healthRouter)
app.use("/api/uploads", uploadRoutes)
for (const entry of registry.routes) app.use(entry.basePath, entry.router)  // ← 24 routers
app.use("/uploads", express.static(getUploadsRoot()))
app.use(express.static(staticDir))
```

---

## Núcleo

| Método | Ruta | Qué hace | Aísla guild | Archivo |
|---|---|---|---|---|
| GET | `/api/health` | Estado del bot y del proceso | n/a | `api/routes/health.ts:8` |
| POST | `/api/uploads/background` | Sube fondo de bienvenida → `/uploads/backgrounds/` | **NO** | `api/routes/uploads.routes.ts:106` |
| POST | `/api/uploads/image` | Sube imagen genérica → `/uploads/images/` | **NO** | `api/routes/uploads.routes.ts:114` |

> **[CRÍTICO]** Ambos uploads son escrituras a disco sin credenciales. El filtro confía en `file.mimetype`, que envía el cliente. El directorio se sirve entero con `express.static`.

## Moderación — `/api/mod`

| Método | Ruta | Qué hace | Aísla guild | Línea |
|---|---|---|---|---|
| GET | `/search-member` | Busca miembros por texto | cliente | `:42` |
| GET | `/search-channel` | Busca canales por texto | cliente | `:53` |
| GET | `/member-info/:id` | Ficha de miembro | cliente | `:64` |
| GET | `/channel-info/:id` | Ficha de canal | cliente | `:74` |
| GET | `/fetch-message` | Recupera un mensaje por `channelId`+`messageId` | cliente | `:84` |
| POST | `/action` | **Ejecuta ban / kick / timeout / purge / slowmode / unban / untimeout** | cliente | `:98` |
| GET | `/discord-audit` | Proxy del audit log de Discord | cliente | `:108` |
| GET | `/active/bans` | Lista de bans activos | cliente | `:137` |
| GET | `/active/timeouts` | Lista de timeouts activos | cliente | `:147` |

> **[CRÍTICO]** `POST /action` pasa el body directo a `executeModAction()` (`service.ts:563`) sin comprobar permisos. La única validación es que exista una razón. El `moderator_id` que se persiste en `mod_logs` es el del propio bot.
> **[ALTO]** `search-member`, `discord-audit` y `fetch-message` hacen fan-out a la API de Discord sin rate limiting: candidatos directos a agotar la cuota global del bot.

## Mensajes y embeds

| Método | Ruta | Qué hace | Aísla guild | Archivo |
|---|---|---|---|---|
| POST | `/api/messages` | Envía mensaje de texto a un canal | **NO** | `messages/api/routes.ts:197` |
| POST | `/api/messages/embed` | Envía embed con adjuntos y botones | **NO** | `messages/api/routes.ts:223` |
| GET | `/api/embeds/library` | Lista embeds enviados | cliente | `messages/api/libraryRoutes.ts:96` |
| POST | `/api/embeds/send` | Envía y registra en biblioteca | cliente | `libraryRoutes.ts:107` |
| PUT | `/api/embeds/edit-sent/:id` | Edita un embed ya publicado | cliente | `libraryRoutes.ts:144` |
| DELETE | `/api/embeds/sent/:id` | Borra un embed publicado | cliente | `libraryRoutes.ts:177` |
| GET | `/api/embeds/templates` | Lista plantillas | cliente | `templateRoutes.ts:135` |
| POST | `/api/embeds/templates` | Crea plantilla | cliente | `templateRoutes.ts:145` |
| GET | `/api/embeds/templates/:id` | Lee plantilla | cliente | `templateRoutes.ts:210` |
| DELETE | `/api/embeds/templates/:id` | Borra plantilla | cliente | `templateRoutes.ts:224` |

> **[CRÍTICO]** `POST /api/messages` acepta un `channelId` suelto y lo resuelve con `resolveSendableChannel(bot, channelId)` sobre el cliente global (`controller.ts:284`). **Sin ninguna noción de guild:** permite publicar en cualquier canal de cualquier servidor donde esté el bot.

## Economía — `/api/economy`

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/config` | Config general (moneda, saldo inicial, tasa) | `:102` |
| PUT | `/config` | Guarda config general | `:112` |
| GET | `/income` | Config de ingresos (daily/weekly/trabajos/crímenes) | `:126` |
| PUT | `/income` | Guarda config de ingresos | `:136` |
| GET | `/casino` | Config del casino (apuestas mín/máx, juegos) | `:150` |
| PUT | `/casino` | Guarda config del casino | `:160` |
| GET | `/shop/items` | Lista artículos de tienda | `:174` |
| POST | `/shop/items` | Crea artículo | `:184` |
| PUT | `/shop/items/:id` | Edita artículo | `:198` |
| DELETE | `/shop/items/:id` | Borra artículo | `:212` |
| GET | `/leaderboard?limit=100` | Ranking de saldos | `:222` |
| POST | `/funds` | **Override admin de saldos** | `:244` |

> **[CRÍTICO]** `POST /funds` altera saldos arbitrariamente con el body sin validar.
> Todos usan `resolveGuildId(req)` que cae a `process.env.DISCORD_GUILD_ID` (`routes.ts:55`).

## Action logs — `/api/logs`

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/config` | Config de logs (routing, eventos, ignorados, retención) | `:36` |
| POST | `/config` | Guarda config | `:48` |
| GET | `/history` | Historial paginado de eventos | `:65` |
| POST | `/test` | Emite un evento de prueba al canal configurado | `:99` |

> **[ALTO]** `/history` consulta `action_logs`, que **no tiene ningún índice** pese a filtrarse por `guild_id` y `created_at`. Full scan en la tabla de mayor volumen.

## Autoroles — `/api/autoroles` y `/api/roles`

| Método | Ruta | Qué hace | Archivo |
|---|---|---|---|
| GET | `/api/autoroles/active` | Menús de autorol activos | `autoroles/api/routes.ts:59` |
| POST | `/api/autoroles/reactions` | Crea menú por reacciones | `:70` |
| POST | `/api/autoroles/create` | Crea menú (compacto o legacy) | `:125` |
| PUT | `/api/autoroles/update-mapping/:id` | Actualiza mapeo emoji→rol | `:229` |
| PUT | `/api/autoroles/update-content/:id` | Actualiza contenido del mensaje | `:257` |
| PUT | `/api/autoroles/edit-content/:id` | Alias del anterior | `:282` |
| DELETE | `/api/autoroles/delete/:id` | Borra menú | `:307` |
| GET | `/api/roles/auto` | Roles automáticos al unirse | `autoroles/api/roles.routes.ts:27` |
| POST | `/api/roles/auto` | Guarda roles de humanos/bots | `:49` |
| POST | `/api/roles/interactive` | Publica menú de botones/reacciones | `:76` |
| GET | `/api/roles/list` | Lista roles de la guild | `roles-builder/api/routes.ts:72` |
| POST | `/api/roles/create` | Crea rol en Discord | `:83` |
| PATCH | `/api/roles/positions` | Reordena jerarquía de roles | `:95` |

> **Nota de arquitectura:** dos módulos distintos (`autoroles` y `roles-builder`) montan sobre el mismo prefijo `/api/roles`. Funciona porque las subrutas no colisionan, pero es frágil.
> **[ALTO]** `POST /api/roles/create` y `PATCH /positions` modifican la jerarquía de roles de Discord sin autenticación.

## Configuración por módulo

| Método | Ruta | Qué hace | Archivo |
|---|---|---|---|
| GET/POST | `/api/welcome-settings` | Config y canvas de bienvenida | `welcome/api/routes.ts:16,41` |
| GET/POST | `/api/bot/leave` | Canvas de despedida | `canvas-events/api/routes.ts:42,53` |
| GET/POST | `/api/bot/ban` | Canvas de ban | idem |
| GET/POST | `/api/bot/boost` | Canvas de boost | idem |
| GET/POST | `/api/auto-mod/config` | Filtros y castigos | `auto-mod/api/routes.ts:34,46` |
| GET/POST | `/api/auto-delete/config` | Reglas de auto-borrado | `auto-delete/api/routes.ts:35,47` |
| GET/POST | `/api/levels/config` | Config de XP | `levels/api/routes.ts:73,85` |
| GET | `/api/levels/leaderboard?limit=100` | Ranking de niveles | `levels/api/routes.ts:112` |
| GET/PUT | `/api/pokemon/config` | Config del plugin Pokémon | `pokemon/api/routes.ts:40,50` |
| GET/POST | `/api/bot/profile` | Perfil global del bot (avatar, nombre) | `bot-profile/api/routes.ts:111,121` |
| GET/POST | `/api/bot/guild-profile` | Perfil por guild | idem |
| GET | `/api/guild-assets` | Canales, roles y emojis de la guild | `guild-assets/api/routes.ts:13` |
| GET | `/api/system-commands` | Permisos de los 45 comandos nativos | `system-commands/api/routes.ts:44` |
| PUT | `/api/system-commands` | Guarda permisos **y re-sincroniza slash en Discord** | `:54` |

> **[ALTO]** `PUT /api/system-commands` dispara un `PUT` a la API de Discord (`Routes.applicationGuildCommands`). Sin auth y sin rate limiting, es un vector directo para agotar la cuota de registro de comandos.

## Formularios — `/api/forms`

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/` | Lista formularios | `:57` |
| POST | `/` | Crea formulario | `:67` |
| GET | `/:id/responses` | Respuestas de un formulario | `:78` |
| POST | `/:id/publish` | Publica el panel en un canal | `:89` |
| GET | `/:id` | Lee formulario | `:108` |
| PATCH | `/:id` | Edita formulario | `:119` |
| DELETE | `/:id` | Borra formulario | `:131` |

> `/:id/responses` se declara antes que `/:id` genérico — orden correcto.
> **[CRÍTICO]** `GET /:id/responses` expone respuestas de usuarios (nombre, avatar, contenido) sin autenticación. Es el endpoint con más carga de datos personales del sistema.

## Mensajes programados — `/api/scheduled-messages`

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/` | Lista mensajes programados | `:51` |
| GET | `/:id` | Lee uno | `:63` |
| POST | `/` | Crea y registra el cron | `:76` |
| PATCH | `/:id` | Edita y re-registra el cron | `:93` |
| POST | `/:id/toggle` | Activa/desactiva — body `{ isActive: boolean }` | `:111` |
| DELETE | `/:id` | Borra y cancela el cron | `:129` |

## Comandos custom — `/api/custom-commands`

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/` | Lista comandos custom | `:65` |
| POST | `/sync` | Re-sincroniza los slash en Discord | `:75` |
| POST | `/` | Crea comando | `:97` |
| GET | `/:id` | Lee comando | `:112` |
| PATCH | `/:id` | Edita comando | `:125` |
| DELETE | `/:id` | Borra comando | `:144` |

---

## Shims deprecados (código muerto)

Cuatro archivos en `api/routes/` son re-exports marcados `@deprecated` que ya no aporta nadie al kernel:

```
api/routes/autoroles.routes.ts         → modules/autoroles/api/routes
api/routes/guild-assets.routes.ts      → modules/guild-assets/api/routes
api/routes/message.routes.ts           → modules/messages/api/routes
api/routes/welcome-settings.routes.ts  → modules/welcome/api/routes
```

Borrarlos. Sólo `api/routes/uploads.routes.ts` y `api/routes/health.ts` son reales.

---

## Resumen de exposición

| Categoría | Endpoints | Riesgo |
|---|---|---|
| Sin noción de guild alguna | 3 | **Crítico** — mensajes y uploads |
| `guildId` del cliente, sin verificar | 83 | **Crítico** — sin aislamiento de tenant |
| Sin noción de guild (legítimo) | 2 | Bajo — health, perfil global del bot |
| Con validación zod | **0** | `zod@^3.24.1` instalado, nunca importado |
| Con rate limiting | **0** | — |
| Con autenticación | **0** | — |
