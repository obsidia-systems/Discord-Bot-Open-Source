# Tobot Architecture — Invariants and Module Boundaries

[Architecture index](README.md) · [Previous](13-recovery-testing-governance.md) · [Next](15-moderation.md)

## 24. Definitive platform invariants

1. Product services never own Discord connections or credentials.
2. Gateway handlers never execute product workflows inline.
3. Every accepted domain-relevant Gateway event is durably inboxed.
4. Every cross-service fact is published through a transactional outbox. That outbox MUST NOT require an inbox parent (DR-021).
5. Every consumer is idempotent under duplicate and out-of-order delivery.
6. Every guild-owned resource carries and enforces a tenant key.
7. Every delivery pins immutable destination, configuration, and message revisions at admission. Those pins MUST NOT change. A blocked intent is terminal; correction admits a new intent.
8. Every delivery has a unique idempotency key and observable state.
9. Every uncertain external effect is reconciled before retry.
10. Every Discord request passes through centralized transport governance.

#### Decision Record DR-004

**Status:** Accepted.

**Decision:** Discord Transport is the only module that opens Discord HTTP. Identity and Installation submit typed Transport operations. OAuth token exchange and current-user reads use a distinct credential class from the bot token. The user's browser may still talk to Discord's authorize URL. Owning modules revalidate guild authority through Discord Capability, which MAY request a Transport inspect when stale. They never call Discord HTTP themselves.

