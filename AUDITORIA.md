# Auditoría técnica — Adobos Bot → SaaS

> **Alcance:** backend · frontend · shared · infraestructura
> **Base auditada:** `develop` @ `2c6d9db` · 27 de agosto de 2026
> **Tamaño:** 65.600 LOC (backend 31.539 · frontend 29.569 · shared 4.492) · 52 commits · 1 contribuidor
> **Documentos relacionados:** [ROADMAP.md](ROADMAP.md) · [docs/INVENTARIO-API.md](docs/INVENTARIO-API.md) · [docs/INVENTARIO-DATOS.md](docs/INVENTARIO-DATOS.md) · [docs/INVENTARIO-FRONTEND.md](docs/INVENTARIO-FRONTEND.md)

---

## Hallazgo principal

**El panel de administración no tiene autenticación de ningún tipo.**

```
grep -riE "oauth|jwt|session|cookie|passport|bearer|api[_-]?key" \
  --include="*.ts" --include="*.tsx" --include="*.astro" .
→ 0 resultados
```

`core/http/createApp.ts` monta helmet, CORS, el body parser, los 24 routers de módulos y los estáticos. No hay middleware de sesión, token ni API key en ninguna parte del repositorio. Los 88 endpoints se sirven abiertos y el `guildId` viaja como parámetro de query controlado por el cliente, sin verificación.

Esto es explotable **hoy** contra el despliegue self-hosted, no sólo en el futuro SaaS. Con `ports: "3000:3000"` en `docker-compose.prod.yml`, basta con que el puerto sea alcanzable.

| Métrica | Valor |
|---|---|
| Módulos | 18 |
| Slash commands | 45 (13 son stubs) |
| Endpoints Express | 88 |
| Tablas SQLite | 37 |
| Migraciones Drizzle | 40 |
| Auth · tests · linter · CI | **0** |

---

## 1. Resumen de producto

### Qué hace hoy

Bot de Discord modular con panel web integrado, empaquetado como un único proceso Node que mantiene el WebSocket del gateway y sirve el dashboard simultáneamente. Nació como proyecto self-hosted para una comunidad concreta (servidor «Adobos», en referencia a la cantante ADO).

18 módulos funcionales, no demos:

- **Mensajes y embeds** con constructor visual y biblioteca de enviados
- **Canvas** de bienvenida/despedida/ban/boost con editor de capas
- **Autoroles** por reacción, botones y menús de selección
- **Action logs** granulares con enrutado por canal y webhooks
- **Auto-mod** con filtros y castigos escalonados
- **Auto-borrado** programado por canal
- **Formularios** interactivos vía modales
- **Mensajes programados** con zona horaria por mensaje
- **Comandos custom** con variables
- **Niveles** con XP de texto y voz, recompensas por rol
- **Economía** con banco, trabajos, tienda y casino (ruleta, blackjack, coinflip)
- **Moderación** con auditoría de Discord
- **Roles builder**
- **Plugin Pokémon** con PokéAPI + Smogon

### Público objetivo

Administradores de comunidades de Discord de tamaño medio —gaming, creadores, comunidades hispanohablantes— que hoy instalan entre cinco y diez bots para cubrir funciones básicas y pagan suscripciones separadas por cada uno.

### Propuesta de valor diferenciada

El dolor original tiene dos caras:

1. **Fragmentación.** Un bot que ya cubre moderación, logs, bienvenidas, niveles, economía, formularios y automatización sustituye a la pila típica de seis bots.
2. **Cobro por servidor.** Todos los competidores cobran por guild: quien administra tres comunidades paga tres veces. **Una suscripción por cuenta que cubra varios servidores es un argumento que ningún competidor grande puede igualar sin canibalizar su propio modelo.**

> **Activo infravalorado:** el motor de canvas (`backend/src/bot/utils/WelcomeCardBuilder.ts` con `@napi-rs/canvas`) con editor visual de capas, posición de avatar, desenfoque y tipografía. MEE6 y ProBot cobran premium exactamente por esto. Regalarlo completo en la capa gratuita es el gesto que hace creíble todo el posicionamiento.

### Stack y versiones

| Capa | Tecnología | Versión | Nota |
|---|---|---|---|
| Runtime | Node.js | ≥22 | pnpm 9.15.4, monorepo de 3 workspaces |
| Lenguaje | TypeScript | ^5.7.3 | `strict: true`, `NodeNext`, `noUnusedLocals` |
| Bot | discord.js | ^14.17.3 | Sin sharding; intents incluyen `MessageContent` (privilegiado) |
| API | Express | ^4.21.2 | + helmet ^8.0.0, cors ^2.8.5, multer ^2.2.0 |
| DB | SQLite / better-sqlite3 | ^11.8.1 | Síncrono, un solo archivo. Cuello de botella del SaaS |
| ORM | Drizzle ORM | ^0.38.4 | drizzle-kit ^0.30.2, 40 migraciones |
| Frontend | Astro | ^5.1.7 | `output: "static"`, inyectado en `backend/public` |
| UI | React + Tailwind | ^19.0.0 / ^3.4.17 | Shadcn UI, Radix, TanStack Table |
| Validación | zod | ^3.24.1 | **Declarada pero nunca importada** |
| Gráficos | @napi-rs/canvas | ^1.0.5 | Canvas nativo |
| Cron | node-cron | ^4.6.0 | Crons por guild |

---

## 2. Mapa de lo implementado

> Inventarios completos en [docs/INVENTARIO-API.md](docs/INVENTARIO-API.md), [docs/INVENTARIO-DATOS.md](docs/INVENTARIO-DATOS.md) y [docs/INVENTARIO-FRONTEND.md](docs/INVENTARIO-FRONTEND.md).

### Arquitectura de arranque

```
backend/src/index.ts
  ├─ initDatabase()                    db/client.ts — SQLite + 600 líneas de DDL bootstrap
  ├─ loadModules(ENABLED_MODULES)      core/modules/registry.ts — 18 módulos
  ├─ wireCustomCommandsBuiltinSync()   reserva nombres del catálogo nativo
  ├─ createBotClient(registry)         core/bot/createClient.ts — Client único, sin shards
  │    └─ registerInteractionRouter()  core/bot/interactionRouter.ts
  ├─ createApp({bot, registry})        core/http/createApp.ts — SIN middleware de auth
  └─ app.listen(PORT)                  un proceso: gateway WS + panel web
```

