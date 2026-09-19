# Tobot Architecture — Security, Observability, and Deployment

[Architecture index](README.md) · [Previous](11-partitioning-discord-backpressure.md) · [Next](13-recovery-testing-governance.md)

## 17. Security architecture

### 17.1 Trust boundaries

```mermaid
flowchart LR
    Internet[Untrusted internet]
    Discord[Discord endpoints]
    Admin[Dashboard user]

    subgraph PublicEdge[Public edge trust zone]
        API[Control API]
    end

    subgraph ServiceZone[Authenticated service zone]
        Gateway[Gateway Edge]
        Interaction[Interaction Edge]
        Transport[Discord Transport]
        Identity[Identity]
        Domain[Domain Services]
        Delivery[Delivery Services]
        Billing[Billing]
        AI[AI adapters]
        Asset[Asset and Renderer]
    end

    subgraph DataZone[Restricted data zone]
        DB[(Service Databases)]
        Bus[(Durable Event Bus)]
        Objects[(Object Storage)]
        Secrets[(Secret Store)]
    end

    Internet --> PublicEdge
    Discord <--> Gateway
    Discord <--> Transport
    Admin --> API
    PublicEdge --> ServiceZone
    ServiceZone --> DataZone
    Secrets --> Gateway
    Secrets --> Transport
    Secrets --> Identity
    Secrets --> Interaction
    Secrets --> Billing
    Secrets --> AI
    Secrets --> Delivery
```

First-product Interaction Edge is not a public HTTP listener. Ingress is Gateway `INTERACTION_CREATE` on Discord Edge (DR-042). Outgoing-webhook mode, if selected later, adds a public Discord HTTP path on Interaction Edge and MUST follow DR-034. The dashboard cookie site is `app.*`; `www` and `docs.*` are sessionless (DR-045).

The Discord bot token is mounted only on Gateway Edge and Discord Transport. Control API and Domain Services MUST NOT receive it. Delivery MAY receive application-owned Discord webhook tokens and MUST NOT receive the bot token. Identity receives OAuth material, PKCE verifiers, and session-bound secrets. Interaction Edge receives the application public key and encrypted interaction tokens. Billing and AI adapters receive their provider credentials (DR-035).

### 17.2 Required controls

