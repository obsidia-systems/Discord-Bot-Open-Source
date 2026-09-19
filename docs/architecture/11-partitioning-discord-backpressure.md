# Tobot Architecture — Partitioning, Discord Safety, and Backpressure

[Architecture index](README.md) · [Previous](10a-data-platform-access-commercial-ai.md) · [Next](12-security-observability-deployment.md)

## 13. Partitioning and ordering

### 13.1 Guild partition rule

All guild-scoped canonical events use `guild_id` as their event-bus partition key. This provides ordered consumption within a guild without imposing global ordering. The first bus adapter is Redis Streams. Stream identity is `guild_id` or a stable hash bucket; it is not a Redis Pub/Sub channel (DR-039).

Guild-scoped storage access uses the same tenant bound. Reads and mutations MUST include a tenant predicate from authenticated context, not solely from the partition key or a client-supplied identifier (DR-033).

DM and user-installation events use a deterministic installation or user partition key. Events without a guild that belong only to shard zero MUST still receive a stable partition key.

### 13.2 Cell assignment

At large scale, a deterministic mapping assigns each guild to one cell by applying a stable hash to the guild identifier and resolving that hash through the active, versioned cell-partition map.

The actual mapping MUST be versioned because changing the number of cells changes a naive modulo result. Production assignment therefore requires a stable partition map or consistent-hash ring with controlled movement.

Each cell contains domain consumers, delivery workers, caches, and data partitions for its assigned guilds. Gateway shard placement and guild cell placement need not be identical; canonical events bridge them through the durable bus.

### 13.3 Ordering rules

- Gateway sequence establishes transport order only inside one session.
- Event-bus partition order establishes processing order for a guild stream.
- Domain version checks prevent stale events from overwriting newer state.
- Deliveries to one channel use bounded concurrency; strict serialization is applied only when feature semantics require it.
- Conflicting moderation commands for the same guild and target use one target partition or optimistic target revision; unrelated targets remain concurrent.
- Automatic moderation incidents partition by guild and message or interaction subject so native and platform observations meet the same semantic reservation.
- Retention sweeps have one active fenced occurrence per guild and policy revision, with subordinate channel checkpoints.
- Activity records preserve canonical event order within a guild partition but executor enrichment may arrive later as a separate fact.
- Security observations are admitted in guild-event order, while threshold crossing requires an atomic counter reservation and unique semantic crossing key rather than reliance on bus order alone.
- One fenced containment transition may mutate a guild at a time; unrelated member sanctions remain independently concurrent through Moderation Cases.
- A restore transition follows the operation that applied the state and may not overtake incomplete apply steps.
- Role assignment ordering is scoped by guild, member, role, and ownership group. Conflicting desired states serialize; Cases or security ownership outranks automatic and self-service for the same relation (DR-068). Unrelated members remain concurrent.
- Role panel publication and interaction resolution serialize by panel identity and revision, while assignment execution remains independently scalable.
- Role-resource hierarchy mutations serialize per guild. Single-role field mutations serialize per role and reject a stale hierarchy or role fingerprint.
- Role deletion publishes dependency invalidation after the provider outcome is confirmed; consumers mark affected policies and mappings unhealthy idempotently.
- Progression decisions serialize by tenant, member, source class, and semantic event identity. Voice-session transitions additionally serialize by tenant and member so reconnects cannot create overlapping earning intervals.
- Starboard contribution changes serialize by board and source message. Projection updates use the resulting aggregate version and may not let an older count overwrite a newer board message.
- Giveaway lifecycle commands serialize by giveaway. A single fenced transition owns close, entrant snapshot, draw, and winner publication for each draw generation.
- Form definition publication serializes by form identity, while submissions serialize only by form version, respondent, and submission key; independent respondents remain concurrent.
- Form review decisions serialize by submission and expected review version so two reviewers cannot both create mutually exclusive terminal effects.
- Temporary-room creation serializes by generator and member creation claim. Room mutation and cleanup serialize by room identity with a fenced lifecycle lease.
- Monetary journal posting serializes by the smallest affected account set. Multi-account commands lock accounts in canonical account-identity order; independent accounts and tenants remain concurrent.
- Holds serialize with their funding account and hold identity. Capture, release, and expiry compete through the hold version and exactly one terminal transition wins.
- Income actions serialize by member, source rule, and cooldown scope. Scheduled salary distribution partitions by occurrence and member page while one fenced owner advances each checkpoint.
- Finite stock reservation serializes by stock bucket; purchase lifecycle commands serialize by purchase. Independent reward lines may progress concurrently after payment state permits them.
- Entitlement lifecycle serializes by entitlement and owned external resource. Expiry generations prevent an old timer from revoking a renewed benefit.
- Casino actions serialize by session and monotonic action sequence. Monetary wager settlement serializes through its hold and ledger idempotency key rather than a global game lock.
- Support policy and template publication serialize by stable aggregate identity; effective snapshots are immutable and independently cached.
- Support panel publication serializes by panel and revision. Interactions route by binding generation while independent panels remain concurrent.
- Support-case admission atomically serializes only the capacity scopes touched by the selected template and member, then allocates a number in the declared sequence scope.
- Support case commands serialize by case version. Claim, unclaim, close, reopen, waiting, escalation, and participant mutations cannot overtake one another.
- Support resource mutations serialize by case generation and provider resource; access changes may batch but remain individually observable.
- Transcript finalization serializes by case resource generation and source watermark, while capture events preserve provider message order within the support resource partition.
- Integration-definition publication serializes by tenant and alert identity, while `STREAM_CANONICAL_IDENTITY` resolution serializes by provider and normalized locator without coupling unrelated tenants.
- Provider callback messages preserve provider message identity and source generation. Arrival order is not trusted as event time order; session transitions use source precedence, provider occurrence time, durable receipt time, and aggregate version.
- Provider subscription operations serialize by provider, canonical identity, event type, credential scope, and transport generation. Shared desired claims may change concurrently, but exactly one fenced operation reconciles the provider resource.
- Poll claims serialize by provider, canonical identity, credential scope, and due generation. Batches execute concurrently within provider budgets, while a losing fencing token cannot publish a conclusive observation.
- External live-session transitions serialize by provider identity and provider session identity. Alert fan-out partitions further by tenant and alert revision so one large identity does not impose global delivery serialization.
- Refresh, offline, and cleanup occurrences for one projection binding follow the confirmed online occurrence and may not overtake a newer metadata or lifecycle generation.
- Custom-command publication serializes by tenant and definition identity; independent definitions remain concurrent until Application Command Registry composes one installation snapshot.
- Application-command projection serializes by application installation and projection generation. No targeted mutation or complete overwrite may overtake a newer compiled snapshot.
- Custom-command invocations serialize only on configured cooldown or concurrency scope. Argument binding and actions within one invocation follow the immutable action order while unrelated invocations remain concurrent.
- Reminder definition commands serialize by reminder version. Occurrence claims serialize by occurrence and schedule generation, while unrelated owners and tenants remain concurrent.
- Cancellation, reschedule, snooze, delivery, recurrence expansion, and expiry compete through one reminder occurrence version; exactly one terminal transition wins.
- Cross-guild global ordering is unsupported and unnecessary.

## 14. Discord safety and acceptable-use controls

### 14.1 Intent minimization

- Each Gateway deployment declares the smallest intent set needed by its assigned modules.
- Privileged intents require an approved product justification, configuration in the Developer Portal, and an annual operational review when applicable.
- `MESSAGE_CONTENT` MUST be enabled only for features that genuinely inspect arbitrary message content, such as automatic replies.
- Presence data MUST NOT be requested for lifecycle or message delivery unless a separately approved module requires it.
- Disabling a module SHOULD allow its exclusive privileged intent to be removed at the next controlled shard restart.

