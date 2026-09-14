# Tobot Architecture — External Integrations and Stream Alerts

[Architecture index](README.md) · [Previous](20-support.md) · [Next](22-automation.md)

## 32. External integrations and stream-alert product specification

### 32.1 Product scope and service ownership

This specification covers live-stream alerts only. Ordinary video uploads, shorts, social posts, transcripts, chat relay, follower events, commerce events, analytics ingestion, and generic feed automation are separate future domains and MUST NOT be inferred from an adapter's technical ability to receive them.

| Product surface | Owning service | Supporting services |
|---|---|---|
| Alert definitions and provider identity selection | Integration Registry Service | Control API, Query and Status, provider identity adapters |
| Provider callback and event-stream ingress | Provider Event Edge Service | Secret capability, durable ingress, telemetry |
| Poll and reconciliation observations | Provider Observation Scheduler | Provider adapters, quota store, circuit and lease capabilities |
| Provider event-subscription resources | Provider Subscription Orchestrator | Provider Event Edge, provider adapters, secret capability |
| Live-session truth and transition fan-out | External Live Signal Service | Integration Registry projections, durable event bus |
| Online, refresh, offline, and cleanup messages | Delivery Orchestrator | Message Catalog, Discord Capability, Asset, Discord Transport, Reconciliation |
| Administrative health and delivery history | Query and Status Service | Read projections from every owner |

Each service owns one consistency boundary. A dashboard route, provider, alert card, or worker type is not itself a service boundary.

### 32.2 Functional boundary

The product answers five questions independently:

1. Which canonical external broadcaster or channel does a tenant intend to monitor?
2. Which provider transport can currently observe that identity, with what freshness and confidence?
3. What is the durable live-session state after applying authenticated and conclusive evidence?
4. Which immutable tenant alert revisions require an effect for a confirmed transition?
5. What happened to each Discord projection?

No answer substitutes for another. An active provider subscription is not proof that a stream is live. A live session is not proof that Discord delivery succeeded. A Discord message is not the live-session record. A configured handle is not a canonical identity.

### 32.3 Provider capability profile

Every provider adapter is admitted through a versioned capability profile. The profile declares:

- Stable provider type and adapter contract version.
- Accepted locator classes, normalization constraints, canonical identity operation, and rename behavior.
- Credential modes and authorization scopes without exposing secret values.
- Supported live lifecycle signals: online, offline, metadata refresh, and provider session identity.
- Supported transports: webhook, managed event stream, polling, and reconciliation probe.
- Transport verification, acknowledgement, retry, revocation, keepalive, expiry, and connection semantics.
- Observation request grouping, maximum batch shape, pagination, response completeness, quota cost class, rate-limit metadata, and conditional request support.
- Normalized title, category, start time, watch URL, preview, avatar, and provider-extension fields.
- Expected freshness ranges and admitted fallbacks for each transport state.
- Legal, contractual, regional, and product-approval status.

Capabilities are deployment data, not remembered constants embedded in alert policy. A profile revision can disable one operation without disabling unrelated providers or already durable session history.

### 32.4 Provider adapter contract

An adapter exposes narrow ports for identity resolution, event authentication and normalization, observation planning and execution, subscription-resource operations, error classification, and capability discovery. Each port returns canonical results and typed health; raw provider payload types remain private.

Adapter conformance requires deterministic locator normalization, stable identity mapping, bounded requests and responses, strict schema validation, explicit completeness semantics, accurate quota accounting, retry classification, correlation propagation, and fixtures for provider drift. Unknown fields may be ignored only when the adapter contract says they are additive. Missing or semantically changed required fields produce an invalid or inconclusive result.

An adapter cannot select Discord content, mention policy, tenant limits, transition confirmation, retry deadlines, or cleanup behavior.

### 32.5 Canonical external identity

Configuration resolves user input into a provider-issued stable channel or broadcaster identifier whenever the provider supplies one. The identity record separates:

- Stable canonical ID.
- Normalized current locator.
- Historical aliases and validity intervals.
- Mutable display name and canonical public URL.
- Credential or public-access scope used for resolution.
- Resolution status, timestamp, adapter contract, and provider capability revision.