El kernel es genuinamente bueno. `core/modules/registry.ts` define un contrato plug-and-play donde cada módulo recibe un `ModuleContext` con `on`, `route`, `command`, `button` y `modal`, y el registro fusiona intents, detecta duplicados y enlaza todo al cliente. Añadir un módulo es una carpeta y una línea en `ENABLED_MODULES`. **Esa arquitectura es la razón por la que el pivote a SaaS es viable.**

### Comandos — 45 slash, 0 por prefijo

Catálogo compartido en `packages/shared/src/system-commands.ts` (877 líneas), despachado por un mapa Command Pattern en `modules/system-commands/handlers/index.ts`.

| Categoría | Comandos | Estado |
|---|---|---|
| Moderación | `ban` `kick` `timeout` | Implementados |
| Moderación | `untimeout` `warn` `warns` `clearwarns` `purge` `slowmode` `lock` `unlock` | **8 stubs** |
| Niveles | `rank` `leaderboard` `givexp` `removexp` `setlevel` | Implementados |
| Economía | `balance` `deposit` `withdraw` `work` `crime` `daily` `weekly` `monthly` `pay` `baltop` `addmoney` `removemoney` `shop` `buy` | Implementados |
| Casino | `coinflip` `roulette` `blackjack` | Implementados |
| Pokémon | `pokeinfo` `location` | Implementados |
| Pokémon | `teambuilder` `weakness` `breeding` `counters` `sandwich` | **5 stubs** |
| Utilidades | `userinfo` `serverinfo` `avatar` `ping` `help` | Implementados |

Los 13 stubs **están registrados en Discord** y responden «🚧 Lógica pendiente».

### Eventos y trabajos programados

| Módulo | Eventos | Notas |
|---|---|---|
| `action-logs` | mensajes, miembros, roles, canales, emojis, stickers, soundboard | `events.ts` — 1.300 líneas |
| `levels` | `messageCreate`, `voiceStateUpdate` | Sesiones de voz en memoria |
| `auto-mod` | `messageCreate` | Filtros + castigos |
| `autoroles` | `guildMemberAdd`, `messageReactionAdd/Remove` | |
| `welcome` / `canvas-events` | `guildMemberAdd`, `guildMemberRemove`, `guildBanAdd` | |
| `auto-delete` | `messageCreate` + cron por guild | `node-cron` |
| `scheduled-messages` | cron por mensaje | Zona horaria propia |
| `economy` | `setInterval` barrido de expiración de tienda | |
| `levels` | `setInterval` refresco de leaderboard en vivo | |
| `action-logs` | `setInterval` limpieza de retención | |

### API Express — 88 endpoints, 24 routers

Prefijos: `/api/{welcome-settings, messages, embeds, autoroles, roles, economy, mod, logs, auto-mod, auto-delete, forms, scheduled-messages, custom-commands, system-commands, levels, pokemon, guild-assets, bot/profile, bot/leave, bot/ban, bot/boost, uploads, health}`

**Autenticación actual: ninguna.** Detalle endpoint por endpoint en [docs/INVENTARIO-API.md](docs/INVENTARIO-API.md).

### Frontend

44 páginas Astro estáticas, 18 carpetas de features, 22 componentes Shadcn, 16 componentes compartidos. **Nueve páginas son placeholders `ComingSoon`.** No existe selector de servidor ni layout consciente de la guild. Detalle en [docs/INVENTARIO-FRONTEND.md](docs/INVENTARIO-FRONTEND.md).

### Esquema de datos — 37 tablas

Todas las tablas de dominio llevan `guild_id` con `FOREIGN KEY … ON DELETE CASCADE` hacia `guild_settings`, que actúa como raíz del tenant. **Esa parte del diseño está bien hecha** y facilita el paso a multi-tenant: el aislamiento existe en el esquema; lo que falta es aplicarlo en la capa HTTP.

Detalle de columnas en [docs/INVENTARIO-DATOS.md](docs/INVENTARIO-DATOS.md).

### Permisos de Discord

Del lado del bot el modelo es **correcto, y es la mejor parte del código en materia de seguridad**. `modules/system-commands/guard.ts` hace un doble check antes de cada comando nativo:

1. Comando habilitado en la guild
2. Canal no está en la lista de ignorados
3. Miembro tiene alguno de los roles permitidos configurados
4. Si no hay roles configurados y el comando lo requiere: permiso nativo de Discord mapeado por comando (`BanMembers` para `/ban`, `ModerateMembers` para `/timeout`, `ManageChannels` para `/purge`)

Además `sync.ts` publica `default_member_permissions` para que Discord oculte el comando en el autocompletado.

**El problema:** toda esa lógica vive únicamente en la ruta de los slash commands. La API HTTP expone las mismas acciones —`POST /api/mod/action` ejecuta bans, kicks y timeouts— sin pasar por ningún guard equivalente.

### Gateway y rate limits

Un solo `Client` sin `ShardingManager`. Listeners de `shardReconnecting` y `shardResume` que sólo hacen log. **No hay configuración de `sweepers` ni `makeCache`**, así que las cachés de miembros y mensajes crecen sin límite. No existe rate limiting propio ni en la API ni en los comandos, salvo cooldowns de negocio en economía, comandos custom y XP de texto.

---

## 3. Roadmap

Documento separado: **[ROADMAP.md](ROADMAP.md)**

| Bloque | Contenido | Items |
|---|---|---|
| 0 · Bloqueantes SaaS | OAuth2, aislamiento por guild, comandos globales, sharding, entitlements, zod, rate limiting, Postgres/D1, Stripe | 12 |
| 1 · Deuda técnica | Fuga de memoria confirmada, ~20 cachés sin límite, DDL duplicado, CORS/CSP, uploads, sin lint/test/CI | 12 |
| 2 · A medio hacer | 8 comandos de moderación stub, 5 de Pokémon, 9 páginas `ComingSoon` | 4 |
| 3 · Huecos de mercado | Tickets, sorteos, anti-raid, voz temporal, alertas, starboard, recordatorios, i18n, auto-respuestas | 10 |
| 4 · Free tier tacaño | Los cuatro patrones de los competidores y el contra-posicionamiento | 4 |
| 5–6 · Tiers y fases | Free / Pro / Business + orden de ejecución en 6 fases | — |