**Rejected Alternative:** Identity or Installation opening Discord HTTP; a second identity HTTP client beside Transport.

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
24. Every semantic moderation incident can produce each configured member sanction at most once. Platform-owned message deletion is a distinct Delivery action, idempotent by incident and message, and is not a member sanction.
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
101. Every stream-alert definition pins one `STREAM_CANONICAL_IDENTITY`, immutable policy revision, destination, presentation, mention, freshness, suppression, and lifecycle contract.
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
140. Discord login, Discord application installation, and payment-provider authorization are separate protocols with separate single-use transaction identities, scopes, redirect bindings, secret generations, and replay protection. Login and installation authorization-code transactions MUST include PKCE S256.
141. A browser-visible guild, cached Discord guild permission bitfield, selected guild ID, installation callback, billing-owner claim, or client-supplied `paid` or `entitled` flag is never sufficient authorization for a sensitive command.
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
176. Every Durable Timer due instant is registered with the Schedule module's opaque wake-up capability. Schedule runs a bounded due-row sweep for scheduled-message occurrences and opaque registrations. A lost wake-up MUST NOT orphan due work. Owners apply misfire policy and retain terminal-state authority. Process-local timers are never authoritative.
177. Platform-owned automatic-moderation message deletion is a Delivery intent. Auto Moderation MUST NOT call Discord Transport. Retention countdown and sweep deletes are typed Transport operations owned by Retention.
178. A commercial invoice is a Billing Orchestrator aggregate with platform identity. A payment-provider invoice object is evidence, not domain identity, and MUST NOT share accounts or journals with guild virtual currency.
179. `DiscordRoleProjection` is the rebuildable guild-role catalog and has one owner: Role Resource. Discord Capability and Role Policy and Assignment MAY read it or keep disposable local copies. They MUST NOT write the authoritative catalog row. Desired member-role relations are Assignment aggregates, not catalog rows. Discord remains provider-authoritative for live role bytes.
180. Conceptual ERD type names that would collide across owners MUST be qualified by the owning module. `AUTO_REPLY_COOLDOWN_RESERVATION` and `CUSTOM_COMMAND_COOLDOWN_RESERVATION` are distinct aggregates. `ROLE_PANEL_PUBLICATION` and `SUPPORT_PANEL_PUBLICATION` are distinct aggregates. They MUST NOT share tables, keys, or write paths. Generic product English does not imply a shared type.
181. Conserved amounts in guild virtual currency, commercial billing, and AI Credits are integer minor units. Binary floating point and domain `decimal` money are forbidden. Policy percentages, multipliers, probabilities, and rating rounding MAY use bounded rational or fixed-scale parameters with one explicit rounding rule. Provider decimal strings are evidence, not domain amount types. The three planes MUST NOT share journals.
182. `PLATFORM_EXTERNAL_IDENTITY` is Identity and Session's login-link aggregate. `STREAM_CANONICAL_IDENTITY` is Integration Registry's stream-channel aggregate. They MUST NOT share tables, keys, or write paths. A Discord OAuth subject is never a stream canonical identity.
183. The dashboard session is Identity's opaque server-side `AUTHORIZATION_SESSION`. The browser cookie, when used, carries only the session identifier. Integrity-protected cookies without a server revocation store MUST NOT be the session of record. Discord tokens and authorization claims MUST NOT live in the cookie.
184. Workflow Definition and Runtime is one module: an execution pins one immutable revision and shares replay, compensation, and dead-letter identity with that owner. Custom Command Definition, Application Command Registry, and Custom Command Runtime are three modules. Application Command Registry owns the Discord provider registry. Custom Command Runtime owns interaction admission. The two families MUST NOT be collapsed into one generic automation aggregate.
185. Protected-user and protected-role product policy is owned by Moderation Cases. Discord Capability evaluates Discord membership, permissions, owner protection, and live hierarchy. Capability MAY apply a pinned Moderation policy snapshot supplied at preflight as a pure function. It MUST NOT persist or author that policy. Discord hierarchy and protected-target deny remain independently explainable facts.
186. Inbox and outbox are sibling tables of the owning service. An outbox row MUST NOT require an inbox parent. Internally originated facts insert outbox without inbox. When a fact is a reaction to ingested work, the outbox MAY record an optional causal inbox identity. Correlation and causation live on the event envelope.
187. A payment-provider HTTP acknowledgement follows a durable provider-event receipt keyed by provider account scope and provider event identity. That receipt is not paid, entitled, or fulfilled. Commercial fulfillment is a later Billing transition from verified provider object state or explicit reconciliation. Browser return pages and HTTP ACK MUST NOT grant features, lots, or invoices.
188. Clock is the UTC wall-time infrastructure port. Durable Timer is Schedule's opaque wake-up and due-row sweep. Process-local clocks MUST NOT be due-work authority and MUST NOT replace the Clock port. Freshness windows use Clock plus a bounded skew policy.
189. Tenant fairness is MUST for Delivery admission and shared Discord HTTP. One tenant MUST NOT monopolize those queues. Weighted fair queuing SHOULD; token-bucket, deficit round-robin, or other work-conserving tenant isolation MAY satisfy the MUST. Priority MUST NOT bypass Discord rate limits or permanently starve lower classes.
190. Cookie-authenticated state-changing dashboard HTTP MUST pass an Origin (or equivalent Referer) check against the dashboard origin allowlist and a CSRF proof that is not the session-id cookie. The proof is a session-bound synchronizer token or a double-submit token. Origin-only and SameSite-only defenses are not sufficient. Safe methods MUST NOT mutate.
191. Every Discord authorization-code transaction for dashboard login and application installation MUST use PKCE with `code_challenge_method=S256`. Single-use `state` remains required. Confidential-client class MUST NOT waive PKCE. `plain` is forbidden. The verifier MUST NOT live in the session cookie.
192. Cookie-authenticated dashboard HTTP MAY name target tenant, guild, and resource identities. Control API and owning modules MUST NOT treat client-supplied commercial status, Discord permission bitfields, owner flags, or guild-discovery observations as authorization. Commercial truth is Billing and Platform Entitlement. Discord membership and guild authority are revalidated through Discord Capability. Billing, install repair, and destructive configuration fail closed when that revalidation is unavailable.
193. Every tenant HTTP workflow trigger MUST terminate at Provider Event Edge and follow the §32.14 processing order. After the ingress receipt, Edge publishes to Workflow, not External Live Signal. Unsigned tenant webhooks are forbidden. A secret solely in the query string or URL path is not sufficient authentication. Workflow MUST NOT skip Edge or treat URL possession as authentication.
194. Any server-side HTTP(S) fetch whose destination is influenced by untrusted or tenant-supplied input MUST resolve DNS, pin the destination IP for that hop, re-pin after every redirect, and deny loopback, link-local, RFC1918, IPv6 unique-local, IPv4-mapped equivalents, and cloud-metadata addresses. A hostname allowlist is not sufficient. Tenant-supplied, payload-supplied, and remote-media URLs MUST NOT use an internal-destination adapter profile.
195. Dashboard HTML encodes untrusted text by default. Form answers, AI prompts and generated output, template metadata and previews, provider titles and payloads, and other tenant- or provider-derived strings MUST NOT be interpolated as HTML. Markup MAY be emitted only through a named sanitizer with an explicit element and attribute allowlist. The dashboard origin MUST send Content-Security-Policy with `default-src 'self'` and script policy that forbids `'unsafe-inline'` and `'unsafe-eval'` except documented hashes or nonces. Disabling CSP is forbidden.
196. Retrieved guild messages, form answers, provider payloads, OCR and transcript text, conversation history, and model output are untrusted for tool selection and authorization. Platform-authored system instructions and the admitted tool catalog MUST NOT be overwritten by retrieved content. AI tools MUST be an allowlisted catalog. Each invocation is a typed command reauthorized by the owning service. Model output MUST NOT grant a new capability or select arbitrary HTTP or Discord effects.
197. The Discord bot permission bitfield requested on install and repair MUST be the minimal union of named permissions from currently enabled module capability manifests. Administrator MUST NOT be the default set, a repair shortcut when a named permission is missing, or a substitute for an incomplete manifest. Disabled modules MUST NOT inflate the request. Enabling another module MUST create a new authorization generation.
198. Every read and mutation of a tenant-scoped aggregate, projection, cache entry, object key, inbox row, or outbox row MUST include a tenant predicate bound from authenticated context, not solely from a client-supplied `tenant_id` or `guild_id`. Queries MUST be parameterized. A missing or mismatched tenant predicate MUST fail closed. A globally unique primary key MUST NOT substitute for the tenant predicate.
199. If Interaction Edge uses outgoing webhook mode, every HTTP request MUST verify Discord Ed25519 over the timestamp concatenated with the exact raw body, before JSON parse. Missing, stale, or invalid signatures fail closed. The application public key MUST NOT appear in a query string or path. Gateway mode MUST NOT admit that HTTP path.
200. The Discord bot token is mounted only on Gateway Edge and Discord Transport. Control API and product Domain workers MUST NOT receive it. Delivery MAY receive application-owned Discord webhook tokens and MUST NOT receive the bot token. Identity, Interaction Edge, Billing, and AI adapters receive only their named credential classes from the Secret Store.
201. Metrics scrape endpoints MUST be reachable only from the internal scrape network via network policy, mTLS, or authenticated scrape, and MUST NOT be reachable from the public internet or the dashboard origin. Liveness and readiness MAY be unauthenticated and MUST NOT include tenant identifiers or secret material. Metric labels MUST NOT include tenant IDs, member IDs, tokens, or secrets.
202. Template packages, workflow graphs, custom-command compiled plans, and worker-queue or job payloads MUST be admitted only through a versioned schema parse. Language-native object codecs over untrusted bytes are forbidden. Content-type is not sufficient. Unknown structure fails closed before object construction.
203. Span attributes, baggage, and other distributed-trace fields MUST use the same field allowlist as structured logs. AI prompts, model output, reminder body text, form answers, message content, invocation arguments, and secret material MUST NOT be copied into traces.
204. Cross-service canonical facts MUST commit to the owning module's transactional outbox and then be dispatched to the Durable Event Bus. The first bus adapter is Redis Streams. Foreign services MUST NOT read another owner's outbox tables. The outbox MUST NOT be marked consumed by the first consumer group. Intra-service claiming MAY use `SKIP LOCKED`. Redis Pub/Sub and RabbitMQ MUST NOT be this bus. Canonical replay lives in SQL. Interaction ACK MUST NOT wait on bus publish.
205. Canonical event and command envelopes MUST be versioned JSON (UTF-8). Unknown additive fields MUST be tolerated. Breaking semantic changes require a new major schema version. Discord and payment-provider raw bodies are not this codec. Language-native object codecs MUST NOT be the envelope contract. Protobuf MUST NOT be the first-product envelope.
206. Cross-service commands that require immediate admit or reject use command-HTTP with the §8.2 JSON envelope to the owning host, or in-process when that host is Control Plane. Control API MUST NOT open a client per module. The guild event bus MUST NOT carry dashboard commands. The command RPC MUST NOT wait for a Discord effect. gRPC MUST NOT be the first-product command adapter and MUST NOT replace Discord, payment-provider, or dashboard HTTP or the fact bus.
207. First-product Interaction Edge ingress is Gateway `INTERACTION_CREATE`. Gateway mode MUST NOT admit outgoing-webhook HTTP and MUST NOT run concurrently with webhook mode. The initial acknowledgement or defer MUST complete within Discord's 3-second budget through a typed Transport interaction-callback operation and MUST NOT wait on bus publish. Outgoing webhook mode, if selected later, MUST follow DR-034.
208. First-product dashboard freshness is cookie-authenticated REST poll of Query and Status. Projections remain bounded-stale. Server-Sent Events MAY later reuse those projections when polling cost is measured. The dashboard MUST NOT open a product WebSocket beside Discord Gateway. SSE MUST NOT place the session identifier in a query string, carry commands, or replace the Durable Event Bus.
209. First-product browser surfaces are three origins: sessionless `docs.*`, sessionless `www` landing, and `app.*` as the sole cookie site. The session cookie is host-only on `app.*`. The `www` login control is a GET navigation to the `app.*` login route. Login form and OAuth callback MUST NOT run on `www` or `docs.*`. A parent-domain session cookie is forbidden.
210. Billing subscription `PastDue` and Platform Entitlement `Grace` are sibling facts. `PastDue` is unpaid-period commercial state. `Grace` is finite product access on the entitlement projection. Feature authorization MUST read Entitlement, never subscription `PastDue`. Invariant 152 `reconciled` is provider-alignment of the subscription record; it MUST NOT be treated as entitled, as Grace, or as commercial fulfillment.
211. Discord installation aggregate `Installed` is true only when every required enabled-module capability is `Healthy`. Bot presence is a capability observation required only when the module manifest demands a bot member. Command-only modules MUST mark bot presence `NotRequired`. Observing the bot user MUST NOT flatten the aggregate to `Installed`. The OAuth callback commits `Verifying`, never `Installed`.
212. The live compatibility window for canonical event and command envelopes, including command-HTTP, is the current major `schema_version` N and exactly one prior major N-1. A new major MUST follow expand/contract. N-1 MUST remain readable until every producer of that `schema_name` family emits N and then for at least 14 Clock-port days. Unsupported majors MUST be recorded and MUST fail closed. N-2 MUST NOT be a live application target. Discord and payment-provider raw bodies are not this window.
213. The dashboard session cookie is host-only on `app.*` and MUST set `Secure`, `HttpOnly`, and `SameSite=Lax`. `SameSite=None` and `SameSite=Strict` are forbidden. Idle expiry is 12 Clock-port hours sliding. Absolute expiry is 7 Clock-port days from creation and MUST NOT extend with activity. Cookie `Max-Age` MUST NOT be expiry authority. Guild-discovery observations MUST NOT exceed 15 Clock-port minutes for presentation. Ordinary mutations MAY use Discord Capability at most 60 Clock-port seconds stale. High-risk commands require live revalidation and a step-up authentication generation no older than 5 Clock-port minutes. Authentication audit MUST use the named catalog and MUST NOT record tokens, cookie bytes, PKCE verifier, or authorization code. `SameSite` is not a complete CSRF control.
214. Discord Installation generates authorize URLs from named presets `GuildInstall`, `UserInstall`, and `GuildRepair`. `client_id` is the platform application identity. When the command names a guild, the URL MUST include that `guild_id` and `disable_guild_select=true`. The `permissions` query parameter is the DR-032 bitfield and is present only when `bot` is in scope. A client-supplied authorize URL, Discord Default Install Settings / `client_id`-only URL, or callback `guild_id`/`permissions` query MUST NOT be authorization.
215. A commercial order is a frozen Billing Orchestrator intent with immutable lines after admit and exactly one hosted-session mode, `Recurring` or `OneTime`. Mixed modes MUST fail closed at admit. Checkout creation is idempotent by `semantic_key` while the order is `Open`. A checkout attempt is one hosted-session generation; at most one non-terminal attempt exists per Open order. Attempt `Completed`, a provider Checkout Session row, a `success_url` GET, and a landing-page retrieve MUST NOT mark the order `Fulfilled`. Fulfillment requires verified paid or admitted provider object state or explicit reconciliation (DR-022).
216. A commercial refund is an append-only Billing Orchestrator aggregate. Invoice `Paid` and Order `Fulfilled` MUST NOT be rewritten when a refund succeeds. Refund amounts are integer minor units and MUST NOT exceed remaining refundable on the source. Adapter HTTP success on create-refund, a dashboard-posted `refunded` flag, and a provider Refund object as the aggregate identity are forbidden as domain `Succeeded`. `Succeeded` requires verified provider refund object state or reconciliation, then grant-source reversal facts. Billing MUST NOT write AI Credit lots. Guild-shop refund remains a distinct machine.
217. A commercial dispute is an append-only Billing Orchestrator aggregate distinct from refund. Verified provider inquiry or chargeback opens `COMMERCIAL_DISPUTE` and MUST publish grant-source freeze. Invoice `Paid` and Order `Fulfilled` MUST NOT be rewritten. Platform MUST NOT create a refund against the same source while the dispute is `Open`, `NeedsResponse`, or `UnderReview`. Dispute-webhook HTTP ACK, a dashboard-posted dispute status, and an early fraud warning MUST NOT be `Won`, `Lost`, or the dispute aggregate. `Lost` publishes reversal facts without creating a refund row.
218. `GRANT_SOURCE` is a Platform Entitlement applied-source aggregate. Billing publishes commercial grant facts and MUST NOT write `GRANT_SOURCE` rows or AI Credit lots. Entitlement applies those facts, plus promotions, compensation, and achievement grants, then recomputes the access projection. Feature admission MUST read the entitlement snapshot, never `GRANT_SOURCE.state` as paid and never Billing `PastDue`. Only Entitlement publishes AI-credit grant-source facts; AI Usage Ledger is the only lot writer. `source_ref` is an opaque originating identity, not a storage-access proof or a cross-service foreign key.
219. There is no domain Customer aggregate. `BILLING_OWNER` is the payer identity. Account-type admits at most one owner per platform account. At most one Active `BILLING_SCOPE_BINDING` exists per Discord installation. `PROVIDER_CUSTOMER_MAPPING` is adapter evidence; at most one Active mapping exists per owner, adapter, merchant-account scope, and environment; `provider_customer_ref` MUST NOT be `billing_owner_id` and MUST NOT attach to two owners. A dashboard-posted provider customer identifier is not authority. `TAX_EVIDENCE` is append-only location and classification evidence, not legal determination and not a Customer row.
220. Dunning is a Billing generation of catalog-pinned collection attempts on one Open renewal invoice. At most one `Open` generation exists per subscription for a given `current_period_start`. Attempt count is 1 through 8. Attempt dues MUST be strictly before Billing `grace_until` and MUST register with Schedule. A retry MUST NOT mint a CommercialOrder or a new invoice identity. Adapter collect HTTP, provider Smart Retries counts, `invoice.payment_failed` ACK, and a dashboard-posted `past_due` flag MUST NOT be invoice `Paid` or subscription `Restricted`. Collection MUST NOT run while a qualifying dispute is `Open`, `NeedsResponse`, or `UnderReview`. Exhaustion at `grace_until` without verified Paid MUST mark the invoice `Uncollectible` and the subscription `Restricted`, then publish commercial grant facts. Duplicate failure events MUST NOT extend `grace_until` or add attempts.
221. A mid-period Recurring subscription change pins a Billing `PRORATION_QUOTE`. Catalog `proration_mode` is `None` or `TimeBalance`. `TimeBalance` MUST compute per affected Recurring line `unused_old = (old_line_amount * remaining_seconds) / period_seconds` and `new_remainder = (new_line_amount * remaining_seconds) / period_seconds` in integer minor units with division toward zero, then sum `delta`. OneTime lines, mixed currency, non-positive `period_seconds`, floating-point or decimal domain money, a dashboard-posted amount, and a provider proration preview as the quote are forbidden. Positive `delta` MUST invoice and MUST NOT activate the upgrade before that invoice is `Paid`. Negative `delta` MUST credit the next renewal invoice and MUST NOT be `COMMERCIAL_REFUND` or rewrite a Paid invoice. A verified provider invoice total that differs from pinned `delta` opens reconciliation; the provider total MUST NOT activate the upgrade alone. Billing MUST NOT write AI Credit lots from proration.
222. A mixed Recurring+OneTime Bundle expands then splits into a `CHECKOUT_GROUP` and exactly two sibling `COMMERCIAL_ORDER` rows, each with one hosted-session mode. Recurring hosted checkout MUST complete or terminate before OneTime `CheckoutAttempt` `Creating`. Mixed Recurring intervals MUST fail closed and MUST NOT mint extra orders. One hosted session spanning both modes is forbidden. Group `Partial` MUST NOT auto-create `COMMERCIAL_REFUND` or rewrite Invoice `Paid`. A single-mode purchase MUST NOT require a group. Replay of an Open group `semantic_key` MUST NOT mint a second Open group.
223. Discord Installation owns the TENANT registry. First-product `tenant_type` is `Guild` or `User`; unknown types fail closed. `tenant_id` is platform opaque identity and MUST NOT equal a Discord snowflake, `billing_owner_id`, `account_id`, or `installation_id`. At most one Active tenant exists per `tenant_type`, `provider_tenant_ref`, and application environment. Product modules, Identity, Billing, Control API, and Query MUST NOT insert TENANT registry rows. Envelope `guild_id` MUST NOT be the storage tenant predicate. Installation `Removed` MUST NOT delete TENANT. A dashboard-posted `tenant_id` or `guild_id` remains insufficient for storage access (DR-033).
224. A due-work claim lease MUST set Clock-port `lease_expires_at` and a fencing token. First-product `lease_ttl` is 15 Clock-port seconds and MUST be in 5 through 30 inclusive. Heartbeat interval MUST be at most `lease_ttl / 3` using integer division toward zero. `lease_ttl` plus successor claim latency MUST be strictly below 60 Clock-port seconds. A superseded fencing token MUST NOT write. Graceful shutdown MUST release the lease. Lease expiry MUST NOT register with Schedule as a Durable Timer. Gateway shard leases and Voice session leases MUST NOT use this catalog.
225. AI Credit lot `expires_at` is frozen at mint from grant-source or catalog terms. Null means no automatic expiry. Purchased OneTime packs MUST be null unless explicit terms or law require otherwise. New reservations MUST NOT allocate a lot whose `expires_at` is at or before Clock now. Open allocations MUST remain until the reservation settles; leftover available then journals `Expiry`. Allocation and consumption order MUST be earliest `expires_at` first (null last), then `granted_at` ascending, then `lot_id`. Reservation TTL is 15 Clock-port minutes, MUST fall in 2 through 30 inclusive, and MUST be at least the operation deadline. Elapsed TTL without a confirmed outcome MUST enter `Uncertain` and MUST NOT `Release`. `Uncertain` stays reserved until reconciliation or 24 Clock-port hours (range 1 through 72), then `Disputed`. Non-null lot `expires_at` and reservation uncertainty deadlines MUST register with Schedule as Durable Timer dues. A dashboard-posted expiry, Billing-written expiry, silent TTL release, and process-local timer as expiry authority are forbidden.
226. Every AI provider attempt MUST record `result_class` `ConfirmedResult`, `ConfirmedFailure`, `RateLimited`, `TimeoutNotSent`, `TimeoutAfterSend`, or `Uncertain`. HTTP 429 or a provider-equivalent rate-limit refusal before a billable result MUST be `RateLimited` and MUST NOT be `Uncertain`, MUST NOT release, and MUST NOT settle. `TimeoutNotSent` is connect, DNS, circuit-open, or adapter timeout before transmit and MAY retry. `TimeoutAfterSend` is wait elapsed, reset, truncation, unparseable success, or 5xx without not-accepted proof after the request was transmitted; it MUST map to operation `Uncertain`, MUST NOT release, MUST NOT blind-retry, and MUST NOT auto-fallback to another provider. First-product `max_attempts` is 3 including the first, MUST fall in 1 through 8, and applies only to `RateLimited` and `TimeoutNotSent`. Adapter HTTP timeout MUST be strictly below remaining operation deadline and remaining reservation TTL. Retry-After is adapter config and MUST NOT be a domain constant and MUST NOT copy Discord 429 numbers. HTTP status MUST NOT be usage settlement.
227. Asset is the sole durable byte store for AI bodies. AI Execution owns `AI_PROTECTED_CONTENT`. `input_ref` and `result_ref` MUST be `protected_content_id` and MUST NOT be `asset_id`. Available protected content MUST have `asset_id`. OCR and transcription MUST use `purpose` `OcrSource`, `OcrText`, `TranscriptAudio`, or `TranscriptText` on that aggregate and MUST NOT invent a second blob owner. AI Character owns `AI_CONVERSATION` and turns that reference protected content and MUST NOT store bodies. First-product window is 20 turns including the current and MUST fall in 8 through 50. Overflow MUST drop the oldest turn and release its content. Support Archive MUST NOT store character conversations. A Discord CDN URL MUST NOT be durable AI content. A vector or embedding table MUST NOT be a first-product aggregate. Asset MUST NOT author AI purpose, privacy class, or conversation order.
228. Owner-schema tables are not integration contracts and MUST NOT use envelope `schema_version` as table version. Breaking private DDL during a rolling deploy MUST expand with additive DDL compatible with running binaries, dual-write and dual-read while mixed binaries of that owning service run, contract by stopping reads and writes of the old shape, then drop only after soak. First-product soak is 24 Clock-port hours, range 1 through 72, after every replica of that owner runs a binary that neither reads nor writes the old shape. Envelope N-1 is not this window. Live mappers MUST NOT `SELECT *`. Versioned forward migrations are the authority; production schema-push or auto-migrate is forbidden. In-place rename, type change, or DROP while an old binary of that owner still runs is forbidden. A service MUST NOT ALTER another owner's schema. PITR restore MUST apply the same versioned migrations as the binary generation; mixing an unrestored old table shape with a contracted binary fails closed.
229. Public money-plane contracts MUST set envelope `schema_family` to exactly `VirtualPayment`, `CommercialPayment`, or `AiCreditReservation`. `schema_name` remains the §8.6 leaf. Guild-shop capture and monetary holds are `VirtualPayment`. Billing order, invoice, refund, dispute, and payment-event facts are `CommercialPayment`. AI Credit reservation and usage-receipt facts are `AiCreditReservation`. An unprefixed public type named `Payment`, `Reservation`, or money `Catalog` is forbidden. `PurchasePaymentCaptured` MUST NOT be applied as commercial fulfillment. `CatalogPublished` MUST NOT be applied as commercial catalog. `StockReserved` MUST NOT be applied as `VirtualPayment` or `AiCreditReservation`. The three journals MUST NOT merge. Module 7.35 is not deleted; its public contracts are `GuildRewardEntitlement`.
230. The guild commerce-reward owner remains module 7.35 and is not deleted. Public contracts for that owner are `GuildRewardEntitlement`. Platform Entitlement remains `PlatformEntitlement`. An unprefixed public type `Entitlement` is forbidden. `GuildRewardEntitlementRequested` and sibling §8.6 leaves MUST NOT be applied as a Platform Entitlement snapshot. `GRANT_SOURCE` MUST NOT be a guild reward aggregate.
231. Payment-provider HTTP callbacks MUST terminate at Provider Event Edge and follow the 9.36 ACK/inbox path. HTTP success ACK is allowed only after a durable Edge ingress receipt. Duplicates MUST ACK success and reuse that receipt without repeating domain effects. Invalid, expired, or unknown generation MUST NOT ACK success. ACK MUST NOT wait for Billing apply, `GRANT_SOURCE`, entitlement projection, or lot mint. Billing MUST NOT open a public payment webhook listener. Edge ACK remains not paid, entitled, or fulfilled (DR-022).
232. Role Policy and Assignment is the sole platform client of Discord Transport for member-role add and remove. Those operations are one-role add or remove and MUST NOT replace the member's complete role list. Moderation Cases owns punitive member-role desired state and MUST NOT call Transport for add or remove. Timeout, kick, ban, unban, purge, slowmode, and channel lock remain Cases through Transport. Role Resource MUST NOT add or remove member roles. Assignment MUST NOT author punitive desired state. For the same guild, member, and role, Cases or security ownership outranks automatic and self-service ownership. Hierarchy and bot capability MUST be rechecked immediately before each Transport mutation.
233. Public entitlement contracts are only `GuildRewardEntitlement*` for module 7.35 and `PlatformEntitlement*` for module 7.55. An envelope whose `schema_name` is unprefixed `Entitlement` or any other Entitlement-shaped name MUST fail closed at parse. Platform Entitlement MUST reject `GuildRewardEntitlement*` at inbox apply. Module 7.35 MUST reject `PlatformEntitlement*` leaves and MUST NOT apply `GRANT_SOURCE`. Consumers MUST NOT infer the plane from payload fields. The private `ENTITLEMENT` table remains guild-reward storage and MUST NOT be Platform Entitlement's journal.
234. `Disputed` is a Ledger reservation review state, not an AI Execution operation state. While a reservation is `Uncertain` or `Disputed`, the paired operation MUST remain `Uncertain`. The operation machine MUST NOT gain a `Disputed` state. Reservation `Disputed` MUST NOT be treated as capture, release, refund, operation `Failed`, operation `Succeeded`, or settlement. The operation MAY leave `Uncertain` only after Ledger accepts a confirmed usage or absence receipt into `Capturing` or `Releasing`. Query and dashboard MUST NOT present a `Disputed` reservation as a completed operation.

