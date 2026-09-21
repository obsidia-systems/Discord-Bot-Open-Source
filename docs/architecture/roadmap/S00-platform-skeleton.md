# Tobot S0 — Platform Skeleton

[Roadmap](../26-implementation-roadmap.md) · [Method](../25-implementation-roadmap-method.md) · [Architecture index](../README.md)

## Plan status

| Attribute | Value |
|---|---|
| Status | In progress; implementation is authorized only by the approved S0 scope and remains incomplete |
| Slice | S0 — Platform skeleton |
| Outcome | A guild can install the application; Gateway accepts and acknowledges an interaction; an operator can authenticate at `app.*` and see an authorized guild shell. |
| Normative inputs | 01 §3.1–3.3; 02 §6.2–6.4 and Edge, Control, Transport modules; 03 §8.1–8.2 and used §8.6 leaves; 04 §9.1–9.2; 07 §12.1–12.2; 11 §§13–16; 12 §§17–18; 13 §22; 14 §25; 23 §§34.4–34.7; 00 §§6–9; 25 §§5–8. |
| Non-normative implementation profile | Rust workspace with Axum/Tokio, `sqlx` and versioned SQL migrations, Redis Streams after transactional outbox, Twilight behind Discord ports, Astro/React/Tailwind for browser apps. Exact versions are selected and locked during Work Package 0 from current primary documentation. |
| Explicit dependency | None |
| Next slice unlocked by this plan | S1 only after every S0 exit criterion is demonstrated honestly. |

This is an implementation plan, not an amendment to RFC sections 01–23. Where it conflicts with an RFC, the RFC wins. It deliberately specifies S0 enough for separate agents to implement coherent pieces without deciding S1 product behavior.

## Execution tracking

This section records observed implementation progress on `codex/s0-platform-skeleton`. It is not normative: the requirements and exit evidence below remain the release bar. A work package is **Complete** only after all of its stated exit evidence has been demonstrated, not merely after its primary code path exists.

**Last reviewed:** 2026-09-19

**Branch:** `codex/s0-platform-skeleton`
**Overall release status:** Not ready for S1. No S0 release gate is fully demonstrated yet.

| Work package | Status | Implemented evidence | Exit evidence still required |
|---|---|---|---|
| WP0 — Repository contract | Partial | Rust workspace, three service binaries, three Astro app packages, Compose/Caddy local topology, Vault/Postgres/Redis wiring, lockfiles, configuration validation, migrations and workspace build/test commands. | CI matrix, documented version/advisory policy, production configuration matrix and operator runbooks; demonstrate clean bootstrap for every binary and browser app. |
| WP1 — Contracts/primitives | Partial | Versioned S0 event envelope, Edge/Installation outboxes, inboxes, Redis Streams relays/consumer group, transactional receipts, claims, leases and fencing. | Command-envelope admission, automated relay/consumer restart and lease-takeover recovery tests, and genuine N/N-1 reader support (current parser accepts only major v1). |
| WP2 — Discord Edge/Transport | Partial | Gateway-only Edge path, technical deduplication, durable interaction receipt, typed callback/defer, private Delivery transport, OAuth/guild typed operations, public interaction route rejection. | Endpoint/shard lifecycle, identify concurrency, resume/reconnect and per-shard readiness; fair route/global/guild/channel rate scheduling; provider-sandbox deadline, resume and 429 tests. |
| WP3 — Identity/install | Partial | Server-held PKCE, single-use OAuth transactions, encrypted secret storage through Vault Transit, opaque sessions + CSRF, bounded guild discovery, generation-bound GuildInstall callback and asynchronous verification. | Refresh/revocation lifecycle, actual UserInstall/GuildRepair behavior, durable repair plan, complete capability projection/retry policy, audit-fact coverage, and OAuth/session/CSRF/install negative integration tests. |
| WP4 — Browser/Query | Partial | Durable Installation-state projection into Query and authenticated tenant-scoped guild-shell API. | `app` UI/routes/islands, login and callback UX, server-side route guards, accessible guild picker/home/degraded states, freshness rendering and browser-level authorization tests. |
| WP5 — Operations/release | Partial | JSON tracing, request IDs, Control liveness/readiness including Vault, Caddy CSP and public `/metrics` rejection, and initial secret separation. | Internal metrics/alerts, service-specific readiness, redaction tests, backup/migration/incident runbooks, CI/security checks, threat-model review and recovery smoke tests. |

### Release-gate ledger

