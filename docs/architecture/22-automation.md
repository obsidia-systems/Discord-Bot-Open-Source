# Tobot Architecture — Custom Commands and Personal Reminders

[Architecture index](README.md) · [Previous](21-integrations.md) · [Next](23-platform-access-commercial-ai.md)

## 33. Custom commands and personal reminders product specification

### 33.1 Product surfaces and ownership

Custom Commands and Personal Reminders share interaction, time, message, asset, delivery, authorization, and audit capabilities, but they are not one generic automation aggregate.

| Product surface | Owning service | Supporting services |
|---|---|---|
| Custom-command drafts, policy, arguments, responses, and revisions | Custom Command Definition Service | Control API, Message Catalog, Asset, Query and Status |
| Built-in and custom application-command projection | Application Command Registry Service | Discord Capability, Discord Transport, Reconciliation |
| Custom-command invocation and cooldowns | Custom Command Runtime Service | Interaction Edge, Definition read projection, Delivery, Activity Log |
| Reminder settings, definitions, schedules, occurrences, and history | Reminder Service | Interaction Edge, time capability, Schedule wake-up capability, Delivery, Activity Log |
| Command and reminder messages | Delivery Orchestrator | Message Catalog, Asset, Discord Capability, Discord Transport |

An administrative dashboard, Discord command group, or worker queue is an adapter, not a domain owner. Custom Command Definition, Application Command Registry, and Custom Command Runtime remain three modules because Registry is a Discord provider surface and Runtime is the interaction hot path (DR-019). Declarative workflows are a separate module and MUST NOT absorb this split or this template language.

### 33.2 Explicit non-goals

This specification does not provide:

- Arbitrary JavaScript, Lua, Python, shell, WebAssembly, or user-supplied executable code.
- Language-native object codecs over template, compiled-plan, or job bytes.
- Arbitrary HTTP requests, web scraping, database queries, environment access, or secret access.
- Invocation of arbitrary built-in bot commands or recursive custom commands.
- A general workflow builder with unconstrained branching, loops, or resource mutation.
- Message-prefix commands or arbitrary message-content triggers.
- Scheduled guild announcements disguised as personal reminders.
- External calendar synchronization or task management.

Future workflow automation requires its own threat model, capability catalog, quotas, compensation semantics, and architecture decision. It cannot extend the template language by stealth.

### 33.3 Custom-command aggregate

A Custom Command has a stable tenant-scoped identity and immutable revisions. Each revision pins command type, canonical name, descriptions and localizations, typed argument schema, invocation policy, cooldown policy, response-action plan, variable contract, destination and visibility policy, deletion behavior, dependency fingerprint, and effective boundary.

Draft changes do not affect active execution. Publication validates and freezes the revision, then emits a desired registry contribution. Activation requires a confirmed registry binding unless an explicitly configured fail-closed degraded state is being repaired. Historical invocations continue to reference the revision they actually used.

The initial admitted type is a chat-input application command. User-command or message-command types require separate argument and context semantics but still use the same registry owner.

### 33.4 Command names, descriptions, and localization

Names and descriptions follow the current Discord contract and stricter tenant policy. The definition stores a canonical default name and optional locale maps. Validation includes normalization, allowed characters, length, locale code, localized collision, Unicode confusables, prohibited impersonation, reserved prefixes, and stable ownership.

Descriptions are required where the provider command type requires them and explain behavior without hidden authorization claims. Localization changes create a new revision because they change the provider schema and discovery surface.

Names are never the runtime primary key. Interaction routing uses provider command binding plus application and installation identity.

### 33.5 Reserved and built-in command ownership

Application Command Registry maintains an explicit command-owner catalog. Built-in module contributions and custom contributions use the same conflict process. Reserved identities include critical platform, privacy, security, moderation, support, economy, administration, and help commands, plus anti-phishing or product-reserved names.

A custom definition cannot shadow a built-in command through capitalization, localization, command type, Unicode similarity, stale provider binding, or race during bulk overwrite. Conflict blocks the new registry snapshot and preserves the last confirmed safe provider state.