## 25. Initial module boundary summary

| Module | Consumes | Produces | Owns | Forbidden dependencies |
|---|---|---|---|---|
| Lifecycle | Canonical member and boost events; admin commands | Lifecycle decisions and delivery intents | Lifecycle policies, revisions, correlations | Discord SDK, raw HTTP, asset bytes |
| Message Catalog | Admin commands | Published definition events and immediate-send intent requests | Message definitions and immutable revisions | Discord SDK, scheduler state, provider storage paths |
| Schedule | Clock port UTC now, admin commands, and opaque wake-up registrations | Due scheduled-message occurrences, delivery intents, and due-work signals to registering owners | Schedules, revisions, occurrences, leases, opaque wake-up registrations | In-memory authority, Discord HTTP, other domains' terminal semantics, Durable Timer per lease expiry, `lease_ttl` outside 5–30 seconds |
| Auto Reply | Canonical message events and admin commands | Match decisions and delivery intents | Rules, revisions, matcher metadata, `AUTO_REPLY_COOLDOWN_RESERVATION` | Direct Discord sends, per-event SQL hot path |
| Delivery | Delivery intents and provider outcomes | Attempt, final-status, and dead-letter events | Delivery workflows, attempts, and dead letters | Product-specific policy decisions, Discord bot token, completing an attempt with a superseded fencing token |
| Discord Capabilities | Discord resource events and inspection commands | Delivery, moderation, hierarchy, and management capability reports and invalidations | Rebuildable guild, member, channel, thread, overwrite, member-role, and permission projections for capability reports | Product configuration, protected-target product policy, provider mutations, and the authoritative guild-role catalog (`DiscordRoleProjection`) |
| Asset | Upload, fetch, reference, and release commands | Asset lifecycle events | Source assets and metadata | Message delivery policy, hostname-only remote fetch, unpinned redirect to private or metadata addresses, object key without tenant predicate, AI purpose or conversation order, `asset_id` as AI `input_ref` |
| Renderer | Render commands | Render artifacts and receipts | Short-lived generated artifacts | Discord credentials, product persistence |
| Gateway Edge | Discord Gateway protocol | Canonical ingress events | Shard sessions and ingress inbox | Product configuration and rendering |
| Interaction Edge | Discord interaction protocol | Acknowledgements and durable commands | Interaction receipts and token expiry | Long-running product work, parse-before-verify webhook HTTP, TLS-only webhook authentication, payload text or tokens in span attributes, concurrent Gateway and webhook ingress, webhook HTTP in Gateway mode, ACK waiting on bus publish |
| Control API | Authenticated dashboard HTTP; Identity session proof | Tenant-scoped commands to owning modules; admission receipts | API idempotency receipts only | Authoritative sessions, product aggregates, Discord SDK, raw provider HTTP, Origin-only CSRF admission, client-supplied paid/entitled/permission-bit authorization, trusted HTML of untrusted fields, dashboard HTML without CSP, unscoped tenant-aggregate lookup, Discord bot token, public metrics scrape, guild-bus dashboard commands, gRPC-first to owning hosts, RPC held open for Discord effects, `www` or `docs.*` as cookie site or OAuth callback, parent-domain session cookie, high-risk admit without live revalidation and 5-minute step-up, client-supplied grant-source as entitlement, client-supplied provider customer as billing owner |
| Query and Status | Public domain events | Bounded-stale dashboard read models | Disposable tenant-scoped projections and freshness watermarks | Authoritative writes, owning-module databases, secrets, trusted HTML of form/AI/template/provider strings, lookup by resource id without tenant predicate, public metrics scrape, log-forbidden payload in span attributes, product WebSocket to the dashboard, query-string session on SSE, SSE as a command path |
| Discord Transport | Typed Discord operations | Normalized provider results | Rate-limit and request state | Product business rules, sharing the bot token with Control API or Domain |
| Reconciliation | Uncertain Delivery and Transport outcomes; Discord message and nonce observations | Confirmed, failed, or expired delivery resolutions | Delivery reconciliation cases, observations, decisions, and expiry | Product policy, Discord SDK, retry without proof of the external effect |
| Voice Control | Voice commands and Gateway voice events | Session assignments and state | Voice session control | Text delivery internals |
| Voice Media | Voice session assignments | Voice health and media outcomes | Live media sessions | Message catalog and lifecycle policy |
| Moderation Cases | Moderator and authorized enforcement commands | Case and moderation outcome events; secondary notification requests; Cases-owned assignment-intent facts | Cases, append-only events, warnings, notes, action receipts, protected-user and protected-role product policy | Raw Discord clients, Activity Log writes, Auto Moderation policy data, Discord Transport for member-role add or remove |
| Auto Moderation Policy | Canonical message events, native execution events, admin commands | Incidents, enforcement requests, reviews, native binding state | Policy revisions, incidents, bindings, counters, review state | Direct member sanctions, Discord Transport, Discord HTTP, direct Discord message sends |
| Retention and Cleanup | Canonical message events, Schedule wake-up signals, admin commands | Countdown and sweep outcomes | Retention revisions, deletion intents, occurrences, checkpoints, leases | In-memory scheduling authority, Activity Log writes, Delivery product-message intents |
| Activity Log | Canonical Discord and platform outcome events | Activity records, attribution updates, optional delivery intents | Activity records, privacy state, attribution links, routing decisions | Raw audit reads, webhook tokens, product mutations |
| Discord Audit Query | Authorized queries and bounded correlation requests | Audit pages and correlation observations | Short-lived cache, opaque cursors, bounded correlation index | Moderation action success path, unbounded audit duplication |
| Security Policy and Incident | Canonical member, member-update, audit-entry, capability, and containment events; admin commands | Incidents, response requests, review facts, and alert intents | Security policy revisions, observations, distributed-window reservations, incidents, latches, cooldowns, evidence references | Discord clients, direct sanctions, containment snapshots, Activity Log writes |
| Containment Orchestrator | Authorized manual and security response requests; provider outcomes | Preview, step, active, partial, restore, conflict, and acknowledgement events | Operations, fenced leases, plans, snapshots, attempts, conflicts, acknowledgements | Raw Discord clients, member-sanction policy, security detector state, unbounded fan-out |
| Role Policy and Assignment | Canonical member events, panel commands, timer occurrences, role invalidations, admitted containment facts, admitted Cases role-intent facts, admin commands | Assignment plans and outcomes, expiries, reconciliation summaries, interaction-result facts | Role policy revisions, assignment intents, ownership, attempts, timers, sticky records, reconciliation checkpoints | Raw Discord clients, panel presentation state, role-resource CRUD, `DiscordRoleProjection` writes, authoring moderation sanctions or security incidents |
| Role Panel | Admin commands, canonical reaction and component events, delivery and role-health outcomes | Publication operations, assignment commands, repair and mapping-health events | Panel revisions, mappings, routing tokens, `ROLE_PANEL_PUBLICATION`, `ROLE_PANEL_PROVIDER_BINDING`, projection receipts, tombstones | Direct role mutation, raw Discord clients, duplicate registries, role-resource ownership |
| Role Resource | Authorized administrative commands, canonical role events, provider outcomes | Mutation, reconciliation, privilege-delta, and dependency-invalidation events | Mutation ledger, before/after snapshots, idempotency receipts, reconciliation cases, rebuildable `DiscordRoleProjection` (guild-role catalog) | Member assignment policy, member-role add or remove, raw Discord clients, authoritative provider role state |
| Engagement Progression | Canonical message and voice-state events, trusted adjustments, role outcomes, timer occurrences | XP and level facts, reward requests, leaderboard snapshot events | Progression revisions, XP ledger, voice segments, level state, reward occurrences, leaderboard definitions and snapshots | Discord clients, direct role mutation, message-content assumptions, process-local cooldown authority |
| Starboard | Canonical reaction and message lifecycle events, admin commands, delivery outcomes | Threshold and contribution facts, projection intents, repair outcomes | Starboard revisions, contributions, source aggregates, projection bindings and reconciliation state | Direct message sends, arbitrary content acquisition, process-local serialization authority |
| Giveaway | Entry interactions, admin commands, timer occurrences, role and delivery outcomes | Entry and lifecycle facts, immutable draw results, prize requests, fulfillment summaries | Giveaway revisions, entries, close snapshots, draws, winners, fulfillment occurrences | Discord clients, direct role mutation, insecure or implicit randomness, unowned external prizes |
| Form Workflow | Form and review commands, submission interactions, asset and role outcomes | Publication, submission, review, export, and secondary-effect facts | Form drafts and versions, sessions, submissions, answers, review history, asset references, export jobs | Discord clients, raw attachment URLs as storage, mutable published forms, direct role mutation |
| Temporary Room | Canonical voice-state and channel events, room interactions, timers, provider outcomes | Room lifecycle, control, cleanup, conflict, and reconciliation facts | Generator revisions, room aggregates, creation and cleanup operations, resource bindings, access claims, timers | Voice media transport, direct Discord clients, deletion of linked external channels, process-local timers |
| Monetary Ledger | Authorized money commands and idempotent settlement requests | Transaction, hold, transfer, reversal, balance, freeze, and reconciliation facts | Currency revisions, accounts, journal, postings, holds, balance projections, transfer and adjustment records | Discord clients, product eligibility decisions, shared writable balance tables, floating-point money |
| Earnings and Income | Income interactions, salary timers, policy commands, role and progression facts, ledger outcomes | Income decisions, settlement requests and outcomes, streak and salary facts, anomaly observations | Income revisions, occurrences, cooldowns, streaks, salary schedules, formula receipts, settlement references | Direct balance writes, Discord clients, process-local randomness cooldowns or schedules |
| Commerce | Catalog and purchase commands, interaction receipts, ledger and entitlement outcomes | Catalog, stock, order, payment, fulfillment, refund, and reconciliation facts | Catalog and item revisions, stock and reservations, purchase limits, orders, reward lines, payment and refund references | Direct ledger writes, Discord clients, direct role channel boost or manual reward effects |
| Guild Reward Entitlement | Commerce grant and reversal requests, timers, owner-service and provider outcomes | Activation, expiry, revocation, compensation, manual fulfillment, and reconciliation facts | Guild reward entitlements, effect references, owned resource bindings, boost grants, manual cases, timers, attempts | Charging, refunding, stock ownership, deletion without ownership proof, raw Discord clients, Platform Entitlement snapshots, `PlatformEntitlement*` apply, unprefixed `Entitlement*` parse |
| Casino Game | Game commands and interactions, timer occurrences, ledger outcomes | Session, action, random outcome, wager, settlement, cooldown, and recovery facts | Casino and rule revisions, sessions, actions, randomness receipts, wager references, outcomes, message bindings | Balance writes, process-local game authority, predictable fallback randomness, real-money value |
| Support Policy | Authorized settings and template commands, dependency invalidations | Policy, template, capacity, schedule, routing, archive, and health facts | Support defaults and revisions, ticket templates and revisions, type registry, authorization, eligibility, routing, automation, archive policy | Live case counts, panel projection, Discord clients, transcript content |
| Support Panel | Panel commands, template health, signed component events, Delivery outcomes | Panel lifecycle, interaction, orphan, repair, and open-request facts | Panel drafts and revisions, options, `SUPPORT_PANEL_PUBLICATION`, `SUPPORT_PANEL_PROVIDER_BINDING`, tokens, health, tombstones | Case creation, channel creation, raw Discord clients, trusting components as authority |
| Support Case | Open and case commands, intake facts, policy snapshots, resource and archive outcomes, timers | Case lifecycle, capacity, assignment, participant, resource, archive, and notification facts | Cases, numbers, capacity reservations, cooldowns, intake references, participants, assignments, events, timers, lifecycle state | Raw Discord clients, form answer ownership, transcript content, count-then-insert admission |
| Support Resource | Case desired-resource commands, canonical channel and thread events, capability and provider outcomes | Provisioning, access, partial, orphan, cleanup, conflict, and reconciliation facts | Resource operations and steps, provider bindings, owned overwrites, access claims, attempts, repair checkpoints | Support eligibility, staff policy, case lifecycle authority, deletion without ownership proof |
| Support Archive | Admitted support-message events, case boundaries, attachment and delivery outcomes | Capture gap, transcript, redaction, retention, delivery, and aggregate metric facts | Message archive records, asset references, gaps, transcript jobs and artifacts, access audit, retention occurrences | Case transitions, unbounded provider history, public artifact URLs, completeness without evidence, AI character conversation history |
| Integration Registry | Authorized configuration and test commands, provider identity and Discord capability outcomes | Definition, identity, dependency-health, desired-coverage, and test-occurrence facts | Alert definitions and revisions, `STREAM_CANONICAL_IDENTITY` bindings, provider capability references, dependency health, test occurrences | Provider polling, subscription resources, live-session state, credentials, Discord clients, `PLATFORM_EXTERNAL_IDENTITY` |
| Provider Event Edge | Public provider callbacks or event streams, endpoint and secret generations | Authenticated event, duplicate, rejection, verification, revocation, and connection-health facts | Callback endpoints, ingress receipts, replay keys, verification evidence, acknowledgement and connection state | Live-session decisions, tenant presentation, provider polling, Discord delivery, unsigned tenant workflow webhooks, query-string-only secrets, delaying payment ACK until entitlement projection, applying `GRANT_SOURCE` |
| Provider Observation | Due occurrences, active identity claims, provider budgets and capability profiles | Conclusive and inconclusive observations, quota, circuit, credential, and freshness facts | Schedules, leases, batches, attempts, quota reservations, caches, circuit and request state | Tenant messages, live-transition authority, direct Discord effects, process-local ownership |
| Provider Subscription | Desired coverage claims, endpoint health, provider outcomes and revocations | Subscription active, degraded, uncertain, absent, reconciled, and fallback facts | Desired claims, provider resource bindings, condition fingerprints, operations, leases, attempts, reconciliation checkpoints | Tenant alert presentation, live-session truth, credentials, Discord clients |
| External Live Signal | Authenticated provider events, conclusive observations, immutable alert snapshots and Delivery outcomes | Session transition, conflict, occurrence, suppression, lifecycle, and projection-state facts | Live-session aggregates, evidence references, metadata revisions, transition ledger, alert occurrences, projection references, lifecycle deadlines | Provider credentials, raw provider APIs, identity resolution, raw Discord clients |
| Custom Command Definition | Authorized definition commands and dependency invalidations | Definition, revision, contribution, dependency-health, preview, activation, and retirement facts | Custom-command aggregates and revisions, argument schemas, compiled plans, policies, response actions, dependency health | Provider command bindings, invocation cooldowns, raw interactions, Discord clients, arbitrary code, language-native codecs over compiled-plan bytes |
| Application Command Registry | Built-in and custom contributions, application and guild events, provider outcomes | Registry snapshot, conflict, projection, binding, drift, and reconciliation facts | Owner registry, desired snapshots, provider bindings, operations, attempts, leases, observed state | Product execution policy, response content, independent owner overwrites, raw interactions |
| Custom Command Runtime | Routed interactions, immutable definition and capability snapshots, Delivery outcomes | Invocation, rejection, cooldown, action, partial, completion, and audit facts | Invocation receipts, `CUSTOM_COMMAND_COOLDOWN_RESERVATION`, concurrency reservations, argument and variable snapshots, evaluation receipts, action occurrences | Definition edits, provider registry mutation, raw Discord clients, scripts, arbitrary service commands, language-native codecs over compiled-plan or job bytes |
| Reminder | Owner and staff commands, time signals, wake-ups, Delivery and capability outcomes | Reminder lifecycle, occurrence, retry, route, snooze, missed, dead-letter, and audit facts | Settings, timezone preferences, definitions, revisions, recurrence, occurrences, leases, attempts, terminal history, origin references | Scheduled announcement ownership, raw Discord clients, process-local timers, silent failure deletion, reminder body in span attributes |
| Identity and Session | OAuth callbacks, account commands, Transport identity-operation results, security events | Sessions, revocations, identity links, guild discovery observations, authentication audit facts | Accounts, `PLATFORM_EXTERNAL_IDENTITY`, OAuth transactions, opaque `AUTHORIZATION_SESSION`, session-bound CSRF secret, grant generations, revocations | Installation truth, TENANT registry, billing ownership, provider tokens outside secret storage, product authorization, Discord HTTP, Discord SDK, `STREAM_CANONICAL_IDENTITY`, claims-cookie sessions, Discord bot token, `SameSite=None` or `Strict` session cookie, cookie Max-Age as expiry authority |
| Discord Installation | Authorized install and repair commands, provider callbacks, guild and application events, Transport inspect results, capability and registry observations | Installation, degradation, removal, module capability, repair, and TENANT registry facts | TENANT registry, installations, generations, manifests, callback receipts, capability health, repair plans | Login sessions, independent command registration, product mutation, raw module effects, Discord HTTP, Discord SDK, Administrator as default or repair shortcut, flattening `Installed` to bot-user presence, client-supplied authorize URL, Default Install Settings as product install, Discord snowflake as `tenant_id`, deleting TENANT on `Removed` |
| Commercial Catalog | Authorized catalog commands and compliance references | Product revision, retirement, compatibility, and catalog publication facts | Plans, add-ons, tiers, bundles, packs, perks, promotions, components, terms | Payment-provider calls, runtime entitlements, module usage, XP levels, mixed Recurring intervals inside one Bundle |
| Billing Orchestrator | Authorized checkout and portal commands, authenticated Edge payment-event facts, reconciliation observations | Order, payment, subscription, invoice, refund, dispute, grace, dunning, proration, checkout-group, and commercial grant facts | Billing owners, scope bindings, provider-customer mappings, tax-evidence snapshots, orders, checkout groups, checkouts, provider references, subscriptions, dunning generations, proration quotes, invoices, refunds, disputes, normalized events | Raw payment data, feature authorization, treating `PastDue` or invariant 152 `reconciled` as entitled, AI Credit balances, guild virtual currency, floating-point or decimal domain money, treating CheckoutAttempt `Completed` or a Checkout Session as order `Fulfilled`, mixed Recurring+OneTime hosted mode on one order, rewriting Invoice `Paid` or Order `Fulfilled` on refund or dispute, collapsing dispute into refund, writing Entitlement `GRANT_SOURCE` or AI Credit lots, treating a provider Customer as `BILLING_OWNER`, two Active payers on one installation, a new order per dunning retry, Smart Retries counts as domain schedule, provider proration preview as quote, unused time as commercial refund, auto-refund on checkout-group `Partial`, a public payment webhook listener |
| Platform Entitlement | Commercial and promotional grant events, scope bindings, usage summaries, due occurrences | Feature, limit, perk, grace, overage, invalidation, and reconciliation facts; AI Credit grant-source facts | Platform grants, `GRANT_SOURCE` applications, effective projections, generations, source lineage | Payment truth, authoring subscription `PastDue`, guild reward entitlements, `GuildRewardEntitlement*` apply, unprefixed `Entitlement*` parse, module usage mutation, AI journal, AI Credit lots, treating `GRANT_SOURCE.state` as paid |
| AI Usage Ledger | Grant, reservation, usage, refund, expiry, and adjustment commands; Entitlement AI-credit grant-source facts | AI Credit balance, reservation, capture, release, refund, expiry, and reconciliation facts | AI Credit accounts, lots, journal, allocations, reservations, projections | AI provider calls, prompts, generated content, guild money, general billing, floating-point or decimal domain credits, lot mutations from Billing or dashboard, silent TTL release, allocating an already-expired lot, expiring reserved allocations while the reservation is open, later-expiring-first consumption |
| AI Execution | Authorized AI requests, entitlement and reservation results, provider responses | Operation, result, usage, moderation, failure, uncertainty, and reconciliation facts | AI operations, `AI_PROTECTED_CONTENT`, provider attempts, usage receipts | Credit balance writes, commercial catalog, direct Discord delivery, unrestricted provider choice, retrieved content as tool authority, prompts or output in span attributes, treating 429 as Uncertain, releasing on TimeoutAfterSend, blind retry after transmit, Discord 429 delays as domain constants, auto-fallback after Uncertain, second object store, `asset_id` as `input_ref`, character conversation order |
| Template Registry | Author, review, report, rating, install, rollback, capability, and owner-service outcomes | Template, review, installation, compensation, conflict, rating, and reputation facts | Packages, revisions, manifests, reviews, reports, ratings, installations, step receipts | Executable code, secrets, direct module writes, assumed resource ownership, commercial billing, paid placement, payouts, language-native codecs over package bytes |
| Workflow Definition and Runtime | Definition commands, canonical triggers, timers, authenticated webhooks, downstream outcomes | Revision, execution, condition, action, partial, compensation, replay, and dead-letter facts | Workflow graphs, triggers, executions, action occurrences, rate and concurrency reservations | Arbitrary code, raw Discord, cross-service database writes, unlimited recursion, direct billing, unsigned HTTP triggers, query-string-only webhook secrets, model-added action identities, language-native codecs over graph or job bytes |
| AI Character | Character commands, canonical messages and interactions, AI and Delivery outcomes | Character revision, match, suppression, response, usage, and retention facts | Characters, `AI_CONVERSATION` and turns, behavior and channel policy, context references, cooldowns, response occurrences | Provider credentials, credit balance writes, direct AI or Discord calls, member impersonation, retrieved content as instructions, turn bodies, Asset writes, Support Archive as character history, unbounded turn window |

