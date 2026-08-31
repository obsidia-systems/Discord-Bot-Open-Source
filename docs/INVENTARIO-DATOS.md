# Inventario de datos — 37 tablas

> `develop` @ `2c6d9db` · `backend/src/db/schema.ts` (1.034 líneas) · 40 migraciones en `backend/drizzle/`
> Complemento de [AUDITORIA.md](../AUDITORIA.md) §2

## Modelo de tenant

`guild_settings` es la raíz. Todas las tablas de dominio llevan `guild_id` con `FOREIGN KEY … ON DELETE CASCADE` hacia ella, de modo que expulsar el bot de un servidor puede limpiar todo su rastro con un solo `DELETE`.

**Esta parte del diseño está bien hecha.** El aislamiento existe en el esquema; lo que falta es aplicarlo en la capa HTTP (ver [INVENTARIO-API.md](INVENTARIO-API.md)).

```
guild_settings (guild_id PK)
   └── CASCADE ──> las 35 tablas de dominio
bot_presence_settings  ← única tabla global (id fijo, sin guild_id)
```

## Hallazgo transversal: ausencia de índices

De 37 tablas, **sólo 5 tienen índices declarados** — las de economía añadidas en las migraciones 0037–0040. Las demás dependen únicamente de su clave primaria.

| Tabla | Volumen esperado | Se consulta por | Índice |
|---|---|---|---|
| `action_logs` | **El más alto del sistema** | `guild_id` + `created_at` (historial y retención) | **NINGUNO** |
| `mod_logs` | Alto | `guild_id`, `target_user_id` | **NINGUNO** |
| `warnings` | Medio | `guild_id` + `user_id` | **NINGUNO** |
| `form_responses` | Medio | `form_id`, `guild_id` | **NINGUNO** |
| `sent_embeds` | Medio | `guild_id` | **NINGUNO** |

Las tablas con PK compuesta (`user_xp`, `user_economy`, `economy_cooldowns`, `plugins_enabled`, `reaction_roles`, `canvas_event_settings`, `default_command_permissions`) sí obtienen un índice implícito por la PK, que cubre sus accesos habituales.

**Acción recomendada (quick win):**

```sql
CREATE INDEX idx_action_logs_guild_created ON action_logs(guild_id, created_at DESC);
CREATE INDEX idx_mod_logs_guild            ON mod_logs(guild_id, created_at DESC);
CREATE INDEX idx_warnings_guild_user       ON warnings(guild_id, user_id);
CREATE INDEX idx_form_responses_form       ON form_responses(form_id, created_at DESC);
CREATE INDEX idx_sent_embeds_guild         ON sent_embeds(guild_id, created_at DESC);
```

## Convenciones observadas

- **Timestamps:** `integer` (epoch ms), no `text`. Consistente en las 37 tablas
- **Booleanos:** `integer` 0/1
- **Estructuras complejas:** `text` con JSON serializado (`roles_mapping`, `questions`, `filters`, `channels_mapping`, `rewards`, `action_sequence`…). Pragmático en SQLite, pero **sin validación de esquema al leer** — si el JSON se corrompe, revienta en runtime
- **IDs:** `integer` autoincremental en tablas de configuración; `text` (UUID) en las de economía y logs

---

## Núcleo

### `guild_settings` — 5 columnas · raíz del tenant
| Columna | Tipo | Flags |
|---|---|---|
| `guild_id` | text | PK |
| `prefix` | text | NN, def `'!'` |
| `log_channel_id` | text | |
| `welcome_enabled` | integer | |
| `updated_at` | integer | |

### `plugins_enabled` — 4 col · PK compuesta `(guild_id, plugin_name)`
`guild_id`, `plugin_name` (NN), `enabled` (NN def 0), `updated_at`

### `bot_presence_settings` — 7 col · **única tabla global**
`id` (PK, def fijo), `status`, `activity_type`, `activity_name`, `stream_url`, `state`, `updated_at`

> Sin `guild_id`: la presencia del bot es global por diseño. En SaaS multi-tenant esto es correcto para el estado global, pero el branding por guild vive en `bot-profile` y no aquí.

---

## Roles

### `reaction_roles` — 6 col · PK compuesta `(message_id, emoji_key)`
`guild_id`, `channel_id` (NN), `message_id` (NN), `emoji_key` (NN), `role_id` (NN), `created_at`