Owner transfer is an explicit audited registry operation. Deleting a custom definition does not grant its provider identity to another definition until retirement and reconciliation complete.

### 33.6 Typed argument schema

Arguments are ordered, stable-keyed declarations mapped to provider-supported option types. An argument specifies provider name, localized description, type, required state, default policy, choices, numeric or length range, channel or user class restrictions, privacy classification, and missing-value behavior.

The runtime accepts only values present in the signed interaction option tree and revalidates them against the pinned revision. It does not parse an untrusted raw command line to reconstruct provider options.

Initial useful types include bounded text, integer, number, boolean, user, role, channel, and provider-supported attachment where separately admitted. Argument count, nesting, choices, localization, autocomplete, and combined command shape are validated dynamically against the current Discord contract.

### 33.7 Defaults, required values, and usage errors

Required arguments missing from a malformed or stale interaction reject execution. Optional defaults are literal typed values or deterministic allowlisted context resolvers declared in the revision. A default cannot query arbitrary services or expand into an undeclared target.

Validation errors return a safe ephemeral response that identifies the argument, expected type or range, and current usage without echoing protected input. The rejection is recorded without consuming response actions. Cooldown policy explicitly declares whether malformed requests consume a reservation; the default is no.

### 33.8 Invocation authorization and precedence

The policy can include tenant capability, enabled state, entitlement, user allow or deny, role allow or deny, channel allow or deny, category constraint, age-restricted channel requirement, bot exclusion, and installation-context restrictions.

Deterministic precedence is:

1. Platform safety and reserved-command denial.
2. Definition, registry binding, tenant, membership, and entitlement validity.
3. Explicit subject, role, and channel denies.
4. Explicit subject overrides admitted by tenant policy.
5. Required allowlists, where a non-empty list must match.
6. Context restrictions such as channel class or age restriction.
7. Cooldown and concurrency admission.

Every stage returns an explainable bounded reason. Role and channel selector visibility is not authorization, and an administrator cannot craft a request that bypasses platform safety.

### 33.9 Atomic cooldown and concurrency policy

Cooldown scope may be tenant-definition-member, tenant-definition-role class, tenant-definition-channel, tenant-definition, or another bounded declared combination. Concurrency may additionally cap active invocations for expensive response plans.

Reservation is atomic across replicas and uses a semantic invocation key. It records start, expiry, scope fingerprint, policy revision, and owner invocation. Duplicate interaction delivery returns the same reservation. Rejection returns authoritative remaining duration without extending it.

Cooldown state is durable or stored in an atomic TTL capability with an authoritative receipt window. A single-node emergency mode may reject new invocations or use a documented conservative policy; it cannot silently become independent per-replica state.

### 33.10 Sandboxed template and expression model

Templates compile at publication into a declarative bounded representation. Supported operations are typed variable insertion, formatting, finite conditional selection, bounded string transformation, and selection from authored message variants. The evaluator has hard limits for input bytes, node count, nesting depth, output bytes, evaluation time, and memory. Compiled plans are admitted only through a versioned schema parse; language-native object codecs over untrusted bytes are forbidden (DR-037).

There are no loops, recursion, dynamic evaluation, reflection, file reads, environment reads, network calls, database access, module loading, timers, nondeterministic functions, or hidden service commands. Random authored variants, if admitted, use a deterministic or durably committed choice keyed by invocation and revision.

Compilation failure blocks publication. Runtime never falls back to unsafe string evaluation.

### 33.11 Variable contract

Variables are individually registered with stable name, type, source owner, privacy class, availability conditions, escaping behavior, maximum size, mention behavior, and missing-value policy.

Initial variable groups may expose bounded facts for:

- Invoker identity and presentation.
- Explicit target argument identity and presentation.
- Guild identity and public configuration metadata.
- Invocation channel identity and presentation.
- Validated typed arguments.
- UTC and configured tenant or user civil time.
- Admitted progression facts such as level or XP through a bounded read contract.