This boundary map is the foundation for subsequent module specifications. New domain modules extend the canonical event and action vocabulary while preserving the platform invariants, service ownership rules, and Discord safety controls defined here.

#### Decision Record DR-002

**Status:** Accepted.

**Decision:** Control API, Query and Status, and Reconciliation are modules in this table. Identity and Session is the sole owner of accounts, OAuth transactions, and sessions. Control API owns HTTP idempotency receipts only. Reconciliation in §7.11 is the Delivery uncertain-outcome resolver, not a platform-wide reconcilor.

**Rejected Alternative:** Control API as session authority; omitting these three modules from §25.

#### Decision Record DR-041

**Status:** Accepted.

**Decision:** Cross-service commands that require immediate admit or reject use command-HTTP with the §8.2 JSON envelope to the owning host, or in-process in Control Plane. Control API MUST NOT open a client per module. The guild event bus MUST NOT carry dashboard commands. The command RPC MUST NOT wait for a Discord effect. gRPC MUST NOT be the first-product command adapter.

**Rejected Alternative:** gRPC-first; gRPC-Web dashboard; mesh of clients; dashboard writes on Redis Streams; RPC held open for Discord effects; durable command as default for billing, install, or destructive admit.

#### Decision Record DR-042

**Status:** Accepted.