### `auto_roles` — 4 col
`guild_id` (PK), `human_roles` (NN def `[]`), `bot_roles` (NN def `[]`), `updated_at`

### `reaction_roles_menus` — 8 col
`id` (PK auto), `guild_id`, `channel_id` (NN), `message_id` (NN), `mode` (NN def `'reactions'`), `roles_mapping` (NN def `[]`), `created_at`, `updated_at`

### `autoroles_registry` — 9 col
`id` (PK auto), `guild_id`, `channel_id` (NN), `message_id` (NN), `title` (NN def `'Autoroles'`), `type` (NN def `'BUTTONS'`), `roles_mapping` (NN def `[]`), `created_at`, `updated_at`

> Tres tablas para el mismo dominio (`reaction_roles`, `reaction_roles_menus`, `autoroles_registry`) son sedimento de tres iteraciones sucesivas. Candidato claro a consolidación.

### `xp_rewards` — 4 col
`id` (PK auto), `guild_id`, `level` (NN), `role_id` (NN)

---

## Canvas

### `welcome_settings` — 21 col
`guild_id` (PK), `channel_id`, `is_enabled`, `welcome_mode` (NN def `'card'`), `background_url`, `bg_filepath`, `blur_amount` (NN def 4), `primary_text`, `secondary_text`, `message_content`, `avatar_x/y/size` (NN def 960/380/280), `avatar_border_width` (NN def 8), `avatar_border_color` (NN def `#FFFFFF`), `text_x/y` (NN def 960/560), `font_size` (NN def 64), `text_color`, `text_layers`, `updated_at`

### `canvas_event_settings` — 21 col · PK compuesta `(guild_id, event_type)`
Mismas columnas que `welcome_settings` más `event_type` (`leave` · `ban` · `boost`).

> **Duplicación estructural:** 20 de 21 columnas son idénticas entre ambas tablas. `welcome_settings` podría ser una fila más de `canvas_event_settings` con `event_type='welcome'`. Es deuda técnica barata de saldar y elimina 21 columnas duplicadas.

---

## Moderación

### `warnings` — 6 col
`id` (PK auto), `guild_id`, `user_id` (NN), `moderator_id` (NN), `reason` (NN), `created_at`

> La tabla existe y el panel la consume, pero los slash `/warn`, `/warns` y `/clearwarns` **son stubs**.

### `mod_logs` — 9 col
`id` (PK auto), `guild_id`, `action` (NN), `target_user_id`, `target_channel_id`, `moderator_id` (NN), `reason` (NN def `''`), `meta`, `created_at`

> **`moderator_id` guarda el ID del bot** cuando la acción viene del panel (`service.ts:586`), no el del humano que la ordenó. Sin auth no hay humano que registrar; al añadir OAuth debe pasar a ser el `userId` de la sesión.

### `auto_mod_config` — 9 col
`guild_id` (PK), `enabled` (NN def 0), `filters` (NN def, JSON), `ignored_roles`, `ignored_channels`, `log_channel_id`, `warn_decay_days` (NN def), `punishments` (NN def, JSON), `updated_at`

### `auto_delete_config` — 4 col
`guild_id` (PK), `enabled` (NN def 0), `rules` (NN def `[]`, JSON), `updated_at`

---

## Action logs

### `action_logs_config` — 12 col
`guild_id` (PK), `enabled` (NN def 0), `routing_mode` (NN def `'GLOBAL'`), `global_channel_id`, `channels_mapping` (NN def `{}`), `ignored_channels`, `ignored_roles`, `ignore_bots` (def 1), `enabled_events` (NN def `{}`), `data_retention_days` (NN def **14**), `webhooks_mapping` (NN def `{}`), `updated_at`

> `data_retention_days` es el gancho natural para el tier de pago: 14 en Free, 90 en Pro, 365 en Business. **Ya existe** — no hay que añadir columna, sólo aplicar el límite.

### `action_logs` — 12 col · **sin índices**
`id` (text PK), `guild_id`, `category` (NN), `event_type` (NN), `executor_id`, `executor_tag`, `target_id`, `target_tag`, `channel_id`, `summary` (NN def), `details` (NN def, JSON), `created_at`

> Tabla de mayor volumen del sistema. Sin índice sobre `(guild_id, created_at)` pese a ser el patrón de acceso de `/api/logs/history` y del job de retención. **Es también la tabla que hará tocar el techo de 10 GB de D1.**

---

## Mensajes