Join time, owner identity, avatar, icon, member count, role, and channel references are supplied only when available and permitted. Locale formatting is explicit and versioned. Variables never embed raw mention permission; mentions use the separate policy.

### 33.12 Response-action plan

A revision contains a finite ordered list of typed actions with a strict maximum. Initially admitted actions are:

- Initial interaction response or edit of a deferred original response.
- Interaction follow-up.
- Direct message to the invoker.
- Message to the current invocation channel when authorized.
- Message to one explicitly configured same-tenant destination when authorized.
- Durable deletion of a message created by an earlier action in the same invocation.

Each action defines required or optional status, visibility, destination, message revision, variable subset, mention policy, not-before boundary, deadline, retry policy, and dependency behavior. Role mutation, moderation, economy, resource creation, and arbitrary command invocation are not generic response actions.

Each action owns an occurrence and outcome. A required failure can mark the invocation partial or failed but cannot undo already visible Discord effects.

### 33.13 Interaction response, ephemeral, and follow-up behavior

Interaction Edge decides immediate response or defer before Discord's deadline. The plan declares desired visibility for the original response. The runtime respects the current provider rule that an existing deferred response's ephemerality cannot be casually changed by a later follow-up.

Long-running policy lookup, Asset preparation, multi-action execution, or DM delivery uses defer. Interaction token expiry is tracked per action. If a useful durable action can use a normal channel or DM route after expiry, that route must have been explicitly declared; the runtime does not silently switch visibility or destination.

Response content and provider flags are validated after rendering. A successful acknowledgement is not a successful domain execution.

### 33.14 Direct-message and channel destinations

DM response is explicit and may include a privacy-safe ephemeral acknowledgement in the guild. DM failure yields a typed action outcome. It does not fall back to a public channel unless the revision explicitly declares a fallback and its preview discloses that behavior.

Configured channel destinations are same-tenant, capability-checked, and immutable within the revision. The current channel may be used only when its class and policy are admitted. A user argument cannot supply an arbitrary destination ID.

Multiple destinations are capped and individually observable to prevent amplification.

### 33.15 Mentions

Mention policy defaults to none. Invoker or explicit target mention may be allowed only when the corresponding typed variable is present and the policy admits that subject. Role mentions require a configured same-tenant allowlist and current authority. Everyone or here requires a stronger explicit capability, preview, cooldown, and anti-spam budget.

Provider-ready allowed mentions are derived from the resolved typed plan, never from scanning rendered text. User input, names, nicknames, guild data, and template strings cannot introduce new mention targets.

### 33.16 Embeds, attachments, and media

Rich responses use Message Catalog. Remote or uploaded media is ingested by Asset Service before publication where durability is required. Runtime does not fetch arbitrary URLs from invocation arguments or local filesystem paths.

Asset health, media type, byte size, dimensions, safety result, retention, and tenant ownership are validated. Optional media failure may omit only an explicitly optional element and records degraded rendering; required media failure blocks the action. Discord content and embed limits are validated after variables resolve.

### 33.17 Durable response deletion

Auto-delete duration is configurable within tenant and provider-safe bounds. Publication declares which owned action message is eligible, minimum and maximum duration, behavior for ephemeral responses, and whether deletion is required or best effort.

Deletion creates a durable generation-bound occurrence after confirmed message creation. It survives worker restart, revalidates application ownership and current provider binding, and passes through Discord Transport. A user deleting the message early produces an idempotent absent result. An unknown or externally owned message is never targeted.

Deleting an invocation message from a future message-trigger mode is outside scope.

### 33.18 Definition preview and validation

Preview uses the exact draft, representative typed arguments, explicit actor/channel context, dependency health, and current provider contract. It displays:

- Command schema and localization conflicts.
- Effective access and cooldown policy.
- Rendered responses by action and visibility.
- Missing variables and fallback results.
- Allowed mentions.
- Asset and destination health.
- Discord command and message limit validation.
- Projection changes and potential command removals.
- Deletion deadlines and partial-effect behavior.

