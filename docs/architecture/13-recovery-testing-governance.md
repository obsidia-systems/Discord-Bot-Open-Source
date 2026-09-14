# Tobot Architecture — Recovery, Testing, and Governance

[Architecture index](README.md) · [Previous](12-security-observability-deployment.md) · [Next](14-invariants-and-boundaries.md)

## 21. Availability and disaster recovery

### 21.1 Failure containment

- Gateway shards fail independently.
- Render saturation cannot make Gateway heartbeats late.
- Voice failure cannot consume text delivery capacity.
- One tenant's burst cannot consume all delivery capacity.
- One destination's rate-limit bucket cannot block unrelated destinations.
- Read projection failure cannot block configuration writes or delivery.
- Event-bus outage causes durable outbox accumulation, not silent loss.

### 21.2 Recovery procedures

**Gateway replica loss:**

1. The shard lease expires or is released.
2. A healthy replica claims the shard using a fencing token.
3. The replica resumes the stored session when valid.
4. Replayed events enter the normal inbox deduplication path.
5. Session loss falls back to controlled Identify under the concurrency guard.

**Event bus outage:**

1. Services continue committing aggregates and local outbox rows while storage is healthy.
2. Outbox backlog and age trigger alerts.
3. Publishers retry with bounded backoff.
4. After recovery, fair publication prevents one service or tenant from flooding consumers.

**Discord HTTP degradation:**

1. Transport circuits open by route or globally according to evidence.
2. Delivery intents remain durable.
3. Retryable work is scheduled within its deadline.
4. Expired work transitions to a final explicit state.
5. Recovery ramps concurrency gradually.

**Moderation action outcome uncertainty:**

1. The case remains `OutcomeUncertain`; the system does not report success or retry blindly.
2. The reconciliation workflow inspects safe provider state and bounded audit evidence when available.
3. A confirmed existing sanction completes the original case without a second mutation.
4. A confirmed absent effect may authorize one fenced retry if the command deadline and policy still allow it.
5. Ambiguous evidence reaches an explicit unresolved state for operator review.

**Security counter or evaluator loss:**

1. Durable Gateway ingestion and observation admission continue only within bounded queue capacity.
2. The affected detector enters an explicit degraded state and stops automatic destructive responses.
3. A healthy evaluator rebuilds compiled policy snapshots from authoritative revisions.
4. Counter reservations recover through idempotent tokens or a bounded non-punitive reconstruction window.
5. Enforcement resumes only after snapshot, counter, required intent, permission, and lag health gates pass.

**Containment worker loss:**

1. The current lease expires and a healthy worker claims the operation with a higher fencing token.
2. The worker loads the immutable plan, snapshots, step attempts, and last confirmed provider results.
3. Any transmitted but unconfirmed step is reconciled against current provider state before retry.
4. Eligible pending steps resume within the original operation deadline and provider budgets.
5. Expired, blocked, uncertain, or conflicting work remains partial and operator-visible; it is never collapsed into success.

**Role worker or panel projector loss:**

1. Unacknowledged events and durable intents remain available for another consumer.
2. Assignment and publication leases expire; replacement workers acquire higher fencing tokens.
3. Confirmed assignment or panel effects are compared with desired state and are not repeated blindly.
4. Temporary-role occurrences retain their intended time and apply the configured misfire policy.
5. Panels with incomplete effects remain degraded and enter bounded repair; they never become published from queue acknowledgement alone.

**Role resource mutation uncertainty:**

1. The mutation remains outcome-uncertain and no identical provider request is issued automatically.
2. Current roles, hierarchy, Gateway observations, and bounded audit evidence are refreshed.
3. Confirmed desired state completes the original mutation with the observed provider identity.
4. Confirmed absence may permit one retry only when the operation is safe, the fingerprint is current, the deadline remains open, and authorization is revalidated.
5. Ambiguous create, delete, or reorder outcomes require operator resolution after the reconciliation deadline.

**Progression evaluator or voice-session worker loss:**

1. Accepted source events remain in the durable inbox and duplicate delivery resolves through the semantic ledger key.
2. A replacement evaluator rebuilds the immutable policy snapshot before awarding.
3. Open voice sessions are recovered from their last durable segment boundary; overlapping or unverifiable time is excluded rather than guessed.
4. Level transitions and reward occurrences are derived from committed ledger state and resume independently.
5. Leaderboards rebuild from authoritative ledger projections and expose snapshot age until caught up.

**Starboard worker or projection loss:**

1. Contribution mutations remain durable and reconstruct the authoritative unique-contributor set.
2. A replacement worker recomputes the source aggregate version without replaying confirmed contribution identities.
3. Missing or uncertain board-message effects enter bounded reconciliation before create, edit, or delete is retried.
4. Provider content that is unavailable is represented explicitly and is not reconstructed from logs or unrelated caches.
5. Repair coalesces obsolete intermediate counts and applies only the newest eligible aggregate version.

**Giveaway close or fulfillment worker loss:**