URL parsing admits only provider-approved hosts, schemes, and path forms. Video URLs, clip URLs, playlists, unrelated hosts, embedded credentials, fragments with hidden parameters, redirects to unapproved origins, and ambiguous search results are rejected. A provider rename updates an alias or identity metadata revision; it does not create a new identity unless the provider stable ID changes.

### 32.6 Alert definition aggregate

A Stream Alert has a stable tenant identity and immutable revisions. A published revision defines:

- Canonical external identity reference.
- Discord destination class and identifier.
- Online message definition.
- Optional offline message definition.
- Explicit mention policy.
- Desired freshness and permitted fallback.
- Online confirmation and transient-session suppression.
- Refresh fields, minimum refresh interval, and coalescing behavior.
- Offline confirmation, offline notice, message retention, and owned cleanup.
- Delivery deadlines, retry policy, and terminal visibility.
- Provider, credential, identity, destination, role, message, and capability dependency fingerprint.

Drafts are mutable. Published revisions are immutable. Editing creates a new revision and never alters historical session occurrences or delivery evidence.

### 32.7 Uniqueness, limits, and entitlement

At minimum, accidental duplicates are rejected when one tenant attempts to publish the same canonical external identity with an equivalent destination and lifecycle purpose. Multiple destinations or intentionally distinct presentations MAY be admitted as separate alerts when the tenant policy and entitlement permit them.

Limits may apply by tenant, provider, canonical identity, active alert, destination, credential scope, subscription resource, test occurrence, and delivery burst. The administration API returns used, reserved, effective, and maximum capacity with a reason and reset or correction path where applicable. Client-side counts are informative only; enablement uses an authoritative transaction.

Provider subscription sharing does not change tenant entitlement accounting. One upstream resource may satisfy many permitted desired claims while each tenant retains a separate alert definition and occurrence.

### 32.8 Administration authorization

Separate capabilities govern alert reading, draft editing, provider identity resolution, enablement, mention configuration, test delivery, history access, manual reconciliation, occurrence replay, subscription repair, credential administration, provider capability publication, and destructive projection cleanup.

Every mutation validates current tenant membership, actor capability, expected revision, entitlement, destination access, and provider availability. Global provider operators cannot read tenant message content by default. Tenant administrators cannot view shared secrets, other tenants, global credential details, or another tenant's private provider authorization.

### 32.9 Destination and Discord capability validation

An alert destination must be an admitted guild text destination supported by the active Discord contract and platform policy. The specification admits ordinary guild text and announcement destinations by default; additional thread, forum, media, or webhook modes require explicit capability profiles and lifecycle semantics.

Before enablement and again before every effect, the platform validates:

- Destination existence, guild ownership, type, and application visibility.
- Permission to view and send in the exact destination.
- Embed, attachment, external-emoji, thread, history, edit, or delete permissions required by the selected effect.
- Role existence, mentionability policy, actor authority, and configured mention allowlist.
- Current provider limits after rendering.

A failed preflight produces a draft, disabled, degraded, or blocked revision according to policy. Historical preflight success never bypasses execution-time validation.

### 32.10 Message definitions and variables

Stream alerts reference immutable Message Catalog definitions. The standard provider-neutral variables are display name, normalized handle, platform label, title, category, watch URL, start time, and content type fixed to live stream. Optional avatar, preview, and provider-extension variables are available only when the active capability profile and accepted observation supply them.

Each variable declares type, maximum rendered size, escaping, missing-value behavior, link policy, and refresh eligibility. Unknown placeholders fail publication; they are not emitted literally. A required variable unavailable from the effective provider mode blocks publication or uses an explicit authored fallback.

Provider data is untrusted. Rendering cannot introduce components with undeclared actions, raw mention authority, arbitrary URLs, unsupported media, or payloads beyond current Discord limits.

### 32.11 Mention policy

The default is no mention. A revision may request one authorized role, everyone, here, or another future admitted mention class only when tenant policy explicitly permits it.

Broad mentions require stronger actor authority, visible preview, per-destination cooldown, per-tenant burst budget, and execution-time capability. Role mentions require a current same-guild role and tenant allowlist. Raw mention syntax in provider titles, handles, templates, or URLs remains inert because Delivery emits an explicit allowed-mentions object.

Refresh edits and offline cleanup never re-trigger a mention unless a separately published offline policy explicitly authorizes it. Test notifications cannot use broad mentions.

