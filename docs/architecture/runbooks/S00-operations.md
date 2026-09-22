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

A live Discord guild, Gateway resume against the provider, HTTP 429 from Discord, and a timed worker-kill recovery still have to be executed against a sandbox application before S0 is releasable.