**Decision:** First-product Interaction Edge ingress is Gateway `INTERACTION_CREATE`. Gateway mode MUST NOT admit outgoing-webhook HTTP and MUST NOT run concurrently with webhook mode. The 3-second acknowledgement MUST NOT wait on bus publish. Later webhook mode remains DR-034.

**Rejected Alternative:** Webhook-first; concurrent Gateway and webhook; bus-then-ACK.

#### Decision Record DR-043

**Status:** Accepted.

**Decision:** First-product dashboard freshness is cookie-authenticated REST poll of Query and Status. SSE MAY later reuse those projections. A product WebSocket beside Discord Gateway is forbidden. SSE MUST NOT use a query-string session, carry commands, or replace the bus.

**Rejected Alternative:** Product WebSocket; SSE-first; SSE as command path; query-string session on EventSource.

#### Decision Record DR-044

**Status:** Accepted.

**Decision:** First-product browser surfaces are the product origin (landing and `/dashboard`) and a sessionless `docs.*` static site. The session cookie is host-only on the product origin. `docs.*` MUST NOT receive that cookie, host OAuth, or admit commands. An `app.*` dashboard origin is not first product.

**Rejected Alternative:** Two cookie apps; `www` plus `app.*` as two cookie sites; parent-domain session cookie; docs as a product service.