### 32.12 Preview and test notification

Preview renders the exact pinned message revision against either provider metadata explicitly fetched for preview or a clearly labeled representative snapshot. It displays missing variables, truncation, URL policy, asset decisions, effective allowed mentions, destination capability, provider mode, freshness expectation, and lifecycle effects.

A test notification:

- Requires a dedicated actor capability and current destination preflight.
- Uses a unique test occurrence and explicit visual test label.
- Is rate-limited independently from production transitions.
- Does not query or mutate live-session state unless the administrator separately requests a provider preview lookup.
- Does not consume production occurrence keys or lifecycle generations.
- Records Delivery outcome and message binding under test retention.
- May be cleaned up only through its own application-owned binding.

### 32.13 Ingestion-mode selection

For each provider identity and event type, Provider Subscription Orchestrator chooses the best currently admitted mode from the capability profile and policy:

1. Authenticated provider event transport for low-latency transitions when reliable and permitted.
2. Reconciliation polling at a bounded cadence to detect missed events and metadata drift.
3. Primary polling when no authoritative event transport exists.
4. Degraded polling or temporarily unavailable coverage when credentials, quota, provider terms, or endpoint health prevent the preferred mode.

The dashboard reports effective mode and realistic freshness. It never labels polling as real time or a disconnected subscription as healthy.

### 32.14 Provider event ingress

Provider Event Edge routes an incoming request or stream message through an opaque endpoint or connection generation. Processing order is:

1. Enforce network, method, content type, header, body, rate, and connection bounds.
2. Load current and bounded overlapping verification generations.
3. Verify the signature or authenticated connection against exact transport bytes.
4. Validate provider timestamp, message type, endpoint condition, and replay identity.
5. Handle a provider verification challenge according to its contract.
6. Atomically store the authenticated ingress receipt and normalized event before successful acknowledgement whenever required by the loss model.
7. Publish asynchronously to External Live Signal Service.

Unknown message types are recorded with bounded metadata and acknowledged or rejected according to the provider contract. They never default to an online event. Provider retries reuse the same receipt.

### 32.15 Provider subscription desired state

Every enabled alert contributes a desired coverage claim. Equivalent claims may reference one provider subscription resource when credential scope, provider terms, transport, privacy, and callback generation permit sharing.

The orchestrator derives desired state from the full claim set. Removing one alert removes only its claim. The provider resource is deleted only when no admitted claim remains and ownership is proven. Creation, verification, activation, rotation, renewal, migration, revocation, and deletion are durable operation states with attempts and provider receipts.

A callback challenge proves endpoint possession, not complete live-event coverage. Active state requires matching provider resource, condition fingerprint, credential scope, event type, callback or connection generation, and health.

### 32.16 Durable observation scheduling

Provider Observation Scheduler stores one due cursor per provider identity, credential scope, observation purpose, and generation. It computes the next due time from desired freshness, effective event coverage, last conclusive observation, provider retry metadata, quota budget, circuit state, adaptive jitter, and tenant fairness.

Missed intervals do not create a catch-up storm. Recovery schedules the next useful observation and a bounded reconciliation window. Leases expire and carry fencing tokens. A worker that loses its lease may finish network I/O for cleanup but cannot publish its result as current evidence.

Identity refresh, online-state polling, live metadata refresh, subscription reconciliation, and failure probes are independent schedules with independent budgets.

### 32.17 Shared observations, batching, and caching

Equivalent tenant alerts may share one provider identity observation when the provider data is public or the same authorization scope lawfully covers them. Private or tenant-authorized provider data remains isolated.

Adapters batch and paginate only according to the current capability profile. A batch request preserves the requested identity set and produces one typed result per identity. The scheduler chunks above provider maxima, does not discard later chunks, and does not infer offline from absent pages or truncated results.

Identity resolution and stable profile metadata use caches with explicit TTL, source revision, negative-cache policy, and authoritative rebuild. Live state is never authoritative only in cache. Conditional requests and provider cursors may reduce cost when their semantics are documented.

### 32.18 Quota, rate limits, and circuit breakers

Provider budgets are tracked by the narrowest applicable provider, application, credential scope, operation, and time window. Admission reserves estimated cost before dispatch and reconciles actual cost when provider evidence is available.