Preview does not reserve a command name, register with Discord, consume cooldown, or create production action occurrences.

### 33.19 Application-command registry composition

Every built-in module and custom definition publishes a versioned desired contribution. Registry compilation loads the complete contribution watermark for one application installation, applies ownership and conflict policy, validates the provider schema, orders deterministically, and commits an immutable snapshot.

The snapshot records every included and excluded contribution with reason, normalized schema hash, desired provider binding where known, and total provider shape. Compilation is idempotent by contribution watermark and capability-profile revision.

A stale or unavailable owner blocks only when its last confirmed desired contribution cannot be trusted. The registry never guesses that absence means deletion.

### 33.20 Discord command projection

Projection selects targeted mutations or complete bulk overwrite according to current Discord support, desired changes, drift, and operational risk. Every operation has a deadline, fencing token, idempotency key, request fingerprint, and observed-state reconciliation plan.

For a complete overwrite, the request contains all admitted command types and owners in the snapshot. After success, the provider response is normalized and bound back to each entry. Missing, extra, altered, or unowned commands create drift or conflict state.

Configuration APIs return published and projection-pending rather than waiting for Discord. A guild-join event requests reconciliation; it does not invoke owner-specific sync routines.

### 33.21 Provider drift and uncertain projection

Periodic and event-triggered reconciliation compares desired snapshot with the current provider registry. Drift classes include missing desired command, unexpected owned command, unknown external command, schema mismatch, provider ID replacement, application identity mismatch, and capacity conflict.

If a create, edit, delete, or overwrite response is lost, the registry reads current provider state before retry. It adopts a command only when owner, application, installation, name, type, schema, and projection generation evidence match. Unknown commands are preserved until ownership policy proves removal is safe.

### 33.22 Invocation routing

Interaction Edge resolves the provider command ID in the current confirmed registry binding. The binding identifies owner service and immutable definition revision. Application ID, guild or installation scope, command type, and binding generation must match.

An interaction for a retired, unknown, stale, or conflicting binding receives a safe acknowledgement and explicit unavailable result. It cannot fall through by command name to whichever custom definition currently matches.

The routing receipt becomes the invocation idempotency basis.

### 33.23 Invocation execution and partial outcomes

Runtime processing order is:

1. Load routing receipt and immutable executable revision.
2. Validate deadline, tenant, membership, binding, definition and dependency state.
3. Evaluate access policy.
4. Bind and validate arguments.
5. Acquire cooldown and concurrency reservation.
6. Freeze variable snapshot and action occurrences.
7. Request actions in declared order with independent idempotency keys.
8. Record completed, partially completed, expired, rejected, or failed summary.

An invocation accepted before a dependency failure remains accepted but may have partial actions. Retrying an action never reruns policy, random choice, or another completed action unless the revision explicitly requires a current authorization gate for safety.

### 33.24 Definition disablement, deletion, and retirement

Disabling publishes a new desired contribution state and immediately prevents new runtime acceptance from the disable boundary, even while Discord still visually exposes a stale command. Invocations routed after disablement reject safely.

Deletion is a retirement workflow:

1. Disable execution.
2. Publish desired command absence.
3. Converge or explicitly degrade provider projection.
4. Retain tombstone and historical revisions while referenced by bindings, invocations, actions, audit, or retention.
5. Delete content and assets only through their privacy and ownership policies.

A failed Discord projection cannot resurrect execution or erase the durable definition.

### 33.25 Custom-command history and audit

History records definition changes, actor, expected revision, publication, activation, projection generation, conflicts, invocation decision class, action outcomes, deletion occurrences, and administrative repair. Argument values, rendered private content, DMs, and protected variables are excluded from ordinary Activity Log entries and from span attributes.

Authorized invocation inspection uses protected references and field-level privacy. Aggregate metrics do not identify members, argument strings, target IDs, or message content.

### 33.26 Reminder policy and settings