#### Decision Record DR-045

**Status:** Accepted.

**Decision:** First-product browser surfaces are sessionless `docs.*`, sessionless `www`, and `app.*` as the sole cookie site. The `www` login control navigates to `app.*` login. OAuth callback is `app.*` only.

**Rejected Alternative:** Login or OAuth on `www`; `www` + `/dashboard` as one cookie origin (DR-044); parent-domain session cookie.

#### Decision Record DR-046

**Status:** Accepted.

**Decision:** Billing subscription `PastDue` and Platform Entitlement `Grace` are sibling facts. Feature authorization reads Entitlement. Invariant 152 `reconciled` is provider-alignment, not Grace.

**Rejected Alternative:** One shared PastDue/Grace row; authorizing from `PastDue`; collapsing 152 into a premium boolean.

#### Decision Record DR-047

**Status:** Accepted.

**Decision:** Aggregate `Installed` is every required enabled-module capability `Healthy`. Bot presence is not the aggregate. Command-only modules use `NotRequired`. Callback is `Verifying`.

**Rejected Alternative:** Flattening `Installed` to bot-present; treating callback as Installed.

#### Decision Record DR-048

**Status:** Accepted.

**Decision:** Live envelope majors are N and N-1. Expand/contract. N-1 remains readable at least 14 Clock-port days after the last N-1 producer. Unsupported majors fail closed.

