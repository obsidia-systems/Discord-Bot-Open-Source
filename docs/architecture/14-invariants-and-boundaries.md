# Tobot Architecture — Invariants and Module Boundaries

[Architecture index](README.md) · [Previous](13-recovery-testing-governance.md) · [Next](15-moderation.md)

## 24. Definitive platform invariants

1. Product services never own Discord connections or credentials.
2. Gateway handlers never execute product workflows inline.
3. Every accepted domain-relevant Gateway event is durably inboxed.
4. Every cross-service fact is published through a transactional outbox.
5. Every consumer is idempotent under duplicate and out-of-order delivery.
6. Every guild-owned resource carries and enforces a tenant key.
7. Every delivery pins immutable configuration and message revisions.
8. Every delivery has a unique idempotency key and observable state.
9. Every uncertain external effect is reconciled before retry.
10. Every Discord request passes through centralized transport governance.
11. Every provider limit is learned from current provider responses where Discord exposes it; mutable rate values are not hard-coded.
12. Every user-derived message uses explicit allowed mentions.
13. Every asynchronous queue, retry loop, cache, and worker pool is bounded.
14. Every lease uses expiry and fencing when stale owners could still write.
15. Every cache is disposable and has an authoritative rebuild source.
16. Every source asset is validated, tenant-owned, content-addressed, and storage-provider neutral.
17. Every rendered artifact has resource and byte ceilings.
18. Every privileged intent has a documented, approved, and monitored justification.
19. Every service can run without authoritative local disk state.
20. Voice media remains isolated from text delivery and interaction workloads.
21. Every moderation action has separate actor authorization, bot capability, owner protection, hierarchy, and protected-target decisions.
22. Every moderation provider mutation creates or resolves one immutable case before secondary notifications are requested.
23. Every automatic moderation rule declares exactly one enforcement owner.
24. Every semantic moderation incident can produce each configured sanction at most once.
25. Every activity attribution carries evidence type and confidence; unknown remains unknown.
26. Every cleanup occurrence is bounded, checkpointed, fenced, and explicit about partial completion.
27. Every retained message excerpt, attachment reference, or moderation evidence has an independent privacy class and expiry.
28. Every failed cleanup page remains a failure or retry state and is never converted into an empty successful page.
29. Every sanction notification is secondary to the primary action and has an independent outcome.
30. Every provider audit lookup is bounded and remains outside the critical moderation mutation path.
31. Every security threshold crossing is atomically reserved against a durable incident and can request each response-plan step at most once per policy revision and response epoch.
32. Every security-critical time window is replica-safe, bounded, expiring, and unavailable rather than replaced by process-local enforcement state.
33. Every security response step has one declared owner: Moderation Cases, Containment Orchestrator, Delivery, Auto Moderation Policy, or observe only.
34. Every security-requested member or role mutation passes through the same case, authority, hierarchy, and transport controls as a manual moderation action.
35. Every automatic security mutation requires a durable incident, immutable response plan, fresh-enough capability report, and typed owner-specific request.
36. Every guild-wide containment operation is durable, fenced, bounded, resumable, and persists step intent before provider mutation.
37. Every reversible containment step snapshots its owned original and applied provider values and never restores over an unrelated administrator change.
38. Every partial, uncertain, blocked, or conflicting containment step remains operator-visible until recovered or explicitly acknowledged.
39. Every security incident pins immutable policy and response-plan revisions and preserves its threshold snapshot.
40. Every anti-nuke executor is provider-evidenced or explicitly unknown; executor identity is never inferred as fact.
41. Every loss of required Discord intent, permission, policy snapshot, or atomic counter produces an explicit degraded-coverage state, never an apparent zero-event state.
42. Every security alert is secondary, durable, deduplicated, mention-safe, and independently observable.
43. Every Discord-native security control is treated as a conditional provider capability and never as an assumed application power.
44. Every role-assignment intent describes one member, one role, one desired state, one ownership key, one immutable policy revision, and one semantic idempotency key.
45. Every automatic or self-service role mutation is durably accepted, capability checked at execution, typed in outcome, and independent from Gateway or interaction handler lifetime.
46. Every role removal proves policy ownership or an explicit authorized override; current absence or presence alone does not establish ownership.
47. Every delayed, temporary, or sticky role has a bounded durable lifecycle and explicit privacy policy.
48. Every role panel has one authoritative versioned aggregate and one provider binding; parallel registries cannot define competing truth.
49. Every role panel interaction validates tenant, member, message, panel, revision, and mapping before requesting assignment.
50. Every panel publication and repair is bounded, fenced, reconcilable, and explicit about degraded or orphaned state.
51. Every role-resource mutation uses live bot capability, provider hierarchy, managed-role rules, actor authorization, sensitive-permission policy, and an optimistic fingerprint.
52. Every uncertain non-idempotent role-resource effect is reconciled before retry.
53. Every automatic and self-service role target excludes `@everyone`, managed roles, above-bot roles, and prohibited sensitive permissions.
54. Every external role deletion or hierarchy change invalidates dependent policy and panel health through idempotent domain events.
55. Every XP award is an append-only ledger decision pinned to one source event and immutable progression-policy revision.
56. Every random XP amount is deterministically derived from the source decision identity and revision or durably committed once before publication.
57. Every voice XP interval is non-overlapping, durably segmented, eligibility-explainable, and closed or expired without inventing unobserved activity.
58. Every level transition and reward occurrence is derived from committed ledger state and has its own idempotency identity.
59. Every leaderboard is a rebuildable, privacy-filtered projection with explicit window, tie rule, snapshot time, and freshness.
60. Every starboard contribution is unique by tenant, board, source message, contributor, and configured reaction identity.
61. Every starboard projection pins one source aggregate version and reconciles uncertain message effects before retry.
62. Every giveaway entry is admitted under an immutable revision and one explicit close boundary.
63. Every giveaway draw generation commits an immutable entrant snapshot and winner set using the secure-randomness capability; no failure silently redraws.
64. Every giveaway prize has one declared fulfillment owner and an outcome independent from winner selection and announcement.
65. Every form submission pins an immutable published form version and is committed before the platform claims acceptance.
66. Every accepted form file becomes a validated tenant asset or remains an explicit failed requirement; ephemeral provider URLs are never authoritative records.
67. Every form review uses optimistic submission state and creates each configured secondary effect at most once.
68. Every reviewer-anonymity promise is enforced across queries, exports, notifications, telemetry, and audit access while accurately disclosing any system-held identity.
69. Every temporary-room creation and lifecycle transition is durable, fenced, bounded, and composed of individually reconcilable provider effects.
70. Every temporary-room mutation proves current actor authority, bot capability, resource ownership, and optimistic room version.
71. Every temporary-room cleanup deletes only resources created and still owned by the room operation; linked external channels are never cleanup targets.
72. Every community interaction acknowledges within the provider deadline while durable domain completion remains independent from the interaction-token lifetime.
73. Every virtual-currency unit exists through balanced immutable postings; mutable balances are projections and never independent monetary truth.
74. Every monetary transaction, hold transition, income settlement, payment, refund, wager, and payout has one semantic idempotency key and immutable source reference.
75. Every monetary account enforces non-negative current and available balance, configured ceiling, currency state, and optimistic projection version within the posting transaction.
76. Every tax, fee, burn, grant, fine, and correction names explicit source and destination ledger accounts; value never appears or disappears through an unexplained balance update.
77. Every correction and refund is a linked compensating transaction; posted financial history is never edited or deleted as an operational shortcut.
78. Every randomized earning or game decision is committed once under an immutable rule revision and never rerolled by retry or presentation failure.
79. Every income action owns a durable occurrence, eligibility result, cooldown decision, formula receipt, and independently observable monetary settlement.
80. Every scheduled salary distribution is fenced, bounded, checkpointed, tenant-fair, and idempotent per recipient.
81. Every finite-stock purchase reserves stock atomically before payment and consumes or releases that reservation exactly once.
82. Every purchase pins immutable price, eligibility, limit, stock, and reward definitions and exposes payment, fulfillment, compensation, and refund separately.
83. Every external reward is an entitlement with one owner, idempotency identity, provider receipt, lifecycle generation, and reconciliation state.
84. Every entitlement reversal proves current effect ownership and never deletes or removes an unrelated administrator-managed resource.
85. Every manual fulfillment remains pending until an authorized evidence receipt confirms the promised benefit, regardless of notification delivery.
86. Every casino game session is durable, single-owner fenced, versioned, bounded, player-authorized, and recoverable without process-local authority.
87. Every wager is represented by a Monetary Ledger hold and one immutable outcome settlement; a stale interaction cannot alter either.
88. Every economy feature uses virtual non-redeemable value only unless a separate regulated-money architecture is explicitly approved.
89. Every economy Discord effect is secondary to domain state and passes through shared capabilities, Delivery, Role Assignment, or governed Transport.
90. Every support panel is an immutable versioned definition with one explicit provider binding, application identity, ownership mode, and reconcilable projection state.
91. Every support interaction validates tenant, application, message, panel, revision, option, template, member, and current enabled state before case admission.
92. Every support open request reserves all applicable capacity, cooldown, number, case, event, and outbox state atomically within Support Case Service.
93. Every Support Case has one immutable template revision, append-only transition history, optimistic version, and lifecycle independent from Discord resource availability.
94. Every support staff, opener, participant, escalation, transcript, and administration action is independently authorized from current policy and membership.
95. Every support resource operation is durable, fenced, bounded, capability-checked, application-owned, and reconciled before uncertain non-idempotent retry.
96. Every support access projection modifies only declared policy-owned permissions or memberships and preserves unrelated provider state.
97. Every support resource cleanup proves matching case generation and current ownership and waits for the required archive-boundary decision.
98. Every transcript declares capture policy, source watermark, gaps, content availability, attachment state, identity mode, integrity, access, and retention.
99. Every support form, message, log, transcript, and notification is secondary to case state and uses its established owning service.
100. Every support timer is durable, generation-bound, uniquely keyed, reclaimable, and explicit about misfire behavior.
101. Every stream-alert definition pins one canonical external identity, immutable policy revision, destination, presentation, mention, freshness, suppression, and lifecycle contract.
102. Every external provider identity uses a provider-issued stable identifier when available; mutable handles and display names never become sole domain identity.
103. Every provider callback or event-stream message is authenticated, freshness-checked, replay-protected, generation-bound, bounded, and durably receipted before semantic processing.
104. Every provider transport is assumed at least once and potentially delayed or reordered; transport and semantic deduplication remain separate.
105. Every provider credential and verification secret is opaque outside the secret boundary, least-scoped, versioned, rotatable, access-audited, and blast-radius limited.
106. Every provider subscription mutation is durable, fenced, ownership-proven, observable, and reconciled before uncertain retry.
107. Every polling occurrence is durable, quota-aware, provider-rate-governed, tenant-fair, bounded, and protected by a fencing token.
108. Every requested identity in a provider batch receives a conclusive result or an explicit inconclusive outcome; omission and failure never mean offline by default.
109. Every provider adapter emits only versioned canonical identities, observations, health, and typed errors; provider response shapes never leak into domain services.
110. Every live-session transition preserves source provenance, source generation, provider occurrence time, receipt time, confirmation basis, and optimistic aggregate version.
111. Every provider failure, quota refusal, credential error, revocation, and stale source becomes explicit coverage health and never fabricates a live or offline fact.
112. Every stream-alert occurrence is unique by alert revision, provider session, transition class, and lifecycle generation and is atomically committed with its outbox.
113. Every Discord alert create, refresh, offline notice, and cleanup is a secondary Delivery projection with an independent outcome.
114. Every alert mention is explicitly authorized, allowlisted, previewed, bounded, and governed by tenant and destination anti-spam policy.
115. Every alert projection edit or deletion proves exact application ownership, message binding, occurrence identity, and current lifecycle generation.
116. Every alert refresh is coalesced and rate-bounded; mutable provider metadata cannot produce uncontrolled Discord edits.
117. Every integration test occurrence is isolated from production provider state, deduplication, lifecycle timers, and broad-mention authority.
118. Every integration dashboard health claim distinguishes provider coverage, observation freshness, subscription state, credential state, Discord capability, and delivery outcome.
119. Every custom command is an immutable versioned definition with a typed argument schema, deterministic invocation policy, bounded response plan, dependency fingerprint, and explicit projection state.
120. Every application command has one declared owner and contributes through the single authoritative Application Command Registry.
121. Every bulk application-command overwrite is compiled from the complete desired registry for that application installation and never from one module's local list.
122. Every application-command provider mutation is durable, fenced, versioned, observable, and reconciled before uncertain retry.
123. Every command interaction resolves through confirmed application, installation, provider binding, owner, and immutable definition revision rather than name alone.
124. Every custom-command interaction is acknowledged or deferred within the provider deadline while durable execution remains independent from token lifetime.
125. Every custom-command access decision is server-side, current, deterministic, tenant-scoped, and independently explains user, role, channel, entitlement, age-restricted, and bot rules.
126. Every custom-command cooldown and concurrency reservation is atomic, distributed, expiring, bounded, and idempotent under duplicate interaction delivery.
127. Every custom-command argument is typed, schema-bound, size-limited, privacy-classified, and sourced only from the signed interaction.
128. Every custom-command template is precompiled, non-Turing-complete, deterministic, resource-bounded, mention-safe, and incapable of arbitrary external side effects.
129. Every custom-command response action has a finite declared owner, unique effect identity, immutable input snapshot, deadline, and independently observable outcome.
130. Every custom-command response, DM, follow-up, attachment, and deletion passes through shared Message Catalog, Asset, Delivery, capability, and transport governance.
131. Every reminder has one owner, immutable revisions, explicit timezone, civil-time resolution, schedule policy, delivery-route privacy policy, and bounded lifecycle.
132. Every reminder occurrence is unique by reminder, schedule generation, and intended instant and pins immutable content, route, origin, mention, and deadline state.
133. Every reminder due claim is durable, leased, fenced, reclaimable, tenant-fair, and invalidated by a newer cancellation or schedule generation.
134. Every reminder delivery route is explicit, privacy-aware, permission-checked, mention-safe, retry-bounded, and independently recorded.
135. Every reminder cancellation, edit, reschedule, snooze, pause, recurrence expansion, and terminal delivery competes through optimistic version and occurrence generation.
136. Every recurring reminder is bounded by frequency, count or end horizon, active occurrence limit, catch-up rule, and misfire policy.
137. Every ambiguous or invalid civil time is resolved by a published daylight-saving policy or rejected; server-local timezone is never implicit authority.
138. Every failed reminder remains delivered, cancelled, missed, expired, unresolved, or dead-lettered for bounded history and is never silently deleted on retry exhaustion.
139. Every command and reminder audit record minimizes argument and reminder content and keeps private values out of telemetry labels.
140. Discord login, Discord application installation, and payment-provider authorization are separate protocols with separate single-use transaction identities, scopes, redirect bindings, secret generations, and replay protection.
141. A browser-visible guild, cached Discord guild permission bitfield, selected guild ID, installation callback, or billing-owner claim is never sufficient authorization for a sensitive command.
142. Every sensitive platform command revalidates the active session generation, current account status, tenant binding, required guild authority, owning-service capability, and expected aggregate version.
143. Provider access and refresh tokens, payment credentials, webhook signing material, AI provider credentials, and Discord webhook tokens never enter client-readable state, domain events, metric labels, or ordinary logs.
144. Discord application installation health requires provider-observed installation context, bot presence when required, command-registry state, current module capability, and generation agreement; a callback alone cannot establish health.
145. Installation permission requests are derived from selected module capability manifests and use least privilege; administrator permission is never a default repair strategy.
146. Commercial billing state and guild virtual-economy state never share currencies, accounts, journals, balances, transaction identities, refund paths, or mutation interfaces.
147. Plans grant base feature and limit components; add-ons extend a compatible capability; capacity tiers quantify an add-on; bundles expand into ordinary components; perks are non-quantitative; XP levels are gamification only.
148. AI Credits are the sole internal credit unit for billable AI operations and are never generic payment credits, compute credits, guild currency, XP, a subscription plan, a capacity tier, cash, or a provider token.
149. Every commercial order and subscription pins immutable product, price, compatibility, regional, tax-classification, and terms revisions that remain interpretable after catalog change.
150. Checkout creation is idempotent by commercial order and attempt generation, while commercial fulfillment is driven only by verified asynchronous provider state or explicit reconciliation, never a browser return page.
151. Every payment-provider event is authenticated before parsing into authority, deduplicated within provider account and environment scope, durably received before acknowledgement, ordered by provider object semantics, and safe under replay.
152. Provider-neutral subscription state preserves incomplete, active, past-due, paused, scheduled-change, cancelled, restricted, disputed, and reconciled distinctions instead of collapsing them into a boolean premium flag.
153. Plan cancellation or capacity reduction never deletes tenant configuration automatically. Existing data follows its retention policy while new capacity-consuming admission observes the effective limit and overage policy.
154. A platform entitlement projection identifies every contributing source, validity interval, precedence decision, effective feature, effective limit, perk, grace state, and generation.
155. Product modules enforce hard capacity atomically against authoritative usage at admission. A cached entitlement snapshot can reject quickly but cannot alone authorize an over-limit creation.
156. Billing ownership, Discord guild management authority, installation presence, and platform entitlement are independent facts; no one fact implies the others.
157. Every AI Credit grant belongs to a source-aware lot with frozen amount, grant time, expiry, refund terms, and deterministic consumption order.
158. Every billable AI operation pins a pricing revision and obtains an atomic reservation before provider execution; actual usage capture and unused reservation release are append-only ledger transitions.
159. An uncertain billable AI provider outcome is reconciled before retry or release whenever a duplicate result or charge is possible.
160. AI Credit settlement accepts only normalized provider usage bound to the exact operation and attempt; client-supplied usage or provider-cost claims are never authority.
161. AI spending limits, cooldowns, concurrency, anomaly controls, and kill switches are enforced independently by commercial scope, tenant, actor, operation class, workflow, and character where applicable.
162. AI inputs, context, media, transcripts, outputs, safety decisions, embeddings, and provider references have explicit purpose, privacy, access, residency, retention, deletion, and provider-training compatibility policy.
163. Every AI character uses an immutable behavior revision, explicit destination policy, isolated context boundary, disclosed automated presentation, input and output moderation, and bounded spending policy.
164. An AI character shares the platform application and cannot acquire authority, permissions, identity, or data through a persona name, avatar, prompt, webhook, XP level, or conversation content.
165. Every published template is declarative, immutable, integrity-addressed, reviewed under an explicit state, portable across provider adapters, and free of secrets, executable code, raw database rows, and implicit ownership.
166. Every template installation pins one revision, preflights all dependencies and permissions, obtains typed plans from owning services, records stable step identities, and exposes partial or uncertain outcomes.
167. Template rollback compensates only effects whose ownership is proven for the matching installation generation; external edits and ambiguous ownership become conflicts rather than destructive guesses.
168. Template ratings and reputation cannot grant administrative authority, bypass moderation, manufacture unlimited AI Credits, or substitute for verified installation and anti-fraud eligibility.
169. The template marketplace is permanently free: templates cannot have prices, purchases, subscriptions, paid placement, revenue sharing, seller payouts, or access conditioned on any monetary instrument, AI Credit balance, guild currency balance, plan, add-on, bundle, or perk.
170. Every workflow revision compiles to a finite typed graph with bounded triggers, conditions, actions, fan-out, depth, duration, recursion lineage, destination budget, and dependency manifest.
171. Workflow conditions are deterministic and side-effect-free; workflow actions are typed idempotent commands to owning services and never direct database, Discord, payment-provider, or unrestricted network operations.
172. Every workflow execution is unique by workflow revision, trigger identity, and scope and freezes authoritative facts, policy, action identities, deadlines, and replay generation.
173. Workflow action occurrences are independently authorized, rate-limited, retried, reconciled, compensated, audited, and observable; one failure cannot erase successful sibling effects.
174. Workflow replay preserves the original revision and semantic action identities unless an explicit authorized new generation is created, and it cannot reset downstream deduplication.
175. Only AI actions consume AI Credits. Ordinary Discord, scheduling, role, support, moderation, economy, integration, and delivery actions never consume AI Credits merely because a workflow invoked them.