- Service-to-service calls use authenticated workload identity and encrypted transport.
- Authorization is evaluated at both public entry and owning service.
- Discord bot tokens are available only to Gateway Edge and Discord Transport roles that require them. Control API and Domain Services MUST NOT receive the bot token. Secret Store mounts follow the §17.1 edges (DR-035).
- Interaction tokens are encrypted, short-lived, and access-audited.
- If Interaction Edge uses outgoing webhook mode, every HTTP request MUST verify Discord Ed25519 using `X-Signature-Ed25519` and `X-Signature-Timestamp` over the timestamp concatenated with the exact raw body, before JSON parse. Timestamp freshness is required. The application public key lives in the secret-management boundary. Missing, stale, or invalid signatures fail closed. Gateway mode MUST NOT admit that HTTP path (DR-034). First-product ingress is Gateway; the two modes MUST NOT run concurrently (DR-042).
- Database credentials are unique per service owner.
- Every read and mutation of a tenant-scoped aggregate, projection, cache entry, object key, inbox row, or outbox row includes a tenant predicate bound from authenticated context, not solely from a client-supplied `tenant_id` or `guild_id`. Queries are parameterized. A missing or mismatched tenant predicate fails closed. A globally unique primary key does not substitute for the tenant predicate (DR-033).
- Events contain references rather than secrets.
- Logs and distributed traces use the same allowlisted fields and redact tokens, authorization headers, user message content where unnecessary, and remote query strings. Span attributes, baggage, and exporter tags MUST NOT copy AI prompts, model output, reminder body text, form answers, message content, invocation arguments, or secret material (DR-038).
- Metrics scrape endpoints are reachable only from the internal scrape network via network policy, mTLS, or authenticated scrape. They MUST NOT be reachable from the public internet or the dashboard origin. Liveness and readiness MAY be unauthenticated and MUST NOT include tenant identifiers or secret material (DR-036).
- Remote media fetching blocks private, loopback, link-local, metadata-service, and rebinding destinations. After DNS resolution, the destination IP is pinned for that hop, including each redirect; a hostname allowlist is not sufficient (DR-029).
- Uploaded media is scanned, decoded within resource limits, re-encoded when required, and never executed.
- Administrative test delivery is clearly marked and audited.
- Tenant deletion is an explicit workflow covering configurations, projections, assets, cooldowns, and retained operational records. Discord Installation owns the TENANT registry and admits that workflow; Installation `Removed` is not deletion (DR-059).
- Moderation reasons, private notes, message excerpts, attachment references, and before/after values receive explicit privacy classifications.
- Evidence access is narrower than case-summary access and is audited independently.
- Message evidence is minimized at ingestion, encrypted at rest when retained, and deleted on its own retention schedule.
- A content hash or unavailable marker replaces raw message content when policy does not authorize retention.
- Moderator-facing exports and searches enforce the same guild scope, evidence policy, and redaction state as individual case reads.
- Dry-run moderation and cleanup operations perform no provider mutation and suppress notification side effects.
- Security policy publication and response-plan publication require optimistic concurrency, authenticated administrator authority, and an immutable change record.
- High-impact response plans require an explicit risk classification; automatic ban, dangerous-role removal, guild lockdown, verification change, invite pause, and direct-message pause are never enabled through an implicit default.
- Exemption changes, manual lockdown transitions, restoration acknowledgements, and security kill-switch changes are separately audited.
- Security evidence stores identifiers and bounded risk facts by default. Raw audit changes, member profile data, invite context, and message content require an explicit privacy purpose and expiry.
- Distributed counter keys use opaque tenant-scoped identifiers or hashes, finite TTL, and bounded cardinality; the counter system is not a behavioral analytics store.
- A service identity may submit security observations or response requests only for its authorized tenant partition and declared source type.
- Break-glass actions require strong administrator authentication, a short-lived authorization context, reason capture, and post-action review; break glass does not bypass Discord permissions or transport governance.
- Role-policy, panel, and role-resource writes require separate tenant-scoped capabilities; permission to publish a self-service panel does not imply permission to create or reorder Discord roles.
- Panel routing tokens are non-secret opaque references with bounded lifetime or revision scope. Every use is reauthorized from the signed Discord interaction or canonical Gateway identity and authoritative panel binding.
- Sticky-role data, member-role desired state, assignment history, and panel interaction observations are purpose-limited, tenant-scoped, and independently retained.
- Sensitive permission classes are centrally versioned. Self-service and automatic policies fail closed when the classification is unavailable.
- Role-resource privilege escalation requires stronger authorization than cosmetic role edits and records the exact before/after permission delta.
- Progression policy changes, manual XP adjustments, reward replay, and leaderboard visibility require distinct tenant-scoped capabilities. Adjustments are append-only ledger facts with actor, reason, and immutable policy context; balances are never edited silently.
- XP abuse controls include source allowlists, bot and webhook exclusions, atomic cooldowns, per-source ceilings, voice eligibility, anti-idle policy, and anomaly signals. They minimize retained content and never use hidden profiling as an enforcement fact.
- Giveaway creation, cancellation, early close, reroll, entrant inspection, and prize fulfillment are independently authorized and audited. Entry eligibility is server-defined, versioned, explainable, and evaluated without exposing unrelated member data.
- Weighted giveaway odds are disabled by default. If enabled, weighting inputs, caps, exclusions, and effective odds are disclosed before entry, pinned in the entrant snapshot, and subject to applicable legal and platform review; purchasing or transferring value is outside this specification.
- Giveaway randomness is obtained only through the secure-randomness capability. Draw inputs and the selection procedure are durably committed so an operator cannot silently redraw an unfavorable result.
- Form definitions, responses, reviews, exports, attachments, and accepted-role actions have separate permissions. Reviewers receive only fields and identity allowed by the published access policy.
- A form advertised as anonymous to reviewers may still retain a tenant-scoped respondent identity for abuse prevention or uniqueness. That distinction, purpose, retention, and authorized system access are disclosed; the platform never claims system anonymity while retaining identity.
- Form responses and assets carry field-level privacy classes and independent expiry. Export generation is authorized, audited, time-bounded, encrypted in transit, and delivered through a short-lived reference rather than public storage.
- Temporary-room creation and control validate the signed actor, live membership, current room ownership or delegated-control claim, and current provider capability on every action. Opaque component identifiers are routing references, not authorization.
- Room owners cannot grant permissions beyond generator policy, move or exclude protected principals contrary to server policy, control another room, or convert a temporary resource into an undeclared permanent channel.
- Economy management uses separate capabilities for currency policy, income policy, catalog publication, stock correction, funds adjustment, entitlement resolution, casino policy, and read-only audit. Dashboard authentication or Discord visibility alone grants none of them.
- Every administrator adjustment, account freeze, tax-policy change, stock correction, refund, manual fulfillment, forced game resolution, and ledger reconciliation action records actor, reason, expected version, affected amount or resource, and correlation identity.
- Currency display assets are validated through Asset Service. They never determine currency identity and cannot supply executable content or an untrusted remote fetch at render time.
- Ledger queries, wealth leaderboards, transfer histories, purchase histories, and game histories enforce tenant and subject scope. Public leaderboards expose only the configured account classes and opted-in identity presentation.
- Income and casino abuse controls include per-member and per-source rate limits, cooldowns, maximum stake and exposure, loss or payout ceilings, bot exclusion, collusion signals, self-target denial, target protections, and kill switches. Abuse observations do not bypass Moderation Cases.
- Robbery is disabled by default, wallet-only unless a later published policy says otherwise, and subject to target opt-out, protected-member rules, minimum balance, loss caps, cooldown, anti-collusion controls, and tenant suitability review.
- Virtual currency is non-redeemable and has no represented monetary value. The platform does not support purchase for real money, cash-out, cryptocurrency, external-market exchange, debt, lending, interest, or wagering of transferable value under this specification.
- Casino publication requires explicit tenant opt-in, age and regional suitability decisions where applicable, responsible-play limits, transparent payout rules, and a demonstrated non-positive uncontrolled issuance exposure. Product presentation never implies real-money winnings.
- Randomness receipts expose outcome integrity facts without exposing secret entropy before use. Operators cannot rerun a committed income, crime, robbery, slot, roulette, coinflip, card, or shuffle decision to obtain a preferred result.
- Catalog eligibility and purchase limits are evaluated server-side from authoritative facts. Client-provided price, stock, balance, reward, role, boost, or ownership fields are untrusted.
- Entitlement access is narrower than purchase-read access. Private-channel bindings, manual instructions, staff evidence, and compensation snapshots receive explicit privacy classes and retention.
- Support administration separates policy management, panel publication, case oversight, transcript access, export, retention hold, and destructive resource cleanup capabilities. Possessing a configured staff role does not grant dashboard policy access.
- Staff action authorization uses current guild membership, current role or capability policy, case assignment where required, protected-role rules, and expected case version. A cached panel or channel overwrite is not authority.
- Ticket eligibility, blacklist, whitelist, bypass, opener-close, participant, claim, escalation, and reopen rules are server-side policies. Component visibility and access to a Discord channel do not imply permission to perform a case transition.
- Intake submissions, case descriptions, participant messages, attachments, staff notes, transcripts, satisfaction responses, and export artifacts have distinct privacy classes, access policies, and expiry.
- Support Case events store references and bounded operational facts by default. They do not copy full transcript content, form answers, Discord tokens, or private attachment URLs.
- Transcript access and export require tenant and case scope, purpose, current authority, short-lived artifact access, and an immutable audit record. Public permanent transcript URLs are forbidden.
- Message and attachment capture is minimized at ingestion. Asset references replace ephemeral Discord URLs, secrets are redacted by policy, and content is encrypted at rest when retained.
- Support capacity, cooldown, scheduling, and automation keys are tenant-scoped and bounded. They are not used as a cross-server behavior profile.
- Case numbering is display metadata and is never accepted without tenant identity as authorization or lookup proof.
- Resource cleanup is destructive and requires current case state, archive-boundary decision, application ownership, case generation, bot capability, and provider fingerprint.
- Staff performance metrics distinguish queue delay, assignment delay, first human response, automation, bot messages, waiting-on-member time, and reopen state. Individual scoring or punitive use requires a separately approved transparent policy and review process.
- Integration administration separates provider credential management, provider capability publication, alert configuration, test delivery, subscription repair, live-signal conflict resolution, delivery replay, and destructive projection cleanup capabilities.
- A tenant administrator may select only provider identities and provider metadata that the active provider access model lawfully exposes. Tenant configuration never reveals shared application credentials, another tenant's private identity, or provider billing state outside the tenant's authorized view.
- Public callback endpoints use randomized opaque routing identity, transport encryption, strict method and media-type checks, bounded request bodies, exact raw-body signature verification, timestamp freshness, replay protection, constant-time comparison where applicable, and denial-of-service admission controls. Tenant HTTP workflow triggers use this same Provider Event Edge profile (DR-028). Unsigned tenant webhooks are forbidden. A secret solely in the query string or path is not sufficient authentication.
- Verification secrets and provider credentials are versioned in a secret-management boundary. Rotation supports overlap only for a bounded generation window and old material is revoked and deleted according to policy.
- Provider adapters run with network egress allowlists, DNS and redirect controls, response-byte and decompression ceilings, timeouts, schema validation, and circuit breakers. User-supplied provider URLs never become arbitrary server-side fetch targets. Any server-side HTTP(S) fetch whose destination is influenced by untrusted or tenant-supplied input MUST resolve, pin the destination IP for that hop, re-pin after every redirect, and deny loopback, link-local, RFC1918, IPv6 ULA, IPv4-mapped equivalents, and cloud-metadata ranges. RFC1918 or loopback MAY be used only by a named operator-configured adapter with an explicit internal destination profile; tenant-supplied, payload-supplied, and remote-media URLs MUST NOT use that profile (DR-029).
- Provider payloads and normalized metadata are untrusted content. Titles, display names, categories, URLs, thumbnails, and extension fields are escaped, length-bounded, mention-neutral, and filtered before entering Message Catalog context or logs.
- Raw provider payload retention is disabled by default after required verification and normalization evidence is committed. Any diagnostic sampling is encrypted, access-controlled, redacted, purpose-limited, tenant- and provider-policy compliant, and independently expired.
- Alert configuration and test endpoints enforce current tenant membership and an integration-specific administrator capability. Possession of a provider handle, Discord channel ID, or alert ID is not authorization.
- Mention policy defaults to none. Broad mentions require explicit tenant opt-in, current actor authority, destination compatibility, anti-spam budgets, and a visible preview; template text cannot grant mention capability.
- Manual replay references an existing transition and occurrence, records actor and reason, and preserves the same provider session identity. It cannot fabricate an online event, reset deduplication history, or target a new destination without a new configuration revision.
- Provider health, error details, and request identifiers exposed to tenants are sanitized. Secret values, signatures, authorization headers, internal callback paths, raw payloads, and cross-tenant quota details are never returned.
- Custom-command administration separates read, draft, publish, enable, disable, permission policy, mention policy, response action, projection repair, invocation history, and retirement capabilities. Dashboard access alone grants none of them.
- Reserved built-in command identities are platform policy. A tenant definition cannot shadow, replace, disable, redirect, or imitate a built-in security, moderation, support, economy, privacy, or administration command.
- The custom-command template language is non-Turing-complete, deterministic, side-effect-free during evaluation, bounded by node count, nesting, input size, output size, and execution time, and cannot access files, environment, secrets, network, database, reflection, dynamic imports, or raw service credentials.
- Template packages, workflow graphs, custom-command compiled plans, and worker-queue or job payloads are admitted only through a versioned schema parse. Language-native object codecs over untrusted bytes are forbidden. Content-type is not sufficient. Unknown structure fails closed before object construction (DR-037).
- Response actions are selected from an allowlisted typed catalog and individually authorized. They cannot invoke arbitrary bot commands, mutate moderation or economy state, assign sensitive roles, create unowned resources, or widen permissions through text.
- User, target, role, channel, guild, level, XP, time, and argument variables have explicit sources and privacy classes. Missing or inaccessible data follows the published fallback and is never fetched by arbitrary template code.
- Custom invocation access evaluates ignore and allow rules through one deterministic precedence model. Current membership, roles, channel, age-restricted context, entitlement, and bot status are server-side facts; client visibility is not authorization.
- Cooldown and concurrency keys are tenant-scoped, bounded, expiring, atomic, and resistant to user-controlled key expansion. Rejected or duplicate interaction delivery cannot consume multiple reservations.
- Reminder content is private to the owner by default. Staff list or cancellation authority is distinct from permission to read content; administrative projections minimize or redact text unless a separately authorized purpose requires it.
- Reminder owner, timezone, content, origin, route policy, recurrence, and history have independent privacy and retention rules. Origin references cannot be used to enumerate inaccessible messages or channels.
- Reminder confirmation, cancel, snooze, edit, and reschedule components validate signed interaction identity, tenant, owner or staff capability, occurrence generation, current state, and deadline. Component possession is not authority.
- Channel fallback never reveals private reminder content after a DM failure unless the owner selected or tenant policy clearly disclosed that route when the occurrence was frozen.
- Time parser inputs are bounded and locale-aware but cannot influence server timezone, environment, scheduler clocks, or arbitrary database expressions. IANA timezone data and parser rules are versioned operational dependencies.
- Invocation arguments and reminder content are excluded from metric labels, ordinary Activity Logs, and span attributes. Audit records store bounded classification and protected references rather than duplicating private text (DR-038).
- Discord login and installation authorization transactions use independent single-use state, exact redirect binding, short expiry, replay detection, and PKCE S256. A login grant cannot be replayed as an installation grant.
- Install and repair authorize URLs are generated by Discord Installation from named presets `GuildInstall`, `UserInstall`, and `GuildRepair`. They include the platform `client_id`, `redirect_uri` on `app.*`, PKCE S256, scopes from enabled-module manifests, and the DR-032 permission bitfield when `bot` is in scope. Named guild install and repair include `guild_id` and `disable_guild_select=true`. Discord Default Install Settings / `client_id`-only URLs are forbidden as product install. Callback `guild_id` and `permissions` are hints, not proofs (DR-050).
- Provider OAuth access and refresh tokens, payment-provider credentials, webhook signing secrets, AI provider credentials, and application-owned Discord webhook tokens live only in a secret-management boundary with environment, service, purpose, and generation isolation.
- Browser sessions are opaque server-side `AUTHORIZATION_SESSION` rows owned by Identity. The browser cookie, when used, carries only the session identifier and MUST set `Secure`, `HttpOnly`, and `SameSite=Lax`. It is host-only on `app.*`. Idle expiry is 12 Clock-port hours sliding; absolute expiry is 7 Clock-port days from creation and MUST NOT extend with activity. Cookie `Max-Age` is not expiry authority. Rotation after authentication-strength changes and revocation-generation checks remain required. Cookie-authenticated state-changing dashboard HTTP MUST pass an Origin check against the dashboard origin allowlist and a CSRF proof that is not the session-id cookie: a session-bound synchronizer token, or a double-submit token. Origin-only CSRF defense is forbidden (DR-025). `SameSite=Lax` is not a complete CSRF control (DR-049). Integrity-protected cookies that themselves are the session, without a server revocation store, are forbidden.
- Dashboard HTML encodes untrusted text by default. Form answers, AI prompts and generated output, template metadata and previews, provider titles and payloads, reminder text, and other tenant- or provider-derived strings are untrusted. HTML markup MAY be emitted only through a named sanitizer with an explicit element and attribute allowlist. The dashboard origin MUST send a Content-Security-Policy with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, and script policy that forbids `'unsafe-inline'` and `'unsafe-eval'` except documented hashes or nonces. Additional origins require an explicit documented exception. Disabling CSP for the dashboard is forbidden (DR-030).