1. The close lease expires and a replacement claims the same close generation with a higher fencing token.
2. The worker resumes entrant snapshot materialization from durable checkpoints and never admits entries after the recorded boundary.
3. A committed draw is immutable; loss after commitment resumes winner publication and prize fulfillment without selecting again.
4. A transmitted but unconfirmed prize effect is reconciled through its owning service before retry.
5. Cancellation, close blockage, partial fulfillment, and manual resolution remain separately visible.

**Form submission, review, or export worker loss:**

1. Acknowledged and durably accepted submissions remain authoritative even when notifications fail.
2. Required asset ingestion resumes only from a durable staged receipt within its expiry; expired provider URLs are never treated as stored assets.
3. Review workers reacquire work using the current submission version and do not repeat committed decisions or accepted-role requests.
4. Export generation restarts from an authorized immutable query boundary and produces a new short-lived artifact; partial files are never published.
5. Retention deletion proceeds by field and asset policy with auditable completion and retry state.

**Temporary-room worker loss or partial Discord mutation:**

1. Creation and lifecycle leases expire; a healthy worker loads the room operation and every step receipt.
2. Unconfirmed channel creation, overwrite, move, edit, and deletion steps are reconciled against provider state before retry.
3. Compensation may remove only resources proven to have been created and still owned by that operation.
4. Existing linked channels are never selected for compensation or empty-room deletion.
5. Orphaned, externally modified, or capacity-blocked rooms remain explicit and enter bounded repair or operator resolution.

**Monetary Ledger worker or response loss:**

1. An uncommitted database transaction has no monetary effect; the caller retries only with the same semantic idempotency key.
2. A committed transaction, hold, capture, release, or reversal is discovered by that key and returned without new postings.
3. A recovered worker verifies balanced postings and account projection versions before resuming write readiness.
4. Outbox lag may delay downstream state but cannot roll back the journal commit.
5. Any detected imbalance, duplicate source, or unexplained projection divergence opens the affected write circuit and requires ledger reconciliation before normal writes resume.

**Income evaluator or salary distributor loss:**

1. Accepted interaction and timer commands remain durable and replay through action-occurrence idempotency.
2. Random formula results are loaded from the committed decision receipt and are never generated again.
3. A salary worker resumes from its recipient page checkpoint with a higher fenced lease.
4. Monetary settlement is reconciled through its ledger key before another payout, fine, or transfer request is issued.
5. Late salary occurrences follow the published misfire policy and never release an uncontrolled catch-up burst.

**Commerce worker loss or purchase uncertainty:**

1. Purchase admission resumes from the order, stock reservation, payment hold, and event receipts.
2. Hold creation and capture are reconciled through Monetary Ledger before stock release, reward creation, or refund.
3. A paid order recreates only missing reward occurrences; it never captures payment again.
4. Reward workers resume independently and Commerce derives the current partial or fulfilled summary from their facts.
5. Expired stock reservations release only when payment capture is proven absent or cancelled.

**Entitlement worker loss or expiry uncertainty:**

1. The lifecycle lease expires and a replacement loads grant, provider binding, ownership snapshot, timer generation, and attempts.
2. Unconfirmed role, channel, boost, message, or manual-case effects are reconciled through their owning service before retry.
3. Expiry never removes the entitlement record before absence is confirmed.
4. Compensation deletes or removes only an effect still proven to be owned by the entitlement.
5. External drift becomes a compensation conflict and remains operator-visible.

**Casino worker loss or wager uncertainty:**

1. The session lease expires and a replacement claims the same immutable rule revision and latest state version.
2. Committed player actions and randomness receipts reconstruct the active game without reselecting prior outcomes.
3. A committed terminal outcome remains unchanged while Monetary Ledger settlement is reconciled by semantic key.
4. A session whose continuation state is complete resumes; otherwise the published timeout policy safely settles, releases, or escalates it.
5. Deleted or expired Discord presentation is recreated only when useful and never determines stake or payout state.

**Support panel worker or projection loss:**

1. The immutable panel revision and publication operation remain durable.
2. A replacement worker claims a higher fencing token and loads the last confirmed provider binding.
3. Any transmitted create, edit, disable, or delete effect is reconciled against the bound application, channel, message, revision, and component fingerprint before retry.
4. A confirmed current projection completes without another message; an orphan follows the declared republish or tombstone policy.
5. Interactions already admitted continue through their Support Case idempotency keys even if the panel projection later fails.

**Support Case worker loss during admission or transition:**

1. An uncommitted capacity transaction consumes no slot, number, cooldown, or case identity.
2. A committed open request returns the existing capacity reservations, number, case, and outbox state under duplicate delivery.
3. A replacement worker rebuilds effective policy and resumes intake, provisioning, timer, or transition work from the case version.
4. Confirmed case transitions are never inferred from Discord messages or repeated because a response token expired.
5. Capacity release occurs once at the configured terminal boundary and reconciliation detects leaked or missing reservations.

**Support resource worker loss or uncertain provider effect:**