Reminder Service has versioned tenant settings for enabled state, creation permission, default timezone source, allowed horizons, pending and recurring limits, minimum frequency, maximum occurrences, delivery routes, channel fallback privacy, content size, retry, deadline, history retention, and staff capabilities.

Optional member settings may define an IANA timezone and default route. Member preference cannot exceed tenant policy. A reminder revision pins the effective settings used; later policy changes declare whether existing pending occurrences continue, pause, or require review.

### 33.27 Reminder ownership and authorization

The creating member owns the reminder. Owners may read, cancel, edit, reschedule, pause, resume, or snooze according to lifecycle state. Staff capabilities for listing metadata, viewing content, cancelling, resolving dead letters, or applying legal and safety policy are separate.

Manage Guild or dashboard access is not automatically full content access. Administrative cancellation may use a protected reminder reference and reason without exposing text. Cross-guild lookup by numeric display ID is forbidden.

### 33.28 Time input and parser contract

The parser accepts published, bounded forms such as relative durations, absolute civil date/time, provider timestamp notation, and admitted recurrence expressions. English and Spanish duration aliases may remain intentional inputs while canonical stored contracts and this specification remain English.

Every parse produces normalized UTC instant or recurrence, IANA timezone, locale, timezone-data version, parser version, source expression hash, selected offset, daylight-saving ambiguity decision, and validation outcome.

A number without a unit, date without a time, or time without a date uses an explicitly documented default. Hidden server locale or timezone never decides behavior.

### 33.29 Daylight-saving and civil-time semantics

Absolute and recurring civil schedules define behavior for:

- A local time that does not exist during a forward clock transition.
- A local time that occurs twice during a backward transition.
- Timezone rule changes after creation.
- User or tenant timezone changes.
- Leap seconds or clock corrections handled by the time capability.

The default SHOULD reject ambiguous one-shot input unless the user selects an occurrence, and SHOULD use a published stable rule for recurrence. Every choice is recorded. Recurrence preserves intended civil semantics rather than adding a fixed UTC duration unless the schedule explicitly requests duration-based behavior.

### 33.30 One-shot reminder creation

Creation validates owner, tenant policy, enabled state, content, horizon, route, timezone, origin reference, pending capacity, and idempotency key. One transaction commits reminder, immutable revision, first occurrence, quota reservation or count effect, audit receipt, and outbox.

Confirmation is ephemeral by default and shows normalized due instant using Discord presentation timestamps, timezone, route privacy, recurrence if any, and a signed opaque cancel token. Provider timestamp rendering is informative; stored UTC and civil-time receipt are authoritative.

### 33.31 Bounded recurrence

Recurrence supports only allowlisted schedules with minimum frequency and requires a maximum count, end instant, or policy-defined finite horizon. It defines catch-up, missed occurrence, overlap, pause, resume, edit, and timezone-change behavior.

The service materializes a bounded lookahead rather than infinite rows. After an occurrence reaches a qualifying terminal state, a fenced expansion creates the next required occurrences under the same schedule generation. Uniqueness prevents duplicate materialization after retries.

No recurrence can create unbounded queue growth, high-frequency Discord spam, or unlimited retained history.

### 33.32 Reminder occurrence and immutable execution snapshot

Each occurrence pins definition revision, schedule generation, intended instant, civil-time receipt, content snapshot, owner, tenant, route order, destination references, mention policy, origin reference, not-before time, deadline, and retry policy.

Retry never reads mutable current content to alter an existing occurrence. Editing future reminders publishes a new revision and specifies which unclaimed future occurrences are superseded and regenerated. Already delivered history remains unchanged.

### 33.33 Earliest-due wake-up and claiming

Reminder Service maintains earliest useful due state and receives wake-ups through Schedule's portable scheduling capability. Schedule's bounded due-row sweep covers missed wake-ups. Owner-side reconciliation covers expired leases, clock correction, and restored dependencies after a due-work signal; it does not replace the platform sweep.