**Rejected Alternative:** Current-major-only during rolling deploys; N-2 on the live path; silent drop.

#### Decision Record DR-049

**Status:** Accepted.

**Decision:** Session cookie is `Secure`, `HttpOnly`, host-only, `SameSite=Lax`. Idle 12 hours; absolute 7 days. Discovery 15 minutes; ordinary Capability 60 seconds; high-risk live plus 5-minute step-up.

**Rejected Alternative:** `SameSite=None` or `Strict`; cookie Max-Age as authority; SameSite as CSRF.

#### Decision Record DR-050

**Status:** Accepted.

**Decision:** Installation generates Discord authorize URLs from named presets. Named guild install and repair lock `guild_id` and `disable_guild_select`. Callback query parameters are hints.

**Rejected Alternative:** Client-supplied authorize URL; Default Install Settings as product install.

#### Decision Record DR-051

**Status:** Accepted.

**Decision:** CommercialOrder is the frozen Billing intent. CheckoutAttempt is one hosted-session generation. Session-completed and `success_url` are not fulfillment.

**Rejected Alternative:** Stripe Checkout Session as the order; fulfilling from the landing page; mixed Recurring+OneTime in one hosted session.

#### Decision Record DR-052

**Status:** Accepted.

**Decision:** Commercial refund is an append-only Billing aggregate. Invoice `Paid` and Order `Fulfilled` are not rewritten. Create-refund HTTP is not `Succeeded`.

**Rejected Alternative:** Rewriting Invoice `Paid`; copying guild-shop refund onto CommercialOrder.

#### Decision Record DR-053

**Status:** Accepted.

**Decision:** Commercial dispute is an append-only Billing aggregate distinct from refund. `Open` freezes grants. Invoice `Paid` and Order `Fulfilled` are not rewritten.

**Rejected Alternative:** Treating a dispute as a refund; treating webhook ACK as `Won`.

#### Decision Record DR-054

**Status:** Accepted.

**Decision:** `GRANT_SOURCE` is owned by Platform Entitlement. Billing publishes commercial grant facts. Only Entitlement publishes AI-credit grant-source to the Ledger.

**Rejected Alternative:** Billing writing lots or Entitlement `GRANT_SOURCE`; authorizing from `GRANT_SOURCE.state` as paid.

#### Decision Record DR-055

**Status:** Accepted.

**Decision:** There is no domain Customer aggregate. `BILLING_OWNER` is the payer. Provider Customer objects are mapping evidence.

**Rejected Alternative:** Stripe Customer as payer identity; a second Customer table.

#### Decision Record DR-056

**Status:** Accepted.

**Decision:** Dunning retries collect one Open renewal invoice before `grace_until`. Exhaustion without verified Paid is `Uncollectible` and subscription `Restricted`.

**Rejected Alternative:** A new order per retry; webhook ACK as Restricted.

#### Decision Record DR-057

**Status:** Accepted.

**Decision:** Proration is a Billing integer quote. Provider previews are not the amount. Negative delta is next-invoice credit, not a refund.

**Rejected Alternative:** Stripe preview as domain amount; unused time as `COMMERCIAL_REFUND`.

#### Decision Record DR-058

**Status:** Accepted.

**Decision:** Mixed Recurring+OneTime Bundles split into two sibling orders under a checkout group. Recurring hosted session first. A single order MUST NOT mix modes. Mixed Recurring intervals fail closed. Partial fulfillment is not an automatic refund.

**Rejected Alternative:** One hosted session spanning both modes; forbidding mixed Bundles; auto-refunding the paid sibling.

#### Decision Record DR-059

**Status:** Accepted.

**Decision:** Discord Installation owns the TENANT registry. First-product `tenant_type` is `Guild` or `User`. `tenant_id` is platform identity, not a Discord snowflake. Uninstall does not delete TENANT.

**Rejected Alternative:** Identity or Billing owning TENANT; Discord snowflake as `tenant_id`; deleting TENANT on Installation `Removed`.

#### Decision Record DR-060

**Status:** Accepted.

**Decision:** Due-work claim `lease_ttl` is 15 Clock-port seconds, range 5 through 30. Heartbeat is at most one-third of TTL. Recovery stays strictly below 60 seconds. Gateway and Voice session leases are excluded.

**Rejected Alternative:** TTL of 60 seconds; infinite leases; a Durable Timer per lease expiry.

#### Decision Record DR-061

**Status:** Accepted.

**Decision:** Lot `expires_at` is frozen at mint. Purchased packs are non-expiring unless terms require otherwise. New reservations skip expired lots. Open allocations survive lot expiry until settlement. Reservation TTL is 15 Clock-port minutes and MUST NOT auto-release; TTL without a confirmed outcome becomes `Uncertain`. Uncertainty deadline is 24 Clock-port hours then `Disputed`.

