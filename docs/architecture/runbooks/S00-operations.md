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

Transport HTTP 429 is a Delivery response, not one of these gauges. There is no invalid-request circuit gauge yet.

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

## What this runbook does not demonstrate

A live Discord interaction, Gateway resume against the provider, and HTTP 429 from Discord still have to be executed against a sandbox application before S0 is releasable. Backup execution and the threat-model review are also still open. The Delivery and Control Plane relay restarts already recovered an accepted fact in under 60 seconds.