## 25. Initial module boundary summary

| Module | Consumes | Produces | Owns | Forbidden dependencies |
|---|---|---|---|---|
| Lifecycle | Canonical member and boost events; admin commands | Lifecycle decisions and delivery intents | Lifecycle policies, revisions, correlations | Discord SDK, raw HTTP, asset bytes |
| Message Catalog | Admin commands | Published definition events and immediate-send intent requests | Message definitions and immutable revisions | Discord SDK, scheduler state, provider storage paths |
| Schedule | Clock signals and admin commands | Due occurrences and delivery intents | Schedules, revisions, occurrences, leases | In-memory authority, Discord HTTP |
| Auto Reply | Canonical message events and admin commands | Match decisions and delivery intents | Rules, revisions, matcher metadata, cooldown reservations | Direct Discord sends, per-event SQL hot path |
| Delivery | Delivery intents and provider outcomes | Attempt and final-status events | Delivery workflows and attempts | Product-specific policy decisions |
| Discord Capabilities | Discord resource events and inspection commands | Delivery, moderation, hierarchy, and management capability reports and invalidations | Rebuildable guild, member, role, channel, thread, and permission projections | Product configuration and provider mutations |
| Asset | Upload, fetch, reference, and release commands | Asset lifecycle events | Source assets and metadata | Message delivery policy |
| Renderer | Render commands | Render artifacts and receipts | Short-lived generated artifacts | Discord credentials, product persistence |
| Gateway Edge | Discord Gateway protocol | Canonical ingress events | Shard sessions and ingress inbox | Product configuration and rendering |
| Interaction Edge | Discord interaction protocol | Acknowledgements and durable commands | Interaction receipts and token expiry | Long-running product work |
| Discord Transport | Typed Discord operations | Normalized provider results | Rate-limit and request state | Product business rules |
| Voice Control | Voice commands and Gateway voice events | Session assignments and state | Voice session control | Text delivery internals |
| Voice Media | Voice session assignments | Voice health and media outcomes | Live media sessions | Message catalog and lifecycle policy |
| Moderation Cases | Moderator and authorized enforcement commands | Case and moderation outcome events; secondary notification requests | Cases, append-only events, warnings, notes, action receipts | Raw Discord clients, Activity Log writes, Auto Moderation policy data |
| Auto Moderation Policy | Canonical message events, native execution events, admin commands | Incidents, enforcement requests, reviews, native binding state | Policy revisions, incidents, bindings, counters, review state | Direct member sanctions, direct Discord message sends |
| Retention and Cleanup | Canonical message events, clock signals, admin commands | Countdown and sweep outcomes | Retention revisions, deletion intents, occurrences, checkpoints, leases | In-memory scheduling authority, Activity Log writes |
| Activity Log | Canonical Discord and platform outcome events | Activity records, attribution updates, optional delivery intents | Activity records, privacy state, attribution links, routing decisions | Raw audit reads, webhook tokens, product mutations |
| Discord Audit Query | Authorized queries and bounded correlation requests | Audit pages and correlation observations | Short-lived cache, opaque cursors, bounded correlation index | Moderation action success path, unbounded audit duplication |
| Security Policy and Incident | Canonical member, member-update, audit-entry, capability, and containment events; admin commands | Incidents, response requests, review facts, and alert intents | Security policy revisions, observations, distributed-window reservations, incidents, latches, cooldowns, evidence references | Discord clients, direct sanctions, containment snapshots, Activity Log writes |
| Containment Orchestrator | Authorized manual and security response requests; provider outcomes | Preview, step, active, partial, restore, conflict, and acknowledgement events | Operations, fenced leases, plans, snapshots, attempts, conflicts, acknowledgements | Raw Discord clients, member-sanction policy, security detector state, unbounded fan-out |
| Role Policy and Assignment | Canonical member events, panel commands, timer occurrences, role invalidations, admitted containment facts, admin commands | Assignment plans and outcomes, expiries, reconciliation summaries, interaction-result facts | Role policy revisions, assignment intents, ownership, attempts, timers, sticky records, reconciliation checkpoints | Raw Discord clients, panel presentation state, role-resource CRUD, moderation sanctions, security incident authority |
| Role Panel | Admin commands, canonical reaction and component events, delivery and role-health outcomes | Publication operations, assignment commands, repair and mapping-health events | Panel revisions, mappings, routing tokens, provider bindings, projection receipts, tombstones | Direct role mutation, raw Discord clients, duplicate registries, role-resource ownership |
| Role Resource | Authorized administrative commands, canonical role events, provider outcomes | Mutation, reconciliation, privilege-delta, and dependency-invalidation events | Mutation ledger, before/after snapshots, idempotency receipts, reconciliation cases, rebuildable role projection | Member assignment policy, raw Discord clients, authoritative provider role state |
| Engagement Progression | Canonical message and voice-state events, trusted adjustments, role outcomes, timer occurrences | XP and level facts, reward requests, leaderboard snapshot events | Progression revisions, XP ledger, voice segments, level state, reward occurrences, leaderboard definitions and snapshots | Discord clients, direct role mutation, message-content assumptions, process-local cooldown authority |
| Starboard | Canonical reaction and message lifecycle events, admin commands, delivery outcomes | Threshold and contribution facts, projection intents, repair outcomes | Starboard revisions, contributions, source aggregates, projection bindings and reconciliation state | Direct message sends, arbitrary content acquisition, process-local serialization authority |
| Giveaway | Entry interactions, admin commands, timer occurrences, role and delivery outcomes | Entry and lifecycle facts, immutable draw results, prize requests, fulfillment summaries | Giveaway revisions, entries, close snapshots, draws, winners, fulfillment occurrences | Discord clients, direct role mutation, insecure or implicit randomness, unowned external prizes |
| Form Workflow | Form and review commands, submission interactions, asset and role outcomes | Publication, submission, review, export, and secondary-effect facts | Form drafts and versions, sessions, submissions, answers, review history, asset references, export jobs | Discord clients, raw attachment URLs as storage, mutable published forms, direct role mutation |
| Temporary Room | Canonical voice-state and channel events, room interactions, timers, provider outcomes | Room lifecycle, control, cleanup, conflict, and reconciliation facts | Generator revisions, room aggregates, creation and cleanup operations, resource bindings, access claims, timers | Voice media transport, direct Discord clients, deletion of linked external channels, process-local timers |
| Monetary Ledger | Authorized money commands and idempotent settlement requests | Transaction, hold, transfer, reversal, balance, freeze, and reconciliation facts | Currency revisions, accounts, journal, postings, holds, balance projections, transfer and adjustment records | Discord clients, product eligibility decisions, shared writable balance tables, floating-point money |
| Earnings and Income | Income interactions, salary timers, policy commands, role and progression facts, ledger outcomes | Income decisions, settlement requests and outcomes, streak and salary facts, anomaly observations | Income revisions, occurrences, cooldowns, streaks, salary schedules, formula receipts, settlement references | Direct balance writes, Discord clients, process-local randomness cooldowns or schedules |
| Commerce | Catalog and purchase commands, interaction receipts, ledger and entitlement outcomes | Catalog, stock, order, payment, fulfillment, refund, and reconciliation facts | Catalog and item revisions, stock and reservations, purchase limits, orders, reward lines, payment and refund references | Direct ledger writes, Discord clients, direct role channel boost or manual reward effects |
| Entitlement | Commerce grant and reversal requests, timers, owner-service and provider outcomes | Activation, expiry, revocation, compensation, manual fulfillment, and reconciliation facts | Entitlements, effect references, owned resource bindings, boost grants, manual cases, timers, attempts | Charging, refunding, stock ownership, deletion without ownership proof, raw Discord clients |
| Casino Game | Game commands and interactions, timer occurrences, ledger outcomes | Session, action, random outcome, wager, settlement, cooldown, and recovery facts | Casino and rule revisions, sessions, actions, randomness receipts, wager references, outcomes, message bindings | Balance writes, process-local game authority, predictable fallback randomness, real-money value |
| Support Policy | Authorized settings and template commands, dependency invalidations | Policy, template, capacity, schedule, routing, archive, and health facts | Support defaults and revisions, ticket templates and revisions, type registry, authorization, eligibility, routing, automation, archive policy | Live case counts, panel projection, Discord clients, transcript content |
| Support Panel | Panel commands, template health, signed component events, Delivery outcomes | Panel lifecycle, interaction, orphan, repair, and open-request facts | Panel drafts and revisions, options, publication operations, provider bindings, tokens, health, tombstones | Case creation, channel creation, raw Discord clients, trusting components as authority |
| Support Case | Open and case commands, intake facts, policy snapshots, resource and archive outcomes, timers | Case lifecycle, capacity, assignment, participant, resource, archive, and notification facts | Cases, numbers, capacity reservations, cooldowns, intake references, participants, assignments, events, timers, lifecycle state | Raw Discord clients, form answer ownership, transcript content, count-then-insert admission |
| Support Resource | Case desired-resource commands, canonical channel and thread events, capability and provider outcomes | Provisioning, access, partial, orphan, cleanup, conflict, and reconciliation facts | Resource operations and steps, provider bindings, owned overwrites, access claims, attempts, repair checkpoints | Support eligibility, staff policy, case lifecycle authority, deletion without ownership proof |
| Support Archive | Admitted support-message events, case boundaries, attachment and delivery outcomes | Capture gap, transcript, redaction, retention, delivery, and aggregate metric facts | Message archive records, asset references, gaps, transcript jobs and artifacts, access audit, retention occurrences | Case transitions, unbounded provider history, public artifact URLs, completeness without evidence |
| Integration Registry | Authorized configuration and test commands, provider identity and Discord capability outcomes | Definition, identity, dependency-health, desired-coverage, and test-occurrence facts | Alert definitions and revisions, canonical identity bindings, provider capability references, dependency health, test occurrences | Provider polling, subscription resources, live-session state, credentials, Discord clients |
| Provider Event Edge | Public provider callbacks or event streams, endpoint and secret generations | Authenticated event, duplicate, rejection, verification, revocation, and connection-health facts | Callback endpoints, ingress receipts, replay keys, verification evidence, acknowledgement and connection state | Live-session decisions, tenant presentation, provider polling, Discord delivery |
| Provider Observation | Due occurrences, active identity claims, provider budgets and capability profiles | Conclusive and inconclusive observations, quota, circuit, credential, and freshness facts | Schedules, leases, batches, attempts, quota reservations, caches, circuit and request state | Tenant messages, live-transition authority, direct Discord effects, process-local ownership |
| Provider Subscription | Desired coverage claims, endpoint health, provider outcomes and revocations | Subscription active, degraded, uncertain, absent, reconciled, and fallback facts | Desired claims, provider resource bindings, condition fingerprints, operations, leases, attempts, reconciliation checkpoints | Tenant alert presentation, live-session truth, credentials, Discord clients |
| External Live Signal | Authenticated provider events, conclusive observations, immutable alert snapshots and Delivery outcomes | Session transition, conflict, occurrence, suppression, lifecycle, and projection-state facts | Live-session aggregates, evidence references, metadata revisions, transition ledger, alert occurrences, projection references, lifecycle deadlines | Provider credentials, raw provider APIs, identity resolution, raw Discord clients |
| Custom Command Definition | Authorized definition commands and dependency invalidations | Definition, revision, contribution, dependency-health, preview, activation, and retirement facts | Custom-command aggregates and revisions, argument schemas, compiled plans, policies, response actions, dependency health | Provider command bindings, invocation cooldowns, raw interactions, Discord clients, arbitrary code |
| Application Command Registry | Built-in and custom contributions, application and guild events, provider outcomes | Registry snapshot, conflict, projection, binding, drift, and reconciliation facts | Owner registry, desired snapshots, provider bindings, operations, attempts, leases, observed state | Product execution policy, response content, independent owner overwrites, raw interactions |
| Custom Command Runtime | Routed interactions, immutable definition and capability snapshots, Delivery outcomes | Invocation, rejection, cooldown, action, partial, completion, and audit facts | Invocation receipts, cooldown and concurrency reservations, argument and variable snapshots, evaluation receipts, action occurrences | Definition edits, provider registry mutation, raw Discord clients, scripts, arbitrary service commands |
| Reminder | Owner and staff commands, time signals, wake-ups, Delivery and capability outcomes | Reminder lifecycle, occurrence, retry, route, snooze, missed, dead-letter, and audit facts | Settings, timezone preferences, definitions, revisions, recurrence, occurrences, leases, attempts, terminal history, origin references | Scheduled announcement ownership, raw Discord clients, process-local timers, silent failure deletion |
| Identity and Session | OAuth callbacks, account commands, provider identity responses, security events | Sessions, revocations, identity links, guild discovery observations, authentication audit facts | Accounts, external identities, OAuth transactions, sessions, grant generations, revocations | Installation truth, billing ownership, provider tokens outside secret storage, product authorization |
| Discord Installation | Authorized install and repair commands, provider callbacks, guild and application events, capability and registry observations | Installation, degradation, removal, module capability, and repair facts | Installations, generations, manifests, callback receipts, capability health, repair plans | Login sessions, independent command registration, product mutation, raw module effects |
| Commercial Catalog | Authorized catalog commands and compliance references | Product revision, retirement, compatibility, and catalog publication facts | Plans, add-ons, tiers, bundles, packs, perks, promotions, components, terms | Payment-provider calls, runtime entitlements, module usage, XP levels |
| Billing Orchestrator | Authorized checkout and portal commands, signed provider events, reconciliation observations | Order, payment, subscription, invoice, refund, dispute, grace, and grant-source facts | Billing owners, scope bindings, orders, checkouts, provider references, subscriptions, normalized events | Raw payment data, feature authorization, AI Credit balances, guild virtual currency |
| Platform Entitlement | Commercial and promotional grant events, scope bindings, usage summaries, due occurrences | Feature, limit, perk, grace, overage, invalidation, and reconciliation facts | Platform grants, effective projections, generations, source lineage | Payment truth, guild reward entitlements, module usage mutation, AI journal |
| AI Usage Ledger | Grant, reservation, usage, refund, expiry, and adjustment commands | AI Credit balance, reservation, capture, release, refund, expiry, and reconciliation facts | AI Credit accounts, lots, journal, allocations, reservations, projections | AI provider calls, prompts, generated content, guild money, general billing |
| AI Execution | Authorized AI requests, entitlement and reservation results, provider responses | Operation, result, usage, moderation, failure, uncertainty, and reconciliation facts | AI operations, protected input and result references, provider attempts, usage receipts | Credit balance writes, commercial catalog, direct Discord delivery, unrestricted provider choice |
| Template Registry | Author, review, report, rating, install, rollback, capability, and owner-service outcomes | Template, review, installation, compensation, conflict, rating, and reputation facts | Packages, revisions, manifests, reviews, reports, ratings, installations, step receipts | Executable code, secrets, direct module writes, assumed resource ownership, commercial billing, paid placement, payouts |
| Workflow Definition and Runtime | Definition commands, canonical triggers, timers, authenticated webhooks, downstream outcomes | Revision, execution, condition, action, partial, compensation, replay, and dead-letter facts | Workflow graphs, triggers, executions, action occurrences, rate and concurrency reservations | Arbitrary code, raw Discord, cross-service database writes, unlimited recursion, direct billing |
| AI Character | Character commands, canonical messages and interactions, AI and Delivery outcomes | Character revision, match, suppression, response, usage, and retention facts | Characters, behavior and channel policy, context references, cooldowns, response occurrences | Provider credentials, credit balance writes, direct AI or Discord calls, member impersonation |

This boundary map is the foundation for subsequent module specifications. New domain modules extend the canonical event and action vocabulary while preserving the platform invariants, service ownership rules, and Discord safety controls defined here.
