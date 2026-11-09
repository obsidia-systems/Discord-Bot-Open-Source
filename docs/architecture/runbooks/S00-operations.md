# S0 operations

Local topology is `tobot/compose.yaml`. Public origins are `https://www.tobot.test`, `https://docs.tobot.test`, and `https://dash.tobot.test`. This note names configuration and recovery steps. It does not contain secret values.

## Version and advisory policy

Rust is pinned by `tobot/rust-toolchain.toml` (1.98.0, edition 2024). Browser packages are pinned by `tobot/pnpm-lock.yaml` (Astro 7, React 19). Updates land as lockfile changes after reading the upstream advisory for that release. A known critical advisory in a direct dependency blocks release. Transitive advisories are reviewed in the same change and are not silently ignored.

## Configuration matrix

| Name | Mounted on | Must not appear in |
|---|---|---|
| `TOBOT_DISCORD_BOT_TOKEN` | Discord Edge, Delivery | Control Plane, browser apps, logs |
| `TOBOT_DISCORD_CLIENT_ID` | Control Plane | logs as a secret; the id itself is public |
| `TOBOT_DISCORD_CLIENT_SECRET` | Control Plane | Edge, browser apps, logs |
| `TOBOT_DISCORD_APPLICATION_ID` | Edge, Delivery, Control | logs beside tokens |
| `TOBOT_DATABASE_URL` | every Rust service and migrate | browser apps |
| `TOBOT_REDIS_URL` | Edge, Delivery, Control | browser apps |
| `TOBOT_INTERNAL_SERVICE_TOKEN` | Control and Delivery | browser apps, public responses |
| Vault Transit | Control | browser apps |

Startup rejects a missing required value. The public listener does not serve `/metrics`.

## Internal metrics

Scrape requires `Authorization: Bearer` with the internal service token. The body is a fixed list of numeric gauges. It has no tenant id, guild id, token, or cookie.

| Listener | Path | Network |
|---|---|---|
| Control Plane `TOBOT_CONTROL_METRICS_BIND` (compose `8083`) | `/metrics` | Not routed by Caddy. The public Control listener has no metrics route. |
| Delivery `TOBOT_DELIVERY_METRICS_BIND` (compose `8084`) | `/metrics` | Separate from the private Transport listener, which still returns 404 for `/metrics`. |
| Discord Edge health bind (`8082`) | `/internal/v1/metrics` | `/metrics` on that listener stays 404. |

| Signal | Gauge | Act when |
|---|---|---|
| Installation outbox age | `tobot_installation_outbox_oldest_age_seconds` | Unpublished age stays above 60 seconds. Restart the Control Plane relay; do not mark the row published by hand. |
| Installation lease expiry | `tobot_installation_outbox_expired_leases` | A dead owner still holds a lease past 15 seconds. The next claim must take a new fencing token. |
| Edge outbox age | `tobot_edge_outbox_oldest_age_seconds` | Same 60-second bar, on the Delivery relay. |
| Stream pending | `tobot_stream_pending` | The `query-status-s0` group has entries that stay pending across a Control Plane restart. The consumer name is `control-plane`. |
| Auth rejections | `tobot_auth_rejections_15m` | A spike of `oauth_rejected` or `install_rejected` in 15 minutes. Read the audit reason code, not the token. |
| Degraded installations | `tobot_degraded_installations` | A shell is `Degraded`. Repair is a new generation, not a deleted tenant. |
| Gateway session | `tobot_gateway_session_established` | `0` means the shard has no session. Readiness on `:8082` is the same fact. |
| Gateway heartbeat | `tobot_gateway_heartbeat_alive` | `0` after a session means the shard has not acknowledged a heartbeat. |

Delivery also publishes `tobot_transport_http_429` and `tobot_transport_invalid_requests_10m`. The invalid-request circuit opens in that process at 8_000 of Discord's 10_000 / 10-minute budget and is not yet shared across a second replica.

`https://admin.tobot.test` renders those gauges and each service's live/ready state. That origin has no session and no password. The scrape token stays on the admin server. `dash.*`, `www`, and `docs.*` do not serve this page, and their `/metrics` path stays rejected.

## Migrations

`tobot/bins/migrate` applies the embedded `sqlx` migrations forward. Services do not migrate on boot. Order is the numeric prefix under `tobot/crates/tobot-persistence/migrations`. A later incompatible shape follows expand, dual read, contract, then drop. Take a Postgres backup before a production migration. Point-in-time recovery requires WAL archiving on that Postgres; the local Compose volume is not a backup.

## Discord credential rotation

1. Issue the new bot token in the Discord application.
2. Update the Edge and Delivery secret mounts.
3. Restart those two processes. Control Plane does not receive the bot token.
4. Confirm Gateway readiness and one diagnostic interaction acknowledgement.
5. Revoke the previous token.

## OAuth rotation

1. Issue a new client secret.
2. Update only the Control Plane mount.
3. Restart Control Plane. Existing browser sessions keep working until their credential generation is rotated by a new login.
4. Revoke the previous client secret after the new process is ready.

## Install repair