#### Security Review

**Current Specification:** Dashboard sessions are opaque server-side Identity aggregates (DR-018). Cookie-authenticated mutations require Origin check plus a synchronizer or double-submit token (DR-025). Authorization-code login and install use PKCE S256 (DR-026). Client-supplied `paid`, `entitled`, and Discord permission bits are not authorization (DR-027). Tenant HTTP workflow triggers use Provider Event Edge §32.14 (DR-028). Untrusted server-side fetches pin destination IPs and deny private and metadata ranges (DR-029). Dashboard HTML encodes untrusted text and sends CSP; AI, template, form, and provider fields are untrusted (DR-030). Retrieved guild, form, and provider content cannot select AI tools or grant capabilities (DR-031). Install and repair request the minimal union of enabled-module named permissions; Administrator is never default or a repair shortcut (DR-032). Install authorize URLs are generated from named presets; named guild install and repair lock `guild_id` (DR-050). Tenant-scoped storage access includes a tenant predicate bound from authenticated context; parameterized queries fail closed without it (DR-033). Outgoing interaction webhooks verify Discord Ed25519 over the exact raw body before parse (DR-034). First-product interaction ingress is Gateway `INTERACTION_CREATE`; webhook HTTP is not admitted in that mode (DR-042). Secret Store mounts include Identity, Interaction, Transport, Billing, and AI adapters; the bot token is Gateway and Transport only (DR-035). Metrics scrape is internal-only; liveness and readiness omit tenant identifiers and secrets (DR-036). Template, workflow, custom-command, and job bytes are admitted only through versioned schema parse (DR-037). Span attributes use the same field allowlist as logs; prompts and reminder text are not copied into traces (DR-038). Payment HTTP acknowledgement follows a durable Provider Event Edge ingress receipt and is not commercial fulfillment (DR-022, DR-067).

**Contradiction C-24 (resolved by DR-018):** §17.2 no longer offers integrity-protected cookies as an alternative session. [23-platform-access-commercial-ai.md](23-platform-access-commercial-ai.md) §34.4 remains the session model: opaque identifier, server revocation store, generation check.