1. The operation lease expires and a replacement loads the immutable plan, case generation, bindings, snapshots, attempts, and last outcomes.
2. Unconfirmed channel, thread, overwrite, message, pin, move, or deletion effects are reconciled before retry.
3. Confirmed provider resources are bound before later steps resume; duplicate creation is never the first recovery action.
4. Cleanup removes only resources still proven owned by the operation and preserves conflicts for review.
5. The Support Case remains authoritative and exposes partial, blocked, orphaned, or deleted resource state independently.

**Support archive worker loss or capture gap:**

1. Canonical message and lifecycle facts replay through per-resource message identity and version idempotency.
2. Attachment ingestion resumes only from durable staged receipts within provider expiry; missing bytes become an explicit partial reference.
3. A transcript job reacquires a higher lease and rebuilds from its immutable capture snapshot and watermark.
4. Gaps are recovered only through a bounded permitted provider-history query; unresolved gaps remain in the artifact coverage result.
5. Delivery, redaction, hold, and deletion resume independently without changing the closed case or prior artifact integrity record.

**Provider event-edge loss or callback uncertainty:**

1. Provider delivery is assumed at least once; a replacement replica loads endpoint generation and verification material without changing the callback identity.
2. A repeated provider message resolves through the durable replay key and receives the prior acknowledgement class without repeating the session transition.
3. Messages acknowledged before durable receipt are treated as a platform incident unless the edge admission design proves equivalent durability; bounded provider reconciliation is scheduled.
4. Expired, unverifiable, or wrong-generation messages remain rejected evidence and never become observations through manual log replay.
5. Sustained acknowledgement, signature, keepalive, or connection failure changes provider coverage to degraded and activates only a declared polling fallback.

**Provider observation worker loss or quota uncertainty:**

1. The observation lease expires and a replacement claims the same due generation with a higher fencing token.
2. A losing or expired worker cannot publish its later response as conclusive evidence.
3. Uncertain quota consumption and request outcome update the provider budget conservatively; the scheduler does not issue an immediate duplicate burst.
4. Partial batch or page results preserve per-identity outcomes, and every missing identity remains inconclusive.
5. Recovery advances next due time from current provider health, freshness policy, tenant fairness, and quota rather than replaying every missed interval.

**Provider subscription worker loss or uncertain provider mutation:**

1. The operation lease expires and a replacement loads desired claims, provider binding, endpoint and secret generations, attempts, and condition fingerprint.
2. Create, rotate, renew, or delete with an unknown outcome is reconciled through bounded provider listing or inspection before retry.
3. A confirmed resource is adopted only when condition, credential scope, callback generation, and ownership fingerprint match.
4. Revoked, duplicate, expired, or orphaned resources are repaired or retired through explicit operations; deletion never targets an unowned resource.
5. Until coverage converges, the alert exposes degraded freshness and may use only its admitted fallback.

**External live-signal or alert-delivery loss:**

1. Authenticated events and conclusive observations replay through source-record uniqueness and session aggregate version.
2. A committed transition returns the same per-alert occurrence keys and delivery references under duplicate fan-out.
3. A replacement worker resumes refresh, offline, or cleanup deadlines from durable generations and suppresses obsolete work.
4. An uncertain Discord create, edit, or delete reconciles exact application-owned message state before retry.
5. Provider session truth remains valid when Discord projection is blocked, failed, delayed, or manually deleted; health exposes the divergence.

**Application command registry worker loss or uncertain projection:**

1. The operation lease expires and a replacement loads the complete immutable registry snapshot, application installation, projection generation, bindings, and attempts.
2. An unconfirmed targeted mutation or bulk overwrite is reconciled by reading and normalizing the provider registry before another mutation.
3. A provider registry matching the desired fingerprint completes the existing operation without issuing another overwrite.
4. Drift or a partial mismatch compiles a safe delta or a new complete snapshot generation; no owner independently repairs its subset.
5. Interactions arriving during degraded projection route only through confirmed provider bindings and immutable executable revisions.

**Custom command runtime worker loss:**

1. Duplicate interaction delivery resolves to the existing invocation receipt and cooldown reservation.
2. A replacement loads the frozen revision, argument and variable snapshots, action occurrences, deadlines, and Delivery references.
3. Confirmed actions are not repeated; pending eligible actions resume with the same occurrence keys.
4. Expired interaction delivery capability becomes an explicit action outcome and cannot invalidate an already accepted invocation.
5. Partial completion remains visible and does not roll back unrelated delivered responses.

**Reminder worker loss or delivery uncertainty:**

1. The occurrence lease expires and a replacement claims the same schedule generation with a higher fencing token.
2. Cancellation, reschedule, pause, snooze, recurrence expansion, and delivery reload current occurrence state before effect dispatch.
3. Confirmed Delivery outcomes complete the occurrence exactly once; uncertain route effects reconcile where possible before fallback or retry.
4. A stale worker cannot deliver after the occurrence generation advances or another terminal state wins.
5. Exhausted attempts produce retained dead-letter or missed history and an operator or owner action, never silent row deletion.

**Automatic moderation policy service loss:**