| Gate | Status | Current assessment |
|---|---|---|
| 1. Gateway durability/deadline | Partial | Durable interaction acceptance exists; full Gateway lifecycle, shard health and provider deadline proof are pending. |
| 2. Interaction acknowledgement | Partial | Typed callback/defer path exists; no real/sandbox p99 and failure-mode proof yet. |
| 3. Transport governance | Partial | Discord HTTP is isolated in Delivery; scheduler and invalid-request protection are incomplete. |
| 4. Durable cross-service facts | Partial | Transactional outbox and Query consumer are present; restart/recovery proof remains. |
| 5. Login/session security | Partial | Core PKCE/session/CSRF path exists; refresh lifecycle and comprehensive negative tests remain. |
| 6. Install authorization | Partial | GuildInstall authority revalidation is present; named presets and repair behavior are incomplete. |
| 7. Capability verification | Partial | Async `Verifying → Installed/Degraded` path exists; repair plan and robust evidence/retry remain. |
| 8. Authorized browser shell | Partial | Authorized API exists; browser shell is not implemented. |
| 9. Operability/security | Partial | Initial hardening exists; observability, runbooks and release review remain. |
| 10. End-to-end release demonstration | Not started | Requires the preceding gates and an honest clean-environment demonstration. |

**Implemented commit sequence:** `706d52e`–`63f9416` (Vault/secret store, Control readiness, Identity OAuth/session/discovery, installation, asynchronous capability verification, and Query projection). New implementation work must update this ledger in the same change set, including a linkable commit or test/runbook artifact and the remaining exit evidence.

## 1. Scope and acceptance boundary

### 1.1 The thin vertical slice

S0 proves one platform path across the required failure domains:

```mermaid
sequenceDiagram
    participant Admin as Guild administrator
    participant App as app.*
    participant Control as Control Plane
    participant Install as Installation
    participant Discord
    participant Edge as Discord Edge
    participant Delivery as Delivery
    participant Query as Query and Status

    Admin->>App: Sign in with Discord
    App->>Control: OAuth start/callback
    Control->>Install: Authorized GuildInstall request
    Install-->>Admin: Single-use authorization URL
    Admin->>Discord: Add application to selected guild
    Discord-->>Control: Installation callback
    Control->>Install: Durable callback receipt; state = Verifying
    Install->>Discord: Inspect presence and installation context
    Install->>Query: Publish installation health projection
    Discord->>Edge: INTERACTION_CREATE
    Edge->>Delivery: Typed initial interaction callback
    Delivery-->>Discord: Immediate acknowledgement or defer
    App->>Query: Cookie-authenticated REST poll
    Query-->>App: Authorized guild and explicit freshness/health
```

The interaction is a platform probe, not a product command. It may be a narrowly registered built-in diagnostic interaction that replies or defers with a static, mention-safe acknowledgement. It must not introduce S1 moderation, S2 messaging configuration, a general custom-command runtime, a full command registry, or a new product module. Its durable fact is `InteractionAccepted`; the acknowledgement itself never waits for outbox publication.

### 1.2 In scope

- A greenfield `tobot/` workspace and reproducible local/CI bootstrap.
- The S0 portions of three deployable services: **Discord Edge**, **Delivery**, and **Control Plane**. These are separate binaries/processes even if local development starts them together.
- Gateway-only interaction ingress: session lifecycle, relevant dispatch ingestion, durable deduplication, in-process handoff of `INTERACTION_CREATE`, and typed interaction callback/defer.
- A minimal governed Transport adapter: Discord Gateway/WebSocket ownership in Edge; Discord HTTP only in Transport; OAuth token exchange/current-user/guild-list/install inspection as distinct credential classes.
- Versioned JSON event and command-envelope library, parse boundary, inbox/outbox relay, Redis Streams consumer topology, tenant partitioning, and recovery-safe claims.
- Identity/session, OAuth login, CSRF, discovery observations, Guild Install generation/callback/verification, opaque tenant registry, and Query read model needed for the shell.
- `docs.*`, `www`, and `app.*` Astro applications. `app.*` has only login, OAuth callback handling, guild picker, guild home, and a clearly non-authoritative “not enabled” state.
- Operational baseline: structured, redacted telemetry; health/readiness semantics; internal-only metrics; secret boundaries; migrations, automated tests, and a runnable demo environment.

### 1.3 Explicitly out of scope