> **La regla de orden que importa:** la capa de entitlements (0.7) va **antes** que Stripe (0.12). Primero se construye `can(guildId, "feature")` y se cablea en los 18 módulos; después se conecta quién paga. Al revés obliga a reescribir todos los módulos una segunda vez.

---

## 4. Auditoría de buenas prácticas 2026

### discord.js

| Sev | Hallazgo | Detalle |
|---|---|---|
| **Alto** | Sin sharding: techo duro en 2.500 guilds | Discord obliga a ≥1 shard por 2.500 guilds. `createClient.ts:35` instancia un `Client` plano. Migrar obliga además a resolver el estado compartido: ~20 `Map` a nivel de módulo asumen un único proceso |
| **Alto** | Cachés de discord.js sin límite | No se configuran `makeCache` ni `sweepers`. Con `MessageContent` y `GuildMembers` activos, las cachés crecen indefinidamente. Causa clásica de OOM |
| **Alto** | Registro de comandos por guild, no global | `Routes.applicationGuildCommands(clientId, DISCORD_GUILD_ID)` con un `PUT` por servidor (`sync.ts:105`). Con N guilds son N llamadas y N oportunidades de agotar el rate limit |
| **Medio** | `ephemeral: true` deprecado | discord.js 14.17+ pide `flags: MessageFlags.Ephemeral`. ~50 usos del literal antiguo |
| **Medio** | Imports dinámicos en el hot path | `interactionRouter.ts` hace `await import()` en 4 puntos por cada interacción (líneas 70, 109, 116, 137) |
| **Bien** | Router de componentes | Registro de handlers por customId exacto o prefijo (`resolvePrefixedHandler`) con detección de duplicados al arrancar. Limpio y escalable |

### Express

| Sev | Hallazgo | Detalle |
|---|---|---|
| **Crítico** | zod instalado y nunca usado | `grep -rl zod backend/src` → 0 archivos. La validación se hace con casts (`req.body as ModActionRequest`). Un cast de TypeScript no valida nada en runtime |
| **Alto** | Sin arquitectura controller/service/repository consistente | Algunos módulos separan `routes` / `controller` / `service`; otros meten la lógica en el router. Sin capa de repositorio, lo que hará doloroso el cambio de motor de BD |
| **Alto** | Sin error handler central ni logging estructurado | Cada módulo redefine su propio `handleError` (patrón repetido en los 24 routers). Todo el logging es `console.*` con prefijo `[adobos]`. Sin request id, sin niveles, sin JSON |
| **Medio** | 4 shims deprecados vivos | `api/routes/{autoroles,guild-assets,message,welcome-settings}.routes.ts` son re-exports marcados `@deprecated`. Ruido que confunde el mapa de rutas |

### Astro + React

**Auditoría de hidratación (pendiente en la versión anterior, ahora completada):**

```
27 de 27 directivas son client:load
 0 client:visible · 0 client:idle · 0 client:only · 0 client:media
```

| Sev | Hallazgo | Detalle |
|---|---|---|
| **Alto** | Hidratación uniforme `client:load` | Las 26 páginas del dashboard y el propio `DashboardLayout.astro:21` usan `client:load`. Cada página descarga y ejecuta React **más su isla completa** antes de pintar, incluyendo paneles pesados como `ActionLogsDashboard` y `EconomyShopDashboard`. `client:visible` o `client:idle` en los paneles por debajo del pliegue es una mejora de TTI casi gratuita |
| **Medio** | Salida estática incompatible con multi-tenant | `output: "static"` genera HTML plano servido por `express.static`. Un dashboard SaaS necesita saber quién es el usuario y qué guilds administra antes de pintar |

### TypeScript

| Sev | Hallazgo | Detalle |
|---|---|---|
| **Bien** | Tipos compartidos de extremo a extremo | `packages/shared` (4.492 líneas, 26 módulos) con `strict: true`, `noUnusedLocals`, `noFallthroughCasesInSwitch`. Base excelente y poco común |
| **Medio** | Los tipos no se validan en el borde | El valor de `@adobos/shared` se pierde en la frontera HTTP porque los DTOs se aplican con `as`. Corrección: derivar los tipos de esquemas zod (`z.infer`) en el propio paquete compartido |

### Multi-tenancy

| Sev | Hallazgo | Detalle |
|---|---|---|
| **Crítico** | Sin aislamiento por encima del esquema | El esquema lo hace bien; la capa HTTP acepta el `guildId` del cliente sin verificarlo, y 8 servicios tienen un `resolveGuildId()` duplicado que cae a `process.env.DISCORD_GUILD_ID` |
| **Crítico** | No existe concepto de tier, plan ni límite | Sin tabla de suscripciones, sin feature flags, sin cuotas. Ninguna capa del código sabe qué es un plan de pago |

### CI/CD, testing, linting

| Sev | Hallazgo | Detalle |
|---|---|---|
| **Crítico** | Cero tests, cero linter, cero pipeline | No existe `.github/`, ni un solo `*.test.ts`, ni configuración de ESLint/Prettier/Biome. Los scripts `lint` y `typecheck` de la raíz usan `--if-present` y en la práctica sólo `typecheck` hace algo. **Sobre 65.600 líneas y un único contribuidor, es el mayor riesgo operativo después de la autenticación**: no hay red de seguridad para los refactors que exige el resto del informe |

---

## 5. Huecos de seguridad

> Los marcados **[CRÍTICO]** son explotables por cualquiera que alcance el puerto de la API, sin credenciales, hoy.

### Autenticación y autorización

**[CRÍTICO] Los 88 endpoints se sirven sin autenticación**
`core/http/createApp.ts:20-41`. Sin middleware de sesión, token ni API key en todo el repositorio.

**[CRÍTICO] Ejecución de acciones de moderación sin comprobar permisos**
`modules/moderation/api/routes.ts:98` → `service.ts:563`. `POST /api/mod/action` pasa el body directamente a `executeModAction()`, que resuelve la guild desde `input.guildId` y ejecuta ban, kick, timeout, purge o slowmode. La única validación es que exista una razón. El `moderator_id` registrado en `mod_logs` es el del propio bot, así que la acción queda sin trazabilidad real.