A degraded guild home can start `GuildRepair`. That creates a new authorization generation, locks `guild_id`, sets `disable_guild_select=true`, and asks only for the S0 permission union (`0`, never Administrator). The callback records `Verifying` again. The previous tenant row is kept. `UserInstall` is a named preset and does not create a product installation.

## Dead relay

Outbox publication is fenced. A worker that dies mid-publish leaves the lease to expire (15 seconds). The next worker takes over only after `lease_expires_at` and must present a new fencing token. Do not mark a row published by hand. Restart the Delivery or Control process that owns the relay and confirm the stream consumer lag returns and the projection watermark moves. Recovery of an already-accepted fact is the relay restart, not a second Discord acknowledgement.

## Session compromise

Logout sets `revoked_at` immediately. A stolen cookie fails the next `authorize_session` check. Rotating `credential_generation` on the account invalidates every session still on the old generation. Idle lifetime is 12 hours. Absolute lifetime is 7 days and does not slide.

## Local restore

On 2026-09-22 `pg_dump -Fc` of database `tobot` was restored with `pg_restore` into a new database `tobot_restore` on the same Postgres. The copy matched the live database: both guild shells (generations 11 and 2, both `Installed`), 8 edge outbox rows, 4 installation rows, and migration 11. `tobot_restore` and the dump file were then removed. The live database was not replaced. This is not WAL point-in-time recovery; the Compose volume still has no archive.

## S0 threat review (local, 2026-09-22)

This is a review of the checks S0 can actually meet. It is not a release pass. Later-slice decisions in DR-025 through DR-049 that belong to billing, AI, workflows, assets, or moderation have no S0 tables and are not treated as passed.

| Check | Local result |
|---|---|
| DR-039 Redis after the outbox | `/probe` at 22:23:16Z returned `Acknowledged.` (`callback_ms` 380) while the relay could not resolve Redis. At 22:23:46Z the relay published the 2 waiting facts. Discord was not called again. |
| DR-059 `tenant_id` is not a snowflake | Shell routes use UUID v7. Discord guild ids stay in `provider_guild_id`. |
| DR-060 due-work lease | PostgreSQL proves a 15-second lease takeover. This session did not kill a worker again. |
| DR-025, DR-026, DR-027, DR-032, DR-049 | PKCE S256, single-use state, Origin plus CSRF header, discovery not used as install authority, permission union `0`, and idle/absolute session expiry are covered by the PostgreSQL tests and the control-plane code. A signed-in browser idle slide is still not shown. |
| DR-035, DR-036 | The bot token is mounted on Edge and Delivery only. Public `/metrics` stays rejected. |
| Forbidden §25 columns for Identity and Installation | Identity does not own the tenant registry or the bot token. Installation does not store login sessions, and `Installed` still requires both capabilities. A snowflake is not `tenant_id`. |
| Still open, deferred | See the deferred list below. The foreign-tenant click is done: on 2026-09-22 the signed-in operator opened `/guild/00000000-0000-7000-8000-000000000001` and the page reported no access. |

## Deferred checks

On 2026-09-22 the operator decided not to run these yet. They stay open. They are not passed, and they are not required before the empty-database demo.

| Check | Result on 2026-11-09 |
|---|---|
| Live duplicate interaction | Still open. No live `/probe` retry was captured in this run. The PostgreSQL duplicate receipt does not close it. |
| Slow consumer | Closed by the 2026-09-22 record. `/probe` was acknowledged at 22:23:16Z (`callback_ms` 380) while Redis could not be resolved. The same two outbox facts were published at 22:23:46Z. The acknowledgement did not wait for the bus. Redis was not stopped again. |
| Acknowledgement p99 | Still open. Three live samples are not a percentile, and this run did not invent one. |
| Invalid-request circuit on a second replica | Still open. Compose runs one Delivery process, `tobot-delivery-1`. |
| Session idle on a disposable database | Closed for the mechanism. `oauth_replay_and_revoked_session_fail_closed_in_postgres` passed on disposable `tobot_test`: an `idle_expires_at` in the past was not authorized and did not match CSRF. A presented unknown session cookie on `GET /api/v1/session` returned HTTP 401 and `Set-Cookie` `__Host-tobot_session=; Max-Age=0`. The operator's live session was not changed. |
| Browser idle slide and the 7-day cap | Still open. A seven-day browser wait adds no new fact. The disposable result above does not sign that wait. |
| Point-in-time recovery | Still open. Compose Postgres has no WAL archive. The earlier `tobot_restore` dump is not point-in-time recovery. |
| Clean CI bootstrap | Still open. Workflow run `42572415619` on `codex/s0-platform-skeleton` finished in 38s: `browser` succeeded, `rust` failed `cargo fmt` in `tobot-envelope`. The workflow builds and tests. It does not start every binary and browser app. |
| Installed shell refresh | Still open. This run had no operator session, so `/guild/01a0c830-c467-70fb-a89e-40a77dc81748` was not reloaded while signed in. |
| Threat-review sign-off | Still open. The 2026-09-22 review stays recorded. It does not clear the release gate while the rows above remain deferred. |

## What this runbook does not demonstrate

The deferred rows above. The live install, `/probe` while Redis was down, the relay line after Redis returned, and the absence of a duplicate Discord message are already recorded. Repeating them on an empty database is not pending.