- S1–S8 behavior, including moderation cases, Delivery message workflows, role mutation, community, support, money, billing, provider-event HTTP, AI, templates, workflows, and voice.
- Discord outgoing-interaction webhook ingress. Gateway and webhook modes must not coexist; S0 rejects the public webhook route rather than leaving a dormant handler.
- Application Command Registry projection, full slash-command catalog, custom commands, component routing, follow-up delivery, or a Discord product UI. The probe is the sole exception and is not a registry foundation.
- Capability completeness beyond the installation probe, message rendering/assets, reconciliation workflows, scheduler, product configuration, full dashboard IA, product WebSocket, or SSE.
- Public dashboard writes beyond login/logout and installation/repair admission. Nothing in S0 treats a guild-list observation, a callback query field, a client `tenant_id`, or a Discord permission bitfield as authorization.
- Billing, entitlement, Administrator permission, payment/webhook credentials, `www`/`docs.*` OAuth, browser-held Discord tokens, and parent-domain cookies.

## 2. Fixed architectural decisions for S0

| Concern | S0 decision and boundary |
|---|---|
| Service topology | Deploy Discord Edge, Delivery, and Control Plane independently. Edge owns Gateway + Interaction Edge; Delivery owns Capability, Delivery Orchestrator, Transport, and thin Reconciliation; Control owns Control API, Query/Status, Identity/Session, and Installation. Co-location inside those service boundaries does not permit shared writable tables or bypassing a module owner. |
| Browser surfaces | Three origins: sessionless `docs.*`, sessionless `www`, and cookie site `app.*`. `www` only navigates by GET to `app.*` login. OAuth, cookies, mutations, and REST polling terminate only at `app.*`. |
| Interaction ingress | Gateway `INTERACTION_CREATE` only. Gateway hands it in-process to Interaction Edge, which reserves it idempotently and calls a typed Transport interaction-callback operation within Discord’s three-second limit. |
| Discord egress | Transport is the only Discord HTTP client. It owns connection reuse, header-driven route/global rate limiting, invalid-request protection, fair admission, normalized errors, and typed operations. No domain module, Identity, Installation, browser app, or raw SDK type crosses that boundary. |
| Contracts | UTF-8 versioned JSON event and command envelopes. Unknown additive fields are tolerated; live readers accept major N and N-1; unsupported majors fail closed and are observable. A `*Requested` event is a fact, never an imperative command. |
| Persistence and bus | PostgreSQL owner stores with versioned forward SQL migrations; each transactional module has sibling inbox/outbox tables. Cross-service facts use the transactional outbox then Redis Streams. `LISTEN/NOTIFY` is a wake-up hint only; Redis Pub/Sub and an in-memory queue are not durable authority. |
| Tenant boundary | Installation owns the opaque `TENANT` registry. S0 accepts only `Guild` and `User`; a `tenant_id` is never a Discord snowflake. Every tenant read/mutation/cache key binds a server-authenticated tenant predicate and fails closed if absent or mismatched. |
| Auth | Discord authorization-code flow with server-side PKCE S256 verifier and single-use state. Browser gets only an opaque server-side session ID in a host-only Secure/HttpOnly/`SameSite=Lax` cookie. Cookie-authenticated mutations require both allowed Origin (or Referer equivalent) and a session-bound CSRF proof. |
| Install | Named `GuildInstall`, `UserInstall`, and `GuildRepair` presets; S0 enables only its declared manifest. Permission union is calculated from enabled named permissions, never default Administrator. Guild-targeted URL locks `guild_id` and sets `disable_guild_select=true`; callback fields are hints pending revalidation. |
| Fairness and recovery | Guild-scoped facts partition by guild ID (or a stable hash bucket). Due-work/outbox claims use a 15-second Clock-port TTL, heartbeat at most five seconds, fencing tokens, and recovery below 60 seconds. Gateway shard/session leases are separate. |

## 3. Implementation sequence and ownership

Work packages are ordered by dependency. A package may begin design review before its predecessor completes, but no package may merge against a contract or ownership decision still open in an earlier package.

### WP0 — Repository contract and decision freeze

**Goal:** create a buildable, reproducible skeleton before product-facing code exists.

1. Create the greenfield Rust workspace and separate browser-app workspaces under the layout in roadmap method §7.1. Do not reuse the current Adobos TypeScript monorepo as a code or naming baseline.
2. Establish crate/application ownership, dependency boundaries, Cargo/npm lockfiles, MSRV/toolchain policy, format/lint/test commands, CI matrix, local compose environment, and configuration schema.
3. Resolve exact, supported 2026 versions from each technology’s primary documentation at this point; pin them in lockfiles and record version plus security-advisory update policy. Prefer maintained stable releases with Rust MSRV compatibility. This is a lockfile decision, not an RFC dependency or a reason to add a framework.
4. Define ports before adapters: Clock, PostgreSQL transaction store, bus, secret store, Gateway, typed Transport, Discord Capability, and browser-to-Control API. Domain-facing crates expose owned DTOs and errors, never Twilight/Axum/SQLx types.
5. Define service configuration validation. It must reject startup when required secrets, exact OAuth redirect configuration, application ID, database/bus connectivity, or service identity are missing. The public listener must not expose `/metrics`.