**Recommended Improvement:** Session SameSite, idle/absolute TTL, login audit catalog, Discord re-fetch staleness, and high-risk step-up are DR-049. Invite URL construction is DR-050. Canonical register: [00-architecture-review.md](00-architecture-review.md#16-bot-installation-review).

#### Decision Record DR-018

**Status:** Accepted.

**Decision:** The dashboard session is Identity's opaque server-side `AUTHORIZATION_SESSION`. The browser cookie, when used, carries only the session identifier and MUST set Secure, HttpOnly, and a SameSite attribute. Discord tokens, authorization claims, and self-sufficient signed sessions MUST NOT live in the cookie. Integrity-protected cookies without a server revocation store are forbidden. CSRF mechanism, exact SameSite value, and idle/absolute TTL numbers remain unspecified. PKCE as spec MUST remains OD-07.

**Rejected Alternative:** Integrity-protected cookies as an alternative to a server session; JWT or similar claims cookies as the session of record.

#### Decision Record DR-025

**Status:** Accepted.

**Decision:** Cookie-authenticated state-changing dashboard HTTP MUST pass an Origin (or equivalent Referer) check against the dashboard origin allowlist and a CSRF proof that is not the session-id cookie. The proof is a session-bound synchronizer token or a double-submit token. Identity issues and verifies the secret bound to `AUTHORIZATION_SESSION`. Control API enforces the check before admission. Safe methods MUST NOT mutate. Origin-only defense is forbidden. Exact SameSite value and idle/absolute TTL numbers remain unspecified. PKCE as spec MUST remains OD-07.

**Rejected Alternative:** Origin-only CSRF defense; placing the CSRF secret in the HttpOnly session-id cookie; treating SameSite as a complete CSRF control.

#### Decision Record DR-026

**Status:** Accepted.

**Decision:** Every Discord authorization-code transaction for dashboard login and application installation MUST use PKCE with `code_challenge_method=S256`. Single-use `state` remains required. Confidential-client class does not waive PKCE. The verifier is server-side, single-use, and MUST NOT enter the session cookie, logs, or browser storage as a long-lived secret. `plain` PKCE is forbidden. Missing, reused, or mismatched verifier is a terminal audited rejection.

**Rejected Alternative:** Leaving PKCE as “where applicable”; waiting for Discord to mandate PKCE for confidential web clients; `plain` code challenge.

#### Decision Record DR-027

**Status:** Accepted.

**Decision:** Cookie-authenticated dashboard HTTP MAY name target tenant, guild, and resource identities. Control API and owning modules MUST NOT treat client-supplied commercial status (`paid`, `entitled`, premium, invoice-paid flags), Discord permission bitfields, owner flags, or guild-discovery observations as authorization. Commercial truth is Billing and Platform Entitlement. Discord membership and guild authority are revalidated server-side through Discord Capability. Billing, install repair, and destructive configuration fail closed when that revalidation is unavailable. Query and Status projections are not mutation authority.

**Rejected Alternative:** Trusting a dashboard POST of `paid`, `entitled`, or Discord permission bits; using cached guild discovery as sufficient authorization.

#### Decision Record DR-049

**Status:** Accepted.

**Decision:** Session cookie is `Secure`, `HttpOnly`, host-only, `SameSite=Lax`. Idle 12 Clock-port hours sliding; absolute 7 Clock-port days from creation. Discovery observations 15 minutes; ordinary Capability 60 seconds; high-risk live revalidation plus step-up within 5 Clock-port minutes. Login audit uses a named catalog without secrets. `SameSite` is not a complete CSRF control.

**Rejected Alternative:** `SameSite=None` or `Strict`; cookie Max-Age as expiry authority; SameSite as CSRF; high-risk from a stale discovery observation.

#### Decision Record DR-028

**Status:** Accepted.

**Decision:** Every tenant HTTP workflow trigger MUST terminate at Provider Event Edge and follow §32.14: opaque endpoint generation, signature or authenticated connection over exact transport bytes, timestamp freshness, replay identity, and a durable ingress receipt before HTTP acknowledgement. After that receipt, Edge publishes to Workflow, not External Live Signal. Workflow consumes the authenticated ingress fact asynchronously. It MUST NOT skip Edge, open a private public HTTP listener, or treat URL possession as authentication. Unsigned tenant webhooks are forbidden. A secret solely in the query string or path is not sufficient authentication.

**Rejected Alternative:** Unsigned tenant webhook URLs; query-string or path secret as the only control; Workflow verifying public HTTP itself.

#### Decision Record DR-029

**Status:** Accepted.

**Decision:** Any server-side HTTP(S) fetch whose destination is influenced by untrusted or tenant-supplied input MUST admit scheme and hostname, resolve DNS, pin the destination IP for that hop, re-pin after every redirect within a bounded hop count, and deny loopback, link-local, RFC1918, IPv6 unique-local (`fc00::/7`), IPv4-mapped equivalents of those ranges, and cloud-metadata addresses. A hostname allowlist is necessary and not sufficient. Named first-party adapters (Discord Transport, admitted payment and AI providers) use operator-configured destinations; their redirects still re-pin and deny private and metadata ranges. RFC1918 or loopback MAY be used only by a named operator-configured adapter with an explicit internal destination profile. Tenant-supplied, payload-supplied, and remote-media URLs MUST NOT use that profile.

**Rejected Alternative:** Hostname-only allowlists; following a redirect to a newly resolved private or metadata address; treating DNS at start-of-request as authority for later hops.

#### Decision Record DR-030

**Status:** Accepted.

**Decision:** Dashboard HTML encodes untrusted text by default. Form answers, AI prompts and generated output, template metadata and previews, provider titles and payloads, and other tenant- or provider-derived strings MUST NOT be interpolated as HTML. Markup MAY be emitted only through a named sanitizer with an explicit element and attribute allowlist. The dashboard origin MUST send Content-Security-Policy with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, and script policy that forbids `'unsafe-inline'` and `'unsafe-eval'` except documented hashes or nonces. JSON API responses MUST use a non-HTML media type and `X-Content-Type-Options: nosniff`. Disabling CSP, treating model output as trusted HTML, or marking Query projections as safe markup is forbidden.

**Rejected Alternative:** Interpolating AI, template, or form fields as HTML; disabling CSP; `'unsafe-inline'` or `'unsafe-eval'` as the script policy.

#### Decision Record DR-031

**Status:** Accepted.

**Decision:** Retrieved guild messages, form answers, provider payloads, OCR and transcript text, conversation history, and model output are untrusted for tool selection and authorization. Platform-authored system instructions, pinned character or workflow policy, and the admitted tool catalog MUST NOT be overwritten by retrieved content. AI tools MUST be an allowlisted catalog. Each tool invocation is a typed command to the owning service and is reauthorized independently of the model. Model output MUST NOT grant a new capability, widen the catalog, skip owning-service authorization, or select arbitrary HTTP or Discord effects.

**Rejected Alternative:** Treating retrieved content as instructions; letting the model pick unrestricted tools; executing Discord effects from free-text model output without a typed reauthorized command.

#### Decision Record DR-032

**Status:** Accepted.

**Decision:** The Discord bot permission bitfield requested on install and repair MUST be the minimal union of named permissions from currently enabled module capability manifests. Administrator MUST NOT be the default install set, MUST NOT be a repair shortcut when a named permission is missing, and MUST NOT be requested because a module manifest is incomplete. Disabled modules MUST NOT inflate the request. Enabling another module MUST create a new authorization generation. An incomplete manifest fails closed rather than substituting Administrator.

**Rejected Alternative:** Inviting Administrator “to simplify”; using Administrator as repair when a named bit is missing; accumulating disabled-module permissions; substituting Administrator because a module manifest is incomplete.

#### Decision Record DR-050

**Status:** Accepted.

**Decision:** Installation generates Discord authorize URLs from named presets. `client_id` is the platform application. Named guild install and repair lock `guild_id` and set `disable_guild_select=true`. `permissions` is DR-032 only with `bot` scope. Callback query parameters are hints.

**Rejected Alternative:** Client-supplied authorize URL; Discord Default Install Settings as product install; unlocked guild picker after a guild is named.

#### Decision Record DR-033

**Status:** Accepted.

**Decision:** Every read and mutation of a tenant-scoped aggregate, projection, cache entry, object key, inbox row, or outbox row MUST include a tenant predicate bound from authenticated context (session, installation, capability, or signed interaction), not solely from a client-supplied `tenant_id` or `guild_id`. Queries MUST be parameterized. A missing or mismatched tenant predicate MUST fail closed: zero rows for reads, rejected mutation. A globally unique primary key MUST NOT substitute for the tenant predicate. Cache keys and object-storage keys MUST include the same tenant bound. Cross-tenant joins on product query paths are forbidden. A named platform-operator aggregate path MAY cross tenants and is not the product query API.

**Rejected Alternative:** Trusting a client-supplied tenant identifier; omitting the tenant predicate because the primary key is globally unique; concatenating identifiers into SQL; treating unscoped ORM queries as sufficient.

#### Decision Record DR-034

**Status:** Accepted.

**Decision:** If Interaction Edge uses outgoing webhook mode, every HTTP request MUST verify Discord Ed25519 (`X-Signature-Ed25519` and `X-Signature-Timestamp`) over the timestamp concatenated with the exact raw body, before JSON parse. Timestamp freshness is required. The application public key lives in the secret-management boundary and MUST NOT appear in a query string or path. Missing, stale, or invalid signatures fail closed, including Discord's PING handshake. Gateway mode MUST NOT admit that HTTP path. Gateway-delivered interactions are authenticated by the Gateway session, not by this HTTP signature.

**Rejected Alternative:** Parsing JSON before verification; treating TLS as sufficient authentication; placing the public key in a query string or path; accepting webhook HTTP while Gateway mode is selected.

#### Decision Record DR-042

**Status:** Accepted.

**Decision:** First-product Interaction Edge ingress is Gateway `INTERACTION_CREATE`. Gateway mode MUST NOT admit the outgoing-webhook HTTP path and MUST NOT run concurrently with webhook mode. The initial acknowledgement or defer MUST complete within Discord's 3-second budget and MUST NOT wait on bus publish. Outgoing webhook mode remains specified for a later operator choice under DR-034.

**Rejected Alternative:** Webhook-first; concurrent Gateway and webhook; bus-then-ACK; a public Interaction HTTP listener in first product.

#### Decision Record DR-035

**Status:** Accepted.

**Decision:** The Secret Store trust-boundary diagram MUST show mounts to Identity, Interaction Edge, Discord Transport, Billing, and AI adapters, in addition to Gateway Edge. The Discord bot token is mounted only on Gateway Edge and Discord Transport. Control API and product Domain workers MUST NOT receive the bot token. Delivery MAY receive application-owned Discord webhook tokens and MUST NOT receive the bot token.

**Rejected Alternative:** Drawing secrets only to Gateway and Delivery; mounting the bot token on Domain or Control API.

#### Decision Record DR-036

**Status:** Accepted.

**Decision:** Metrics scrape endpoints MUST be reachable only from the internal scrape network. Access MUST use network policy, mTLS, or authenticated scrape. Metrics MUST NOT be reachable from the public internet or the dashboard origin. Liveness and readiness MAY be unauthenticated and MUST NOT include tenant identifiers, secrets, tokens, or unbounded high-cardinality labels. Metric labels MUST NOT include tenant IDs, member IDs, tokens, or secret material.

**Rejected Alternative:** Public `/metrics`; unauthenticated internet scrape; putting tenant IDs or secrets in metric labels or in liveness and readiness bodies.

#### Decision Record DR-037

**Status:** Accepted.

**Decision:** Template packages, workflow graphs, custom-command compiled plans, and worker-queue or job payloads MUST be admitted only through a versioned schema parse. Language-native object codecs over untrusted bytes are forbidden. Content-type or file extension is not sufficient. Unknown structure fails closed before object construction. Deserialize-then-validate is forbidden.

**Rejected Alternative:** Reconstructing language-native object graphs from template or job bytes; deserialize then validate; trusting Content-Type alone.

#### Decision Record DR-038

**Status:** Accepted.

**Decision:** Span attributes, baggage, and other distributed-trace fields MUST use the same field allowlist as structured logs. AI prompts, model output, reminder body text, form answers, message content, invocation arguments, and secret material MUST NOT be copied into traces. Correlation uses the identifier catalog in §18.1, not payload text. Auto-instrumentation that records HTTP bodies, Discord message content, or provider request bodies is forbidden unless those fields pass the same allowlist. Named diagnostic sampling already constrained for logs MAY apply to traces under the same encryption, access, redaction, purpose, and expiry controls.

**Rejected Alternative:** Copying prompts or reminder text into span attributes for debugging; treating traces as a looser allowlist than logs; recording request or message bodies by default.

**Risk:** stolen session after logout remains pre-MVP for the dashboard. CSRF on cookie-authenticated mutations is closed by DR-025. PKCE “where applicable” is closed by DR-026. Frontend grants of paid or Discord bits are closed by DR-027. Unsigned workflow webhooks are closed by DR-028. Hostname-only SSRF defense is closed by DR-029. Untrusted dashboard HTML is closed by DR-030. Prompt injection into privileged tools is closed by DR-031. Administrator as an install or repair shortcut is closed by DR-032. Missing tenant predicates on storage access are closed by DR-033. Forged interaction HTTP in webhook mode is closed by DR-034. Secret Store edges limited to Gateway and Delivery are closed by DR-035. Public `/metrics` is closed by DR-036. Native codecs on template or job bytes are closed by DR-037. Prompts and reminder text in traces are closed by DR-038. Payment ACK treated as fulfillment is closed by DR-022. Billing as a public payment webhook listener, or ACK delayed until entitlement projection, is closed by DR-067.
- Guild discovery observations are never sufficient authorization. Client-supplied `paid`, `entitled`, Discord permission bitfields, and owner flags MUST NOT authorize (DR-027). Sensitive configuration, billing, installation, export, secret, and destructive operations revalidate current account state, guild membership, required guild authority, billing-owner membership, tenant binding, and owning-service policy.
- Payment callback endpoints terminate at Provider Event Edge, verify the exact raw request signature before parsing, enforce freshness and replay protection where the provider contract permits, bind events to one provider account and environment, commit a durable Edge ingress receipt, acknowledge only after that receipt, and let Billing process commercial transitions asynchronously. The HTTP acknowledgement is not paid, entitled, or fulfilled, and MUST NOT wait for entitlement projection (DR-022, DR-067).

#### Decision Record DR-067

**Status:** Accepted.

**Decision:** Payment-provider HTTP callbacks MUST terminate at Provider Event Edge and follow the 9.36 ACK/inbox path. HTTP success ACK is allowed only after a durable Edge ingress receipt. Duplicates ACK success and reuse that receipt. Invalid, expired, or unknown generation MUST NOT ACK success. ACK MUST NOT wait for Billing apply, `GRANT_SOURCE`, entitlement projection, or lot mint. Billing MUST NOT open a public payment webhook listener. DR-022 receipt-versus-fulfillment glossary is unchanged.

**Rejected Alternative:** Billing as the public webhook listener; ACK after entitlement projection; ACK before durable ingress; treating Edge ACK as `GRANT_SOURCE` apply.
- Payment credentials are least-privilege, service-specific, non-exportable to clients, independently rotated, and restricted by network policy where supported. Provider object identifiers and sanitized errors may cross services; credentials and raw payment details may not.
- Hosted checkout or billing-portal return pages never grant access. Commercial fulfillment requires verified asynchronous provider state or explicit provider reconciliation. Fulfillment is a later Billing transition, not the ingress receipt, not the HTTP acknowledgement, not CheckoutAttempt `Completed`, and not a landing-page retrieve of a Checkout Session (DR-051). Commercial refund `Succeeded` likewise requires verified provider refund object state; create-refund HTTP MUST NOT rewrite Invoice `Paid` or Order `Fulfilled` (DR-052). Commercial dispute `Open` freezes grants; dispute-webhook ACK is not `Won` or `Lost` (DR-053).
- The platform does not store raw primary account numbers, card verification values, or equivalent payment credentials. Payment collection remains on an admitted provider-hosted or provider-controlled compliant surface.
- Commercial catalog publication, price mapping, refund, dispute accept or evidence submit, billing ownership transfer, promotional grants, AI Credit adjustment, and entitlement override are separately authorized, strongly audited capabilities.
- Billing tax configuration stores classification and collection evidence but never asserts legal registration or filing compliance. Enabling automated tax calculation requires an active jurisdictional registration and a verified test for the configured product class; legal obligations remain subject to qualified review.
- AI prompts, uploaded media, OCR documents, transcripts, conversation context, embeddings, generated output, safety decisions, and provider request references have explicit purpose, privacy class, encryption, access, residency, retention, deletion, and training-use policies.
- AI providers receive only the minimum context required for the admitted operation. Provider-side retention or training incompatible with the tenant policy causes admission failure or routing to a compatible adapter.
- AI Credit reservations and pricing cannot be influenced by client-supplied provider usage. Settlement accepts only a normalized usage receipt bound to the operation, provider attempt, pricing revision, and integrity evidence.
- Template publication rejects executable code, secrets, raw database records, arbitrary provider URLs, unbounded assets, undeclared destructive effects, and privilege requests outside the manifest. Import executes only typed commands reauthorized by each owning service. Package bytes are admitted only through a versioned schema parse (DR-037).
- Template author, reviewer, installer, rater, and operator capabilities are independent. Ratings require an eligible completed installation and are protected against self-dealing, automation, duplication, and coordinated manipulation.
- Workflow triggers, conditions, variables, secrets, actions, replay, and execution logs have separate access policies. Secret values are resolved just in time by the authorized adapter and never copied into definitions, events, previews, or logs. HTTP workflow triggers terminate at Provider Event Edge; Workflow MUST NOT treat URL possession as authentication (DR-028).
- Workflow graphs are finite and resource-bounded. Recursion lineage, event-loop suppression, maximum depth, maximum fan-out, maximum duration, and destination budgets are enforced before downstream effects.
- AI character presentation discloses automation according to platform policy, cannot imitate a member or protected identity, and never treats a webhook username or avatar as authorization. Character context is isolated and deletable independently. Retrieved guild, form, and provider content cannot select tools or grant capabilities; AI tools are an allowlisted catalog of typed commands reauthorized by owning services (DR-031).

## 18. Observability

### 18.1 Correlation

Every request, event, command, render, delivery, and provider request propagates:

- Trace ID.
- Correlation ID.
- Causation ID.
- Tenant ID.
- Module name.
- Configuration revision.
- Message revision.
- Delivery ID.
- Attempt ID where applicable.
- Security incident and containment operation IDs where applicable.
- Role policy, assignment intent, panel, panel publication, and role-resource mutation IDs where applicable.
- Progression ledger, voice session, starboard source aggregate, giveaway and draw, form version and submission, and temporary-room operation IDs where applicable.
- Currency policy, monetary transaction, hold, income action, salary occurrence, purchase, stock reservation, entitlement, game session, outcome, and wager settlement IDs where applicable.
- Support policy and template revision, panel and publication, open request, case, capacity reservation, resource operation and binding, transcript, and archive-job IDs where applicable.
- Integration definition and revision, `STREAM_CANONICAL_IDENTITY`, provider subscription and generation, ingress receipt, observation attempt, external live session, stream-alert occurrence, and projection binding IDs where applicable.
- Custom-command definition and revision, command contribution, registry snapshot and projection generation, provider command binding, invocation, cooldown reservation, action occurrence, reminder revision, reminder occurrence, and schedule generation IDs where applicable.
- Platform account, authorization session and generation, Discord installation and generation, billing owner, commercial order, checkout attempt, subscription, provider event, platform entitlement projection, AI Credit account and reservation, AI operation and provider attempt, template revision and installation, workflow revision and execution, AI character revision, and response occurrence IDs where applicable.

High-cardinality identifiers belong in structured logs and traces, not unbounded metric labels. Metric labels MUST NOT include tenant IDs, member IDs, tokens, or secret material (DR-036). Span attributes MUST use the same field allowlist as logs. AI prompts, model output, reminder body text, form answers, message content, and invocation arguments MUST NOT be copied into traces (DR-038).

### 18.2 Required metrics

**Gateway:**

- Connected shards and shard ownership.
- Heartbeat latency and missed acknowledgements.
- Reconnect, resume, invalid-session, and identify counts.
- Last received sequence and event-ingestion latency.
- Inbox and outbox lag.

**Interactions:**

- Time to acknowledgement.
- Immediate versus deferred ratio.
- Missed deadline and expired-token counts.

**Domain modules:**

- Events accepted, matched, suppressed, and rejected by reason.
- Matcher snapshot build time and age.
- Correlation processes opened, matched, and expired.
- Schedule drift and misfire decisions.

**Delivery:**

- Pending age, claim latency, send latency, and completion latency.
- Attempts and outcomes by normalized category.
- Rate-limit bucket wait time.
- Invalid-request rolling budget.
- Reconciliation cases and unresolved outcomes.

**Moderation and safety:**

- Moderation actions requested, authorized, rejected, applied, failed, uncertain, and compensated by action type.
- Capability-preflight failures by bot permission, actor permission, owner protection, hierarchy, protected-role product policy (Moderation Cases snapshot on the preflight; DR-020), and stale resource state.
- Time from action receipt to provider mutation and time from primary outcome to secondary notification completion.
- Automatic moderation evaluations, hits, native observations, semantic deduplications, incidents, sanctions, and false-positive reviews by rule.
- Native-rule desired/observed drift, synchronization attempts, provider capacity blocks, and last confirmed synchronization.
- Distributed counter saturation, matcher snapshot age, evaluation latency, and cold-snapshot fallback count.
- Activity records accepted, filtered, redacted, attributed, routed, delivered, and retained by category.
- Audit queries, pages, rate-limit wait, permission denial, correlation outcome, and attribution confidence.
- Countdown deletion latency, sweep drift, pages fetched, messages matched, bulk deletions, individual deletions, skips, partial failures, and blocked policies.
- Evidence volume, privacy classification, redaction age, and expired-evidence deletion lag without using message content as a metric label.
- Join observations, raw and risky window counts, threshold crossings, incident starts, aggregations, containments, resolutions, and false-positive reviews by detector class.
- Anti-nuke observations, mapped and unsupported audit actions, executor-resolution state, exemption results, punishment reservations, and cooldown suppression.
- Required security-intent and audit-permission health, event-gap detection, bounded backfill results, compiled security-snapshot age, counter latency, and counter-unavailable decisions.
- Containment preflight latency, apply and restore duration, resources planned, confirmed, blocked, uncertain, conflicted, and acknowledged.
- Invite-pause, direct-message-pause, verification-change, quarantine, dangerous-role-removal, and lockdown outcomes by normalized result without member identifiers as metric labels.
- Security alert queue age, coalescing ratio, delivery state, fallback use, and terminal failure.
- Automatic-role events evaluated, policies matched, intents planned, delayed, expired, unchanged, applied, skipped, blocked, retried, uncertain, and failed by normalized policy class.
- Role-assignment queue age, dispatch latency, provider latency, reconciliation age, stale-intent suppression, group-conflict count, and member backfill progress.
- Panel drafts, preflight failures, publications, effect latency, degraded projections, orphan detections, repairs, stale interactions, mapping invalidations, and tombstones by transport class.
- Role-resource previews, creates, updates, deletes, reorders, privilege-delta classes, stale conflicts, uncertain outcomes, reconciliation decisions, and dependency invalidations.
- Role capability projection age, hierarchy refresh latency, managed or above-bot denials, sensitive-role denials, and provider-limit validation failures.
- XP source events admitted, deduplicated, skipped, awarded, adjusted, capped, and rejected; decision latency; cooldown contention; ledger lag; level transitions; reward outcomes; and compiled policy age.
- Voice progression sessions opened, resumed, segmented, closed, expired, and reconciled; eligible duration; excluded duration by bounded reason; overlap prevention; and stale-session age.
- Leaderboard refresh lag, snapshot age, rows ranked, query duration, publication outcomes, and privacy exclusions.
- Starboard contributions added, removed, deduplicated, reconciled, and rejected; unique contributor count; threshold transitions; projection lag; edit coalescing; degraded bindings; and orphan age.
- Giveaway entries admitted, rejected, withdrawn, and deduplicated; lifecycle drift; snapshot duration and size; draw duration; winner count; reroll generation; fulfillment outcomes; and unfulfilled-winner age.
- Form sessions opened, expired, and submitted; submission latency and outcomes; question validation failures; asset-ingestion outcomes; review queue age; decision conflicts; secondary-effect outcomes; export size and duration; and retention lag.
- Temporary-room creation claims, saga duration, step outcomes, active rooms, capacity denials, owner transfers, access changes, timer drift, empty-room duration, cleanup outcomes, orphan detections, conflicts, and reconciliation age.
- Monetary commands, transactions, postings, holds, captures, releases, reversals, transfer tax postings, account blocks, projection conflicts, journal imbalance detections, and reconciliation lag without member identifiers as metric labels.
- Account current, held, and available aggregate volume by tenant class only where privacy and cardinality permit; ceiling denials, freeze state, posting latency, account-lock contention, and outbox lag.
- Income actions requested, admitted, rejected, deduplicated, settled, and uncertain by source class; cooldown contention; streak transitions; salary occurrence drift, page lag, recipient outcomes, and anomaly classes.
- Catalog publication health, item and category counts, shop page latency, eligibility denials, purchase-limit denials, stock reservations, contention, expiry, order state age, payment latency, and refund state.
- Entitlements requested, activated, partial, expired, revoked, conflicted, and reconciled by type; external-effect latency; manual-case age; timer drift; owned-resource orphan age; and compensation outcome.
- Casino sessions opened, active, expired, recovered, settled, and blocked by game type; action latency; stale-action rejection; randomness health; wager hold age; settlement lag; payout exposure; and recovery-case age.
- Support policy and template publications, validation failures, dependency health, compiled snapshot age, and authorization denials by bounded reason.
- Support panel drafts, publications, projection latency, degraded effects, identity mismatches, orphan detections, stale interactions, repair outcomes, and retired bindings.
- Support open requests, intake sessions and outcomes, capacity reservations and denials, cooldown denials, duplicate suppression, allocation latency, queue depth, and case state age.
- Support claims, unclaims, waits, escalations, resolutions, closes, reopens, participants, first staff response, assignee response, resolution duration, waiting duration, and service-level deadline outcomes without member identifiers as metric labels.
- Support resource preflight latency, provision duration, step outcomes, active bindings, permission conflicts, external deletion, orphan age, access convergence, cleanup duration, and reconciliation results.
- Support archive events admitted, content unavailable, attachment outcomes, capture gaps, transcript coverage, generation duration, artifact size, delivery outcomes, access denials, redactions, legal holds, and retention lag.
- Integration definitions drafted, enabled, disabled, degraded, blocked, and retired; identity-resolution latency and outcomes; dependency-health age; test-alert requests and outcomes.
- Provider callback requests, authentication failures by bounded reason, replay duplicates, verification challenges, acknowledgement latency, body-size rejection, clock-skew rejection, revocations, keepalive age, connection changes, and ingress lag.
- Provider subscription desired and active counts, operation age, create renew rotate delete outcomes, uncertain effects, verification latency, drift, expiry horizon, revocation reasons, repair outcomes, and fallback activation.
- Provider observation due lag, lease contention, batch size, page count, request latency, classification, conclusive ratio, cache ratio, rate-limit wait, quota reservation and depletion, circuit state, credential health, and freshness age by provider and credential class without tenant or identity identifiers as metric labels.
- External sessions candidate, live, ending, ended, stale, and conflicted; event-to-transition latency; poll-to-transition latency; source disagreement; duplicate suppression; metadata coalescing; fan-out page age; and source watermark lag.
- Stream-alert occurrences created, suppressed, queued, delivered, blocked, retried, uncertain, unresolved, refreshed, offline-projected, and cleaned; transition-to-Discord latency; destination preflight failure; mention denial; binding orphan age; and lifecycle deadline drift.
- Custom-command drafts, publications, activations, disables, dependency failures, compile duration, template complexity rejection, previews, and tenant-limit denials.
- Application-command contributions, registry snapshot size, conflicts, compile latency, projection operations, Discord request latency, converged generations, uncertain outcomes, drift age, provider binding changes, and reconciliation results.
- Custom-command interactions received, acknowledged, deferred, routed, accepted, rejected, expired, partially completed, and completed; policy-decision latency; cooldown contention; argument validation failure; action count and outcome; and end-to-end response latency without argument or member values as metric labels.
- Reminder definitions created, revised, paused, resumed, cancelled, completed, and expired; parser outcomes, timezone ambiguity decisions, recurrence expansion, quota denials, and origin-reference availability.
- Reminder occurrence due lag, claim contention, lease expiry, stale-worker suppression, route selection, DM and channel outcomes, retry age, delivery latency, cancellation race, snooze generation, missed deadlines, dead-letter age, and reconciliation results without reminder content or owner identifiers as metric labels.
- OAuth transactions accepted, rejected, replayed, expired, and exchanged; session creation, renewal, idle expiry, absolute expiry, revocation, compromise, and guild-authority revalidation outcomes without token or user identity metric labels.
- Installation generations, authorization callbacks, presence confirmation latency, per-module capability health, missing permission and hierarchy classes, command projection state, degraded duration, repair attempts, and removals.
- Catalog publications and validation failures; checkout attempts; verified, duplicate, invalid-signature, out-of-order, and reconciliation-derived provider events; subscription transitions; invoice, refund, dispute, and grace state age.
- Platform entitlement projections, invalidation lag, cache age, feature denials, limit admissions, overage state, downgrade boundaries, and source reconciliation without billing-owner identifiers as metric labels.
- AI Credit grants, lot expirations, reservations, captures, releases, refunds, disputes, balance reconciliation, spending-limit denials, and stale reservation age; AI operations by class, provider-adapter latency, moderation result, uncertainty, and settlement lag without prompt or output content.
- Template scans, reviews, reports, publications, installs, preflight denials, step outcomes, rollbacks, ownership conflicts, rating eligibility denials, and reputation-projection lag.
- Workflow trigger admissions, deduplications, loop suppressions, condition latency, action fan-out, concurrency contention, partial outcomes, compensation, dead letters, replay, and per-owner downstream latency.
- AI character matches, suppressions, context size classes, cooldown and concurrency denials, spending denials, generation latency, moderation blocks, delivery outcomes, webhook presentation health, and retention lag without conversation content.

**Media and voice:**

- Render queue depth, CPU time, memory high-water mark, artifact size, and cache ratio.
- Asset fetch latency, rejection reason, and byte volume.
- Voice session count, packet loss, jitter, reconnects, and encode/decode saturation.

### 18.3 Health semantics

- **Liveness** answers whether the process can make progress internally.
- **Readiness** answers whether the replica may accept new work.
- **Dependency health** is reported separately and MUST NOT automatically fail process liveness.
- Gateway readiness is shard-specific.
- A transport replica is not ready when rate-limit coordination or credentials are unavailable.
- A renderer is not ready when it cannot obtain admission capacity or required fonts.
- A security evaluator is not ready for automatic enforcement without a valid compiled policy snapshot and atomic counter capability; it MAY remain ready for observe-only ingestion when durable observations can still be accepted.
- A containment worker is not ready without fenced-lease storage, authoritative step state, capability access, and governed Discord transport.
- A role-assignment worker is not ready for mutation without authoritative intent storage, a valid policy snapshot where required, fresh-enough role capability access, and governed transport.
- A role-panel worker is not ready for publication without authoritative panel revisions, Delivery availability, and capability preflight; interaction ingestion may remain ready while bounded durable buffering is available.
- A role-resource worker is not ready for mutation without live hierarchy capability and durable mutation receipts; read projections may remain available with explicit freshness.
- A progression evaluator is not ready to award without an immutable compiled policy and durable ledger uniqueness; metadata-only evaluation may remain ready when content capability is absent and the policy defines that mode.
- A starboard worker may accept durable contribution changes while projection delivery is degraded, but its health must expose projection lag and reconciliation coverage separately.
- A giveaway worker is not ready to close or draw without authoritative entries, a fenced transition store, secure randomness, and durable entrant snapshots. Entry ingestion may remain ready while bounded buffering is available.
- A form receiver is not ready to accept a submission unless it can commit the submission and required asset state durably. Review and export dependencies are reported separately.
- A temporary-room worker is not ready for mutation without creation-claim storage, lifecycle fencing, fresh channel capability, and governed transport; observation may remain ready for repair indexing.
- A Monetary Ledger worker is not ready for writes without transactional journal storage, balance constraints, idempotency receipts, and outbox durability. Read projections may remain available only with explicit watermark and freshness.
- An Earnings worker is not ready to decide randomized actions without an immutable policy snapshot, durable occurrence storage, secure randomness, and Monetary Ledger command availability or bounded durable dispatch.
- A Commerce worker is not ready to admit paid purchases without authoritative item revision, atomic stock reservation, purchase idempotency, and Monetary Ledger hold capability. Catalog reads may remain available as stale-marked projections.
- An Entitlement worker is not ready for provider mutation without durable lifecycle state, current owner-service capability, fenced timers, and reconciliation storage.
- A Casino Game worker is not ready to accept wager-bearing play without durable session state, fencing, secure randomness, and Monetary Ledger holds. It may acknowledge inspection commands while game admission is disabled.
- A Support Panel worker is not ready for publication without immutable panel and template revisions, Delivery, destination capability, and binding storage; interaction ingestion may remain ready while durable case commands can still be accepted.
- A Support Case worker is not ready for admission without authoritative policy, atomic capacity storage, sequence allocation, idempotency, and durable outbox. Existing-case reads may remain available with explicit freshness.
- A Support Resource worker is not ready for mutation without fenced operation state, current Discord capability, governed transport, ownership receipts, and reconciliation storage.
- A Support Archive worker is not ready to claim complete capture without required intent and resource coverage. It may remain ready for metadata-only or explicitly incomplete capture when the active policy permits it.
- A Provider Event Edge replica is not ready for an endpoint generation unless it can load the current verification material, enforce replay and freshness policy, and durably commit ingress receipts. Failure of one provider endpoint does not remove readiness for unrelated provider generations.
- A Provider Observation worker is not ready for a credential scope without fenced scheduling, quota state, adapter contract, and durable result publication. Quota exhaustion is dependency health, not process liveness failure.
- A Provider Subscription worker is not ready to mutate a provider resource without current desired claims, endpoint generation, credential scope, fenced operation storage, and bounded reconciliation access.
- An External Live Signal worker is not ready to advance sessions without authoritative aggregate storage, occurrence uniqueness, provider capability profile, and durable outbox. It may continue read queries while transition admission is disabled.
- Integration Registry reads may remain available with explicit health and freshness when provider identity resolution is unavailable, but new definitions cannot be enabled without the mandatory identity and destination checks.
- An Application Command Registry worker is not ready for projection without the complete desired-owner set, current application identity, fenced operation storage, governed Discord transport, and reconciliation access. Read projections remain available with explicit generation age.
- A Custom Command Runtime worker is not ready to accept invocations without immutable executable revisions, atomic cooldown storage, interaction routing bindings, durable invocation storage, and Delivery admission. It may reject safely while acknowledging interactions when policy snapshots are unavailable.
- A Reminder worker is not ready to claim due occurrences without authoritative occurrence state, fencing, time capability, and durable Delivery dispatch. Creation reads may remain available, but accepting a reminder requires atomic definition and first-occurrence persistence.
- Identity and Session is not ready to complete OAuth callbacks without current state storage, exact redirect configuration, secret access, provider exchange capability, and session-revocation storage. Existing sessions may be validated only while their credential generation can be checked authoritatively.
- Discord Installation is not ready to report healthy without provider-observed presence, current module manifest, Discord Capability access, and Application Command Registry state. It may preserve a degraded read model while repair mutation is unavailable.
- Billing Orchestrator is not ready to process a provider event without signature material, durable deduplication, provider-account binding, and outbox storage. Checkout creation may be disabled independently while event intake and reconciliation remain operational.
- Platform Entitlement is not ready to authorize new capacity without authoritative grant state and atomic projection generation. Product modules fail closed for new admissions when a hard entitlement cannot be validated, while existing data remains readable according to policy.
- AI Usage Ledger is not ready to reserve or settle without transactional journal, lot-allocation constraints, pricing revision access, idempotency, and durable outbox. Balance reads expose an explicit watermark when writes are unavailable.
- AI Execution is not ready to start a billable provider call without entitlement, an AI Credit reservation, moderation policy, provider credential isolation, and durable operation state. A provider outage disables only affected model classes or adapters.
- Template installation is not ready without a complete immutable package, review state, target preflight, owner-service dry-run plans, and durable step receipts. Marketplace browsing may remain available with explicit freshness.
- Workflow Runtime is not ready to accept a trigger without an immutable compiled revision, deduplication, concurrency admission, recursion guard, durable action state, and typed downstream command availability. It may suppress safely and record the reason.
- AI Character is not ready to respond without an active revision, context isolation, current entitlement, spending capacity, AI Execution, and Delivery admission. Character configuration reads remain available while responses are paused.

## 19. Deployment portability

### 19.1 Runtime contract

Every service MUST:

- Run as an unprivileged process.
- Use immutable images or artifacts.
- Store no authoritative state on local ephemeral disk.
- Receive configuration through environment-neutral configuration providers.
- Receive secrets through mounted files or a secret-provider interface, not baked images. Mounts follow the §17.1 Secret Store edges: Identity, Interaction Edge, Transport, Billing, and AI adapters in addition to Gateway; the bot token is not mounted on Control API or Domain (DR-035).
- Expose separate liveness, readiness, and metrics endpoints. Metrics scrape MUST be internal-only (network policy, mTLS, or authenticated scrape) and MUST NOT be reachable from the public internet or the dashboard origin. Liveness and readiness MAY be unauthenticated and MUST NOT include tenant identifiers, secrets, tokens, or unbounded high-cardinality labels (DR-036).
- Support graceful shutdown with work lease release or expiry.
- Handle termination without losing accepted durable work.
- Emit structured logs to standard output or a configurable sink. Trace exporters MUST apply the same field allowlist; prompts and reminder text MUST NOT appear as span attributes (DR-038).

### 19.2 Container deployment

```mermaid
flowchart TB
    LB[Layer 7 load balancer]

    subgraph StatelessPool[Horizontally scaled stateless services]
        API1[Control API replicas]
        INT1[Interaction Edge replicas]
        QUERY[Query replicas]
    end

    subgraph ShardPool[Shard leased services]
        GW1[Gateway Edge replica]
        GW2[Gateway Edge replica]
    end

    subgraph WorkerPool[Autoscaled workers]
        DOM[Domain consumers]
        DEL[Delivery workers]
        REN[Render workers]
        VOI[Voice media workers]
    end

    subgraph DurablePlane[Externalized durable services]
        BUS[(Event bus)]
        SQL[(Relational stores)]
        TTL[(Distributed TTL and lease store)]
        OBJ[(Object storage)]
    end

    LB --> API1
    LB --> INT1
    LB --> QUERY
    GW1 --> BUS
    GW2 --> BUS
    BUS --> DOM
    BUS --> DEL
    DEL --> REN
    GW1 --> SQL
    GW2 --> SQL
    DOM --> SQL
    DEL --> SQL
    REN --> OBJ
    WorkerPool --> TTL
```

The public load balancer MUST NOT route metrics scrape paths. Metrics scrape uses a distinct internal network, mTLS, or authenticated scrape (DR-036).

The topology runs under a container orchestrator or a simpler container runtime. Orchestrator-specific service discovery, autoscaling, and secret delivery are adapters, not domain assumptions.

### 19.3 Orchestrated deployment requirements

- Gateway Edge uses disruption budgets and ordered, shard-aware rollout.
- Interaction Edge and Control API may use normal stateless rolling deployment. Canonical envelope majors follow expand/contract: consumers that read N and N-1 deploy before producers emit N (DR-048). Owner-schema breaking DDL follows a distinct expand, dual-write, contract, drop path; envelope N-1 is not that soak (DR-064).
- Consumers use queue lag, processing latency, and resource saturation for autoscaling.
- Rendering uses queue depth plus CPU and memory saturation.
- Voice workers use admitted session count and media resource saturation.
- Moderation Case workers scale by command backlog but preserve guild and target conflict ordering.
- Auto Moderation consumers scale by partition lag and evaluation latency; policy snapshots are warmed before readiness.
- Activity Log consumers scale by event lag independently from optional Discord notification delivery.
- Retention workers scale by due occurrences and page backlog while respecting per-guild concurrency ceilings.
- Monetary Ledger workers scale by tenant-account partitions and posting latency while preserving canonical multi-account coordination; no autoscaler may create concurrent ownership that violates account serialization.
- Earnings workers scale by action backlog and salary-recipient pages; salary fan-out remains capped by tenant and ledger admission budgets.
- Commerce workers scale by catalog query load, purchase backlog, and reward-line age while hot stock buckets retain atomic reservation semantics.
- Entitlement workers scale by activation, expiry, and reconciliation backlog independently from purchase admission.
- Casino Game workers scale by active sessions and action latency while session fencing and per-member exposure remain authoritative.
- Support Policy and Panel workers scale by command load and projection backlog; panel publication remains serialized per panel revision.
- Support Case workers scale by open-request and case-command backlog while atomic capacity scopes and per-case ordering remain authoritative.
- Support Resource workers scale by provisioning, access, and cleanup backlog within guild and provider quotas.
- Support Archive workers scale independently by admitted message volume, transcript jobs, rendering resources, and retention backlog so capture cannot delay case controls.
- Provider Event Edge scales by authenticated request rate and acknowledgement latency with endpoint-generation routing; replicas share durable replay state and do not depend on sticky sessions.
- Provider Observation workers scale by due-work lag and provider-specific concurrency headroom; autoscaling cannot exceed credential, quota, rate, or tenant-fairness budgets.
- Provider Subscription workers scale by desired-state backlog, expiry horizon, revocation volume, and reconciliation age while preserving one fenced operation per provider condition.
- External Live Signal workers scale by provider-identity partitions, transition latency, and fan-out backlog; Discord delivery backlog scales independently.
- Custom Command Definition workers scale with control-plane load, while Runtime workers scale independently by interaction backlog and execution latency under cooldown and tenant partitions.
- Application Command Registry workers scale by installation backlog and drift age, but one fenced projection generation remains active per application installation.
- Workflow Definition and Runtime may scale workers by trigger fan-out and action backlog while remaining one module (DR-019). A later process split MUST pass a §3.1 test.
- Reminder workers scale by due-occurrence lag, recurrence expansion, and route-attempt backlog while earliest-due coordination and occurrence fencing remain authoritative.
- Discord Audit Query replicas scale as a read service but remain constrained by tenant and provider request budgets.
- Database and event-bus maintenance MUST preserve quorum and service ownership.
- Availability zones are anti-affinity domains for replicas of the same critical service.
- Graceful termination time MUST exceed normal work-drain time or allow leases to expire safely.

### 19.4 Virtual machine deployment

The same services may run as supervised processes or containers on virtual machines. VM deployment MUST preserve:

- One active owner per shard.
- Externalized relational, event, lease, and object state.
- Workload identity or mutually authenticated service credentials.
- Health-driven restart with restart-rate limiting.
- Independent scaling of Gateway, API, delivery, rendering, and voice roles.
- Internal-only metrics scrape; public listeners MUST NOT expose `/metrics` (DR-036).

## 20. Infrastructure capability contracts

No product module may depend directly on a specific infrastructure product.

| Capability | Required semantics |
|---|---|
| Relational store | Transactions, unique constraints, row-level concurrency, durable indexes, backup and point-in-time recovery |
| Durable event bus | At-least-once delivery, partition keys, consumer groups, acknowledgement, retry delay or retry topic, retention, observable lag |
| Distributed TTL store | Atomic create-if-absent, compare-and-delete, expiry, bounded consistency suitable for cooldowns and leases |
| Distributed window store | Idempotent contribution, atomic event-time prune and count, unique threshold-crossing reservation, finite TTL, bounded cardinality, and replica-safe results |
| Durable timer | Unique occurrence keys, persistent wake-up, reclaimable leases, misfire policy, cancellation, observable lag, and a bounded due-row sweep. The port is the Schedule module's opaque wake-up capability. Every timer owner registers here. Schedule finds due rows; owners keep misfire and terminal semantics. |
| Clock | UTC wall-time instants for `occurred_at`, `received_at`, deadline comparison, and freshness windows; bounded skew policy; test injection. Civil-time parsing MAY use this port plus versioned timezone rules. MUST NOT be due-work authority. Due work remains the Durable Timer port (DR-009). |
| Secure randomness | Cryptographically secure, unbiased byte generation from the host or replaceable trusted source; health reporting; no deterministic fallback for winner selection |
| Object storage | Immutable object keys, bounded upload, metadata, streaming read, lifecycle policy, integrity validation |
| Secret provider | Versioned retrieval, access policy, audit trail, and rotation |
| Telemetry backend | Open trace, metric, and log ingestion protocols with replaceable storage |
| Service discovery | Stable service identity, endpoint discovery, health awareness, and encrypted transport |

The Durable Event Bus is a port. Product modules MUST NOT import a broker client as domain code. The first adapter is Redis Streams, fed by a dispatcher from the owner's transactional outbox after commit. Envelope bytes are versioned JSON; unknown additive fields MUST be tolerated (DR-040). Live readers accept majors N and N-1; unsupported majors fail closed (DR-048). Intra-service due-work claiming remains relational `SKIP LOCKED`. Redis Streams MUST NOT share a cache-evictable instance with the TTL or window adapters. Redis Pub/Sub and RabbitMQ are not this adapter. Canonical replay lives in SQL; the bus MAY forget after consumer-group acknowledgement. Interaction ACK MUST NOT wait on publish (DR-039).

Adapters MUST pass conformance tests. Replacing an adapter must not change domain contracts.

#### Decision Record DR-023

**Status:** Accepted.

**Decision:** Clock is a §20 infrastructure port: UTC wall time, bounded skew for freshness, and test injection. Durable Timer remains Schedule's opaque wake-up and due-row sweep (DR-009). A process-local clock MUST NOT be due-work authority and MUST NOT replace the Clock port. Adapter-conformance entries for identity, Discord transport, and provider ports remain module adapters; they are not additional §20 infrastructure products.

**Rejected Alternative:** Merging Clock into Durable Timer; treating process-local `now()` as Schedule; copying every §22.1 adapter name into this infrastructure table.

#### Decision Record DR-039

**Status:** Accepted.

**Decision:** Cross-service canonical facts MUST commit to the owning module's transactional outbox and then be dispatched to the Durable Event Bus. The first bus adapter is Redis Streams. The outbox is the publication log: append-only; dispatcher states MUST NOT collapse into a single `processed` flag consumed by the first reader. Each consuming service records application in its sibling inbox keyed by consumer group and `event_id`, plus a durable cursor per partition. Foreign services MUST NOT read another owner's outbox tables. Intra-service worker claiming of the owner's own due work and outbox relay MAY use `SELECT … FOR UPDATE SKIP LOCKED`. Redis Streams MUST NOT share a cache-evictable instance with the TTL or window port. Redis Pub/Sub is not the bus. RabbitMQ is not the canonical guild event bus. Kafka is a later adapter, not the first product. `LISTEN/NOTIFY` is a wake-up hint only. Interaction ACK MUST NOT wait on bus publish. Canonical retention and replay live in SQL. The bus MAY forget after consumer-group acknowledgement. Guild-scoped keys use `guild_id` or a stable hash bucket as partition.

**Rejected Alternative:** Postgres-only as the sole cross-service bus; consumers selecting another service's outbox; Redis Pub/Sub; RabbitMQ as the canonical event log; publishing to the broker without an outbox row; marking outbox processed after the first consumer; mixing Streams with cache eviction; Kafka-first.