1. Discord-native rules continue according to their last confirmed provider state.
2. Gateway events remain in the durable stream within retention limits.
3. Recovered consumers rebuild immutable policy snapshots before becoming ready.
4. Stale incidents remain subject to their original deadline; expired punitive actions are not replayed merely to catch up.
5. Native execution observations are deduplicated against any already-created incident.

**Retention worker loss:**

1. The fenced lease expires and a healthy worker resumes from the last committed page checkpoint.
2. Confirmed message outcomes are not repeated.
3. Unknown individual deletion outcomes are reconciled as already absent or still present before another delete attempt.
4. The occurrence preserves partial counts and final completeness status.

**Relational store recovery:**

1. Writes stop rather than acknowledge non-durable work.
2. Read services may serve marked stale projections within policy.
3. Restore uses tested backups and point-in-time recovery.
4. Inbox, aggregate, and outbox consistency is verified before consumers resume.

**Object storage degradation:**

1. Text-only deliveries continue when their definition does not require assets.
2. Asset-required deliveries retry within deadline.
3. The renderer never substitutes an unapproved remote source silently.
4. Permanent expiry produces an actionable delivery failure.

### 21.3 Backup scope

Back up authoritative service databases, object metadata, source assets, commercial catalog revisions, billing event receipts, provider-object mappings, financial and tax evidence, platform grant lineage, AI Credit journals and lots, protected AI content required by retention policy, template packages, and workflow definitions and executions. Rebuildable caches, entitlement read projections, guild discovery observations, compiled matchers, compiled workflow indexes, and render caches need not be backed up. Restore drills MUST prove referential consistency between asset metadata and stored objects, commercial sources and grants, AI operations and reservations, and template or workflow revisions and their durable effects.

## 22. Testing and verification

### 22.1 Test layers

| Layer | Required coverage |
|---|---|
| Domain unit | Lifecycle decisions, variable semantics, matcher precedence, recurrence, misfire, moderation authorization, escalation transitions, native ownership, cleanup selection, attribution confidence, security detector precedence, incident latching, containment planning, restoration conflict handling, role-policy precedence, assignment ownership, panel action compilation, role privilege deltas, deterministic XP decisions, voice eligibility segmentation, starboard contribution reduction, giveaway lifecycle and draw selection, form version and review rules, temporary-room lifecycle planning, balanced postings, holds, transfer tax, income formulas, cooldown and streak rules, salary stacking, stock reservation, purchase state, entitlement compensation, casino rule engines, wager settlement, support-policy precedence, panel option binding, capacity reservation, case transitions, staff authorization, access compilation, transcript coverage, provider capability precedence, identity normalization, observation classification, session transitions, source conflict handling, alert suppression, command schema conflict resolution, access precedence, typed argument binding, atomic cooldowns, bounded template evaluation, civil-time resolution, recurrence expansion, reminder races, and error classification |
| Contract | Every public event and command version, additive compatibility, malformed payload rejection |
| Adapter conformance | Relational, event bus, TTL, object storage, clock, secure randomness, identity, Discord transport, provider identity, provider event transport, provider observation, quota, and provider subscription ports |
| Component | Inbox/outbox atomicity, lease fencing, idempotency, journal and projection atomicity, stock reservation, durable game recovery, support capacity and number allocation, resource saga recovery, archive capture, provider replay protection, subscription convergence, observation fencing, transition-occurrence atomicity, complete command-registry composition, command projection reconciliation, invocation and cooldown atomicity, reminder occurrence fencing, recurrence generation, asset validation, and render bounds |
| Integration | Service database and bus interactions under retries and duplicate delivery |
| Provider sandbox | Discord permissions, role hierarchy, managed roles, member-role add/remove, role CRUD and positions, reactions and reaction gaps, components, modals, file uploads, custom identifiers, shop game and support interaction ownership, support panel projection and identity changes, channel and thread creation and deletion, permission overwrites, message history and Message Content degradation, member moves, channel types, interactions and token expiry, rate limits, moderation actions, native Auto Moderation, audit pagination and events, guild incident actions, verification settings, membership-screening observations, bulk-delete age boundaries, message creates edits deletes and nonce behavior, provider identity resolution, webhook verification challenge retry and revocation, event-stream reconnect, poll batching pagination quota and rate limits, and provider schema drift |
| End to end | One complete path for each lifecycle event, message capability, manual moderation action, native and platform Auto Moderation incident, activity route, audit query, countdown deletion, scheduled cleanup outcome, join-raid incident, anti-nuke incident, lockdown apply, lockdown restoration, auto-role assignment, delayed expiry, each role-panel transport and repair, each role-resource mutation, each XP source and reward path, starboard threshold and repair, giveaway close and reroll, form submit and review, temporary-room create control and cleanup, account creation and transfer, every income class, salary distribution, purchase and refund, each entitlement class and expiry, every admitted casino game and recovery path, support button and select panels, intake, concurrent open, resource provisioning, each case control, reopen, transcript, cleanup and repair, provider-event live start, polling live start, offline transition, refresh, owned cleanup, test notification, subscription revocation, fallback and recovery, custom-command publish project invoke reject partial complete disable and retire, reminder create list edit reschedule pause resume cancel snooze deliver fallback recur miss dead-letter and recovery |
| Resilience | Process kill, network partition, slow dependency, duplicate event, lost response, and stale cache |
| Load | Gateway bursts, auto-reply matching, schedule fan-out, raid join bursts, audit-action bursts, containment fan-out, member-role assignment bursts, panel interactions, XP event storms, voice reconnect storms, reaction flapping, giveaway entry spikes and close snapshots, concurrent form submissions and exports, room-creation races, transfer contention, hot-account and hot-stock contention, salary fan-out, shop purchase spikes, entitlement expiry waves, casino action bursts, support-open races at cap boundaries, panel interaction bursts, access-change fan-out, transcript message and attachment volume, provider callback bursts, hot canonical identities, poll batch and pagination limits, quota exhaustion, event-to-alert fan-out, metadata flapping, alert delivery bursts, command registry rebuilds, mass guild joins, command invocation bursts, hot cooldown scopes, reminder creation spikes, synchronized due occurrences, recurrence expansion, cancellation races, automation timers, reconciliation scans, hierarchy contention, render saturation, and rate-limit fairness |
| Security | Tenant escape, SSRF, upload bombs, mention injection, token leakage, authorization bypass, exemption abuse, forged internal observations, break-glass misuse, cross-guild containment, forged role panel room shop game support integration command and reminder routing, sensitive self-assignment, role-ownership violation, XP farming and forged awards, giveaway manipulation and redraw abuse, form identity or response disclosure, malicious attachments, room takeover, forged ledger commands, balance or stock tampering, duplicate settlement, cooldown bypass, self-transfer and collusion abuse, entitlement takeover, predictable randomness, forced redraw, support cap bypass, staff impersonation, unauthorized participant access, resource ownership forgery, transcript disclosure, provider signature bypass, replay, callback confusion, credential leakage, quota abuse, URL redirect abuse, cross-tenant identity disclosure, fake live events, unowned message cleanup, reserved-command shadowing, registry overwrite races, template escape, arbitrary action execution, argument injection, cooldown-key abuse, reminder text disclosure, forged cancellation, recurrence amplification, and privilege escalation |