### 14.2 Gateway session controls

- Identify operations MUST pass through a distributed concurrency guard derived from Discord's current session-start metadata.
- Resume MUST be preferred over Identify when the session is resumable.
- Restart orchestration MUST be shard-aware and MUST NOT restart all shards simultaneously.
- Heartbeat delay and missed acknowledgements MUST page operators before broad session loss occurs.
- Gateway outbound commands MUST remain below Discord's per-connection limit; presence and member-chunk requests require their own governors.
- No product service may write arbitrary Gateway opcodes.

### 14.3 HTTP rate limits

- Limits MUST NOT be hard-coded because Discord may change them.
- The transport MUST discover buckets from response headers.
- Buckets MUST include the relevant major resource identity.
- A `429` MUST be retried only after the provider-specified delay.
- Global and per-route limits MUST be coordinated across all transport replicas using shared state or deterministic request ownership.
- Queue admission and fair scheduling MUST prevent one guild from monopolizing transport capacity. Weighted fair queuing SHOULD; other work-conserving tenant isolation MAY (DR-024).
- Interaction callback endpoints are governed separately from the normal bot global limit but still require responsible rate handling.

### 14.4 Invalid-request budget

Discord currently counts excessive `401`, `403`, and applicable `429` responses toward temporary API restrictions. The platform therefore MUST:

- Stop all authenticated egress immediately when credentials are known invalid.
- Preflight permissions and cease repeated requests after a confirmed `403` until relevant state changes.
- Tombstone unknown or deleted channels, messages, and webhooks after a confirmed permanent response.
- Track invalid requests over sliding one-, five-, and ten-minute windows.
- Open protective circuits before reaching Discord's documented invalid-request threshold.
- Alert on abnormal growth rather than waiting for a provider ban.

### 14.5 Mention safety

- Default mention parsing is disabled.
- User, role, replied-user, and everyone mentions require explicit policy.
- Variables that render mention syntax MUST also contribute the exact allowed identifier.
- Editing a message MUST resend explicit allowed-mention policy; previous create-message policy must not be assumed.
- Test and preview deliveries MUST suppress broad mentions.

### 14.6 Spam and burst prevention

- Apply quotas per guild, channel, user, module, and source rule.
- Coalesce duplicate lifecycle events within a bounded semantic window.
- Bulk commands MUST create bounded work batches and return per-item status.
- Recovery after downtime MUST apply misfire policy and MUST NOT emit an uncontrolled message storm.
- Automatic replies MUST have rule, user, channel, and guild cooldown support.
- A kill switch MUST disable a module, guild, cell, or all nonessential delivery without stopping Gateway heartbeats.

### 14.7 Discord reference constraints

The architecture follows these current Discord requirements:

- Gateway connections require heartbeat, Identify or Resume behavior, shard coordination, and approved intents: [Discord Gateway](https://docs.discord.com/developers/events/gateway).
- HTTP rate limits are dynamic, use route buckets and major resources, and require honoring `Retry-After`: [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits).
- Message creation requires explicit payload validation, safe `allowed_mentions`, and operation-specific permissions: [Discord Message Resource](https://docs.discord.com/developers/resources/message).
- Interactions require an initial response within three seconds and have time-bounded follow-up tokens: [Discord Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding). First-product ingress is Gateway `INTERACTION_CREATE`; Gateway and webhook ingestion are mutually exclusive and MUST NOT run concurrently (DR-042). Outgoing webhook mode, if selected later, MUST verify Ed25519 (`X-Signature-Ed25519`, `X-Signature-Timestamp`) over the exact raw body before parse (DR-034).
- Channel behavior differs across text channels, announcements, threads, forums, media, DMs, voice, and stage channels: [Discord Channel Resource](https://docs.discord.com/developers/resources/channel).
- Voice uses a separate WebSocket and UDP protocol and must remain isolated from normal message delivery: [Discord Voice](https://docs.discord.com/developers/topics/voice-connections).
- Moderation permissions combine permission flags with Discord's role hierarchy for applicable actions: [Discord Permissions](https://docs.discord.com/developers/topics/permissions).
- Native rule triggers, actions, exemptions, management permissions, and execution events follow the current provider contract: [Discord Auto Moderation](https://docs.discord.com/developers/resources/auto-moderation).
- Native audit entries are provider-owned, permission-gated, cursor-paginated, and currently retained by Discord for 45 days: [Discord Audit Log](https://docs.discord.com/developers/resources/audit-log).

### 14.8 Moderation-specific provider controls

- Member sanctions MUST validate both the required permission and Discord role hierarchy immediately before execution.
- The guild owner, the bot itself, and targets at or above the bot's highest role are never actionable through ordinary moderation commands.
- Actor authority and bot authority are separate decisions; both must pass.
- Protected-role policy may deny an action that Discord would technically permit, but it may never permit an action Discord denies.
- Ban message-history deletion, timeout duration, slowmode, purge size, audit-log reason, native Auto Moderation exemptions, and rule counts MUST be validated against current provider limits at the transport boundary.
- Bulk message deletion MUST contain between 2 and 100 unique message identifiers, may operate only in guild channels, and MUST exclude messages at least two weeks old. Older admitted messages require individually governed deletion.
- Purge MUST preflight `VIEW_CHANNEL`, `READ_MESSAGE_HISTORY`, and `MANAGE_MESSAGES` as applicable and MUST use bounded pagination.
- Lock and unlock MUST modify only the intended permission bit, preserve the previous overwrite snapshot, and use an optimistic precondition so unrelated administrator changes are not overwritten.
- Native Auto Moderation rule creation and modification MUST require the provider's management permission and attach a bounded audit reason.
- Native Auto Moderation configuration and execution intents are requested only by deployments that own those functions.
- Message content from native Auto Moderation execution events is treated as unavailable unless the application is authorized for the Message Content privileged intent.
- Discord audit access MUST require `VIEW_AUDIT_LOG`; native entries currently have a 45-day provider retention window and are fetched through cursor-based pages of at most 100 entries.
- Audit-log correlation is evidence enrichment, never a precondition for an urgent sanction or message deletion.

### 14.9 Security-specific provider controls

- `GUILD_MEMBER_ADD` requires the privileged `GUILD_MEMBERS` intent. The security deployment owning join detection MUST declare and maintain that approved intent; other deployments MUST NOT inherit it unnecessarily.
- `GUILD_AUDIT_LOG_ENTRY_CREATE` requires the `GUILD_MODERATION` intent and the bot's `VIEW_AUDIT_LOG` permission. Losing either capability places anti-nuke detection in an explicit degraded state and alerts operators; absence of events is never represented as healthy coverage.
- Discord audit entries are the preferred provider identity for anti-nuke deduplication. Bounded REST backfill MAY be used after a detected event gap, but provider retention is not the platform's incident ledger.
- Member actions require separate bot permission and role-hierarchy checks immediately before execution. The guild owner, the platform bot itself, exempt identities, and targets at or above the platform bot's highest role are not punished by ordinary security response plans.
- Dangerous-role removal may touch only roles the bot can edit and only the permission-bearing roles selected by the immutable plan. A partial strip remains partial and must identify every untouched role.
- Lockdown permission changes MUST operate on named permission bits, preserve unrelated allow and deny bits, and persist the original and applied values before advancing.
- Channel, role, verification, and native incident-control restoration MUST use an operation-specific precondition. A later administrator change produces a restoration conflict, not a blind overwrite.
- Discord's guild incident-actions operation currently permits invite and direct-message pauses for no more than 24 hours and requires `MANAGE_GUILD`. The transport validates the current provider contract and never silently clamps a longer requested duration.
- Membership Screening `pending` state is a signal that a member remains restricted until screening completion. It may influence a configured risk or quarantine policy, but the platform MUST NOT mark screening completed on the member's behalf.
- Discord-managed raid alerts, ML classification, or CAPTCHA challenges are not assumed to be application-controllable. They may be displayed as operator guidance but MUST NOT appear as confirmed plan steps without a supported provider operation.
- Verification-level changes are opt-in, separately authorized, snapshotted, bounded in duration, and restored only when the operation still owns the value.
- Security audit reasons include a stable operation or case reference plus a sanitized operator reason within the provider's current encoding and length rules.
- All raid-time fan-out uses the shared Discord request governors. Emergency priority may reduce queue delay but never bypass route, global, invalid-request, guild, or resource budgets.

### 14.10 Role-specific provider controls

- Automatic join roles require `GUILD_MEMBER_ADD` and therefore the privileged `GUILD_MEMBERS` intent. Screening-aware completion also consumes the relevant guild-member update event. Deployments that do not own those policies MUST NOT request the intent solely for role-panel interactions.
- Reaction role panels require the guild message-reaction events selected by the current Gateway contract. Button and select interactions use the Interaction Edge and MUST meet Discord's acknowledgement deadline independently from assignment completion.
- Role panels do not require arbitrary message content. Linked-message support MUST NOT become a justification for `MESSAGE_CONTENT`; unsupported content inspection is omitted or explicitly admitted as a separate capability.
- A component routing token follows Discord's current custom-identifier length and uniqueness rules, is versioned, and is validated against the stored tenant, message, panel, revision, and mapping. Possession of a token is not authorization.
- Discord's current member-role add and remove operations require `MANAGE_ROLES`. Immediately before execution, the target role must exist, must not be managed or `@everyone`, and must remain below the platform bot's highest role.
- Self-service and automatic assignment policies MUST reject `Administrator` and every permission class designated non-self-assignable by platform safety policy. An administrator cannot bypass this restriction by crafting a dashboard request.
- Role-resource create, update, delete, and position operations require `MANAGE_ROLES` and current hierarchy eligibility. Managed integration roles and roles at or above the platform bot remain immutable through this product.
- Provider role counts, component counts, select-option counts, action-row constraints, emoji support, field sizes, and mutable role attributes are validated against the current Discord contract at publication or execution; business policy may impose lower limits.
- Reactions on linked messages require message visibility, history access where applicable, reaction capability, and emoji usability. Content or component edits additionally require provider-authorized message ownership.
- Position changes use the current full role list returned by Discord to refresh projections. Roles sharing a provider position are interpreted using Discord's documented ordering rule; the UI MUST NOT invent a unique order unsupported by the provider.
- Community-invite `role_ids`, when available and explicitly configured, are a Discord-owned assignment path. The platform records or reconciles the resulting role state and MUST NOT issue a duplicate add. Those roles currently persist after invite expiration or deletion, so any removal requires a separately owned policy.
- Membership Screening `pending` is an eligibility signal, not a failure. A policy may wait for the transition to non-pending; it MUST NOT bypass, complete, or simulate Discord screening.
- Audit-log reasons attach a stable assignment, panel, or mutation reference plus a sanitized bounded reason where the endpoint supports it.
- Role assignment and panel repair use the same centralized transport buckets, guild fairness, invalid-request circuit, and retry deadlines as every other Discord effect.

### 14.11 Community-specific provider controls

- Text progression based only on message occurrence and provider identifiers does not require arbitrary message content. Word counts, content quality, attachment inspection, or semantic exclusions require an explicitly approved `MESSAGE_CONTENT` capability and MUST degrade to a documented metadata-only rule when that capability is absent.
- Voice progression and temporary-room lifecycle require the guild voice-state events selected by the current Gateway contract. Temporary Room Service does not open a Discord voice connection and does not receive voice encryption keys, RTP, UDP, or media packets.
- Starboard contribution tracking requires the relevant guild message-reaction events. A reaction event is a change signal, not complete truth; detected gaps, cache loss, or ambiguous removals trigger bounded provider reconciliation.
- Starboard projection that republishes message text, embeds, or attachments requires that content to have been lawfully received and retained under the Message Content policy. Without it, the projection is restricted to allowed metadata, attribution, counts, and a source-message link.
- Every giveaway entry, form launch, form submission, review action, and room-control interaction receives an initial response within Discord's current three-second deadline. Work that cannot finish immediately is deferred before that deadline; follow-up credentials are treated as short-lived and currently expire after fifteen minutes.
- Form publication validates modal and component structure against the current Discord contract. Text inputs, selectable components, and file-upload components are admitted only where the current interaction surface supports them; the domain question model is not assumed to map one-to-one to every Discord component.
- Discord attachment and interaction URLs are temporary transport locations, not durable records. Accepted form files are ingested through Asset Service within a bounded deadline and submissions retain tenant-owned asset references plus integrity metadata.
- Channel creation, deletion, update, overwrite, member move, invite, and room-status actions are typed operations with fresh capability preflight. They require the current applicable combination of channel management, move-member, view, connect, speak, send-message, and history permissions.
- Temporary-room overwrites may grant or deny only the policy-owned permission set and may never grant a permission the platform bot cannot exercise. Unrelated administrator overwrites and permission bits are preserved.
- Guild channel counts, overwrite counts, component limits, modal limits, attachment constraints, message sizes, reaction availability, and other mutable provider bounds are validated dynamically at publication or execution; no product policy treats remembered numeric limits as permanent.
- An existing channel linked to a room generator is externally owned. The service may observe it and apply explicitly authorized policy-owned bindings, but it never deletes that channel during room cleanup.
- XP rewards, giveaway role prizes, and accepted-form roles are requested through Role Policy and Assignment Service. Announcements and starboard projections use Delivery. No community service calls Discord directly or bypasses shared request governance.

### 14.12 Economy-specific provider controls

- Balance, income, shop, and game commands use application-command or component interactions and require no arbitrary message content. Optional chat-income evaluation is a progression-style metadata source by default; content-quality rules require a separately approved `MESSAGE_CONTENT` capability.
- Every economy interaction receives an initial response within Discord's current three-second deadline. Long-running purchase, entitlement, salary, and game settlement work is deferred before that boundary; the current fifteen-minute interaction-token lifetime never bounds authoritative workflow recovery.
- Shop pagination, purchase buttons, job or crime selection, and game controls validate current component structure, custom-identifier bounds, option counts, message size, and interaction context at publication. Remembered limits are not embedded in domain policy as permanent constants.
- An opaque component token identifies a catalog, item or game session, revision, action, and routing generation. It does not carry trusted price, stake, payout, balance, eligibility, owner, stock, reward, or game state.
- Component ownership is revalidated from the signed interaction identity. A message visible to another member never grants control of the buyer's purchase or player's game.
- Economy replies and projections use explicit allowed mentions. Transfers, salary announcements, purchases, wins, and manual fulfillment never enable user, role, or everyone mentions merely because rendered text contains mention syntax.
- Role entitlements pass through Role Policy and Assignment and therefore require current `MANAGE_ROLES`, role hierarchy, managed-role, prohibited-permission, and ownership checks.
- Private-channel entitlements require current channel-creation and overwrite capabilities. Discord currently requires `MANAGE_CHANNELS` for guild channel creation and the applicable role-management permission for overwrite mutations; the transport validates the current contract at execution.
- Entitlement channel names, topics, overwrites, categories, counts, and lifetime operations are validated against current provider limits. Creation response loss enters reconciliation before another channel is created.
- Only Entitlement Service resources with durable creation ownership are eligible for automated deletion. Pre-existing roles, categories, channels, messages, and externally linked resources are never compensation targets.
- Manual reward tickets and logs are Delivery projections. Message or thread creation does not prove that a staff member fulfilled the benefit.
- Casino and income randomness is generated internally through the secure-randomness capability and is never delegated to message timing, reaction order, Discord identifiers, client input, or provider presentation behavior.
- Deleting a shop or game message affects only its projection. It does not reverse a purchase, release a captured payment, change a committed outcome, or settle a wager.
- Economy services never call Discord directly, retain raw interaction tokens as durable workflow state, or bypass centralized route, global, guild, channel, invalid-request, and fairness governors.

### 14.13 Support-specific provider controls

- Support panels, intake launches, and case controls acknowledge within Discord's current three-second interaction deadline. Deferred completion is used before that boundary, and the current fifteen-minute token lifetime never limits case or provisioning recovery.
- Button and string-select custom identifiers are opaque routing references validated against current provider bounds. Panel option labels, descriptions, emoji, rows, select options, placeholders, and complete message structure are validated at publication against the current component contract.
- A panel message is mutable only when its binding proves the configured application identity owns it and current permissions allow the operation. Messages created by another bot or copied from another application are external and cannot be adopted merely because their visual content matches.
- Panel interactions do not require arbitrary message content because the authoritative panel and option are resolved from the signed interaction and provider binding. Support deployments MUST NOT request `MESSAGE_CONTENT` solely to operate buttons, selects, or case controls.
- Transcript capture of ordinary participant messages, attachments, embeds, components, or polls requires the approved Message Content privileged intent under Discord's current contract. Without it, the archive records metadata-only or explicit content-unavailable coverage and never claims completeness.
- Private text-channel creation currently requires `MANAGE_CHANNELS`. Permission-overwrite mutations require the current applicable role-management capability, and every resource mutation also validates view, send, history, attachment, embed, thread, and message-management permissions required by the specific plan.
- Category capacity, guild channel counts, channel name and topic bounds, overwrite counts, component counts, modal structure, select options, attachment limits, thread behavior, message size, and other mutable provider limits are validated dynamically rather than frozen in ticket policy.
- Creating a private channel, private thread, message, or pin is not assumed idempotent. A lost response triggers bounded reconciliation using the operation identity, application ownership, provider events, expected parent, safe name, creation interval, and bounded audit evidence before retry.
- Access compilation denies guild-wide visibility by default for private resources and grants only policy-owned permissions to the opener, admitted participants, staff, observers, and bot. It cannot grant permissions unavailable to the bot or replace unrelated administrator overwrites.
- Staff access roles and mention roles are separate. A role that may view or manage a ticket is never automatically mentionable; every open, escalation, or log message carries an explicit allowed-role set.
- Deleting a guild channel is permanent. Cleanup requires case policy, archive-boundary resolution, live ownership proof, current capability, and a fenced resource operation. Categories, system channels, linked resources, and channels created by another operation are excluded.
- Support message history reconciliation is bounded by exact case resource and cursor. The service never performs unbounded guild or category scraping, and lack of `READ_MESSAGE_HISTORY` is exposed as coverage degradation.
- Discord channel deletion, message deletion, application-identity change, or permission loss produces an explicit case-resource or panel health event; it never silently deletes the Support Case aggregate.
- Support services do not call Discord directly. Panel and case messages use Delivery, while resource mutations use Discord Capabilities and governed Discord Transport.

### 14.14 Integration and stream-alert provider controls

- Provider webhook or event-stream ingress uses a dedicated public trust boundary. Every message is authenticated from exact transport bytes and current secret or connection generation, checked for timestamp freshness and replay identity, size-bounded, and durably admitted before domain processing. Tenant HTTP workflow triggers use this same boundary (DR-028).
- Provider callbacks are acknowledged within the provider's current deadline independently from Discord work. A callback handler never performs provider polling, message rendering, Discord delivery, or tenant-wide fan-out inline.
- Provider event delivery is assumed at least once and may be duplicated, delayed, reordered, revoked, or interrupted. Provider message identity suppresses transport duplicates; provider session identity and alert occurrence identity suppress semantic duplicates.
- Twitch EventSub stream-online and stream-offline coverage is keyed by canonical broadcaster identity. Webhook signatures, message identifiers, timestamps, retry markers, verification challenges, and revocations follow the current Twitch contract; a revocation changes coverage state and does not imply the broadcaster is offline.
- Twitch and every batch-capable adapter derive batch size, pagination, rate budget, and result completeness from the current provider contract. Every requested identity omitted from a partial or truncated response is inconclusive until the adapter can prove that omission means offline under that exact operation.
- YouTube identity resolution is separated from live observation. Expensive discovery operations, quota cost, daily allocation, page cost, authorization scope, and supported live-state filters are represented by the active provider capability profile and budget store rather than fixed permanently in product policy.
- Provider push notifications that describe uploads or channel-feed changes are not treated as authoritative live-start or offline signals unless the current provider contract explicitly supplies that semantic. The adapter may use them only as bounded hints that schedule a conclusive observation.
- An undocumented or unstable provider endpoint is disabled by default in production unless its legal use, authentication, response contract, quota behavior, monitoring, circuit policy, and fail-safe behavior are explicitly approved. Failure of such an adapter is unavailable or inconclusive, never offline.
- Credentials are held by a dedicated secret capability and referenced by opaque generation. Provider tokens, client secrets, API keys, webhook secrets, refresh tokens, and raw authorization headers never enter configuration events, logs, metric labels, delivery context, or tenant-readable models.
- Credential pools enforce tenant authorization, provider terms, rate and quota budgets, rotation, revocation, least scope, and blast-radius separation. Public provider access is still circuit-broken and rate-governed.
- Provider redirect targets, thumbnails, avatars, and watch URLs are untrusted external data. Only admitted HTTPS origins and schemes are rendered; remote media passes through Asset Service policy or is omitted, and Discord never receives a server-side credential-bearing URL. Server-side fetches of those URLs pin destination IPs and deny private and metadata ranges (DR-029).
- Stream-alert messages pass current Discord content, embed, attachment, destination, and permission validation after rendering. Allowed mentions default to none; role, everyone, or here mentions require explicit alert policy, current administrator authority, tenant allowlist, cooldown, and anti-spam budgets.
- Discord HTTP rate limits are governed from returned bucket and retry metadata, not guessed fixed constants. The shared transport coordinates route, channel, webhook, global, guild fairness, and invalid-request budgets across all modules.
- Creating an announcement uses a stable internal delivery identity and a provider-supported nonce where applicable. If the response is lost, Delivery reconciles before retry; webhook sends that must return a durable message binding use a confirmed-response mode supported by the current Discord contract.
- Refresh or offline edits and auto-delete target only the exact application-owned message binding created by the occurrence. A changed destination, copied embed, matching content, or message supplied by an administrator is never sufficient ownership proof.
- Repeated metadata changes are coalesced to the newest accepted revision and obey minimum edit intervals. The system does not edit on every viewer-count fluctuation or upstream field change and does not generate avoidable Discord request bursts.
- A test alert is visibly labeled, actor-authorized, tenant-rate-limited, uses synthetic or explicitly previewed bounded data, creates its own test occurrence, and cannot advance provider session state or production notification deduplication.
- Stream-alert services do not access the Discord SDK or HTTP API directly. Integration definitions reference Message Catalog revisions; every create, edit, offline notice, or cleanup passes through Delivery, Discord Capability, Asset policy where applicable, and governed Discord Transport.

### 14.15 Automation command and reminder provider controls

- Application-command names, descriptions, localizations, option trees, choices, contexts, integration types, default member permissions, age restrictions, and total registry shape are validated against the current Discord contract at snapshot compilation. Product policy may impose stricter limits.
- Discord's guild bulk-overwrite operation replaces the complete application command list across command types. Only Application Command Registry may invoke it, and only from an immutable snapshot containing every admitted built-in and custom owner for that installation.
- Targeted create, edit, and delete operations also pass through the registry owner. A product service never mutates its perceived subset independently because provider IDs, names, and command types share one namespace and drift boundary.
- Provider command IDs plus application and installation identity route interactions to owners. Command names are presentation and cannot alone authorize or select custom behavior.
- Every custom-command interaction is acknowledged or deferred within Discord's current three-second deadline. The current interaction token lifetime is short-lived delivery capability, not workflow durability or invocation authority.
- Ephemeral state is selected on the initial interaction response or defer according to the current Discord contract; a later follow-up cannot be assumed to change an existing response's visibility class.
- Custom commands use signed application-command option values and do not inspect arbitrary message content. Prefix and message-trigger modes are outside this specification and cannot justify the Message Content privileged intent.
- Direct-message response requires an explicit policy and independent privacy-safe confirmation path. DM failure does not expose command output in the invocation channel unless the frozen action plan explicitly authorizes that fallback.
- Application-command output passes current content, embed, component, attachment, flag, and allowed-mention validation after rendering. Variables never grant mention authority; everyone or here behavior requires explicit published policy and current tenant authorization.
- Auto-delete targets only the exact application-owned response or follow-up message binding and uses a durable deadline. Interaction-token expiry, ephemerality, missing delete capability, or provider absence yields an explicit outcome instead of an untracked timer.
- A reminder interaction uses a signed owner identity and opaque cancellation or snooze token. The token resolves reminder, occurrence, owner, generation, and action but carries no trusted due time, content, destination, or authority.
- Reminder DMs and channel messages use Delivery. Channel fallback permits only the owner's explicit mention by default and exposes reminder content only when the frozen privacy policy authorizes that route.
- Origin jump links are presentation metadata built only from same-tenant provider identifiers. Their presence does not grant access to the source channel or message and their absence does not block reminder delivery.
- Discord timestamps may be accepted as schedule input only after server-side parsing and range validation. Client rendering, locale, and relative-time display are not authoritative due instants.
- Reminder create, edit, reschedule, snooze, cancel, list, clear, and staff actions acknowledge within the interaction deadline while authoritative completion is durable and versioned.
- Custom Command and Reminder services never call Discord directly, persist raw interaction tokens beyond their operational lifetime, or use process-local cooldowns, timers, or delete callbacks as authoritative state.

### 14.16 Installation, workflow, and AI character provider controls

- Discord user authentication and Discord application installation are separate authorization flows with separate state, redirect, scope, expiry, replay, and audit records. Neither flow can reuse the other's callback receipt.
- Guild discovery uses only the minimum identity scopes required by the dashboard. The returned guild permission bitfield excludes channel overwrites and implicit permission behavior, so it cannot authorize a channel, role, moderation, or delivery effect.
- Installation policy models Discord integration contexts explicitly. Guild installation may request a bot user and application commands; user installation may expose only capabilities supported by its current application context. Product services depend on capability results rather than hard-coded scope assumptions.
- `applications.commands` is an application authorization capability and does not imply bot-user presence. Bot presence, application authorization, command projection, Gateway coverage, and module permissions are independently observed.
- Install and repair links request the union of named permissions required by currently enabled modules, never Administrator as default or as a shortcut when a named bit is missing. Disabled and optional modules do not inflate the request. An incomplete manifest fails closed rather than substituting Administrator (DR-032).
- A guild selection constraint reduces user error but is not authorization. The callback guild, current actor authority, application identity, installation generation, and provider-observed presence must agree before activation.
- Removed or degraded installation state stops only effects whose required capabilities are absent. Accepted durable work remains visible, retries wait for a relevant state change, and configuration is not deleted.
- Workflow actions that produce Discord effects pass through the same owning services, Delivery, capability preflight, mention policy, rate limits, invalid-request budget, ownership proof, and reconciliation as an equivalent direct action.
- Workflow recursion lineage and effect budgets prevent feedback loops caused by the bot's own messages, role changes, support events, webhooks, and module outcomes. A workflow cannot multiply one event into unbounded Discord requests.
- AI character matching never requires the Message Content privileged intent unless the published channel and invocation mode explicitly depends on message content and the application has completed the applicable Discord approval and privacy review. Mention or slash-command invocation is preferred where it satisfies the product behavior.
- Retrieved guild, form, and provider content cannot select AI tools or grant capabilities. AI tools are an allowlisted catalog of typed commands reauthorized by owning services (DR-031).
- Character responses are rate-limited by tenant, character, actor, channel, destination, and application-wide Discord budgets. Slow AI execution is acknowledged or deferred through Interaction Edge or handled from durable Gateway ingestion; it never holds a Gateway dispatch loop.
- Optional persona webhooks are created, rotated, stored, and deleted through application-owned resource workflows. Webhook presentation cannot impersonate a real user, moderator, official notice, or another application and does not alter authorization identity.
- AI-generated text, embeds, images, attachments, components, and links undergo the same post-render Discord validation, allowed-mention denial, size constraints, media scanning, destination capability checks, and anti-spam admission as authored content.
- AI or workflow output blocked by Discord policy, permissions, rate limits, safety, or entitlement remains a typed outcome. The system never rewrites content repeatedly or retries across destinations to evade provider restrictions.

## 15. Error taxonomy and retry policy

| Category | Examples | Retry behavior | State action |
|---|---|---|---|
| Rate limited | HTTP 429 | Retry exactly after provider delay with jitter only beyond that boundary | RetryScheduled |
| Provider transient | Selected 5xx and connection establishment failures | Exponential backoff with jitter and attempt ceiling | RetryScheduled |
| Outcome uncertain | Connection lost after request transmission | Reconcile before retry | OutcomeUncertain |
| Invalid authentication | Invalid or revoked token | No retry; open global circuit | PermanentlyFailed and critical alert |
| Permission blocked | Missing send, embed, attach, history, reaction, or thread permission | Refresh capability once; no retry of the same intent. Owner admits a new intent after correction | Blocked |
| Unknown destination | Deleted channel, thread, message, or webhook | No retry of the same intent; tombstone projection; owner may admit a new intent to a live destination | Blocked or PermanentlyFailed |
| Invalid payload | Provider or platform validation failure | No retry with same revision | PermanentlyFailed |
| Expired interaction | Initial or follow-up token expired | No retry | PermanentlyFailed |
| Asset transient | Temporary storage or network failure | Bounded retry before delivery deadline | RetryScheduled |
| Asset permanent | Unsafe URL, bad signature, unsupported format, oversized input | No retry | PermanentlyFailed |
| Render transient | Worker crash or temporary capacity rejection | Retry in a different healthy worker within deadline | RetryScheduled |
| Render permanent | Invalid design, memory bound, output byte ceiling | No retry with same revision | PermanentlyFailed |
| Tenant quota | Delivery or storage quota exceeded | No automatic retry of the same intent until quota state changes; owner admits a new intent | Blocked |
| Moderation hierarchy conflict | Actor or bot no longer outranks the target | No retry with the same authority snapshot | Rejected or Blocked |
| Concurrent target change | Roles, timeout, membership, channel overwrite, or message state changed after preflight | Refresh once and reevaluate the command precondition | Rejected, Skipped, or RetryScheduled |
| Native rule capacity | Discord rejects Auto Moderation synchronization because current trigger limits are exhausted | No blind retry; preserve last confirmed binding and require policy resolution | Blocked |
| Audit unavailable | Missing audit permission, exhausted cursor, rate limit, or provider outage | Retry only transient transport failures; never block a sanction | Explicit query state |
| Cleanup partial | Some pages or messages succeeded while others failed | Resume from durable checkpoint within occurrence limits | PartiallyCompleted |
| Evidence unavailable | Message content or attachment context was not received, retained, or permitted | Continue with reduced evidence and never fabricate content | Completed with evidence state |
| Security coverage degraded | Required Gateway intent, audit permission, policy snapshot, or distributed counter is unavailable | Do not claim healthy enforcement; fail closed for automatic destructive actions and alert operators | Degraded or Blocked |
| Duplicate threshold crossing | Existing incident, reservation, or cooldown owns the semantic response | No retry and no duplicate effect; aggregate the observation | Deduplicated |
| Containment preflight blocked | Required permission, hierarchy, resource, or alert readiness is absent | No mutation; return exact blocker and await a relevant state change | PreflightBlocked |
| Containment partial | Some planned steps confirmed while others blocked, failed, or remain uncertain | Persist every step and resume only eligible work with fencing | Partial |
| Restoration conflict | Current provider state no longer matches the operation's applied state | Never overwrite; require safe merge, skip, or audited operator acknowledgement | RestorePartial |
| Role already desired | Member already has the requested present or absent relation | No provider request | Unchanged |
| Role assignment stale | Deadline, policy ownership, membership, screening, or group selection changed | No retry; supersede or skip with reason | Skipped |
| Role unassignable | Missing, managed, `@everyone`, sensitive, or above-bot role | No blind retry; invalidate dependency until role state or policy changes | Blocked or PermanentlyFailed |
| Panel projection partial | Message exists but required content, component, or reaction effects did not converge | Retry only eligible effects; retain pinned revision and degraded state | Degraded |
| Panel orphaned | Bound message was deleted or became permanently inaccessible | No automatic destructive cleanup; offer repair, clone, or tombstone | Orphaned |
| Role resource conflict | Role or hierarchy fingerprint changed after preview | Refresh and require a new explicit command | Rejected |
| Role mutation uncertain | Provider response lost after create, delete, update, or reorder transmission | Reconcile live roles and bounded audit evidence before retry | OutcomeUncertain |
| Progression duplicate or stale event | An XP source event, voice segment, or adjustment key already exists, or an older policy revision arrives after a newer decision | Do not retry the decision; return the existing ledger result or reject the stale command | Deduplicated or Superseded |
| Progression source unavailable | Required content capability, voice-state continuity, or trusted source metadata is absent | Do not estimate hidden facts; apply only the declared degraded rule or award nothing | Degraded or Skipped |
| Starboard projection degraded | The source aggregate is valid but the destination message is missing an eligible content, reaction, or edit effect | Retry only the missing eligible effect against the pinned aggregate version | Degraded |
| Starboard source or projection orphaned | The source or board message was deleted or became permanently inaccessible | Tombstone the binding; apply configured delete, preserve, or recreate policy without blind retries | Orphaned |
| Giveaway transition conflict | A concurrent command changed lifecycle version, close generation, or cancellation state | Reload and reevaluate; never draw from the losing revision | Rejected or Unchanged |
| Giveaway close blocked | Entrant snapshot is incomplete, eligibility dependencies are stale, secure randomness is unavailable, or the draw lease is lost | Do not select winners; resume the fenced close workflow from durable state | CloseBlocked |
| Giveaway fulfillment partial | Winner selection is immutable but one or more prizes or announcements failed | Retry each independently idempotent fulfillment within its deadline; never redraw implicitly | PartiallyFulfilled |
| Form reception failure | An acknowledged interaction could not be committed durably before its acceptance deadline | Report an explicit submission failure; never imply the response was stored | Rejected or Failed |
| Form asset ingestion failure | A submitted file is unsafe, expired, oversized, or could not become a durable tenant asset | Apply the published question's required-asset rule; never persist only the temporary provider URL | Rejected or Partial |
| Form review conflict | The submission review version or terminal state changed after the reviewer loaded it | Reject the stale decision and return current state | Rejected |
| Temporary-room partial creation | Only some channels, overwrites, moves, or bindings were confirmed | Reconcile every durable step and compensate only service-owned resources | Partial |
| Temporary-room orphan or ownership conflict | A bound resource disappeared or an administrator changed service-owned state after application | Reconcile and expose conflict; never recreate or overwrite without policy and current preconditions | Orphaned or Conflict |
| Monetary duplicate | A transaction, hold, capture, release, reversal, or transfer semantic key already exists | Return the prior immutable result; never post again | Deduplicated |
| Insufficient available balance | Current balance minus active holds cannot cover a debit or new hold | No retry without a new command or relevant credit | Rejected |
| Account or ceiling blocked | Account is frozen, currency inactive, or posting would exceed a configured wallet or bank maximum | No automatic retry until policy or account state changes | Blocked |
| Ledger invariant failure | Postings do not balance, amount or scale is invalid, or projection version conflicts unexpectedly | Roll back the entire local transaction, open the ledger circuit for the affected path, and alert | Failed |
| Hold ownership conflict | Non-owner requests capture or release, hold expired, amount differs, or terminal state already won | Do not mutate; return authoritative hold state | Rejected or Unchanged |
| Income action stale | Cooldown, streak, role, policy, schedule, or eligibility changed before decision commit | Reevaluate once under the authoritative revision or reject | Skipped or Superseded |
| Income settlement unavailable | A valid income decision cannot reach Monetary Ledger before its deadline | Preserve the decision and retry the same monetary key within policy; never reroll | SettlementUncertain |
| Stock contention | Finite stock or member purchase limit is exhausted during reservation | No automatic retry of the same user action | Rejected |
| Purchase payment uncertain | Hold or capture response is lost after transmission | Reconcile by ledger semantic key before release, recapture, fulfillment, or refund | ReconciliationRequired |
| Purchase fulfillment partial | Payment is captured but one or more required rewards are pending, blocked, failed, or uncertain | Retry only eligible reward occurrences; retain paid and partial state | PartiallyFulfilled |
| Refund compensation conflict | A granted benefit was externally changed or cannot safely be reversed | Do not claim a full refund automatically; require policy or operator resolution | ReconciliationRequired |
| Entitlement effect uncertain | Provider or owning service may have applied a grant or revocation but its response was lost | Reconcile the desired relation or resource before retry | ActivationPartial or RevocationPartial |
| Manual fulfillment overdue | No authorized completion receipt exists before the case deadline | Escalate or remain pending; delivery receipt is not completion | Pending or Overdue |
| Casino session stale | Action token, player, turn, action sequence, deadline, or session version does not match | Reject without changing game or money state | Rejected |
| Secure randomness unavailable | Randomness capability cannot produce a trusted result | Do not play or commit an outcome; hold remains recoverable under timeout policy | Blocked |
| Wager settlement uncertain | Outcome is committed but capture or payout confirmation is missing | Reconcile the same ledger settlement key; never redraw | RecoveryRequired |
| Support panel projection partial | Panel revision is valid but message or component effects did not converge | Retry only eligible missing effects against the pinned revision | Degraded |
| Support panel identity mismatch | Bound message belongs to another application identity or ownership cannot be proven | Do not edit or delete; require republish or explicit external tombstone | Orphaned |
| Support admission contention | Tenant, template, member, or queue capacity changed during open reservation | Retry the atomic reservation once under current policy or return the authoritative limit | Rejected or RetryScheduled |
| Support duplicate open | The same interaction, intake, or semantic request already owns a case or pending admission | Return the existing case state; do not allocate another number or capacity slot | Deduplicated |
| Support intake unavailable | Required Form Workflow version, submission, or asset dependency cannot be validated before deadline | Do not create the case unless the published template permits an intake-degraded mode | Blocked or Rejected |
| Support resource provisioning partial | Channel or thread exists but access, opening, control, log, or binding effects are incomplete | Preserve case and every step; retry or reconcile only eligible effects | Partial |
| Support resource outcome uncertain | Provider response was lost after a non-idempotent create, move, or delete request | Reconcile bounded provider state before retry | OutcomeUncertain |
| Support access conflict | Provider overwrites or membership changed after the owned snapshot | Preserve unrelated state and require safe merge, policy refresh, or operator resolution | Conflict |
| Support archive incomplete | Message content, events, history, attachments, or permissions were unavailable | Generate only when policy permits explicit gaps; never claim complete coverage | Incomplete |
| Support cleanup blocked | Mandatory archive boundary, legal hold, capability, ownership, or active reopen state prevents deletion | Retain the resource operation and next safe action | Blocked |
| Provider event authentication failed | Signature, timestamp, endpoint generation, secret generation, or connection identity is invalid | Never retry domain processing; acknowledge or reject only as required by the provider contract and alert on sustained failure | Rejected |
| Provider event duplicate | Provider message identity already has an authenticated ingress receipt | Return the prior acknowledgement class and do not repeat normalization or transition | Deduplicated |
| Provider subscription uncertain | Create, renew, rotate, or delete may have succeeded but the response was lost | List or inspect bounded owned provider resources before retry | OutcomeUncertain |
| Provider subscription revoked or degraded | Provider reports revocation, expiry, callback failure, transport disconnect, or invalid condition | Persist coverage loss, attempt bounded repair, and activate only a declared fallback | Degraded |
| Provider quota exhausted | The credential or application budget cannot admit the observation | Defer until authoritative reset or policy change; never represent state as offline | Blocked |
| Provider rate limited | Upstream returns a retry boundary or budget refusal | Honor provider retry metadata with coordinated jitter beyond the boundary | RetryScheduled |
| Provider credential invalid | Token, API key, scope, client identity, or public-access assumption is rejected | Open the scoped circuit, stop dependent calls, and require rotation or authorization correction | Blocked |
| Provider response incomplete | A requested identity, page, field, or cursor cannot be conclusively classified | Record inconclusive coverage and retry within freshness and quota policy | Inconclusive |
| External live-signal conflict | Authenticated event and conclusive observation disagree beyond the source-precedence window | Preserve evidence, stop terminal lifecycle effects, and resolve through bounded reconciliation | Conflicted |
| Stream-alert projection blocked | Destination, permission, mention role, message definition, or Discord provider limit is invalid | Keep the occurrence and expose exact dependency; retry only after a relevant revision or capability change | Blocked |
| Stream-alert projection uncertain | Discord may have created, edited, or deleted the message but the response is unavailable | Reconcile exact application-owned binding before retry | OutcomeUncertain |
| Stream-alert lifecycle stale | Refresh, offline, or cleanup occurrence is older than the current session, alert, metadata, or binding generation | Do not execute; mark superseded without altering the current projection | Superseded |
| Command registry conflict | Built-in or custom owners collide on name, type, localization, context, option schema, or provider capacity | Do not project the losing snapshot; expose every owner and correction path | Conflicted |
| Command projection uncertain | Discord may have applied a targeted mutation or complete overwrite but the response was lost | Fetch and normalize the full affected registry before retry | OutcomeUncertain |
| Custom invocation stale | Provider binding, definition revision, tenant, actor membership, deadline, or interaction generation is no longer eligible | Reject without acquiring new effects or extending the token lifetime | Rejected or Superseded |
| Custom command cooldown contention | Another invocation owns the same active cooldown or concurrency scope | Return the authoritative remaining boundary; do not retry automatically | Rejected |
| Custom action partial | Invocation was accepted but one or more independent response actions blocked, failed, or expired | Preserve action receipts and retry only eligible actions within deadline | PartiallyCompleted |
| Reminder time ambiguous or invalid | Civil time is in a daylight-saving gap or overlap, timezone is invalid, or input exceeds policy | Apply the published ambiguity rule or reject with correction guidance | Rejected |
| Reminder claim stale | Cancellation, reschedule, snooze, revision, deadline, or a newer fencing generation invalidated the worker | Do not deliver; release or mark superseded from authoritative state | Superseded |
| Reminder route unavailable | DM closed, member inaccessible, channel missing, permission denied, or privacy policy forbids fallback | Try only the next frozen admitted route; otherwise retain a terminal outcome | RetryScheduled or DeadLetter |
| Reminder delivery uncertain | Discord may have sent a route message but the response is unavailable | Reconcile when the endpoint permits; otherwise preserve unresolved evidence and never blindly fan out fallbacks | OutcomeUncertain |
| Reminder recurrence invalidated | Timezone, recurrence revision, end boundary, occurrence cap, or pause state changed before next expansion | Recompute only from the new revision and do not recreate superseded instants | Superseded |
| OAuth transaction invalid | State, redirect, proof key, client binding, scope, identity, or expiry validation fails | Never retry the same transaction; create a new login or installation generation | Rejected |
| Installation degraded | Application remains installed but a module permission, hierarchy, intent, command, or destination dependency is absent | Wait for a relevant provider observation or authorized repair generation | Degraded |
| Payment event stale or duplicate | Provider event identity was processed or object ordering is older than authoritative state | Record bounded disposition and perform no repeated grant | Unchanged |
| Payment outcome uncertain | Checkout or subscription mutation may have succeeded without a confirmed response | Reconcile the exact provider object before creating another attempt | OutcomeUncertain |
| Entitlement overage | Effective capacity decreased below current authoritative usage | Reject new capacity-consuming admission and preserve existing data | Restricted |
| AI provider outcome uncertain | A billable result or usage may exist but response confirmation is absent | Preserve reservation and reconcile before retry release or capture | OutcomeUncertain |
| Template effect partial | One or more required owner-service operations are blocked failed or uncertain | Preserve step receipts; repair or compensate only eligible owned effects | Partial |
| Workflow loop or fan-out violation | Lineage depth visited set or worst-case effect budget exceeds policy | Reject or stop before the next effect; do not retry unchanged revision | Rejected or DeadLetter |
| Poison delivery intent | Attempts, deadline, or reconciliation evidence window exhausted; payload repeatedly fails classification | No automatic retry; persist dead letter | DeadLetter |

Retries MUST be bounded by both attempt count and absolute deadline. A dead-letter record MUST contain a normalized reason, owning service, next operator action, and replay eligibility. Blind replay of dead-letter traffic is forbidden.

## 16. Concurrency, backpressure, and fairness

Every asynchronous boundary has a finite capacity.

| Boundary | Required control |
|---|---|
| Gateway decode to inbox | Bounded buffer and shard health degradation signal |
| Inbox to event bus | Durable outbox with retry and publication lag metric |
| Event bus to domain service | Consumer concurrency partitioned by guild |
| Domain outbox to delivery | Durable backlog and tenant fairness |
| Delivery to renderer | CPU and memory admission tokens |
| Delivery to Discord transport | Global, bucket, guild, and channel governors |
| Remote asset fetch | Host, tenant, byte, and concurrent-fetch limits |
| Voice sessions | Per-node session, CPU, memory, and bandwidth admission |
| Moderation commands | Guild and target serialization for conflicting actions; independent targets remain concurrent |
| Automatic moderation | Partitioned policy evaluation with bounded distributed counters and one incident reservation |
| Activity attribution | Bounded asynchronous audit lookups with a strict guild request budget |
| Retention sweeps | Per-guild and per-channel leases, bounded pages, adaptive batches, and provider bucket awareness |
| Security detection | Guild-partitioned consumers, atomic bounded windows, incident latch, and finite policy-snapshot capacity |
| Guild containment | One fenced operation per guild, bounded resource batches, explicit step deadline, and shared provider governors |
| Role assignments | Member and ownership-group serialization, finite retry queues, deadline admission, and tenant fairness |
| Role panels | One fenced publication per panel revision, bounded effects, interaction admission limits, and repair backpressure |
| Role resources | Per-role serialization plus one per-guild hierarchy lease; no concurrent reorder operations |
| Progression ingestion | Tenant-member-source partitioning, semantic-event uniqueness, atomic cooldown reservation, bounded voice-session recovery, and finite ledger backlog |
| Leaderboards | One refresh lease per definition and window, bounded ranking pages, snapshot reuse, and read-side caching that never becomes award authority |
| Starboards | Board-source serialization, incremental unique-contributor storage, coalesced projection updates, bounded reaction reconciliation, and per-board fairness |
| Giveaways | One fenced lifecycle transition per giveaway, immutable entrant snapshot, finite entry admission, bounded winner count, and independently queued fulfillment |
| Forms | Per-form admission quotas, per-respondent uniqueness, bounded active sessions and attachments, submission-review optimistic concurrency, and export backpressure |
| Temporary rooms | One creation claim per generator and member, one lifecycle lease per room, bounded channel mutations, per-guild room quota, and timer coalescing |
| Monetary ledger | Canonical multi-account locking, per-account mutation queues where needed, bounded holds, partitioned journal publication, and strict tenant fairness |
| Earnings and income | Member-source cooldown serialization, bounded role evaluation, one salary occurrence lease, paged recipient checkpoints, and anomaly admission limits |
| Commerce | Optimistic order version, atomic finite-stock reservation, bounded catalog pages, per-member purchase limits, and independently backpressured reward lines |
| Entitlements | One lifecycle lease per entitlement and owned resource, bounded Discord effects, generation-fenced expiry, and reconciliation deadlines |
| Casino games | One session owner with fencing, monotonic action sequence, per-member active-session and exposure limits, bounded state size, and settlement queue isolation |
| Support panels | One fenced publication per panel revision, bounded component effects, interaction admission limits, and coalesced repair |
| Support admission | Atomic multi-scope capacity reservation, member and template cooldown uniqueness, bounded intake sessions, and tenant fairness |
| Support cases | Per-case optimistic serialization, finite participant and event size, bounded timers, and independent notification backpressure |
| Support resources | One fenced operation per case generation and resource, bounded overwrite or membership changes, provider-bucket awareness, and cleanup deadlines |
| Support archive | Resource-partitioned capture, bounded content and attachment size, gap checkpoints, transcript render admission, export quotas, and retention backpressure |
| Provider event ingress | Per-endpoint connection and request limits, body ceilings, replay-key storage, signature-verification CPU budgets, and fast durable acknowledgement |
| Provider observations | Fenced due claims, shared canonical-identity work, provider and credential budgets, bounded batches and pages, adaptive backoff, and tenant fairness |
| Provider subscriptions | One fenced operation per provider condition and generation, bounded listing reconciliation, verification deadlines, and credential-scope isolation |
| External live signals | Per-identity session serialization, bounded evidence and metadata revisions, alert fan-out pages, refresh coalescing, and stale-signal suppression |
| Stream-alert delivery | Per-tenant and destination burst limits, mention budgets, provider bucket awareness, effect deadlines, and lifecycle-generation ordering |
| Command registry | One fenced projection generation per application installation, complete-snapshot size bounds, conflict admission, provider rate budgets, and drift-reconciliation backpressure |
| Custom-command runtime | Interaction-deadline admission, tenant-definition-actor cooldown scopes, bounded argument and variable size, finite action count, and Delivery isolation |
| Reminders | Earliest-due wake-ups, occurrence-generation fencing, bounded recurrence expansion, per-owner and tenant quotas, route attempt ceilings, and reconciliation lookahead |
| Durable timers | Schedule bounded due-row sweep for every registration, owner leases and fencing, explicit misfire, cancellation by generation, and observable lag |
| Due-work claims | `lease_ttl` 15 Clock-port seconds (range 5–30), heartbeat at most one-third of TTL, higher fencing token on reclaim, Clock-port expiry on the row, no Durable Timer per lease |
| Identity and sessions | Bounded OAuth transactions, callback exchange concurrency, session-generation cache, revocation fan-out, per-account and per-origin abuse limits |
| Discord installation | One active mutation generation per installation context, bounded provider inspections, coalesced capability refresh, command-registry coordination, and tenant fairness |
| Commercial billing | Provider-account and object partitioning, idempotent checkout admission, finite webhook buffers, subscription ordering, separate reconciliation pools, and no checkout priority over event intake |
| Platform entitlements | Scope-generation serialization, bounded source expansion, targeted cache invalidation, owner-service capacity admission, and grace-occurrence fencing |
| AI usage ledger | Credit-account serialization, atomic multi-lot allocation, finite reservation lifetime, spending windows, and independent reconciliation queues |
| AI execution | Separate bulkheads by operation and model class, provider and credential budgets, tenant fairness, bounded input and output, deadline admission, and uncertainty capacity |
| Templates | Separate scan preview install and rollback pools, per-package and tenant limits, bounded dependency graph, owner-service action budgets, and conflict backpressure |
| Workflows | Compiled trigger indexes, execution and recursion admission, per-tenant workflow trigger destination and action limits, finite graph size, and downstream owner fairness |
| AI characters | Compiled channel matching, per-character actor and channel cooldowns, context-size ceilings, AI and Discord queue isolation, and tenant spending budgets |

Priority classes MAY distinguish interaction responses, direct user commands, lifecycle messages, automatic replies, schedules, and bulk administrative work. Priority MUST NOT bypass Discord rate limits or permanently starve lower classes. Tenant fairness is MUST for Delivery admission and shared Discord HTTP: one tenant MUST NOT monopolize those queues. Weighted fair queuing SHOULD be used; it is one acceptable algorithm, not the only one. Token-bucket, deficit round-robin, or other work-conserving tenant isolation MAY satisfy the MUST if it prevents monopolization.

#### Decision Record DR-024

**Status:** Accepted.

**Decision:** Tenant fairness is MUST for Delivery claim and admission and for shared Discord HTTP. One tenant's burst MUST NOT consume all Delivery capacity or monopolize Transport. Weighted fair queuing SHOULD be used. Token-bucket, deficit round-robin, or other work-conserving tenant isolation MAY satisfy the MUST. Priority classes MUST NOT bypass Discord rate limits or permanently starve lower classes. WFQ is not elevated to MUST.

**Rejected Alternative:** Elevating WFQ to MUST; treating fairness as optional because WFQ is SHOULD; FIFO-only shared queues without tenant isolation.

#### Decision Record DR-060

**Status:** Accepted.

**Decision:** Due-work claim leases use `lease_ttl` 15 Clock-port seconds (range 5–30). Heartbeat is at most one-third of TTL. The 60-second worker-loss SLO stays strictly below 60 seconds. Gateway and Voice session leases are not this catalog.

**Rejected Alternative:** TTL of 60 seconds; applying this catalog to Gateway shard leases; a Durable Timer per lease expiry.

**Risk:** a hot guild can starve others until Delivery and Transport implement a documented fairness algorithm. Pre-MVP for multi-tenant Delivery.