### `embed_templates` — 6 col
`id` (PK auto), `guild_id`, `name` (NN), `embed_data` (NN, JSON), `created_at`, `updated_at`

### `sent_embeds` — 8 col
`id` (text PK), `guild_id`, `channel_id` (NN), `message_id` (NN), `title`, `embed_data` (NN, JSON), `created_at`, `updated_at`

### `scheduled_messages` — 9 col
`id` (PK auto), `guild_id`, `channel_id` (NN), `timezone` (NN def), `frequency` (NN def, JSON), `embed_data` (NN def, JSON), `is_active` (NN def), `created_at`, `updated_at`

> `timezone` por mensaje (migración 0030) — bien resuelto: no depende de la zona del proceso.

### `custom_commands` — 9 col
`id` (PK auto), `guild_id`, `name` (NN), `description` (NN def), `response_data` (NN def, JSON), `options` (NN def, JSON), `permissions` (NN def, JSON), `created_at`, `updated_at`

### `default_command_permissions` — 7 col · PK compuesta `(guild_id, command_name)`
`guild_id`, `command_name` (NN), `enabled` (NN def 1), `allowed_roles` (NN def `[]`), `ignored_channels` (NN def `[]`), `ephemeral` (NN def), `updated_at`

> Es la tabla que consume `system-commands/guard.ts`. **El punto de enganche natural para los tiers del lado del bot.**

---

## Formularios

### `guild_forms` — 17 col
`id` (PK auto), `guild_id`, `modal_title`, `button_label`, `embed_title`, `embed_description`, `embed_color`, `embed_image_url`, `embed_thumbnail_url`, `publish_channel_id`, `reception_channel_id`, `questions` (NN def, JSON), `cooldown_minutes` (NN def), `published_channel_id`, `published_message_id`, `created_at`, `updated_at`

### `form_responses` — 9 col
`id` (PK auto), `form_id` (FK), `guild_id`, `user_id` (NN), `username` (NN def), `display_name` (NN def), `avatar_url`, `answers` (NN def, JSON), `created_at`

> **Los datos personales más sensibles del sistema:** nombre, display name, avatar y respuestas libres de usuarios reales. Expuestos sin auth vía `GET /api/forms/:id/responses`. Al implementar GDPR/borrado de cuenta, esta es la tabla que importa.

### `interactive_forms` — 12 col · **legado**
Versión anterior de `guild_forms`. La migración 0031 la reemplaza y `db/client.ts:627-660` contiene código de migración de datos que copia `interactive_forms` → `guild_forms` si la nueva está vacía. **Candidata a eliminar** una vez confirmada la migración en todos los despliegues.

---

## Niveles

### `xp_config` — 27 col · la tabla más ancha
`guild_id` (PK), `enabled`, `text_xp_min/max`, `cooldown_seconds`, `voice_enabled`, `voice_xp_per_minute`, `stream_multiplier` (real), `xp_multiplier`, `ignored_roles`, `ignored_channels`, `level_up_channel_id`, `custom_multipliers` (JSON), `custom_channel_multipliers` (JSON), `level_up_format`, `level_up_message`, `level_up_embed_title`, `level_up_embed_color`, `level_up_show_thumbnail`, `level_up_image`, `live_leaderboard_channel_id`, `live_leaderboard_message_id`, `leaderboard_embed_title`, `leaderboard_embed_description`, `leaderboard_embed_color`, `leaderboard_show_thumbnail`, `updated_at`

> 27 columnas en una sola fila por guild mezcla tres dominios: reglas de XP, formato del mensaje de subida de nivel, y config del leaderboard en vivo. Funciona, pero cada nueva opción de presentación añade una columna. Un `text` con JSON para la parte de presentación lo contendría.

### `user_xp` — 5 col · PK compuesta `(guild_id, user_id)`
`guild_id`, `user_id` (NN), `xp` (NN def 0), `level` (NN def 0), `xp_frozen_until`

---

## Economía — 10 tablas

### `economy_config` — 7 col
`guild_id` (PK), `is_active` (NN def), `currency_name` (NN def), `currency_symbol` (NN def), `start_balance` (NN def), `transfer_tax` (NN def), `updated_at`

### `user_economy` — 9 col · PK compuesta `(guild_id, user_id)`
`guild_id`, `user_id` (NN), `wallet` (NN def), `bank` (NN def), `daily_streak` (NN def), `last_daily_at`, `last_weekly_at`, `last_monthly_at`, `updated_at`