**[CRÍTICO] Envío de mensajes a cualquier canal de cualquier servidor**
`modules/messages/api/controller.ts:284`. `POST /api/messages` acepta un `channelId` suelto y lo resuelve con `resolveSendableChannel(bot, channelId)` sobre el cliente global, **sin ninguna noción de guild**. Cualquiera puede publicar en cualquier canal de cualquier servidor donde esté el bot. Igual en `POST /api/messages/embed`, que además admite adjuntos.

**[CRÍTICO] Alteración arbitraria de saldos de economía**
`modules/economy/api/routes.ts:244`. `POST /api/economy/funds` llama a `adjustEconomyFunds()` con el body sin validar.

**[CRÍTICO] El `guildId` es un parámetro controlado por el cliente**
Patrón repetido en los 24 routers: `typeof req.query.guildId === "string" ? req.query.guildId : undefined`, y luego el servicio cae a `process.env.DISCORD_GUILD_ID`. Ningún punto del código comprueba que el solicitante tenga derecho sobre esa guild.

**[CRÍTICO] Subida de archivos abierta sin autenticación**
`api/routes/uploads.routes.ts:106,114`. Los controles existentes son razonables (5 MB, un archivo, extensión saneada, nombre aleatorio) pero el filtro confía en `file.mimetype`, que lo envía el cliente, y el directorio se sirve entero con `express.static`. Alojamiento de archivos gratuito y persistente para cualquiera.

### Doble verificación de permisos

**Sí en los comandos, no en la API.** `assertSystemCommandAllowed()` (`guard.ts:62-131`) valida server-side comando habilitado → canal permitido → rol configurado → permiso nativo de Discord. Es el modelo correcto. Pero la API expone las mismas capacidades destructivas sin equivalente.

**Corrección:** extraer el guard a un servicio compartido e invocarlo desde ambos caminos, con la identidad del usuario del panel obtenida de la sesión OAuth, nunca del body.

### OAuth2 del dashboard

**[CRÍTICO] No hay flujo OAuth2 que auditar.** No existe. Recomendaciones para cuando se construya:

- **Scopes mínimos:** `identify` + `guilds`. No pedir `guilds.join`, `email` ni `guilds.members.read` salvo que una función concreta lo exija
- **Parámetro `state`** aleatorio de ≥32 bytes, ligado a la sesión y de un solo uso
- **PKCE (S256)** aunque el flujo sea confidencial
- **No confiar en el listado de guilds del cliente.** El bit `MANAGE_GUILD` debe leerse desde la API de Discord en el servidor, cachearse pocos minutos y re-verificarse en cada acción sensible
- **Cookies** `HttpOnly`, `Secure`, `SameSite=Lax`, con rotación de sesión tras el login
- **No almacenar el access token del usuario** más allá de lo necesario; si se guarda el refresh token, cifrarlo en reposo

### Inyección SQL

**Sin inyección SQL — verificado.** Toda la lógica de negocio usa el query builder de Drizzle, que parametriza. Se revisaron los usos de SQL crudo uno por uno:

- Las ~20 llamadas a `database.prepare()` en `db/client.ts` son `PRAGMA table_info(...)` y consultas de bootstrap con cadenas estáticas, sin interpolación
- La única interpolación en un `exec()` es `ALTER TABLE welcome_settings ADD COLUMN ${ddl}` (`db/client.ts:423`), donde `ddl` proviene de literales escritos a mano en las llamadas inmediatamente siguientes. No hay entrada de usuario en ese camino
- El único `sql` template de Drizzle (`economy/service.ts:167`) interpola referencias de columna tipadas, no valores

Es de los pocos apartados que no requiere acción. Mantener la disciplina al migrar de motor.

### Rate limiting y aislamiento entre tenants

**[ALTO] Sin límite de tasa propio en API ni en comandos.** Los únicos límites son cooldowns de negocio: economía (`economy/cooldowns.ts`), comandos custom (`handler.ts:12`) y XP de texto (`levels/events.ts:27`). Los peores candidatos sin protección son los que hacen fan-out a la API de Discord: `/api/mod/search-member`, `/api/mod/discord-audit`, `/api/logs/history`, y los que renderizan canvas. **En multi-tenant, un abusador agota el rate limit global del bot y degrada el servicio de todos los servidores.**

**[MEDIO] Fuga de memoria confirmada.** `setInteractionEphemeral()` se llama en el guard para **cada** comando nativo (`guard.ts:129`), pero sólo 15 archivos llaman a `consumeInteractionEphemeral()`. Las entradas de los ~30 comandos restantes nunca se borran y el `Map` crece sin techo mientras el proceso viva (`modules/system-commands/ephemeral.ts:4`).

**[MEDIO] ~20 cachés en memoria sin límite ni TTL.** `configCache` en levels/auto-mod/auto-delete, `formCache`, `historyByGuild`, `spamBuckets`, `repeatBuckets`, `textCooldowns`, `voiceSessions`, `voicePauseCarryMs`, `dirtyGuilds`, `lastFingerprint`, `debounceTimers`, `sessions` de blackjack, `cooldownUntil`. Con sharding quedarían desincronizadas, lo que en los cooldowns de economía y los buckets de anti-spam **es directamente un fallo de seguridad**: el mismo usuario esquivaría el límite alternando de shard.

### Validación de entrada de usuarios de Discord

**[ALTO] Contenido de mensajes procesado sin saneado sistemático.** Con `MessageContent` activo, action-logs persiste contenido y auto-mod lo analiza. Hay truncados puntuales (`slice(0, 400)` en razones, `slice(0, 100)` en placeholders) pero no una capa uniforme. Riesgos concretos:

- Expansión de menciones al reenviar contenido a los embeds de log → usar `allowedMentions: { parse: [] }` en todos los envíos del bot
- `react-markdown` con `rehype-raw` está en las dependencias del frontend, y **`rehype-raw` habilita HTML crudo**. Verificar que no reciba texto de usuarios de Discord sin sanear

**[MEDIO] Interpolación de variables en comandos custom.** `custom-commands/variables.ts` sustituye `{user}`, `{username}`, `{server}` en texto definido por administradores. Al no forzar `allowedMentions`, una plantilla puede fabricar `@everyone`.

### Webhooks entrantes

**No hay webhooks entrantes todavía.** Los de `action-logs/webhooks.ts` son **salientes** hacia Discord. Cuando llegue Stripe:

- Endpoint dedicado con `express.raw({type:"application/json"})` **antes** del parser JSON global
- Verificación con `stripe.webhooks.constructEvent(rawBody, sig, secret)`
- Tolerancia de timestamp para replay
- Idempotencia por `event.id` persistido

### CORS y cabeceras

**[ALTO] `cors({ origin: true })` refleja cualquier origen.** `createApp.ts:22` — `process.env.CORS_ORIGIN ?? true`. Sin la variable definida (y no está en `.env.example`), el servidor refleja el `Origin` de quien pregunte. Hoy el impacto es limitado porque no hay cookies; **en cuanto se añada sesión se convierte en CSRF trivial.** Debe ser allowlist explícita antes de introducir la sesión.

**[ALTO] CSP desactivada explícitamente.** `helmet({ contentSecurityPolicy: false })` en `createApp.ts:21`. La defensa contra XSS queda anulada justo en la aplicación que renderizará contenido generado por usuarios de Discord.

**[MEDIO] Handler de prueba en producción.** `test_button_1` responde «¡El botón interactivo funciona!» a cualquier usuario que fabrique ese customId (`interactionRouter.ts:160`).

### Secretos y privilegio mínimo

**[MEDIO] Secretos sólo en variables de entorno, sin rotación.** `DISCORD_TOKEN` se carga con `dotenv` desde un `.env` montado vía `env_file`. Aceptable para self-hosted; insuficiente para SaaS, donde se sumarán el client secret de OAuth, la clave de Stripe y el secreto de firma de webhooks.

*Comprobado: `.gitignore` excluye `.env` y el historial de 52 commits no lo contiene.*

**[MEDIO] Privilegio mínimo del bot: sin invitación documentada.** No hay en el repositorio una URL de invitación ni una lista de permisos solicitados, así que **no se puede auditar qué pide el bot hoy**. Dado que ejecuta bans, timeouts, gestión de roles y creación de canales, la tentación de pedir `Administrator` es fuerte, y es la decisión equivocada para un SaaS: en cuanto una instalación se comprometa, el radio de daño es cada servidor que confió.

Pedir el conjunto mínimo explícito: `ManageRoles`, `ManageChannels`, `BanMembers`, `KickMembers`, `ModerateMembers`, `ManageMessages`, `ViewAuditLog`, `SendMessages`, `EmbedLinks`, `AttachFiles` — y degradar con elegancia cuando falte alguno. Además, en la publicación de la app hará falta justificar ante Discord el intent privilegiado `MessageContent`.

---

## 6. Migración a Cloudflare

### El dato decisivo

Un bot de discord.js necesita un WebSocket saliente al gateway abierto **indefinidamente**. Los Workers son stateless; la vía natural sería un Durable Object. Pero Cloudflare documenta que, desde junio de 2026, **una conexión saliente mantiene vivo un Durable Object durante 15 minutos como máximo** — pasado ese plazo la conexión deja de impedir el desalojo.

Un bot desalojado cada 15 minutos pierde eventos, se reconecta sin parar y agota la cuota de *identify* de Discord. **El gateway necesita un proceso persistente. No es negociable.**

### Opción A — Todo a Workers + D1 + R2

- **Viabilidad: inviable** para el gateway, por el límite de 15 minutos
- La única alternativa sería reescribir el bot como **Interactions endpoint HTTP**, abandonando discord.js y el gateway
- Eso significa **perder todos los eventos**: `messageCreate`, `guildMemberAdd`, `voiceStateUpdate`, `messageDelete`. Morirían action-logs (1.300 líneas), auto-mod, niveles, bienvenidas y auto-borrado
- Quedarían sólo los slash commands. Sería tirar la mitad del producto

### Opción B — Híbrido (recomendada)

- **Viabilidad: alta.** El proceso de discord.js vive en un contenedor o VPS ligero, donde ya funciona
- El panel Astro se sirve desde Workers Static Assets: gratis, global, rápido
- Los webhooks de Stripe y el callback de OAuth entran por Workers: cero servidor que mantener, firma verificada en el borde
- Los assets van a R2 con **egress gratuito** — hoy están en un volumen local que no sobrevive a múltiples instancias
- La base de datos es la decisión abierta

### D1 — límites que importan

| Límite (Workers Paid) | Valor | Impacto |
|---|---|---|
| Tamaño máx. por base | 10 GB | **El riesgo real.** `action_logs` con retención de 14 días a 10.000 guilds toca el techo |
| Bases por cuenta | 50.000 | Habilita **una base por guild** — aislamiento perfecto, sin techo agregado |
| Concurrencia | Single-threaded por base | Una consulta a la vez. A 1 ms/consulta, ~1.000 q/s |
| Parámetros por consulta | 100 | Revisar los `INSERT` por lotes de action-logs |
| Consultas por invocación | 1.000 | Holgado |
| Almacenamiento de cuenta | 1 TB | Sin problema |

> **Acoplamiento a vigilar:** D1 sólo es accesible cómodamente desde Workers. Si el bot corre en un VPS, necesita hablar con D1 vía API HTTP (con latencia y límites por consulta) o pasar por un Worker intermedio. Para un bot que escribe XP en cada mensaje, eso es mucho ida y vuelta. **Postgres gestionado (Neon, Supabase) encaja mejor con la arquitectura híbrida.**

### R2 — modelo de claves

Egress gratuito, $0,015/GB-mes de almacenamiento; nivel gratuito de 10 GB-mes, 1 M ops Clase A y 10 M Clase B.

```
guilds/{guildId}/backgrounds/{uuid}.webp      # fondos de bienvenida — permanente
guilds/{guildId}/embeds/{uuid}.webp           # imágenes de embeds — permanente
guilds/{guildId}/exports/{ts}-{tipo}.csv      # exports del panel — expira a 7 d
guilds/{guildId}/logs/{yyyy-mm}/{uuid}.json   # archivado de logs — expira según tier
system/backups/{yyyy-mm-dd}/{guildId}.json    # backup de config — expira a 30 d
```

El prefijo por `guildId` permite borrar todo lo de un servidor cuando el bot es expulsado, aplicar cuota por tier y contabilizar consumo por tenant. Recodificar todo a WebP al subir reduce el almacenamiento de forma significativa frente a los PNG que hoy se aceptan.