**Exit evidence:** fresh checkout can format, lint, type-check, unit-test, build all three service binaries and three web apps, then start the local topology with no secret values printed.

### WP1 — Canonical contracts and durable platform primitives

**Goal:** make durable acceptance and cross-service collaboration correct before Discord behavior is added.

1. Implement event and command envelope parsers/serializers for §8.1 and §8.2 with a schema registry that has an explicit allowlist of S0 leaves: `GatewayEventAccepted`, `InteractionAccepted`, identity/session facts, and installation/health facts selected by their owners. Reject unknown S0 leaf names, malformed envelope JSON, invalid version, invalid timestamp/identity fields, and all money-plane families.
2. Preserve raw envelope bytes for audit, but validate before constructing domain values. Contract parsers tolerate unknown additive fields only after known-field validation.
3. Create per-owner inbox, outbox, consumer-cursor, and idempotency-receipt primitives. The transaction which accepts a new fact persists the aggregate/receipt and its outbox row atomically. A duplicate returns the prior receipt and does not republish an effect.
4. Implement outbox dispatch after commit to a dedicated Redis Streams deployment/database that cannot be cache-evicted. Consumer applications use their own inbox plus durable partition cursor; they never read another owner’s outbox table.
5. Implement bounded claiming with `FOR UPDATE SKIP LOCKED`, Clock-port time, leased/fenced attempts, bounded retry classification, and `LISTEN/NOTIFY` only as latency hint. Record lease age, outbox lag, and redelivery metrics.
6. Provision private owner schemas/databases and migration discipline: explicit columns, parameterized queries, no cross-owner SQL, no production auto-migration/schema push, and expand/contract rules documented in the migration runbook.

**Exit evidence:** duplicate inbox, duplicate publication, process kill during relay, consumer restart, N/N-1 compatibility, N-2 rejection, and a lease takeover all have automated tests and observable receipts.

### WP2 — Discord Edge and governed Transport

**Goal:** accept Gateway work durably and meet the interaction deadline without allowing it to inherit product latency.

1. Implement Gateway lifecycle: fetch endpoint/shard guidance, jittered heartbeats, Identify concurrency/session-start limiting, Resume preference, reconnect, shard-specific health, and the least Gateway intents required for S0. Event decoding is bounded by payload size and queue capacity; only explicitly disposable telemetry may be shed.
2. Normalize relevant dispatches into an envelope with application, shard, session, sequence, correlation, timestamps, and Discord guild correlation. Technical deduplication key is application + shard + session + sequence, not timestamp.
3. Persist Gateway inbox + outbox in one transaction before publishing relevant non-interaction facts. Keep short-retention raw data under the Edge owner only; no product configuration lookup or Discord HTTP occurs in Gateway Edge.
4. On `INTERACTION_CREATE`, hand off in-process before bus publication. Interaction Edge authenticates/validates the application, installation context, interaction lifetime, and duplicate reservation. It chooses a static immediate acknowledgement or defer only; it must record acknowledgement outcome and expiry.
5. Implement typed Transport operations for interaction callback/defer, OAuth token exchange, current-user read, user guild discovery, installation/bot presence inspection, and only the capability checks S0 needs. Separate credential pools and log fields for bot token, OAuth tokens, and client secret.
6. Transport learns Discord rate limits from responses, honors `Retry-After`, bounds global/route/guild/channel concurrency, and schedules tenant work fairly. It rejects arbitrary endpoint/path requests and raw Discord SDK objects.
7. Explicitly reject outgoing interaction-webhook HTTP routes in S0. Preserve the future port boundary but do not mount an implementation or verification bypass.

**Exit evidence:** a real/sandbox guild interaction is acknowledged or deferred p99 under one second and always before three seconds under duplicated events, Redis outage, slow consumer, and outbox lag. Gateway resume/identify behavior and HTTP 429 handling are provider-sandbox tested.

### WP3 — Identity, session, tenant, and installation vertical

**Goal:** make browser authentication and installation independently secure and verifiable.