### `economy_cooldowns` — 4 col · PK compuesta `(guild_id, user_id, command_key)`
`guild_id`, `user_id` (NN), `command_key` (NN), `available_at` (NN)

> **Los cooldowns sí están en base de datos** — bien hecho, sobreviven al reinicio y al sharding. Contrasta con los cooldowns de XP de texto y los buckets de anti-spam, que viven en `Map` en memoria.

### `economy_income` — 10 col
`guild_id` (PK), `daily_pay`, `weekly_pay`, `monthly_pay`, `streak_enabled`, `streak_bonus_percent`, `role_salaries` (JSON), `jobs` (JSON), `crimes` (JSON), `updated_at`

### `economy_shop_items` — 15 col · **1 índice**
`id` (text PK), `guild_id`, `name` (NN), `description`, `price` (NN def), `icon`, `stock`, `rewards` (JSON), `action_sequence` (JSON), `reward_type`, `reward_config` (JSON), `enabled` (NN def), `sort_order` (NN def), `created_at`, `updated_at`

> Coexisten `rewards`, `action_sequence` y `reward_type`+`reward_config`: tres generaciones del mismo concepto (migraciones 0037, 0038, 0040). Deuda a consolidar.

### `economy_purchases` — 9 col · **1 índice**
`id` (text PK), `guild_id`, `user_id` (NN), `item_id` (NN), `item_name` (NN), `price_paid` (NN), `status` (NN def), `metadata` (JSON), `created_at`

### `economy_user_boosts` — 8 col · **1 índice**
`id` (text PK), `guild_id`, `user_id` (NN), `module` (NN), `multiplier` (NN), `expires_at`, `purchase_id`, `created_at`

### `economy_owned_roles` — 9 col · **1 índice**
`id` (text PK), `guild_id`, `user_id` (NN), `role_id` (NN), `item_id`, `purchase_id`, `expires_at`, `delete_role_on_expire`, `created_at`

### `economy_owned_channels` — 8 col · **1 índice**
`id` (text PK), `guild_id`, `user_id` (NN), `channel_id` (NN), `item_id`, `purchase_id`, `expires_at`, `created_at`

### `economy_casino` — 8 col
`guild_id` (PK), `is_active` (NN def), `min_bet` (NN def), `max_bet` (NN def), `coinflip` (JSON), `roulette` (JSON), `blackjack` (JSON), `updated_at`

---

## Plugins

### `plugin_pokemon_config` — 10 col
`guild_id` (PK), `is_active` (NN def), `default_generation` (NN def), `language` (NN def), `embed_color` (NN def), `force_ephemeral`, `allowed_channels` (NN def `[]`), `allowed_roles` (NN def `[]`), `commands` (NN def, JSON), `updated_at`

> Único plugin con tabla propia. El patrón (`plugin_*_config` con `is_active`, `allowed_channels`, `allowed_roles`, `commands`) es el molde a reutilizar para Minecraft, osu!, Valorant y demás.

---

## Doble fuente de verdad del esquema

`db/client.ts` contiene `ensureCoreTables()`: **~600 líneas de DDL literal** (`CREATE TABLE IF NOT EXISTS`, `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` condicionales) que conviven con las 40 migraciones de `drizzle/`.

Es un «migrate-lite» defensivo para que el bot arranque sin haber corrido `drizzle-kit`, pero significa que **el esquema está definido en dos sitios que pueden divergir en silencio**. Antes de migrar de motor hay que consolidar en Drizzle y borrar el DDL literal.

---

## Preparación para multi-tenant

Lo que **ya está bien**:
- `guild_id` en las 36 tablas de dominio, con CASCADE
- Cooldowns de economía persistidos, no en memoria
- `data_retention_days` ya existe como columna — el gancho de tier está puesto

Lo que **falta** (ver [ROADMAP.md](../ROADMAP.md) §0.7):

```sql
-- tablas nuevas para la capa de billing
billing_customers   (user_id PK, stripe_customer_id, created_at)
subscriptions       (id PK, user_id, tier, status, current_period_end, cancel_at)
guild_entitlements  (guild_id PK, subscription_id, tier, assigned_at)
webhook_events      (event_id PK, processed_at)   -- idempotencia de Stripe
```

`guild_entitlements` es la tabla que consulta `can(guildId, feature)`. **La fuente de verdad del acceso es esta tabla, no la API de Stripe.**