Rate-limit responses define the earliest retry boundary. Quota depletion blocks eligible work until a known reset, explicit budget increase, or policy change. Authentication and scope failures open a credential-scoped circuit. Repeated transient failures open an operation or provider circuit with half-open probes. Circuits do not erase scheduled work or classify external state.

Tenant fairness allocates observation opportunities without allowing a large tenant or popular provider identity to consume every request. Emergency freshness does not bypass provider terms or rate limits.

### 32.19 Observation classification

Every observation result is exactly one of:

- Conclusive live with a provider session identity.
- Conclusive offline under a provider operation whose completeness semantics support that conclusion.
- Conclusive unchanged.
- Rate limited.
- Quota exhausted.
- Unauthorized or forbidden.
- Identity not found or migrated.
- Provider unavailable.
- Invalid provider response.
- Inconclusive due to timeout, missing result, partial page, adapter drift, or unknown semantics.

Only conclusive live, offline, or unchanged evidence may directly advance the live-session aggregate. A not-found identity follows a separate identity-health policy and cannot automatically end an active session unless the provider contract and confirmation policy explicitly permit that inference.

### 32.20 External live-session aggregate

The aggregate key is provider, canonical external identity, and provider session identity. It retains state, first evidence, provider start time, last conclusive evidence, terminal evidence, accepted metadata revisions, source precedence, event and observation references, and optimistic version.

Unknown means no conclusive current state. Live candidate means evidence has not yet met confirmation policy. Live means online transition is confirmed. Ending candidate means an offline signal needs corroboration. Ended means terminal policy is satisfied. Stale means the freshness boundary elapsed without conclusive evidence. Conflicted means authoritative sources disagree beyond the resolution window.

Stale and conflicted are not offline. They suppress destructive cleanup unless policy explicitly reaches a safe terminal decision.

### 32.21 Source precedence and temporal ordering

Each capability profile defines precedence by event type and source mode. Evaluation uses provider message identity, subscription or lease generation, provider occurrence time, durable receipt time, source cursor, provider session identity, and aggregate version.

A delayed online event for an already ended session does not reopen it. A stale poll from a losing lease cannot overwrite a newer event. Metadata from the same active session may advance independently. An online signal with a different provider session identity begins a candidate for a new session even if older offline evidence arrives later.

When evidence cannot be ordered safely, the aggregate becomes conflicted and awaits bounded reconciliation or authorized resolution. The platform does not use local wall-clock arrival alone as universal truth.

### 32.22 Online confirmation and suppression

Default behavior creates an online occurrence on the first authenticated authoritative online event or first conclusive live observation with a new provider session identity. A provider profile or tenant policy MAY require corroboration or a minimum live duration when transient false starts are common.

Suppression policies may cover maintenance windows, disabled revisions, expired delivery deadlines, explicitly excluded provider content types, a session already announced by the same alert revision, or a minimum confirmation interval. Suppression creates a durable reasoned occurrence or decision; it never deletes the provider session.

A later alert revision does not automatically announce a session already in progress unless its activation policy explicitly requests a current-live announcement with a separate occurrence class visible to the administrator.

### 32.23 Online announcement delivery

Confirming a live transition loads all effective alert revisions for the canonical identity through a versioned, paginated fan-out snapshot. For each revision, External Live Signal Service atomically records a unique online occurrence and outbox request.

Delivery renders the pinned definition with the accepted metadata revision, validates destination and mentions, and sends under Discord transport governance. Confirmed success records application, channel, message, nonce or request evidence, rendered revision, and ownership fingerprint. Retry returns the same occurrence and delivery identity.

Discord delivery order across different tenants is not guaranteed. Within one destination, bounded serialization prevents an offline or cleanup effect from overtaking its online create.

### 32.24 Live metadata refresh

Refresh is optional and limited to declared fields. Viewer-count polling is excluded by default because it creates high upstream and Discord write volume without changing live-session identity.

Accepted metadata changes update the session metadata revision. For each active projection, the service coalesces changes during a minimum interval and schedules only the newest useful revision. An edit is skipped when rendered output is unchanged, the occurrence is terminal, the message is not application-owned, or the delivery deadline has passed.

Refresh failure leaves the online message and session intact. A missing message becomes orphaned projection health and follows recreate, preserve, or stop-refresh policy; it is not silently recreated by default.

### 32.25 Offline notice and owned cleanup

