# ROADMAP — Adobos Bot → SaaS

> Estado base auditado: `develop` @ `2c6d9db` · ~65.6k LOC (backend 31.5k / frontend 29.6k / shared 4.5k)
> 18 módulos, 45 slash nativos, 88 endpoints Express, 37 tablas SQLite, 40 migraciones Drizzle.
> Leyenda esfuerzo: **S** ≤1 día · **M** 2–5 días · **L** 1–3 semanas · **XL** >3 semanas.
> Documentos: [AUDITORIA.md](AUDITORIA.md) · [MARCA.md](MARCA.md) · [docs/INVENTARIO-API.md](docs/INVENTARIO-API.md) · [docs/INVENTARIO-DATOS.md](docs/INVENTARIO-DATOS.md) · [docs/INVENTARIO-FRONTEND.md](docs/INVENTARIO-FRONTEND.md)
> Leyenda tier: **FREE** = capa gratis amplia · **PAID** = monetizable · **INFRA** = no visible al usuario.

---

## 0. BLOQUEANTES DE LANZAMIENTO SaaS (hacer antes que nada)

Nada de lo demás importa hasta cerrar esto. Hoy el panel es **100% público**: no existe ni una
línea de autenticación en el repo (`grep -riE "oauth|jwt|session|cookie"` → 0 resultados).

| # | Item | Archivos | Esfuerzo | Tier |
|---|------|----------|----------|------|
| 0.1 | **OAuth2 Discord + sesión firmada** para el panel. Scopes `identify` + `guilds`. Validar `state` (anti-CSRF) y PKCE. | nuevo `backend/src/core/auth/` + `core/http/createApp.ts` | L | INFRA |
| 0.2 | **Middleware `requireGuildAccess(guildId)`** aplicado en los 88 endpoints. Verificar server-side que el usuario tiene `MANAGE_GUILD` en esa guild vía la API de Discord (con caché corta), nunca confiar en el `guildId` del query string. | `core/http/`, todos los `modules/*/api/routes.ts` | L | INFRA |
| 0.3 | **Eliminar el fallback `process.env.DISCORD_GUILD_ID`** de los 8 `resolveGuildId()` duplicados. En SaaS ese fallback es un bug de aislamiento, no una comodidad. | `economy/{service,shopService,casinoService,incomeService}.ts`, `auto-delete/service.ts`, `moderation/service.ts`, `system-commands/sync.ts` | M | INFRA |
| 0.4 | **Scoping de canal por guild.** `POST /api/messages` y `/api/messages/embed` sólo reciben `channelId` y lo resuelven global (`messages/api/controller.ts:284`). Debe validarse que el canal pertenece a la guild autorizada. | `modules/messages/api/` | S | INFRA |
| 0.5 | **Slash commands globales** en vez de `Routes.applicationGuildCommands(clientId, DISCORD_GUILD_ID)`. Con N guilds el modelo actual es inviable (rate limit + un `PUT` por guild). | `modules/system-commands/sync.ts:105` | M | INFRA |
| 0.6 | **Sharding** (`ShardingManager` o `client.shard`). Discord obliga a ≥1 shard por cada 2.500 guilds. Hoy `createClient.ts` crea un `Client` plano. | `core/bot/createClient.ts`, `index.ts` | M | INFRA |
| 0.7 | **Tabla `guild_subscriptions` + capa de entitlements** (`can(guildId, "feature")`). Ver §9 — hacerlo ahora evita reescribir 18 módulos después. | nuevo `core/entitlements/` | M | INFRA |
| 0.8 | **Validación con zod en el borde HTTP.** `zod@^3.24.1` está en `backend/package.json` pero **no se importa en ningún archivo**. Los bodies se castean con `as` (`req.body as ModActionRequest`). | todos los `modules/*/api/routes.ts` | M | INFRA |
| 0.9 | **Rate limiting** por IP + por usuario + por guild en la API, y por usuario en comandos costosos (canvas, leaderboards, Pokémon). | `core/http/`, `core/bot/interactionRouter.ts` | M | INFRA |
| 0.10 | **Error handler centralizado + logging estructurado** (pino). Hoy cada módulo repite su propio `handleError` y usa `console.*`. | `core/http/`, 18 módulos | M | INFRA |
| 0.11 | **Migración SQLite → Postgres o D1.** `better-sqlite3` es síncrono y un solo archivo; no sobrevive multi-instancia. Ver §6 del informe. | `db/client.ts`, `db/schema.ts`, `drizzle.config.ts` | L | INFRA |
| 0.12 | **Stripe Billing + webhook con verificación de firma** (`stripe.webhooks.constructEvent`, raw body). | nuevo `modules/billing/` | L | INFRA |

---

## 1. FUGAS Y DEUDA TÉCNICA DETECTADA (quick wins)