Workers claim a limited due page ordered by intended instant and tenant fairness. Each claim records lease expiry and fencing token. Claim does not equal delivery. Before dispatch the worker reloads cancellation state, occurrence generation, deadline, owner and tenant state, and frozen route policy.

Autoscaling cannot create concurrent valid ownership for one occurrence.

### 33.34 Delivery route policy

Admitted route classes are:

- DM only.
- Origin channel only.
- Configured same-tenant channel only.
- DM then privacy-approved channel fallback.
- Channel then DM fallback when explicitly configured.

Each route has current capability checks, privacy classification, allowed mention policy, retry classification, and deadline. Default personal behavior is DM, with no public content fallback unless clearly selected. A channel fallback mention permits only the owner by default.

Voice, stage, category, forum, media, archived or inaccessible thread, and unsupported channel types are rejected unless a future route profile defines valid message semantics.

### 33.35 Delivery attempts, uncertainty, and dead letters

Each route request has one Delivery identity and normalized outcome. Retryable transport failures schedule backoff within the occurrence deadline. Permanent permission, destination, privacy, or payload failures advance only when another frozen route is eligible.

An ambiguous send cannot immediately trigger the next route because that could duplicate or publicly expose content after a successful DM. The system reconciles where possible; otherwise it records unresolved and applies a conservative operator-visible policy.

Exhausting attempts yields dead letter, missed, expired, or unresolved state with error class, last route, next owner or operator action, and replay eligibility. The reminder and occurrence are retained for bounded history.

### 33.36 Edit and reschedule

Editing content or route publishes a new reminder revision. The command states whether it affects only future unmaterialized occurrences or also supersedes eligible pending occurrences. Rescheduling atomically cancels or supersedes the selected pending occurrence and creates a new schedule generation and occurrence.

If delivery already succeeded, edit or reschedule returns the delivered outcome and cannot retract the message. If a worker claimed but has not dispatched, advancing generation makes the worker stale. Optimistic reminder and occurrence versions prevent concurrent edits from both succeeding.

### 33.37 Snooze

Snooze is an owner-authorized creation of one child occurrence from an eligible delivered, due, or acknowledged occurrence. It records parent occurrence, snooze command, new intended instant, schedule generation, content snapshot, and quota decision.

Snooze does not mutate historical delivery time or recurrence cadence unless the revision explicitly defines that behavior. Repeated interaction delivery creates one child. Snooze count and horizon are bounded to prevent amplification.

### 33.38 Pause, resume, cancel, and clear

Pausing stops new recurrence expansion and declares whether already materialized occurrences remain pending or become paused. Resuming creates only occurrences permitted by the recurrence misfire policy and never blindly catches up every missed interval.

Cancelling may target one occurrence or the complete reminder. It advances the generation before a pending worker can dispatch. A delivered occurrence remains delivered. Administrative cancellation records actor and reason without granting content access.

Clear-all is a paged, checkpointed owner command with preview, bounded batch size, idempotency key, and per-occurrence outcome. It is not one unbounded transaction and cannot affect another owner.

### 33.39 Origin reference and jump link

When creation occurs in a guild message context and policy permits, the reminder stores guild, channel, message, and application context required to construct a Discord jump link. The reference is metadata, not copied source content.

The link is shown only to an authorized viewer and only when tenant and channel context match. The platform does not test access by leaking the URL. A deleted or inaccessible origin does not block reminder delivery and is displayed as unavailable.

### 33.40 Listing, pagination, and search

Owner lists are cursor-paginated by stable due time and occurrence identity and may filter pending, recurring, paused, delivered, cancelled, missed, failed, and expired states. They show normalized due time, timezone, recurrence, route, status, and bounded content preview according to privacy policy.

Staff views are separately authorized, paginated, and content-minimized. Tenant-wide APIs never return every reminder without explicit bounds. Search over reminder content is opt-in, purpose-limited, access-controlled, and retention-aware.

### 33.41 Feature disablement semantics

Tenant policy separately controls:

- New reminder creation.
- Editing, rescheduling, snoozing, and recurrence creation.
- Delivery of already accepted occurrences.
- Public fallback routes.
- Staff administration.

The published policy must choose whether disabling the feature allows accepted reminders to continue, pauses pending delivery, or cancels future occurrences with notice. Default behavior SHOULD block new creation while preserving accepted private deliveries, but the dashboard must state the effective decision before publication.

Disabling cannot silently delete pending rows or history.

### 33.42 Reminder lifecycle completion and retention

A one-shot reminder completes when its only occurrence reaches delivered, cancelled, missed, expired, dead-letter, or acknowledged unresolved state according to policy. A recurring reminder completes at count or end boundary after every materialized occurrence is terminal, or becomes cancelled explicitly.

Definition, revision, occurrence, delivery attempt, origin reference, protected content, cancellation, and audit data have independent retention. Content may expire before operational metadata. Privacy deletion redacts content and actor presentation while preserving minimal idempotency and delivery integrity when legally permitted.

### 33.43 Activity Log boundary

Custom Command and Reminder services publish structured facts for definition changes, projection results, invocation decision classes, reminder creation and mutation, occurrence states, administrative actions, and terminal failures. Activity Log owns tenant audit presentation and optional Discord log delivery.

Argument values, reminder text, DM content, user timezone, protected target data, and rendered private responses are excluded from ordinary logs and from span attributes. Authorized detailed inspection remains with the owning service and is independently audited (DR-038).

### 33.44 Reconciliation

Bounded reconciliation covers:

- Custom definitions versus dependencies, desired contributions, registry binding, and executable state.
- Complete desired application-command snapshot versus provider registry and bindings.
- Invocation receipts versus cooldown reservations, action occurrences, Delivery results, and deletion deadlines.
- Reminder definitions versus materialized recurrence lookahead, earliest-due cursor, claims, route attempts, terminal state, and retention.
- Delivered or uncertain messages versus exact application-owned provider bindings where inspection is supported.

Automatic repair handles expired leases, missing outbox publication, safe registry deltas, proven provider absence, missing recurrence materialization, stale wake-ups, and duplicate schedule rows. Ownership ambiguity, registry conflicts, provider overwrite uncertainty beyond the evidence window, and private delivery uncertainty require explicit operator-visible resolution.

### 33.45 Scalability and low latency

Interaction Edge performs signature verification, idempotency reservation, routing, and immediate response or defer only. Custom runtime evaluation uses compiled definitions and bounded policy projections. Registry projection, asset handling, multi-action delivery, audit, and deletion run asynchronously.

Registry work partitions by application installation. Runtime work partitions by tenant and configured cooldown scope. Reminder work partitions by due-time range, tenant, owner, and occurrence while preserving occurrence fencing. Delivery remains independently scalable and Discord-rate-governed.

Caches contain immutable compiled definitions, provider registry bindings, role and channel capability projections, timezone rules, and read models. Cooldowns, invocation acceptance, reminder occurrences, claims, and terminal outcomes are never authoritative only in cache.

### 33.46 Operational procedures

**Publishing a custom command:**

1. Authorize actor and validate expected aggregate version and entitlement.
2. Validate name, localization, arguments, access, cooldown, context, response actions, variables, mentions, assets, deletion, and provider constraints.
3. Compile the sandboxed template plan and render representative previews.
4. Detect reserved-name and complete-registry conflicts.
5. Commit immutable revision and desired contribution atomically with outbox.
6. Report publication separately from registry convergence and expose exact degraded state.

**Repairing command projection:**

1. Fence one installation projection generation.
2. Load every owner contribution and the immutable desired snapshot.
3. Read and normalize current provider registry within Discord limits.
4. Reconcile uncertain prior operations and classify drift.
5. Apply only the safe targeted delta or complete snapshot.
6. Persist provider bindings and notify every affected owner.

**Resolving a partial custom invocation:**