### Costes estimados

| Componente | 100 guilds | 1.000 guilds | 10.000 guilds |
|---|---|---|---|
| Shards de Discord | 1 | 1 | 4+ |
| VPS del bot | ~$8 · 2 vCPU / 4 GB | ~$18 · 4 vCPU / 8 GB | ~$100 · 2–3 nodos 8 vCPU / 16 GB |
| Workers Paid | $0 (free) | $5 | $5 + uso |
| Base de datos | $0 (free) | ~$10 | ~$50–90 |
| R2 | $0 (free) | ~$3 | ~$25 |
| Redis / KV | $0 | ~$0–10 | ~$15 |
| Observabilidad | $0 | ~$0–10 | ~$25 |
| **Total mensual** | **~$8–13** | **~$36–56** | **~$220–260** |
| **Coste por guild** | ~$0,10 | ~$0,05 | **~$0,024** |

> *Las cifras de VPS son referencias de mercado, no cotizaciones. Los precios de Cloudflare son los publicados.*

**La conclusión económica importa más que la técnica:** a 10.000 servidores el coste marginal por guild ronda los **2,4 centavos al mes**. Una capa gratuita amplia no sólo es viable, es barata. Lo que cuesta dinero es el desarrollo y el soporte, no la infraestructura — y eso justifica regalar funciones completas y cobrar por escala.

### Recomendación

**Opción B, por fases, con Postgres gestionado salvo que se adopte una base D1 por guild.**

1. **Primero R2.** La migración más barata y de mayor retorno: elimina la dependencia del volumen local, que es lo que hoy impide correr más de una instancia. Se puede hacer sin tocar nada más
2. **Después el panel a Workers Static Assets** más un Worker para el callback OAuth y los webhooks de Stripe
3. **Después la base de datos**, cuando SQLite empiece a doler de verdad
4. **El proceso del bot se queda en VPS o contenedor.** Indefinidamente

No migrar por migrar. Una migración completa de golpe, con cero tests en el repositorio, sería temerario.

---

## 7. Análisis de mercado

*Precios de agosto de 2026. El patrón que atraviesa todo el sector: **los seis cobran por servidor**.*

| Bot | Precio | Cómo estrangula el free tier | Fuerte en |
|---|---|---|---|
| **MEE6** | $11,99/mes · $49,99/año · $89,99 vitalicio (por servidor) | **5 comandos custom en total.** Tarjetas de bienvenida con imagen, automod avanzado, recompensas multi-nivel, logs completos y música: todo premium. **La IA es una suscripción aparte** que Premium no incluye | Marca, niveles |
| **Arcane** | ~$7/mes (por servidor) | Comandos custom ilimitados y límites de roles detrás del muro | Niveles |
| **Dyno** | $4,99/mes (por servidor) | Comandos ilimitados, niveles y anti-nuke son premium. Los «ilimitados» tienen soft-limits no publicados | Moderación, automod |
| **ProBot** | $4,99/mes (por servidor) | Bienvenidas gratis, pero los mejores diseños y el anti-spam fino son premium | Bienvenidas |
| **Carl-bot** | $3,99/mes · $39,99/año (por servidor) | **El más generoso.** Reaction roles, automod y logging gratis. Cobra por límites más altos, colores de embed y subida de imágenes | Reaction roles, logs |
| **Wick** | Escalonado | Especialista en anti-nuke; el resto es delgado | Seguridad, anti-raid |

> *No se pudieron verificar los límites exactos del free tier de Dyno, Arcane y Wick: las fuentes publicaban comparativas de funciones, no números por tier. Conviene confirmarlo en sus páginas oficiales antes de usar estas cifras en material de marketing.*

### Funciones comunes que ya tenemos

Moderación, action logs, bienvenidas con tarjeta, autoroles, auto-mod, niveles, economía, comandos custom, mensajes programados, formularios, auto-borrado. **En la mayoría de estas categorías el producto está a la par o por delante**: el editor visual de tarjetas y la granularidad de los action logs superan lo que ofrece gratis casi todo el sector.

### Funciones comunes que NO tenemos

Por orden de urgencia competitiva: **tickets de soporte** (los seis lo tienen; es lo que más obliga a instalar un bot adicional), **sorteos**, **anti-raid/anti-nuke**, **canales de voz temporales**, **alertas de Twitch/YouTube/TikTok**, **starboard**, **auto-respuestas por palabra clave**, **recordatorios**.

Nueve de estas ya tienen página `ComingSoon` en el panel.

Aparte, y probablemente más importante: **i18n**. Todo el producto está en español —mensajes de error, embeds, panel— lo que hoy cierra la puerta al grueso del mercado de Discord. Es también una ventaja de nicho a corto plazo: hay poca competencia con soporte nativo real en español.

### Los cuatro patrones a no repetir

1. **Cobrar por servidor.** Tres comunidades, tres facturas. La queja recurrente y nuestra mayor oportunidad estructural
2. **Cortar por conteo arbitrario.** Cinco comandos custom es un límite que se toca el primer día. Eso no es capa gratuita, es demo con cuenta atrás
3. **Paywall estético.** Cobrar por colores de embed o diseños de tarjeta es lo más barato de servir y lo que más resentimiento genera. El motor de canvas ya está construido; regalarlo entero cuesta cero
4. **Trocear la suscripción.** Premium que no incluye la IA. Un solo plan que signifique algo

> **El titular se escribe solo:** «Un plan. Tres servidores. $4,99. MEE6 te cobra $35,97 por lo mismo.»

---

## 8. Plan de monetización

### Comparación de modelos

| Modelo | A favor | En contra | Encaje |
|---|---|---|---|
| **(a) Por servidor** | Estándar del sector; ingreso escala con el uso; fácil de explicar | Es exactamente el modelo que originó el dolor. Adoptarlo destruye el único argumento diferencial | **Descartar** |
| **(b) Por cuenta de usuario** | Ataca el dolor de frente. Una factura por administrador. Menor fricción, mejor retención | Un usuario con 50 servidores grandes consume mucho y paga una vez. Necesita tope | **Buena base** |
| **(c) Freemium + compras únicas** | Sin compromiso recurrente; buena conversión por impulso | Ingreso no recurrente e impredecible; fragmenta el producto en trocitos vendibles — el patrón MEE6/AI que criticamos | **Descartar** |
| **(d) Híbrido** | Suscripción por cuenta con N servidores incluidos, y escalones para quien gestione más | Algo más complejo de comunicar | **Recomendado** |