1. Define Identity-owned records: platform account, external identity link, OAuth transaction, authorization session, session generation/revocation, CSRF secret, discovery observation, and audit event. Tokens are encrypted/secret-referenced server-side and never enter events, browser state, ordinary logs, traces, or metrics.
2. Implement login start/callback: generate cryptographically random single-use state and server-side S256 verifier; bind client class, exact redirect URI, scope set, creation/expiry, and browser transaction context; atomically consume before Transport token exchange. Reuse, mismatch, expiry, missing verifier, unexpected scope, or provider failure produces terminal audited rejection.
3. Issue a rotated opaque session after successful login. Enforce current account state and credential generation on every request; idle lifetime is 12 hours sliding and absolute lifetime is seven days from creation. Logout/revocation invalidates server state immediately.
4. Implement Control API session middleware and CSRF policy. Apply Origin allowlist and session-bound synchronizer/double-submit proof to every cookie-authenticated mutation. Do not mistake `SameSite=Lax`, an Origin check, or the session cookie for the CSRF proof.
5. Define Installation-owned records: opaque tenant registry, installation aggregate, authorization generation, frozen module manifest/permission union, callback receipt, verification observations, per-module capability health, and repair plan. Identity must not create tenant rows.
6. Implement named authorization presets. `GuildInstall` is the S0 usable path; `UserInstall` is a validated named preset but has no product outcome; `GuildRepair` creates a new generation and asks only for the proven missing named permission delta. The S0 manifest must remain minimal and have an explicit empty/no-extra-permission rationale if its interaction probe needs none.
7. On callback, durably record `Verifying` immediately; do not wait for inspections. Revalidate actor/session, provider-observed guild/application/bot presence, and only then create/reuse the opaque Guild tenant. Treat callback `guild_id`/`permissions` as hints. Mark `Installed` only when every required enabled-module capability is `Healthy`; otherwise preserve `Degraded`, `Pending`, or `Removed` with per-module reasons. `Removed` never deletes the tenant.
8. Build the S0 Capability projection/preflight necessary to support installation health and current guild authority. Discovery freshness is at most 15 minutes; stale/absent authority fails closed for installation and repair, using typed Transport inspection as needed. Do not overbuild later moderation/role capabilities.

**Exit evidence:** all OAuth replay/PKCE/redirect/CSRF/session-expiry/revocation negative paths are automated; a guild installation progresses `Verifying → Installed` only after observed evidence; missing capability yields `Degraded` with an operator-readable repair plan and no Administrator request.

### WP4 — Browser shell and Query projection

**Goal:** make the operator path usable without inventing settings screens or a second authority.

1. Create static, sessionless `docs` and `www` Astro apps. `www` contains a normal GET login navigation to `app.*`; neither app exposes OAuth callback, cookie-authenticated API, session read, commands, or user-specific rendered data.
2. Create the `app` Astro application with small React islands only where interactivity is needed. Implement routes for login, OAuth completion/error, guild picker, `/dashboard/guild/:tenant` home (or equivalent stable tenant route), and a “not enabled/degraded” screen. Route guards validate the opaque session server-side.
3. Query and Status consumes only public owner facts and creates a rebuildable tenant-scoped projection for discovery, selected installation, installation health, health freshness watermark, and neutral S0 probe status. It is never a write authority and shows bounded staleness explicitly.
4. Expose cookie-authenticated REST polling from `app.*`; every response binds tenant predicate from session-derived authority, not route parameter alone. Use cache-control appropriate to authenticated state and avoid user/tenant data in shared caches.
5. Implement accessible baseline UI: semantic landmarks, keyboard guild selection, visible focus, error summaries, loading/error/no-access states, no raw HTML interpolation, and CSP with `default-src 'self'`. No product WebSocket or SSE.

**Exit evidence:** unauthenticated users cannot read a guild route; a user sees only permitted discovery observations; selecting a guild never grants authority; an installed/degraded/not-enabled shell survives refresh and reports projection freshness.

### WP5 — Operations, security hardening, and release readiness

**Goal:** ensure S0 is operable under the failure cases it claims to survive.