| # | Item | Archivo | Esfuerzo | Tier |
|---|------|---------|----------|------|
| 1.1 | **Fuga de memoria confirmada:** `ephemeralByInteraction` se escribe en *cada* comando nativo (`guard.ts:129`) pero sólo 15 archivos llaman a `consume*`. Las entradas de los ~30 comandos restantes nunca se borran. Añadir TTL de 15 min o usar `interaction.client`-scoped WeakRef. | `modules/system-commands/ephemeral.ts` | S | INFRA |
| 1.2 | **Cachés de config sin límite ni invalidación cross-instancia:** `configCache` en `levels`, `auto-mod`, `auto-delete`; `formCache`, `historyByGuild`, `spamBuckets`, `repeatBuckets`, `textCooldowns`, `voiceSessions`, `dirtyGuilds`… ~20 `Map` a nivel de módulo, todas ilimitadas y por-proceso. Con sharding quedan desincronizadas. Migrar a un caché con TTL + tamaño máximo (o Redis/KV). | `modules/*/service.ts`, `levels/events.ts`, `auto-mod/filters.ts` | M | INFRA |
| 1.3 | **`sessions` de blackjack en memoria** (`economy/commands/casino.ts:73`) — se pierden en cada deploy y no tienen límite. | `modules/economy/commands/casino.ts` | S | INFRA |
| 1.4 | **`ensureCoreTables()` de 600+ líneas de DDL literal** conviviendo con 40 migraciones Drizzle (`db/client.ts`). Dos fuentes de verdad del esquema. Consolidar en Drizzle. | `db/client.ts` | M | INFRA |
| 1.5 | **`cors({ origin: true })`** refleja cualquier `Origin` (`core/http/createApp.ts:22`). Con cookies de sesión sería CSRF trivial. Allowlist explícita. | `core/http/createApp.ts` | S | INFRA |
| 1.6 | **`helmet({ contentSecurityPolicy: false })`** — CSP desactivada. | `core/http/createApp.ts:21` | S | INFRA |
| 1.7 | **Uploads sin verificación de contenido real:** se confía en `file.mimetype` (cabecera del cliente) y se sirve el directorio entero con `express.static`. Validar magic bytes y re-encodear. Sin auth, hoy es un file-drop abierto. | `api/routes/uploads.routes.ts` | M | INFRA |
| 1.8 | **Sin linter, sin formatter, sin tests, sin CI.** No hay `.eslintrc`, `.prettierrc`, `biome.json`, `.github/`, ni un solo `*.test.ts`. | raíz | M | INFRA |
| 1.9 | **`interactionRouter.ts` usa `await import()` dinámico en el hot path** de cada interacción (4 sitios). Mover a imports estáticos. | `core/bot/interactionRouter.ts` | S | INFRA |
| 1.10 | **Handler de prueba en producción:** `test_button_1` responde "¡El botón interactivo funciona!" a cualquiera. | `core/bot/interactionRouter.ts:160` | S | INFRA |
| 1.11 | **`ephemeral: true` está deprecado** en discord.js v14.17+; migrar a `flags: MessageFlags.Ephemeral` (≈50 usos). | transversal | S | INFRA |
| 1.12 | **Secretos sólo por env var**, sin rotación ni vault. `DISCORD_TOKEN` va en `.env` montado por `env_file` en `docker-compose.prod.yml`. | despliegue | M | INFRA |

| 1.13 | **`action_logs` no tiene ni un índice.** Es la tabla de mayor volumen y se consulta por `guild_id` + `created_at` en el historial y en el job de retención: cada consulta es un full scan. Sólo 5 de 37 tablas tienen índices. | `db/schema.ts`, nueva migración | S | INFRA |
| 1.14 | **Hidratación uniforme `client:load`.** 27 de 27 directivas del panel; cero `client:visible`/`client:idle`. Cada página hidrata el layout + su panel completo antes de pintar. `emoji-picker-react` y `@hello-pangea/dnd` se cargan de inmediato. | 26 páginas `.astro` + `DashboardLayout.astro:21` | S | INFRA |
| 1.15 | **4 shims `@deprecated` vivos** en `api/routes/{autoroles,guild-assets,message,welcome-settings}.routes.ts` — re-exports que ya no usa el kernel. Ruido en el mapa de rutas. | `backend/src/api/routes/` | S | INFRA |
| 1.16 | **`rehype-raw` habilita HTML crudo** en `react-markdown`. Auditar si recibe contenido de usuarios de Discord (respuestas de formularios, contenido de mensajes en logs) — sería XSS almacenado. | `frontend/` | S | INFRA |

---

## 2. FUNCIONES A MEDIO IMPLEMENTAR (terminar lo empezado)