1. Load invocation, frozen revision, policy receipt, action occurrences, deadlines, and Delivery outcomes.
2. Never rerun argument binding, random selection, or completed actions.
3. Reauthorize only actions that require current safety capability.
4. Reconcile uncertain provider effects before retry.
5. Resume eligible actions with original keys and preserve partial history.

**Creating or rescheduling a reminder:**

1. Authorize owner and load tenant and member settings.
2. Parse time with explicit timezone, parser version, DST decision, and bounds.
3. Validate content, recurrence, horizon, route privacy, origin, and quotas.
4. Commit revision, generation, occurrence, mutation receipt, and outbox atomically.
5. Update earliest-due wake-up and return normalized confirmation.

**Recovering overdue reminders:**

1. Fence a bounded due range and expire stale claims.
2. Compare intended time, deadline, recurrence misfire policy, cancellation, and schedule generation.
3. Deliver only still-useful occurrences; mark missed or expired ones explicitly.
4. Reconcile uncertain routes before retry or fallback.
5. Materialize only the bounded future recurrence required by policy.

### 33.47 Automation-specific consistency rules

- Custom-command revision and desired-contribution outbox publication are atomic within Custom Command Definition Service.
- Definition persistence and Discord command projection cannot share a transaction; immutable contribution and registry generation bridge them.
- All command owners compose through one registry snapshot before bulk overwrite; no owner maintains a parallel authoritative registry.
- Provider command mutation and observed registry cannot share a transaction; operation intent, provider bindings, and reconciliation bridge them.
- Interaction acknowledgement and Custom Command Runtime execution cannot share a transaction; the durable interaction and routing receipt bridge them.
- Invocation, cooldown reservation, argument snapshot, initial action occurrences, and runtime outbox are atomic within Custom Command Runtime.
- Each response action and Discord delivery is cross-service and independently idempotent; one action failure cannot erase another confirmed effect.
- Reminder creation commits definition, revision, first occurrence, capacity decision, mutation receipt, and outbox atomically.
- Recurrence expansion commits each bounded occurrence set and next expansion cursor atomically under one schedule generation.
- Claiming and Discord delivery cannot share a transaction; occurrence fencing and Delivery identity bridge them.
- Cancellation, reschedule, snooze, delivery, expiry, and recurrence advancement compete through occurrence generation and optimistic version.
- A newer command or reminder revision never rewrites historical invocations, occurrences, arguments, content snapshots, route attempts, provider bindings, or audit receipts.

### 33.48 Automation operational kill switches

Independent authenticated, versioned, and audited controls MUST exist for:

- Custom-command draft, preview, publication, enablement, invocation, DM actions, channel actions, broad mentions, attachments, follow-ups, auto-delete, manual replay, disablement, and retirement independently.
- Registry compilation, targeted projection, bulk overwrite, drift scanning, automatic repair, provider deletion, and manual reconciliation independently by application installation.
- Reminder creation, absolute parsing, recurrence, edit, reschedule, snooze, pause, resume, cancel, clear-all, DM delivery, channel delivery, fallback, retry, manual replay, and retention deletion independently.
- Specific command definitions, response action types, reminder tenants, route classes, destination classes, and schedule frequency classes without disabling unrelated work.

Disabling custom-command projection does not enable unprojected definitions or stop safe interaction rejection. Disabling runtime execution does not delete provider commands or invocation history. Disabling bulk overwrite preserves targeted repair and read-only reconciliation only when current policy considers them safe.

Disabling reminder creation does not silently cancel accepted occurrences. Disabling DM delivery does not automatically enable public fallback. Disabling recurrence stops future expansion according to policy while preserving existing occurrence truth. Disabling retry leaves due terminal actions visible.

No Automation kill switch may stop interaction acknowledgement, signature validation, durable ingress, tenant authorization, atomic cooldown integrity, reminder cancellation, stale-worker fencing, provider or Discord rate-limit compliance, ownership reconciliation, privacy deletion, audit visibility, or visibility into pending, projection-degraded, partial, overdue, missed, dead-letter, uncertain, and conflicted work.