1. Implement structured logs and OpenTelemetry traces with one allowlist shared by both. Include correlation/causation, service, module, outcome class, bounded IDs, and freshness/lease data; exclude tokens, cookie bytes, authorization codes, PKCE verifiers, Discord content, and other payload bodies.
2. Expose liveness/readiness separately. Gateway readiness is per shard; Transport readiness requires rate-limit coordination and credentials; Identity callback readiness requires transaction/session store, exact redirect configuration, secret access, and exchange capability; Installation health is a projection, not process liveness.
3. Publish metrics only on an internal listener protected by network policy, mTLS, or authenticated scrape. Public listeners expose no tenant IDs, secrets, or metrics. Add alerts/runbooks for Gateway disconnect/reconnect, unacknowledged interaction deadline risk, outbox age, stream consumer lag, lease expiry, Transport rate-limit/invalid-request circuit, OAuth rejection spikes, and installation degradation.
4. Enforce least-privilege secret mounting: bot token only on Gateway and Transport; Identity gets OAuth client credentials/token store access; Control gets no bot token; browser apps get public configuration only. Rotate test credentials and prove redaction in failure logs.
5. Produce deployment manifests for local Compose and portable production containers, database backup/PITR prerequisites, migration ordering, readiness-aware rollout, and operator runbooks for Discord credential rotation, OAuth rotation, install repair, dead relay recovery, and session compromise.
6. Conduct an S0 threat-model/release review against DR-025 through DR-049, DR-059, DR-060, and the S0 forbidden columns in §25. A failed mandatory check blocks release rather than becoming a backlog item.

**Exit evidence:** a clean environment can deploy, migrate forward, recover an outbox worker kill within 60 seconds, show correct readiness, and prevent public metrics/token exposure in an automated smoke test.

## 4. Contracts and service interfaces to freeze before parallel implementation

### 4.1 S0 event and command allowlist

The contract crate must establish the envelope mechanics once. Each owner then adds its leaf schema in its own namespace/review. At S0, do not create speculative schemas for later slices.

| Flow | Owner | Contract form | Minimum semantic requirement |
|---|---|---|---|
| Gateway accepted | Gateway Edge | Event `GatewayEventAccepted` | Contains technical ingestion identity, correlation and provider/guild correlation; deduplicated by session sequence. |
| Interaction accepted | Interaction Edge | Event `InteractionAccepted` | Exists only after Gateway-mode authenticity and idempotent reservation; acknowledgement outcome is separately recorded. |
| Dashboard admission | Control API → owner | Command envelope over in-process/command-HTTP | Carries actor, target tenant, idempotency key, deadline, trace context; owner binds authenticated tenant predicate and returns admit/reject without waiting for a Discord effect. |
| Login and session lifecycle | Identity and Session | Owner facts | Emit only named audit-safe outcomes; no credential material. |
| Installation lifecycle | Discord Installation | Owner facts | Generation-bound install/callback/verification/capability-health facts; no callback query field is trusted as authority. |
| Query projection | Query and Status | Consumes owner events | Projection is disposable, tenant-scoped, carries last processed position/watermark, and is not an event-to-command bridge. |

Before coding, name the exact `schema_name` leaves for Identity and Installation in a short contract decision attached to their owner crate. The naming must conform to §8.6 and be reviewed with the envelope registry. It must not rename or repurpose later public vocabulary.

### 4.2 Typed Discord operations

Transport accepts a closed set of typed requests, not arbitrary REST methods:

- `RespondToInteraction` and `DeferInteraction` for the S0 probe;
- OAuth authorization-code exchange, refresh/revocation only where Identity needs it, current-user read, and current-user guild discovery under the OAuth credential class;
- application/guild/bot installation/presence inspection under the appropriate application/bot credential class;
- capability inspection requests needed to establish S0 installation health.

Each request has a correlation ID, bounded deadline, credential class, typed response/error class, idempotency/receipt semantics where the provider supports it, and redacted audit metadata. Later generic message/role operations are not hidden behind an escape hatch.

### 4.3 Command admission matrix

| Browser request | Control API responsibility | Owning module decision | Required freshness |
|---|---|---|---|
| Start login | Create/bind OAuth transaction; redirect | Identity owns transaction | N/A |
| OAuth callback | Validate browser route and pass callback | Identity consumes transaction and exchanges code through Transport | Exact redirect + single-use transaction |
| View discovery | Validate session; return Query projection | Identity observation is presentation only | ≤15 minutes, explicitly marked |
| Select/view guild | Validate session and tenant-scoped projection read | Query binds tenant predicate; no authorization grant | Session/current account valid |
| Request GuildInstall/Repair | Validate session, CSRF, request shape; command Installation | Installation revalidates current guild authority and manifest | Live server-side authority; recent step-up is reserved for higher-risk future operations |
| Installation callback | Route receipt only | Installation persists `Verifying`, then verifies asynchronously | Callback values are hints, not authority |

## 5. Data and migration plan

### 5.1 Owner data boundaries