### Criterio para decidir qué va gratis

La pregunta que resuelve casi todos los casos: **¿el coste marginal de servir esta función crece con el uso?**

- **Gratis** — utilidad diaria de coste marginal casi nulo: moderación, logs con retención corta, bienvenidas *incluido el canvas completo*, autoroles, comandos custom sin límite de conteo, niveles, economía, formularios, tickets, sorteos
- **De pago** — lo que cuesta almacenamiento, cómputo o llamadas a terceros, y lo que ahorra tiempo a un administrador profesional: retención larga de logs, analítica, exports, alertas ilimitadas, integraciones externas, API, anti-nuke, backup/restore, soporte prioritario

**Regla de oro: nunca cobrar por desbloquear un botón que ya está construido.** Cobrar por escala, por historia y por tiempo ahorrado.

### Tiers

| | **Free** | **Pro** | **Business** |
|---|---|---|---|
| **Precio** | 0 € | 4,99 €/mes · 39,99 €/año | 14,99 €/mes |
| **Servidores** | 3 | 3 | Ilimitados |
| | Los 18 módulos completos | Todo lo de Free | Todo lo de Pro |
| | Canvas de bienvenida completo | Logs · 90 días | Retención de 1 año |
| | Comandos custom ilimitados | Analítica de crecimiento | Webhooks salientes |
| | Logs · 14 días | Exports CSV / JSON | API pública con API keys |
| | Auto-mod, auto-borrado, formularios | Branding del bot por servidor | Auditoría del propio panel |
| | Niveles con recompensas por rol | Alertas de streaming ilimitadas | Roles de staff con permisos granulares |
| | Economía, tienda y casino | Anti-nuke y gate por edad de cuenta | SLA |
| | Tickets y sorteos | Backup y restauración | |

**Ancla de precio deliberada:** Pro a 4,99 € cubriendo tres servidores se compara con 3,99 € × 3 = 11,97 € de Carl-bot y 11,99 € × 3 = 35,97 € de MEE6. Esa comparación literal puede ir en la página de precios.

### Proveedor de pagos

**Stripe Billing.** Es el estándar para SaaS, tiene Customer Portal alojado —que elimina construir gestión de suscripción, cambio de tarjeta y cancelación— y Stripe Tax resuelve el problema fiscal internacional, inmediato en un producto de Discord.

**La alternativa que merece considerarse es Paddle**, que actúa como *merchant of record* y asume íntegramente la responsabilidad del IVA y los impuestos sobre ventas mundiales a cambio de una comisión mayor. Para un desarrollador individual que vende a cincuenta países, esa comisión suele salir más barata que el coste real de cumplir. **Evaluarlo en serio antes de comprometerse con Stripe.**

#### Integración con Express

- **Un módulo `modules/billing/`**, siguiendo el patrón Lego existente. Encaja sin tocar el kernel
- **Webhook** en `express.raw({type:"application/json"})` montado **antes** del `express.json()` global de `createApp.ts` — con el parser JSON delante, la verificación de firma falla siempre
- **Eventos:** `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`
- **Idempotencia** por `event.id` persistido: Stripe reintenta y los eventos llegan desordenados
- **Tablas nuevas:** `billing_customers` (usuario Discord ↔ customer de Stripe), `subscriptions` (estado, tier, periodo, cancel_at), `guild_entitlements` (qué servidor consume qué plaza)
- **La fuente de verdad del acceso es la base de datos, no Stripe.** El webhook actualiza la tabla; `can(guildId, feature)` lee sólo la tabla. Nunca consultar la API de Stripe en la ruta de una interacción de Discord

#### Consideraciones legales y operativas

- **Impuestos.** IVA en la UE, GST y equivalentes: obligatorios desde la primera venta, sin umbral mínimo para digitales en muchos países. Stripe Tax calcula pero **no declara por ti**; Paddle sí asume la obligación
- **Facturación internacional.** Facturas con los datos fiscales requeridos y validación de número de IVA para clientes B2B en la UE (inversión del sujeto pasivo)
- **Cancelaciones.** Degradar al final del periodo pagado, nunca al instante. Definir por escrito qué pasa con los datos que exceden el límite gratuito al degradar — recomendación: conservarlos en sólo lectura 30 días. **Perder los logs de alguien el día que le caduca la tarjeta es la forma más rápida de perder al cliente para siempre**
- **Reembolsos.** Política clara y publicada (14 días sin preguntas es el estándar y reduce las disputas, que salen más caras que el reembolso)
- **Requisitos de Discord.** Verificación de la app antes de las 100 guilds si se usan intents privilegiados, y justificación de `MessageContent`. Revisar las condiciones para desarrolladores respecto a monetización de bots; comparar el coste efectivo de un proveedor externo frente a las suscripciones de app nativas de Discord
- **Licencia.** El proyecto nació open source y **no se ha encontrado archivo de licencia en el repositorio**. Antes de comercializar hay que decidir explícitamente el modelo —open core, source-available o cierre— y documentarlo

---

## 9. Recomendaciones a la lógica existente

### Quick wins (< 1 día cada uno, sin dependencias)

- Poner TTL al mapa de `ephemeral` (`system-commands/ephemeral.ts`)
- Sustituir `cors({origin:true})` por allowlist explícita
- Borrar el handler `test_button_1` (`interactionRouter.ts:160`)
- Convertir los `await import()` del router de interacciones en imports estáticos
- Añadir `allowedMentions: {parse: []}` por defecto en los envíos del bot
- Cambiar `client:load` por `client:visible` en los paneles por debajo del pliegue
- Borrar los 4 shims `@deprecated` de `api/routes/`
- Añadir índices a `action_logs(guild_id, created_at)` y `mod_logs(guild_id)` — hoy **no tienen ninguno**
- Instalar Biome y añadir un workflow de GitHub Actions que corra `typecheck` en cada push

### El refactor que hay que hacer primero

**Un contexto de request único que reemplace los ocho `resolveGuildId()` duplicados.** Es la raíz tanto del fallo de aislamiento como de la imposibilidad de aplicar límites por tier de forma consistente.