**Rejected Alternative:** Silent TTL release; expiring reserved allocations in place; FIFO ignoring earlier `expires_at`; dashboard-posted lot expiry.

#### Decision Record DR-062

**Status:** Accepted.

**Decision:** AI provider attempts classify `RateLimited`, `TimeoutNotSent`, `TimeoutAfterSend`, `ConfirmedFailure`, `ConfirmedResult`, and `Uncertain`. HTTP 429 is `RateLimited`, not `Uncertain`, and MAY retry after Retry-After. Timeout after transmit is `Uncertain` and MUST NOT release or blind-retry. Timeout before transmit is `TimeoutNotSent` and MAY retry.

**Rejected Alternative:** Treating 429 as `Uncertain`; releasing on response timeout; copying Discord 429 delays as domain constants; auto-fallback after unknown outcome.

#### Decision Record DR-063

**Status:** Accepted.

**Decision:** Asset is the sole durable byte store. AI Execution owns `AI_PROTECTED_CONTENT`; `input_ref` and `result_ref` are that identity, not `asset_id`. OCR and transcription are purposes on that aggregate. AI Character owns `AI_CONVERSATION` and bounded turns that reference protected content and MUST NOT store bodies. Support Archive remains distinct. No first-product vector store.

**Rejected Alternative:** Asset as conversation or OCR authority; Execution or Character as a second object store; Support Archive for character history; `asset_id` as `input_ref`; embeddings as a first-product aggregate.

#### Decision Record DR-064

**Status:** Accepted.

**Decision:** Owner-schema tables are not integration contracts. Breaking private DDL during a rolling deploy MUST expand, dual-write, contract, then drop. Envelope N-1 is not that window. Soak before drop is 24 Clock-port hours after the last replica of that owner neither reads nor writes the old shape.

**Rejected Alternative:** In-place rename or DROP while an old binary still runs; using envelope `schema_version` as table version; production schema-push as migration authority; `SELECT *` as the live mapper.

#### Decision Record DR-065

**Status:** Accepted.

**Decision:** Public money-plane contracts MUST set `schema_family` to `VirtualPayment`, `CommercialPayment`, or `AiCreditReservation`. `schema_name` keeps the §8.6 leaf. An unprefixed `Payment`, `Reservation`, or money `Catalog` type is forbidden.

**Rejected Alternative:** One shared Payment contract; renaming §8.6 leaves in this revision; treating stock reservation as `VirtualPayment`; treating `CatalogPublished` as `CommercialPayment`; treating AI Credit reservation as a monetary hold.

#### Decision Record DR-066

**Status:** Accepted.

**Decision:** The guild commerce-reward owner remains module 7.35 and is not deleted. Its public contracts are `GuildRewardEntitlement`. Platform Entitlement remains `PlatformEntitlement`. An unprefixed public type `Entitlement` is forbidden.

**Rejected Alternative:** Deleting module 7.35; merging with Platform Entitlement; renaming Platform Entitlement; treating `GRANT_SOURCE` as a guild reward.

#### Decision Record DR-067

**Status:** Accepted.

**Decision:** Payment-provider HTTP callbacks MUST terminate at Provider Event Edge and follow the 9.36 ACK/inbox path. HTTP success ACK is allowed only after a durable Edge ingress receipt. Duplicates ACK success and reuse that receipt. Invalid, expired, or unknown generation MUST NOT ACK success. ACK MUST NOT wait for Billing apply, `GRANT_SOURCE`, entitlement projection, or lot mint. Billing MUST NOT open a public payment webhook listener. DR-022 receipt-versus-fulfillment glossary is unchanged.

**Rejected Alternative:** Billing as the public webhook listener; ACK after entitlement projection; ACK before durable ingress; treating Edge ACK as `GRANT_SOURCE` apply.

#### Decision Record DR-068

**Status:** Accepted.

**Decision:** Role Policy and Assignment is the sole platform client of Discord Transport for member-role add and remove. Those operations are one-role add or remove, never a replace of the member's complete role list. Moderation Cases remains the owner of punitive member-role desired state: quarantine present or absent, dangerous-role absent, and other case-owned role relations. Cases publishes those relations as assignment intents with a Cases ownership key and MUST NOT call Transport for member-role add or remove. Timeout, kick, ban, unban, purge, slowmode, and channel lock remain Cases through Transport. Role Resource remains the sole writer of guild-role catalog mutations and MUST NOT add or remove member roles. Assignment MUST NOT author punitive desired state or reinterpret a Cases-owned relation as automatic or self-service ownership. For the same guild, member, and role, Cases or security ownership outranks automatic and self-service ownership. Discord hierarchy and bot capability are rechecked immediately before each Transport mutation. DR-014 catalog ownership and DR-020 `protected_targets` ownership are unchanged.

**Rejected Alternative:** Cases and Assignment both calling Transport for member-role mutations; replacing the member's complete role list; Assignment authoring punitive desired state; Role Resource adding or removing member roles; merging Cases ownership into auto-role policy.

#### Decision Record DR-069

**Status:** Accepted.

**Decision:** Public entitlement contracts are only `GuildRewardEntitlement*` for module 7.35 and `PlatformEntitlement*` for module 7.55. An envelope whose `schema_name` is unprefixed `Entitlement` or any other Entitlement-shaped name MUST fail closed at parse. Platform Entitlement MUST reject `GuildRewardEntitlement*` at inbox apply. Module 7.35 MUST reject `PlatformEntitlement*` leaves and MUST NOT apply `GRANT_SOURCE`. Consumers MUST NOT infer the plane from payload fields. The private `ENTITLEMENT` table remains guild-reward storage and MUST NOT be Platform Entitlement's journal. DR-066 ownership and public names are unchanged.

**Rejected Alternative:** Guessing guild versus platform from payload; applying unprefixed `Entitlement*` into either journal; sharing one Entitlement inbox; treating `ENTITLEMENT` as Platform Entitlement storage.

#### Decision Record DR-070

**Status:** Accepted.

**Decision:** `Disputed` is a Ledger reservation review state, not an AI Execution operation state. While a reservation is `Uncertain` or `Disputed`, the paired operation MUST remain `Uncertain`. The operation machine MUST NOT gain a `Disputed` state. Reservation `Disputed` MUST NOT be treated as capture, release, refund, operation `Failed`, operation `Succeeded`, or settlement. The operation MAY leave `Uncertain` only after Ledger accepts a confirmed usage or absence receipt into `Capturing` or `Releasing`. Query and dashboard MUST NOT present a `Disputed` reservation as a completed operation. DR-061 deadlines and DR-062 attempt classes are unchanged.

**Rejected Alternative:** Adding operation `Disputed`; auto-failing the operation when the reservation becomes `Disputed`; treating `Disputed` as `Released` or `Captured`; dashboard settlement from `Disputed`.

#### Architecture Review

**Contradiction (resolved by DR-066):** “Entitlement” in this table was the guild virtual-currency reward owner; Platform Entitlement is a distinct row. Public contracts are now `GuildRewardEntitlement`. Module 7.35 is not deleted. Canonical review: [00-architecture-review.md](00-architecture-review.md#17-billing-and-entitlements-review).

**Contradiction (resolved by DR-067):** 9.47 no longer draws Billing as the public payment-provider HTTP listener. Provider Event Edge terminates those callbacks and ACK follows the 9.36 inbox path. Canonical review: [00-architecture-review.md](00-architecture-review.md#17-billing-and-entitlements-review).

**Contradiction (resolved by DR-068):** Cases and Assignment no longer both call Transport for member-role add or remove. Assignment is the sole Transport client; Cases owns punitive desired state. Canonical review: [00-architecture-review.md](00-architecture-review.md#14-discord-integration-matrix).

**Contradiction (resolved by DR-069):** unprefixed `Entitlement*` names and payload-guessed plane no longer apply. Parse fails closed; inboxes are prefix-isolated. Canonical review: [00-architecture-review.md](00-architecture-review.md#17-billing-and-entitlements-review).

**Contradiction (resolved by DR-070):** reservation `Disputed` no longer settles or fails the operation. The operation stays `Uncertain` until Ledger accepts a confirmed usage or absence receipt. Canonical review: [00-architecture-review.md](00-architecture-review.md#18-ai-credits-review).

**Risk:** none remaining for the two Entitlement contract names. A writer who forges a prefixed leaf still needs owning-module authorization; that is a compliance bug, not an open naming hole. None remaining for reservation `Disputed` versus operation `Uncertain`.