When terminal session state is confirmed, each alert revision independently chooses:

- No Discord effect.
- Create an offline notice.
- Edit the owned online message into an offline presentation.
- Retain the online message unchanged.
- Delete the owned online message immediately or after a durable delay.

Offline notification and cleanup are separate occurrences. Deletion requires exact application ID, tenant, destination, message binding, alert occurrence, session, and lifecycle generation. Missing ownership, administrator edits that invalidate the expected fingerprint, or a changed binding produces conflict rather than deletion.

An inconclusive provider result, event transport outage, quota exhaustion, or stale session cannot trigger cleanup.

### 32.26 Delivery failure and replay

Retryable Discord failures use bounded backoff within the occurrence deadline. Permission, unknown destination, invalid message revision, invalid mention, and permanent payload errors block or terminate the occurrence with an operator action. Ambiguous create, edit, or delete outcomes enter Reconciliation Service before retry.

Manual replay is allowed only for an existing occurrence whose replay policy permits it. It records actor, reason, target delivery generation, and prior outcome. Replay cannot change the provider session, alert revision, destination, message content revision, or mention policy. A desired change requires a new alert revision and a new explicitly classified administrative occurrence.

### 32.27 Configuration changes during a live session

Changing presentation or destination creates a new alert revision. The publication command declares one of:

- Apply only to future sessions.
- Reproject the current confirmed live session as an administrative current-live occurrence.
- Replace an owned current projection through an explicit two-step create-then-retire or edit policy.

The system previews the exact provider and Discord effects. It never silently sends a second live alert merely because a template was edited. A destination change cannot move a Discord message; it creates a new owned projection and handles the old binding through an explicit retirement policy.

### 32.28 Disablement and retirement

Disabling an alert stops new online, refresh, and offline occurrences after the disable boundary. Policy explicitly decides whether already queued delivery proceeds, is cancelled before dispatch, or remains inspectable. Disabling does not delete provider session history or shared provider subscriptions still claimed by other alerts.

Retirement tombstones the definition after dependent occurrences and retention references permit it. Optional message cleanup is a separate owned effect. Provider subscription desired claims are removed and reconciled asynchronously. Deleting a dashboard row cannot directly delete a provider subscription or Discord message.

### 32.29 Provider-specific profiles

**Twitch:** Canonical broadcaster user ID is authoritative. Stream-online and stream-offline provider events are preferred when the current EventSub contract and deployment authorization permit them. Event messages are treated as at least once and verified using current provider signature, message identity, timestamp, challenge, retry, and revocation rules. Helix observations provide reconciliation and metadata; batch shape and completeness follow the current documented operation.

**YouTube:** Canonical channel ID is authoritative. Handle resolution occurs outside the live polling hot path. The provider profile distinguishes public channel lookup, live search, owner-authorized live-stream operations, and push notifications. Upload or feed notifications are hints only unless the provider contract explicitly communicates live state. Search and every additional page consume the current documented quota class; scheduling is quota-aware and exposes achievable freshness.

**Kick:** The adapter is admitted only against an approved, stable, legally usable provider contract with explicit authentication, rate, schema, and availability behavior. A public undocumented endpoint is insufficient for a production healthy capability profile. When no approved contract exists, Kick configuration is unavailable rather than optimistically reported healthy.

Adding a provider requires an architecture review, adapter conformance suite, capability profile, operational ownership, credential model, terms review, quota and circuit policy, identity migration semantics, and sandbox evidence. It does not require changes to live-session or Delivery domain contracts.

### 32.30 Administrative status and history

For each alert, the dashboard reports independently:

- Definition revision and enabled state.
- Canonical identity and last confirmation.
- Effective ingestion mode and expected freshness.
- Provider subscription state and last reconciliation when applicable.
- Credential or public-access health without exposing secrets.
- Last conclusive live-state observation, source class, and age.
- Current live session and conflict or stale state.
- Last online, refresh, offline, cleanup, and test occurrence.
- Discord destination and mention capability health.
- Delivery attempt history and terminal operator action.

Provider failures are classified and timestamped. A healthy check time, conclusive offline time, last event time, last Discord delivery, and last reconciliation time are different fields.

### 32.31 Privacy, credentials, and external content