### 22.2 Mandatory invariants under test

- Duplicate inbox delivery does not duplicate the domain decision.
- Duplicate outbox publication does not duplicate the delivery intent.
- Concurrent delivery workers cannot both own a valid fenced lease.
- A timed-out create-message request enters reconciliation before retry.
- A published message revision never changes.
- A schedule occurrence key is unique.
- A cooldown reservation is atomic across replicas.
- A guild cannot reference another guild's asset.
- A test delivery cannot emit broad mentions.
- A renderer cannot exceed its declared CPU, memory, input, or output budget.
- A `403` stops repeated delivery until capability state changes.
- A `429` is not retried before Discord's specified delay.
- A moderator who passes dashboard authorization but fails execution-time hierarchy cannot create a provider mutation.
- An actor permission, bot permission, protected-role decision, and Discord hierarchy decision remain independently explainable.
- One native Auto Moderation execution event and one related message event create at most one semantic incident and one sanction request.
- A platform-owned rule cannot duplicate an effect owned by a Discord-native rule.
- Applied moderation remains applied when its DM or activity notification fails.
- Warning clearance and case redaction do not delete immutable case history.
- Concurrent escalation evaluation creates at most one action per threshold crossing and policy revision.
- Lock and unlock preserve unrelated permission overwrite changes.
- Audit-log absence or ambiguity cannot be represented as a known executor.
- A failed cleanup page is never counted as an empty successful page.
- Sweep resume begins at the last durable checkpoint and does not repeat confirmed deletions.
- Messages beyond Discord's bulk-delete age boundary never enter a bulk-delete request.
- Pinned messages are excluded immediately before deletion, not only during initial planning.
- Activity content retention follows the content policy independently from activity metadata retention.
- Duplicate or reordered member-add events produce one security observation contribution and at most one threshold crossing per semantic key.
- Two replicas updating one security window cannot lose an admitted contribution or both reserve the same threshold crossing.
- An unavailable distributed counter cannot silently fall back to replica-local automatic enforcement.
- Repeated observations inside one incident latch aggregate without duplicating the same response-plan step.
- Every security decision preserves the exact immutable policy and response-plan revisions used.
- A security-requested member sanction creates one Moderation Case and never bypasses its authority or hierarchy checks.
- One guild cannot hold two valid fenced containment mutations concurrently.
- A crash after any lockdown step resumes from durable snapshot and attempt state without repeating a confirmed step blindly.
- Lockdown apply and restore preserve permission bits outside the plan's declared ownership.
- A restoration conflict cannot be reported as successfully restored or inactive without an audited resolution.
- Losing `GUILD_MEMBERS`, `GUILD_MODERATION`, or `VIEW_AUDIT_LOG` capability produces an explicit degraded-coverage state.
- Incident alerts are deduplicated and secondary; alert failure does not erase a confirmed containment outcome.
- Duplicate member or panel events create at most one role-assignment intent for the same desired relation and source identity.
- A role owned by one policy is not removed by another policy without an explicit shared-ownership rule or authorized override.
- A delayed role never applies after its assignment deadline, policy supersession, member departure, or eligibility loss.
- Temporary-role expiry is durable and idempotent across worker loss and duplicate wake-ups.
- A panel interaction is rejected when its guild, message, panel, revision, mapping, or member context does not match authoritative binding.
- Panel publication cannot report success while a required component or reaction effect remains partial or uncertain.
- A deleted or above-bot mapped role invalidates the mapping and cannot generate provider mutation retries.
- Exclusive role groups expose partial add/remove outcomes and converge without claiming Discord atomicity.
- A stale role or hierarchy fingerprint cannot authorize a role-resource mutation.
- An uncertain role create, delete, or reorder enters reconciliation before any retry.
- Self-service and automatic assignment cannot grant Administrator or another prohibited sensitive permission class.
- Duplicate or reordered XP source events create exactly one ledger decision under the pinned policy revision.
- Concurrent cooldown reservations cannot both award the same member-source interval.
- Voice reconnect, restart, and duplicate-state sequences cannot create overlapping eligible progression segments.
- A level reward is requested at most once for one member, level transition, reward definition, and revision.
- Starboard counts represent unique eligible contributors across configured reactions and remain correct after duplicate add/remove delivery.
- An older starboard aggregate version cannot overwrite a newer board-message projection.
- A giveaway close boundary excludes every later entry regardless of event delivery order.
- One giveaway draw generation has one immutable entrant snapshot, selection input, and winner set.
- Reroll creates a new audited draw generation and never alters an earlier result.
- A committed giveaway result remains valid when announcement or prize fulfillment fails.
- A published form version never changes and every submission pins exactly one version.
- A reviewer-anonymous submission cannot reveal respondent identity through normal review, export, notification, or metric surfaces.
- Required form attachments are either durable tenant assets or cause explicit rejection; temporary provider URLs never become authoritative storage.
- Concurrent terminal form reviews cannot both succeed, and accepted-role effects occur at most once.
- Concurrent room-trigger observations create at most one active room for the same generator and member claim.
- Temporary-room compensation never deletes an existing linked channel or a resource without proven operation ownership.
- Empty-room timers are generation-bound; a rejoin invalidates the prior cleanup occurrence.
- A stale or forged room-control interaction cannot mutate ownership, access, channel state, or member placement.
- Every posted monetary transaction balances debits and credits for one tenant currency.
- No committed posting makes a member wallet or bank negative or exceeds the active account ceiling.
- Account current balance equals journal-derived balance at the recorded projection watermark.
- Available balance equals current balance minus active holds and cannot be spent by two concurrent commands.
- Duplicate transaction, hold, capture, release, transfer, adjustment, refund, or settlement keys return one prior result and create no extra value movement.
- One starting grant is posted at most once for one tenant, currency, account owner, and stable onboarding-grant policy identity; publishing a new revision cannot grant it again.
- Transfer tax reaches exactly one declared ledger destination; it is never omitted from the journal or deducted twice.
- A reversal creates equal-and-opposite postings linked to an original transaction and never rewrites it.
- Concurrent income claims cannot both reserve the same cooldown or streak transition.
- Random income, crime, robbery, salary, and job decisions do not change under replay or worker recovery.
- A scheduled salary occurrence pays each eligible member at most once and resumes from a durable checkpoint.
- A robbery cannot target the actor, a protected or opted-out member, an unavailable member, or an account class excluded by policy.
- Finite stock cannot be oversold under concurrent purchases, and a stock reservation cannot be released or consumed twice.
- Purchase price, eligibility, stock, limits, and rewards are pinned to one immutable item revision.
- A paid purchase creates each reward occurrence once and remains paid when a Discord presentation fails.
- A refund cannot exceed the captured purchase amount or restore stock more than once.
- Entitlement activation, renewal, expiry, revocation, and compensation are generation-bound and idempotent.
- Entitlement compensation never deletes or removes an external resource without current ownership proof.
- A manual entitlement requires an authorized completion receipt; a delivered staff message is insufficient.
- One casino session has one active fenced owner, one monotonic action sequence, and one immutable rule revision.
- A casino wager hold is captured or released exactly once, and a terminal game outcome settles exactly once.
- Duplicate, stale, expired, cross-tenant, or non-owner game interactions cannot advance state or affect money.
- A committed random outcome never changes because settlement, response delivery, process lifetime, or message state changes.
- A support panel revision and each option pin immutable template revisions; an edited template cannot change an already admitted open request.
- A support component interaction cannot cross tenant, panel, message, application identity, binding generation, revision, option, or member context.
- Concurrent support-open requests cannot exceed tenant, template, member, role, or queue capacity and cannot allocate duplicate support numbers.
- Duplicate open interaction or intake completion creates at most one capacity reservation set and one Support Case.
- Capacity rejected or uncommitted admission creates no case, number allocation, cooldown, or provider effect.
- A committed Support Case survives channel, message, interaction-token, panel, worker, or Discord availability loss.
- Claim, unclaim, waiting, escalation, resolution, close, reopen, and participant changes reject stale case versions.
- Opener-close permission never grants staff claim, participant-management, escalation, transcript, or policy authority.
- Staff access role, notification role, escalation role, and dashboard administration remain separate authorization relations.
- An uncertain support channel or thread creation is reconciled before retry and cannot produce an untracked duplicate resource.
- Support access convergence changes only policy-owned permissions or memberships and preserves unrelated administrator state.
- Support cleanup deletes only resources proven owned by the matching case generation and never deletes a category or external binding.
- A mandatory transcript boundary resolves as complete, explicitly incomplete, waived, or terminal before destructive resource deletion.
- Transcript completeness cannot be reported when required message content, event range, attachment, or history coverage is unavailable.
- Transcript and intake attachment records contain durable tenant asset references rather than expiring provider URLs.
- A closed or resolved case remains valid when transcript delivery, log delivery, control-message update, or cleanup fails.
- A provider callback with an invalid signature, stale timestamp, wrong endpoint generation, or replay conflict cannot create an observation or session transition.
- Duplicate delivery of one authenticated provider message creates one ingress receipt, one accepted source record, and at most one semantic transition.
- Provider callback acknowledgement latency is independent from alert fan-out, rendering, Discord delivery, and tenant count.
- A provider event revocation or connection loss changes coverage health but never fabricates an offline transition.
- Concurrent provider-subscription reconcilers cannot both own a valid mutation lease or adopt mismatched provider resources.
- An uncertain provider subscription create or delete is reconciled before retry and cannot create an untracked duplicate subscription.
- A losing observation fencing token cannot publish a conclusive result after a newer claim completes.
- A partial batch, missing page, timeout, quota denial, parse failure, or provider error cannot be classified as offline.
- Many tenant alerts for one canonical provider identity share an observation only when credential, terms, and privacy scope permit it, while each tenant transition remains isolated.
- Reordered online, metadata, and offline evidence cannot let an older record overwrite a newer conclusive session version.
- One provider session and alert revision creates at most one online occurrence, one active projection binding, and one occurrence per admitted lifecycle generation.
- Changing an alert destination, template, mention policy, provider identity, or lifecycle rule never rewrites an earlier occurrence or adopts its message without an explicit compatible binding rule.
- A test notification cannot advance live-session state, consume a production occurrence key, enable undeclared mentions, or masquerade as a real provider event.
- A delivery failure does not roll back or erase a confirmed external live-session transition.
- An uncertain Discord alert create, edit, or delete is reconciled before retry.
- Refresh coalescing applies only the newest accepted metadata revision and cannot exceed the configured edit budget.
- Offline cleanup deletes only the exact application-owned message binding for the matching alert occurrence and lifecycle generation.
- Provider secrets, API keys, tokens, signatures, and raw authorization headers never appear in domain contracts, delivery context, logs, metrics, or tenant read models.
- Two command owners cannot publish the same application installation, command type, and normalized name without an explicit resolved ownership rule.
- A Discord bulk overwrite contains the complete current desired registry and cannot erase commands contributed by another owner.
- An uncertain command create, edit, delete, or overwrite is reconciled before retry.
- A provider command ID routes only to its confirmed application, installation, owner, and immutable definition revision.
- Duplicate interaction delivery creates one custom-command invocation and at most one cooldown reservation per configured scope.
- A process restart or replica race cannot reset or bypass an active custom-command cooldown.
- Ignore, deny, allow, user, role, channel, age-restricted, entitlement, and bot rules produce one deterministic explainable decision.
- Custom-command argument values are bound only from the signed typed interaction option tree and revalidated against the pinned schema.
- A published custom-command template cannot execute arbitrary code, network requests, filesystem access, database queries, recursive expansion, or another command.
- Each custom-command response action has a unique occurrence and cannot repeat after confirmed delivery merely because another action failed.
- A custom-command definition remains durable and visibly projection-degraded when Discord registration fails.
- Auto-delete targets only the exact application-owned response binding and survives worker restart through a durable deadline.
- One reminder creation command commits its definition, first occurrence, idempotency receipt, and outbox atomically or creates none of them.
- Every reminder occurrence pins one definition revision, intended UTC instant, civil-time resolution receipt, route policy, content snapshot, generation, and deadline.
- Two workers cannot hold valid reminder occurrence leases for the same generation, and a stale fencing token cannot deliver.
- Cancellation, reschedule, snooze, delivery, recurrence expansion, expiry, and dead-letter transitions cannot produce two terminal winners.
- Recurrence expansion creates at most one occurrence per reminder, schedule generation, and intended instant.
- Daylight-saving gaps and overlaps follow the published ambiguity policy and never silently create duplicate or missing occurrences.
- A DM failure cannot expose reminder content in a channel unless the frozen route policy explicitly permits that fallback.
- Reminder retry exhaustion preserves a terminal record and does not silently delete the reminder history.
- Reminder content and argument values never appear in metric labels or ordinary activity summaries.
- OAuth state, redirect, proof-key, callback replay, scope escalation, identity conflict, session rotation, idle expiry, absolute expiry, and revocation-generation tests.
- Guild discovery tests proving that cached permission bits and frontend visibility cannot authorize a sensitive owner-service command.
- Discord installation context, minimal permission union, bot-presence, application-command-only, degraded module, removal, repair generation, and callback-without-presence tests.
- Commercial catalog compatibility, immutable term pinning, bundle expansion, product retirement, regional availability, currency, tax-reference, and upgrade or downgrade effective-time tests.
- Payment-provider contract tests for signature rejection, raw-body verification, duplicate event, out-of-order event, delayed payment, incomplete checkout, renewal, failed invoice, cancellation, pause, refund, dispute, portal authorization, and provider reconciliation.
- Tests proving that browser success or return pages cannot activate entitlements and that one commercial order creates at most one semantic fulfillment per grant source.
- Platform entitlement projection, source lineage, add-on aggregation, perk separation, cache invalidation, overage admission, grace expiry, downgrade preservation, and module-local atomic usage tests.
- AI Credit lot, grant, expiry, deterministic consumption, concurrent reservation, actual capture, remainder release, failed-operation release, refund, adjustment, spending ceiling, journal balance, and uncertain-outcome reconciliation tests.
- AI provider adapter tests for credential isolation, input and output moderation, privacy incompatibility, rate limit, timeout, circuit, fallback, usage normalization, billable blocked output, and no blind retry after uncertainty.
- AI character tests for tenant and character context isolation, automated disclosure, webhook identity, member-impersonation denial, channel policy, cooldown, concurrency, spending limit, retention deletion, and Delivery mention safety.
- Template validation, secret and code rejection, permission manifest, dependency conflict, resource ceiling, review state, rating eligibility, fraud signal, target preflight, idempotent install, partial repair, ownership-aware rollback, and external-edit conflict tests.
- Marketplace tests proving that price, checkout, subscription, paid placement, commercial entitlement, AI Credit, guild currency, plan, add-on, bundle, and perk state cannot gate template discovery or installation and that no creator payout path exists.
- Workflow compilation tests for cycles, unreachable nodes, bounded expansion, recursion lineage, worst-case effect budget, typed action authorization, deterministic conditions, trigger deduplication, concurrent execution, partial failure, compensation, uncertainty, dead letter, and replay without repeated confirmed effects.
- Cross-domain tests proving that guild virtual currency, guild reward entitlements, XP levels, commercial billing, platform entitlements, perks, and AI Credits cannot be substituted through any API or event contract.