| Owner | S0 authoritative records | May project/read | Must not own/write |
|---|---|---|---|
| Gateway/Interaction Edge | shard/session checkpoints, ingress inbox, interaction receipt/ack outcome, short-retention raw envelope metadata, Edge outbox | installation context required for interaction validation | product aggregates, OAuth/session data, Discord HTTP receipts |
| Delivery/Transport | rate-limit state, typed request receipts, transport health, delivery/interaction callback attempt data, thin reconciliation state, service inbox/outbox | disposable capability facts | bot token outside Gateway/Transport; Identity/Installation aggregates |
| Identity and Session | account, external identity link, OAuth transaction, server-side token reference, authorization session, CSRF secret, revocation/generation, discovery observation, audit, inbox/outbox | none as authoritative installation truth | tenant registry, installation health, bot token |
| Discord Installation | `TENANT`, installation/generation/manifest, callback receipt, verification observations, capability health, repair plan, inbox/outbox | current Identity/session and Capability evidence via ports/projections | login sessions, raw OAuth tokens, product configuration |
| Query and Status | rebuildable per-tenant shell projection and watermark | public facts only | authoritative writes, authorization policy, tenant registry insertion |

### 5.2 Schema rules

- Use UUIDv7/ULID (one selected convention) for platform identities. Discord snowflakes remain provider references/correlation fields.
- All tenant-scoped tables, inbox/outbox rows, cache keys, and object keys include tenant scope; repository APIs require a server-bound tenant context, not a bare ID.
- Use explicit columns and selected projections; prohibit `SELECT *`, cross-owner foreign-key assumptions, and cross-owner joins.
- Every new owner schema starts with versioned forward migration infrastructure. Production deploys run reviewed migrations; no runtime auto-migrate or schema push.
- Additive S0 changes may be one-step expands. Any later incompatible shape follows expand → dual write/read → contract → 24-hour post-old-replica soak → drop.
- Retention windows for Edge raw envelopes and OAuth transaction/audit records must be decided with security/privacy owners before production; they cannot default to indefinite storage.

## 6. Security checklist required at merge time

| Control | Required S0 proof |
|---|---|
| OAuth/PKCE | State single-use and atomically consumed; exact redirect and scope binding; S256 verifier server-side; replay and `plain` rejected. |
| Session | Opaque ID only; Secure/HttpOnly/host-only `app.*`/`SameSite=Lax`; server-side idle/absolute expiry and revocation generation enforced. |
| CSRF | Allowed Origin/Referer plus session-bound proof on every cookie mutation; negative tests show either factor alone fails. |
| Tenant isolation | Database/repository/query tests prove a globally unique resource ID cannot bypass the bound tenant predicate; cache keys carry tenant scope. |
| Install safety | Manifest permission union has reviewable named sources; no Administrator; callback fields/discovery bitfields cannot authorize install/repair. |
| Discord credentials | Bot token mounted only where allowed; typed Transport separates token classes; test scans/log assertions prove no secret output. |
| Interaction mode | Gateway-only configuration rejects HTTP interaction ingress and no listener/route accepts it. |
| Browser safety | CSP, encoded untrusted output, no session/token in URL/local storage, `www`/`docs` have no authenticated path. |
| Telemetry | Internal metrics only; trace/log allowlist; privacy regression tests for OAuth and Discord payloads. |
| Dependency/configuration | Locked versions, advisory scanning, least-privilege service credentials, schema/config validation at startup. |

## 7. Test plan and release gates

### 7.1 Required automated tests

| Layer | S0 minimum |
|---|---|
| Contract | Event/command valid N and N-1 parse, additive-field tolerance, malformed/unknown schema rejection, N-2 fail-closed, trace-field allowlist. |
| Component | Atomic inbox/outbox, duplicate ingress, independently originated outbox fact, consumer inbox/cursor behavior, relay retry, lease fencing/heartbeat/takeover, no cross-owner writes. |
| Edge/Transport integration | Gateway resume/identify guard, sequence dedupe, interaction duplicate reservation, acknowledgement/defer before three seconds without bus publish, rate-limit header and `Retry-After` behavior, typed-operation credential separation. |
| Identity/Installation integration | PKCE, state replay, redirect/scope mismatch, token-exchange failure, session rotation/idle/absolute/revocation, CSRF, live authority denial, callback hint rejection, `Verifying` before inspection, `Installed`/`Degraded` transitions, minimal permission union. |
| Query/browser | Sessionless origins have no cookie/OAuth endpoints; protected routing, tenant-bound Query reads, stale watermark display, CSRF request behavior, keyboard/error-state smoke tests, CSP/header checks. |
| Resilience | Kill dispatcher/consumer/Gateway replica; duplicate delivery; bus interruption; slow Discord endpoint; stale lease owner; database restart within declared recovery behavior. |
| Provider sandbox | Discord OAuth/install redirect, bot presence/install inspection, Gateway interaction reception, acknowledgement/defer, Gateway reconnect/resume, permission and rate-limit behavior. |
| Security | Tenant escape, OAuth/session/token leakage, CSRF bypass, forged callback fields, public metrics, forbidden webhook route, browser token storage, and unauthorized install/repair. |