The platform minimizes provider data to identity, live status, bounded presentation metadata, provenance, and operational health required by the product. Provider viewer lists, chat content, private analytics, account email, tokens, and unrelated channel data are outside scope.

Secrets remain in the secret capability and are supplied to adapters only for the required operation and generation. Logs and traces use credential-scope references and provider request IDs, never values. Provider titles, categories, display names, URLs, and images are untrusted user-derived content and follow escaping, URL, asset, mention, and retention policy.

Cross-tenant sharing is restricted to lawful public provider observations. Tenant-authorized private data, OAuth grants, credential budgets, previews, errors, and identities cannot be shared merely to optimize cost.

### 32.32 Retention and deletion

Independent retention classes apply to drafts, published revisions, identity aliases, dependency health, callback verification evidence, ingress receipts, replay keys, raw diagnostic payload samples, subscription operations, provider request attempts, quota reservations, observations, session evidence, metadata revisions, occurrences, Discord bindings, delivery history, tests, conflicts, and audit records.

Raw authenticated payload bytes are retained only for the minimum verification, incident, or contractual window and are replaced by normalized facts and integrity digests when permitted. Deleting a tenant removes tenant definitions, occurrences, and presentation data through a checkpointed workflow; it does not delete a shared canonical provider identity or subscription while other lawful claims remain.

Provider and Discord resource deletion are explicit external operations with ownership evidence. Database retention never masquerades as external cleanup.

### 32.33 Reconciliation and drift repair

Bounded reconciliation covers:

- Enabled definitions versus canonical identity and current provider capability.
- Desired provider subscription claims versus provider resources, callbacks, connection health, expiry, and revocations.
- Observation due cursors versus last conclusive evidence, quota reservations, leases, and circuit state.
- Live-session state versus recent authenticated events and bounded provider observations.
- Alert occurrences versus Delivery workflows and Discord bindings.
- Owned online messages versus expected lifecycle generation when Discord access permits inspection.

Repair is report-first for destructive or ambiguous cases. Automatic repair is limited to derivable missing publications, expired leases, safe subscription renewal, proven-absent retry, coalesced refresh, and application-owned message convergence. Unknown ownership, source conflict, provider schema drift, or cross-tenant credential mismatch requires operator resolution.

### 32.34 Scalability and low-latency behavior

Low latency comes from separating callback acknowledgement, live transition, alert fan-out, rendering, and Discord transport. Provider Event Edge performs constant bounded work and never waits for tenant count. External Live Signal Service partitions by canonical identity and pages fan-out into tenant-isolated occurrences. Delivery scales by queue and Discord capacity.

Polling efficiency comes from canonical-identity coalescing, separate identity caching, provider-native batches, complete pagination, adaptive scheduling, event-assisted reconciliation cadence, conditional requests, and quota admission. These optimizations cannot merge private authorization scopes or weaken tenant isolation.

Hot identities, callback bursts, mass live starts, and provider outages have explicit bulkheads. Queue capacity, fan-out pages, retries, provider budgets, and Discord delivery remain finite. Overload increases visible lag or degraded freshness; it does not drop accepted transitions silently.

### 32.35 Operational procedures

**Publishing or enabling an alert:**

1. Authorize the actor and validate tenant entitlement and expected definition version.
2. Normalize and resolve the provider locator to a canonical identity under the current capability profile.
3. Validate destination, mention, message definitions, lifecycle, freshness, suppression, retention, and provider prerequisites.
4. Preview exact Discord presentation, provider mode, limitations, and degraded behavior.
5. Commit the immutable revision and desired coverage claim atomically with its outbox.
6. Report enabled only with the effective mode and current dependency health; provider subscription convergence may remain explicitly pending.

**Rotating a provider credential or callback secret:**

1. Create a new secret generation without exposing it to domain state.
2. Identify affected provider subscriptions, observation schedules, callback endpoints, and credential budgets.
3. Preflight provider authorization and allocate a bounded overlap window when supported.
4. Reconcile or recreate owned subscriptions through versioned operations and verify the new callback generation.
5. Shift observation work only after the new credential scope is healthy.
6. Revoke the prior generation and verify no active resource still depends on it.

**Resolving stale or conflicted live state:**