### 2.1 Comandos de moderación en stub — **8 de 11**
`backend/src/modules/system-commands/handlers/index.ts:69-76` mapea a `stubCommand()`:
`untimeout`, `warn`, `warns`, `clearwarns`, `purge`, `slowmode`, `lock`, `unlock`.
Están **registrados en Discord** y responden "🚧 Lógica pendiente" — mala primera impresión.
`ban`, `kick`, `timeout` sí están implementados. La tabla `warnings` (`db/schema.ts:240`) ya existe
y el panel ya la consume; sólo falta el handler de slash.
→ **Esfuerzo M · FREE** (moderación básica debe ser gratis, es el dolor original).

### 2.2 Comandos Pokémon en stub — **5 de 7**
`backend/src/modules/pokemon/commands/stubs.ts`: `teambuilder`, `weakness`, `breeding`, `counters`, `sandwich`.
`pokeinfo` y `location` sí funcionan. Ya existe `services/pokemonApi.ts` (PokéAPI + caché) y
`services/smogonService.ts` (tiers + stats), así que la infraestructura de datos está hecha.
→ `weakness` / `breeding` / `counters` **M · FREE** · `teambuilder` (equipos guardados) **M · PAID**.

### 2.3 Páginas del panel en `ComingSoon`
`plugins/{minecraft,osu,valorant,gachas,free-games,alerts}.astro`,
`support/{panels,settings}.astro`, `community/giveaways.astro`.
Nueve entradas de navegación que no llevan a nada. Decisión requerida: implementar u ocultar
del nav (`frontend/src/lib/nav.ts`) hasta que existan. → **S** ocultar · ver §3 para implementar.

### 2.4 Rangos por nivel (del README)
`xpRewards` (`db/schema.ts:506`) ya persiste roles por nivel y `levels/service.ts` los aplica,
pero el README lo marca `[ ]`. Verificar y cerrar el checkbox, o completar la asignación
por tiempo en voz. → **S**.

---

## 3. FUNCIONES NUEVAS — HUECOS FRENTE A COMPETIDORES

Todos los competidores analizados (MEE6, Dyno, Carl-bot, ProBot, Arcane, Wick) tienen esto y
Adobos no. Ordenado por frecuencia en el mercado.

| # | Función | Por qué | Esfuerzo | Tier |
|---|---------|---------|----------|------|
| 3.1 | **Sistema de tickets/soporte** | Presente en los 6 competidores. Ya hay stub de UI en `support/panels.astro`. Es la función #1 que obliga a instalar un bot extra (Ticket Tool). | L | **FREE** (paneles ilimitados) / PAID (transcripciones, claim, SLA) |
| 3.2 | **Sorteos / giveaways** | Presente en 5 de 6. Stub en `community/giveaways.astro`. | M | **FREE** |
| 3.3 | **Anti-raid / anti-nuke** | Diferenciador premium de Wick y Dyno ($4.99). Límites de creación de roles/canales, gate por antigüedad de cuenta, lockdown de emergencia. El módulo `auto-mod` ya tiene la estructura de `punishments.ts`. | L | FREE (básico) / **PAID** (anti-nuke, gate por edad de cuenta) |
| 3.4 | **Canales de voz temporales** (VoiceMaster) | El README ya lo lista como deseado. `GuildVoiceStates` ya está en `CORE_INTENTS`, y `levels/events.ts` ya trackea sesiones de voz. | M | **FREE** |
| 3.5 | **Alertas Twitch / YouTube / TikTok / Kick** | Presente en MEE6, ProBot, Arcane. Stub en `plugins/alerts.astro`. Requiere webhooks/polling externo. | L | FREE (1–2 canales) / **PAID** (ilimitados) |
| 3.6 | **Starboard** | Carl-bot lo tiene gratis; muy pedido. | M | **FREE** |
| 3.7 | **Recordatorios / `/remind`** | Barato de construir: `scheduled-messages/scheduler.ts` ya tiene la maquinaria de cron + timezone. | S | **FREE** |
| 3.8 | **i18n del bot y del panel** | Todo está hardcodeado en español (mensajes de error, embeds, UI). Bloquea el mercado internacional, que es donde está el volumen de Discord. | L | INFRA |
| 3.9 | **Auto-respuestas / triggers por palabra clave** | Distinto de `custom-commands` (que son slash). Presente en Dyno y Carl-bot. | M | **FREE** |
| 3.10 | **Música** | El README lo lista. Alto coste operativo (CPU/ancho de banda) y riesgo legal/ToS. Recomendación: **no construirlo** o dejarlo explícitamente PAID para cubrir coste. | XL | PAID |

---

## 4. PATRONES DE "FREE TIER TACAÑO" A ATACAR EXPLÍCITAMENTE