### 22.3 Mermaid verification policy

This specification uses stable Mermaid diagram families only:

- Flowcharts for component topology, trust boundaries, and deployment.
- Sequence diagrams for runtime collaboration and failure branches.
- State diagrams for lifecycle transitions.
- Entity-relationship diagrams for data ownership and cardinality.
- Class diagrams for conceptual domain relationships.
- Requirement diagrams for traceability.

Experimental C4 syntax, beta architecture syntax, and beta swimlane syntax are intentionally excluded from the normative document. Diagram syntax MUST be rendered in documentation CI using the repository's pinned Mermaid version. A diagram parse failure fails documentation validation.

## 23. Architecture governance

### 23.1 Adding a new product module

A new module is admitted only after its specification defines all of the following:

1. Product responsibility and explicit non-responsibilities.
2. Commands it accepts and actors authorized to issue them.
3. Canonical events it consumes and publishes.
4. Required Discord intents and justification for privileged intents.
5. Aggregates and data owned exclusively by the module.
6. Idempotency keys and semantic duplicate policy.
7. Ordering and partition requirements.
8. Message definitions, variables, destinations, and mention policy.
9. Failure classification, retry deadline, and reconciliation behavior.
10. Cache strategy and authoritative source.
11. Quotas, abuse controls, and effect on Discord invalid-request budget.
12. Observability signals and dashboard status.
13. Security and tenant-isolation analysis.
14. Deployment and scaling profile.
15. Contract, resilience, load, and end-to-end tests.

A new module normally consumes canonical events and creates domain commands or delivery intents. It MUST NOT receive Discord credentials, open Gateway sessions, construct raw Discord requests, or bypass the shared Delivery Plane.

### 23.2 Contract evolution

- Additive optional fields are backward-compatible.
- Renaming, removing, or changing semantics requires a new major schema version.
- Producers support the current version and the defined previous-version window.
- Consumers record unsupported versions rather than silently discarding them.
- Public contracts include ownership, change history, compatibility tests, and deprecation dates.
- Database schemas are private implementation details and are not integration contracts.

### 23.3 Architecture decision records

An architecture decision record is required for:

- Creating, merging, or splitting a service.
- Introducing a privileged Discord intent.
- Changing the delivery guarantee or idempotency model.
- Introducing a new durable infrastructure capability.
- Changing tenant partitioning or cell assignment.
- Allowing a product service direct provider access.
- Changing retention of events, messages, or user-derived content.