```ts
// backend/src/core/http/guildContext.ts — nuevo
export interface GuildContext {
  guildId: string;
  userId: string;
  tier: "free" | "pro" | "business";
  can: (feature: FeatureKey) => boolean;
  limit: (key: LimitKey) => number;
}

export function requireGuildAccess(): RequestHandler {
  return async (req, res, next) => {
    const session = await getSession(req);            // cookie firmada, no el body
    if (!session) return res.status(401).json({ error: "No autenticado" });

    const guildId = req.params.guildId ?? req.query.guildId ?? req.body?.guildId;
    if (!isSnowflake(guildId)) return res.status(400).json({ error: "guildId inválido" });

    // MANAGE_GUILD verificado server-side contra Discord, con caché de 60 s.
    // Nunca a partir de lo que envía el cliente.
    if (!(await userManagesGuild(session.userId, guildId)))
      return res.status(403).json({ error: "Sin permiso sobre este servidor" });

    const tier = await getGuildTier(guildId);
    req.guild = { guildId, userId: session.userId, tier,
                  can: (f) => TIERS[tier].features.has(f),
                  limit: (k) => TIERS[tier].limits[k] };
    next();
  };
}
```

Con eso, cada router pierde su bloque repetido y gana la comprobación de tier gratis:

```ts
// antes — modules/economy/api/routes.ts
router.post("/funds", (req, res) => {
  const body = req.body as AdjustEconomyFundsRequest;      // cast, no validación
  const result = adjustEconomyFunds({
    ...body,
    guildId: resolveGuildId(req) ?? body.guildId,           // cae a env, sin auth
  });
  res.json(result);
});

// después
router.post("/funds", requireGuildAccess(), (req, res, next) => {
  const parsed = adjustFundsSchema.safeParse(req.body);     // zod, ya instalado
  if (!parsed.success)
    return res.status(400).json({ error: "Datos inválidos", issues: parsed.error.issues });

  try {
    res.json(adjustEconomyFunds({ ...parsed.data, guildId: req.guild.guildId }));
  } catch (err) { next(err); }                               // error handler central
});
```

### La capa de entitlements

Una sola definición de tiers, consultada de forma idéntica desde la API y desde los comandos del bot. **Construirla antes de integrar Stripe.**

```ts
// backend/src/core/entitlements/tiers.ts — nuevo
export const TIERS = {
  free: {
    features: new Set(["welcome", "levels", "economy", "logs", "automod",
                       "tickets", "giveaways", "forms", "custom-commands"]),
    limits: { logRetentionDays: 14, streamAlerts: 2,
              scheduledMessages: 25, storageMb: 100 },
  },
  pro: {
    features: new Set([...FREE_FEATURES, "analytics", "exports",
                       "antinuke", "branding", "backups"]),
    limits: { logRetentionDays: 90, streamAlerts: Infinity,
              scheduledMessages: 500, storageMb: 2048 },
  },
  business: { /* … */ },
} as const;
```

El mismo `can()` se invoca desde `system-commands/guard.ts`, que ya es el punto único por el que pasan los 45 comandos nativos — cablear los tiers del lado del bot es añadir una comprobación en una función que ya existe.

### Cuellos de botella actuales

- **`better-sqlite3` es síncrono.** Cada consulta bloquea el event loop, el mismo que sostiene el WebSocket del gateway. A un servidor le da igual; a mil, las consultas lentas se traducen en latencia de eventos de Discord
- **`ensureCoreTables()`, 600 líneas de DDL literal** en `db/client.ts` conviviendo con 40 migraciones de Drizzle. Dos fuentes de verdad del esquema que pueden divergir en silencio
- **Estado en memoria por proceso.** Los ~20 `Map` impiden escalar horizontalmente
- **Sesiones de blackjack en memoria** (`economy/commands/casino.ts:73`): se pierden en cada despliegue
- **`action_logs` sin índices ni particionado.** Es la tabla que más crece, se consulta por `guild_id` + `created_at` en el historial y en la retención, y **no tiene ni un índice**: cada consulta es un full scan
- **Hidratación uniforme `client:load`** en las 27 islas del panel

### Cambios estructurales, en orden

1. **Sesión y autorización** — sin esto nada más puede exponerse
2. **Contexto de guild unificado** — desbloquea el multi-tenant y prepara los tiers de una vez
3. **Capa de entitlements** — antes de Stripe, siempre
4. **Estado compartido fuera del proceso** (Redis o KV) — requisito previo del sharding
5. **Sharding y comandos globales** — el techo de 2.500 guilds
6. **Migración de base de datos** — cuando SQLite duela de verdad, no antes

---

## Nota final sobre el estado del proyecto

El diagnóstico de seguridad es duro, pero conviene leerlo en contexto: esto es un proyecto self-hosted de un solo desarrollador que funciona bien para lo que fue construido. La ausencia de autenticación es coherente con un bot pensado para correr en una red doméstica. **Lo que la convierte en crítica es la decisión de pivotar a SaaS.**

Y lo importante es que **los cimientos son buenos**: el registro modular, los tipos compartidos de extremo a extremo, el guard de permisos por comando y el esquema con `guild_id` en todas las tablas son decisiones que mucha gente no toma hasta que es tarde. Aquí ya están tomadas. Lo que falta es una capa de autorización sobre una base que la admite bien — no una reescritura.

---

## Fuentes

**Mercado:** [Comparativa de precios 2026](https://peakbot.pro/blog/ai-discord-bot-pricing-comparison-2026) · [MEE6 Pricing 2026](https://www.vibebot.gg/blog/mee6-pricing-explained) · [MEE6 Premium 2026](https://peakbot.pro/blog/mee6-premium-worth-it-2026) · [Dyno Premium](https://docs.dyno.gg/en/premium) · [Carl-bot Premium](https://carl.gg/get-premium) · [Arcane Premium](https://docs.arcane.bot/premium) · [Comparativa de 15 bots](https://peakbot.pro/blog/discord-bot-comparison-chart-2026)

**Plataforma:** [Límites de D1](https://developers.cloudflare.com/d1/platform/limits/) · [Precios de R2](https://developers.cloudflare.com/r2/pricing/) · [Conexiones salientes y Durable Objects](https://developers.cloudflare.com/changelog/post/2026-06-19-outbound-connections-keep-dos-alive/)