Datos de mercado recogidos en agosto 2026. Esto es material de marketing tanto como de producto.

| Competidor | Precio | Cómo estrangula el free tier |
|---|---|---|
| **MEE6** | $11.99/mes · $49.99/año · $89.99 lifetime — **por servidor** | **5 comandos custom** en total. Tarjetas de bienvenida con imagen, automod avanzado, recompensas multi-nivel, logs completos y música: todo premium. La IA es **otra** suscripción aparte. |
| **Arcane** | ~$7/mes por servidor | Comandos custom ilimitados y límites de roles detrás del muro. |
| **ProBot** | $4.99/mes por servidor | Las bienvenidas gratis existen, pero los diseños buenos y el anti-spam fino son premium. |
| **Dyno** | $4.99/mes por servidor | Comandos ilimitados, leveling y anti-nuke son premium. Los "ilimitados" tienen soft-limits no publicados. |
| **Carl-bot** | $3.99/mes · $39.99/año por servidor | El más generoso: reaction roles, automod y logging gratis. Cobra por *límites más altos*, colores de embed y subida de imágenes. |
| **Wick** | Escalonado | Especialista en anti-nuke; el resto es delgado. |

**Los cuatro patrones a no repetir:**
1. **Cobrar por servidor.** Tres comunidades = pagar tres veces. Es la queja #1 y nuestra mayor oportunidad.
2. **Cortar por conteo arbitrario** (5 comandos custom). Un límite que se toca el primer día no es free tier, es demo.
3. **Paywall estético** (tarjetas de bienvenida bonitas, colores de embed). Barato de servir, alto valor percibido, y el motor de canvas (`WelcomeCardBuilder.ts`) ya está construido y es bueno.
4. **Trocear la suscripción** (MEE6 Premium ≠ MEE6 AI).

**Nuestro contra-posicionamiento:** todos los módulos hoy implementados van completos en FREE, y
se cobra por **escala, automatización y analítica**, no por desbloquear el botón.

---

## 5. PROPUESTA DE TIERS

Alineado con §8 del informe. Modelo **híbrido: suscripción por cuenta de usuario que cubre N servidores.**

### FREE — "amplio de verdad"
Los 18 módulos actuales, completos y sin recortes cosméticos:
mensajes/embeds ilimitados, welcome/leave/ban/boost con **canvas completo**, autoroles ilimitados,
action logs (retención 14 días), auto-mod, auto-delete, formularios, mensajes programados,
comandos custom **ilimitados** (vs. 5 de MEE6), niveles con recompensas por rol, economía + casino
+ tienda, moderación completa, roles builder, Pokémon, tickets, giveaways, starboard.
Límite razonable: **3 servidores por cuenta**.

### PRO — ~$4.99/mes o $39.99/año · **hasta 3 servidores**
Retención de logs 90 días · analítica de crecimiento y engagement · exports CSV/JSON ·
branding del bot por servidor (nombre/avatar — `bot-profile` ya lo soporta) · alertas de streaming
ilimitadas · multiplicadores de XP avanzados y leaderboard en vivo · anti-nuke · backup/restore de
configuración · soporte prioritario.

### BUSINESS — ~$14.99/mes · **servidores ilimitados**
Todo lo de Pro · retención de 1 año · webhooks salientes e integraciones externas ·
API pública con API keys · logs de auditoría del propio panel · roles de staff en el dashboard
con permisos granulares · SLA.

**Precio ancla:** Pro a $4.99 **cubriendo 3 servidores** compite de frente con Carl-bot ($3.99×3 = $11.97)
y destroza a MEE6 ($11.99×3 = $35.97). Ese es el titular.

---

## 6. ORDEN DE EJECUCIÓN SUGERIDO

**Fase 1 — Cerrar la puerta (2–3 semanas).** 0.1 → 0.2 → 0.3 → 0.4 → 1.5 → 1.7.
Sin esto no se puede exponer el panel a Internet bajo ninguna circunstancia.

**Fase 2 — Multi-tenant real (3–4 semanas).** 0.5 → 0.6 → 0.11 → 1.2 → 1.1 → 0.9.

**Fase 3 — Preparar la monetización (2–3 semanas).** 0.7 (entitlements) → 0.8 → 0.10 → 1.8.
El punto 0.7 va **antes** de Stripe: primero la capa de permisos de features, luego quién paga.

**Fase 4 — Cobrar (2 semanas).** 0.12 (Stripe + webhooks + Customer Portal).

**Fase 5 — Paridad competitiva (6–8 semanas).** 2.1 → 2.2 → 3.1 → 3.2 → 3.4 → 3.7 → 3.6.

**Fase 6 — Expansión.** 3.3 → 3.5 → 3.8 (i18n) → 3.9 → 2.2 (Pokémon completo).