1. Fence the canonical identity and freeze destructive offline or cleanup effects.
2. Load ordered authenticated events, conclusive observations, source generations, session IDs, capability profile, and current aggregate version.
3. Run only bounded provider reconciliation allowed by quota and credentials.
4. Apply the published source-precedence and confirmation rules.
5. If one state is derivable, commit it with evidence; otherwise preserve conflict and require an authorized reasoned resolution.
6. Resume only lifecycle occurrences valid for the resulting generation.

**Repairing an undelivered alert:**

1. Load occurrence, pinned revisions, deadline, attempts, destination health, and message binding.
2. Reconcile every uncertain Discord effect before retry.
3. Distinguish blocked permission, invalid dependency, already delivered, safe retry, expired, externally deleted, and ownership conflict.
4. Reauthorize manual replay and preserve the same occurrence semantics.
5. Execute only an eligible effect and retain the prior attempt history.

**Retiring an alert:**

1. Commit disable or retirement boundary and remove its desired provider-coverage claim.
2. Cancel or preserve pending occurrences according to the published boundary policy.
3. Apply optional owned Discord cleanup as an independent occurrence.
4. Reconcile shared provider subscription state without affecting remaining tenants or alerts.
5. Retain tombstone, occurrence, delivery, and audit evidence for their declared periods.

### 32.36 Integration-specific consistency rules

- Alert revision publication and desired-coverage outbox publication are atomic within Integration Registry Service.
- Canonical identity resolution and alert publication cannot share a provider transaction; publication pins the confirmed identity revision and resolution evidence.
- Provider event authentication, ingress receipt, replay reservation, and normalized-event outbox are atomic within Provider Event Edge.
- Provider callback acknowledgement and downstream live transition cannot share a transaction; provider replay identity bridges them.
- Provider subscription desired claims and provider resources cannot share a transaction; durable operations, generations, ownership receipts, and reconciliation bridge them.
- Poll scheduling, quota reservation, external request, and observation publication cannot share a transaction; fenced attempts make every boundary explicit.
- Live-session transition, per-alert occurrence reservation, and External Live Signal outbox publication are atomic within each bounded fan-out transaction.
- Large fan-out uses a durable snapshot and checkpointed pages; each alert occurrence remains unique if a page repeats.
- External session state and Discord delivery cannot share a transaction. Delivery failure never reverses a confirmed provider transition.
- Refresh, offline, and cleanup are independent lifecycle occurrences ordered by session, alert, projection, and generation.
- A newer provider capability or alert revision never rewrites historical identity evidence, sessions, occurrences, rendered definitions, or provider receipts.
- Shared provider identity, subscription, or observation state never permits cross-tenant configuration reads or effect mutation.

### 32.37 Integration operational kill switches

Independent authenticated, versioned, and audited controls MUST exist for:

- New alert drafting, identity resolution, enablement, current-live activation, test delivery, edits, disablement, retirement, and manual replay.
- New provider callback admission by provider, endpoint generation, message type, or credential scope while preserving verification and revocation handling where safe.
- Provider event-to-session transition by provider and event type without discarding authenticated ingress receipts.
- Primary polling, reconciliation polling, identity refresh, metadata refresh, and subscription health probes independently.
- Provider subscription create, verify, renew, rotate, migrate, repair, and delete independently.
- Online announcements, refresh edits, offline notices, and owned cleanup independently by provider, tenant, destination, or alert class.
- Provider remote-image ingestion, preview lookup, broad mentions, role mentions, and provider-extension variables independently.
- Automatic conflict resolution, manual conflict resolution, Discord reconciliation, and provider reconciliation independently.

Disabling new alert admission does not delete active definitions or provider resources. Disabling provider transitions does not discard authenticated events or conclusive observations; it creates bounded backlog and visible lag. Disabling polling does not claim event-only coverage healthy when event transport is degraded.

Disabling online delivery preserves session state and occurrences. Disabling refresh does not prevent an admitted offline transition. Disabling cleanup preserves messages and due occurrences without reporting them cleaned. Disabling one credential scope or provider does not open another provider's circuit.

No Integration kill switch may disable secret revocation, provider-signature verification, callback replay protection, safe provider acknowledgement, durable ingress, provider rate-limit compliance, Discord rate-limit governance, ownership reconciliation, tenant authorization, audit visibility, retention deletion, or visibility into pending, degraded, stale, conflicted, blocked, uncertain, and failed work.