### 7.2 Non-negotiable S0 release gates

S0 is not complete until all statements below are demonstrably true:

1. Gateway accepts relevant work durably, deduplicates by technical identity, and exposes shard-specific health.
2. `INTERACTION_CREATE` is acknowledged or deferred within Discord’s three-second deadline despite delayed bus publication; Gateway and HTTP webhook ingress cannot run together.
3. Discord HTTP comes only from Transport, with no bot token in Control Plane/Identity/browser and no raw arbitrary endpoint escape hatch.
4. Cross-service facts traverse transactional outbox then Redis Streams; a consumer cannot use a foreign outbox as its cursor; Redis Pub/Sub/in-memory queues are not substitutes.
5. An OAuth login has PKCE S256, single-use state, opaque revocable session, correct cookie scope/lifetime, and two-part CSRF defense.
6. A Discord administrator can install into one selected guild using a minimal named permission union. Callback query values and guild-list observations cannot impersonate current authority.
7. Installation becomes `Installed` only from required module health; otherwise the operator sees `Verifying`, `Degraded`, or `Removed` with freshness and repair reason. Tenant registry persistence survives removal.
8. `app.*` exposes only an authenticated, tenant-predicate-bound guild shell through REST polling. `docs.*` and `www` remain sessionless.
9. Mandatory security, resilience, and provider-sandbox tests pass in CI; public metrics and secret-bearing logs are proven absent.
10. The full demo below survives a worker kill and recovers accepted durable work in under 60 seconds.

## 8. Demo script

1. Start the three service binaries, PostgreSQL, dedicated Redis Streams, and the three browser apps using an empty local database and non-production Discord application credentials.
2. Visit `www.*`; selecting login performs a GET navigation to `app.*`. Verify no session cookie exists on `www.*` or `docs.*`.
3. Complete Discord OAuth. Demonstrate that replaying state, changing redirect/scope, or omitting CSRF on a mutation fails; show the new opaque session only on `app.*`.
4. In the app guild picker, choose an observed guild and request `GuildInstall`. Inspect the generated URL: fixed application ID, selected guild lock, `disable_guild_select=true`, and only the S0 manifest’s permission union—never Administrator.
5. Authorize the Discord install. Show the callback first records `Verifying`, then the operator’s guild home changes to `Installed` only after provider/capability evidence. Demonstrate a missing requirement as `Degraded`, with a new-generation repair path and no configuration deletion.
6. Trigger the registered S0 diagnostic interaction in the guild. Show its immediate static response/defer, `InteractionAccepted` receipt, and Edge/Transport correlation without waiting for the bus.
7. Kill the outbox dispatcher or a consumer after durable acceptance. Restart it and show no duplicate external acknowledgement/effect, fenced work recovery below 60 seconds, updated projection watermark, and bounded operational logs/metrics.
8. Attempt a cross-tenant route/resource ID, public `/metrics`, outgoing-interaction webhook request, and a browser-posted permission/tenant claim. Each fails closed and leaves an audit-safe record.

## 9. Handoff checklist for implementation agents

Before assigning code, the S0 lead must publish these small, reviewed artifacts alongside this plan:

- S0 enabled-module manifest with exact named Discord permissions/intents and a one-line justification for each; empty sets are explicit, not implicit.
- Contract registry table naming the exact S0 event/command leaves, owners, current major, partition key, retention, and consumer groups.
- Service configuration/secret matrix and local test credential procedure; never values.
- Schema ownership/migration map, including tenant-bound repository API conventions.
- Transport operation catalog with credential class, timeout, retry/idempotency, rate-limit, and redaction behavior.
- OAuth/install route matrix with permitted origin, method, CSRF rule, authenticated principal, and audit event.
- Dashboard route/projection contract, including freshness watermark and all no-data/degraded states.
- CI test matrix mapped to §22.2 invariants and the ten release gates above.

No agent should add a later-slice table, command, permission, browser screen, or SDK convenience API merely because S0 establishes the scaffolding. A request that crosses this boundary is a roadmap change and must be planned in its own slice.
