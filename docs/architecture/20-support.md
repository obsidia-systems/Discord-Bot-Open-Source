# Tobot Architecture — Support and Ticketing

[Architecture index](README.md) · [Previous](19-economy.md) · [Next](21-integrations.md)

## 31. Support panels and ticket policy product specification

### 31.1 Product surfaces and ownership

Support configuration and entry are implemented by five collaborating bounded contexts:

| Product surface | Owning service | Authoritative result |
|---|---|---|
| Tenant defaults, ticket types, routing, eligibility, staff policy, limits, schedules, automation, and archive settings | Support Policy Service | Immutable policy and ticket-template revisions |
| Panel presentation, options, publication, component routing, retirement, and repair | Support Panel Service | Immutable panel revision and provider binding |
| Open admission, capacity, number, participants, assignment, state, deadlines, and reopen | Support Case Service | Versioned Support Case with append-only events |
| Private channel or thread, access, messages, resource movement, freeze, and cleanup | Support Resource Orchestrator | Durable resource operation and owned bindings |
| Message capture, transcripts, delivery, retention, and aggregate analytics | Support Archive Service | Archive records and transcript artifacts with coverage |

Message Catalog owns reusable content definitions. Form Workflow owns intake questions and submissions. Asset Service owns uploaded or captured files. Delivery owns message effects. Discord Capability and Transport own provider inspection and mutation. Activity Log owns platform activity history. Support services reference these capabilities and never duplicate their data ownership.

### 31.2 Tenant support policy

A tenant support-policy revision defines default behavior inherited by ticket templates:

- Enabled state and admitted open sources.
- Default private-resource mode, primary category or parent, overflow routes, and channel naming.
- Staff access, notification, escalation, observer, administration, blacklist, whitelist, and bypass rules.
- Default member, template, tenant, role, queue, and priority capacity.
- Open cooldown, opening schedule, timezone, holidays, emergency closure, and bypass behavior.
- Opener, participant, staff, assignee, and administrator action permissions.
- Opening, control, waiting, close, reopen, escalation, rejection, and log message references.
- Claim, waiting, escalation, inactivity, auto-close, auto-delete, reopen, and service-level timing.
- Intake, transcript, export, direct-message delivery, retention, satisfaction, and analytics policy.
- Audit, privacy, operational quotas, repair budget, and kill switches.

A template inherits defaults at publication time and pins the resolved values. Later tenant-default changes do not mutate an existing template revision. A new template revision may inherit the new defaults after preview and publication.

### 31.3 Ticket template aggregate

A ticket template is the stable identity of a support type such as general support, billing, report, appeal, partnership, or another tenant-defined category. Its published revision contains:

- Stable type key and localized administrative and member-facing names.
- Eligibility, availability, intake form, capacity, cooldown, priority, and tags.
- Primary and overflow resource routes.
- Staff access, notification, escalation, observer, and bypass relations.
- Channel or thread name, topic, initial access, and participant policy.
- Opening, control, lifecycle, log, and direct-message definitions.
- Claiming, waiting, resolution, close, reopen, inactivity, deletion, and escalation behavior.
- Transcript capture, format, delivery, privacy, retention, and completeness requirement.

Template revisions are immutable. Panel options pin an exact template revision or a policy-approved moving binding resolved and frozen at open admission. The preferred mode pins exact revisions so panel repair and audit remain deterministic.

### 31.4 Override and precedence model

Every setting declares one of three ownership levels: platform safety, tenant default, or template override. Platform safety cannot be weakened. Tenant defaults apply when the template omits an overridable field. Template fields replace or extend defaults only under the field's declared merge semantics.

Role collections use explicit union, replace, exclude, or ordered-fallback behavior. Capacity uses the most restrictive applicable hard ceiling unless a named bypass policy applies. Availability combines tenant closure, template schedule, and emergency state; an open result requires every applicable gate.

The effective template view records the source of each value. Operators can preview why a category, role, limit, schedule, message, or transcript rule is effective without reading multiple mutable documents.

### 31.5 Support authorization model

Distinct capabilities exist for:

- Managing tenant support policy.
- Creating and publishing templates.
- Creating, publishing, moving, disabling, repairing, and retiring panels.
- Viewing all cases or only assigned or participating cases.
- Claiming, unclaiming, waiting, resolving, closing, reopening, and escalating.
- Adding or removing participants and observers.
- Overriding capacity, cooldown, availability, or eligibility.
- Viewing intake answers, attachments, staff notes, or transcripts.
- Exporting, redacting, holding, or deleting support data.
- Forcing resource repair or destructive cleanup.

Discord `ManageGuild` may map to selected tenant capabilities but is not a universal implicit bypass. Configured staff roles grant only the ticket actions declared by policy. Notification roles may be mentioned but have no automatic access. Access roles may view a resource but cannot necessarily claim or close it.

Every action revalidates current membership, current role or capability facts, target case, expected version, protected identities, and service health. Authorization evidence is recorded without copying the member's full role list into every event.

### 31.6 Panel aggregate

A panel has stable identity, administrative name, draft, active revision, lifecycle state, and zero or more historical provider bindings. A revision defines destination, Message Definition, component mode, ordered options, availability presentation, disabled behavior, and retirement policy.

Each option defines stable option identity, label, optional description, optional emoji, button style where applicable, sort order, and exact ticket-template revision. Type keys are internal policy identifiers; provider custom identifiers use opaque routing tokens.

Panel count, option count, label length, description length, message content, component layout, and emoji use are bounded first by platform policy and then by current provider constraints. The architecture does not preserve the current limits of ten panels or five options as permanent product constants.

### 31.7 Button and select presentation

The panel domain model is transport-independent. Presentation adapters support:

- Buttons distributed across the currently supported component layout.
- One string-select menu with placeholder, option labels, descriptions, and emoji where supported.

The adapter may reject a layout or require a different mode when current provider limits cannot represent all options. It never silently drops an option, changes order, merges templates, or truncates meaning-bearing text.

Switching from buttons to select creates a new revision and component fingerprint. Existing interactions from a superseded binding follow the published stale-interaction policy and never route solely by a reused type key.

### 31.8 Panel preview and validation

Preview uses the same Message Catalog render and component compiler as publication but produces no provider mutation. It displays exact content, embeds, components, allowed mentions, disabled state, current limit validation, and destination capability.

Preflight validates:

- Actor authority and expected draft version.
- Panel and option identities, ordering, uniqueness, and template health.
- Message definition, variables, allowed mentions, assets, and component constraints.
- Destination existence, channel type, bot access, send and embed permissions, and application identity.
- Schedule and bypass rule consistency.
- Retirement and orphan-repair behavior.

Preview success is advisory. Publication rechecks mutable provider capabilities immediately before its effect.

### 31.9 Panel publication

Publication commits one immutable panel revision and one publication operation before Delivery is invoked. The operation type is create, edit, relocate, disable, enable, repair, or retire.

For first publication, Delivery creates a message and returns channel, message, application identity, effect receipt, and component fingerprint. For edit, Support Panel supplies the confirmed owned binding and expected projected revision. An unknown outcome is reconciled before create or edit retry.

A panel becomes `Published` only when every required content and component effect is confirmed. A saved `message_id` alone is insufficient. Partial, blocked, uncertain, or invalid-template outcomes produce `Degraded` with exact repair actions.

### 31.10 Message ownership and application identity

A provider binding belongs to the application identity that created the message. Changing to another bot identity invalidates edit ownership and interaction routing even when the new application shares database configuration.

An owned binding records proof from the confirmed create or edit path. An external binding may be observed or linked only under explicit policy and cannot be edited, disabled, or deleted unless the provider independently proves ownership by the active application.

Duplicating a panel creates a new panel lineage and new publication. Copying the visual message in Discord does not duplicate the authoritative revision or component routing.

### 31.11 Panel relocation, disablement, and retirement

Relocation creates a new message in the target destination, confirms the new binding, switches active interaction routing, then applies the old-binding policy. Failure after new creation leaves an explicit dual-binding transition; it never makes both silently active.

Disablement prevents new case admission and projects disabled components or an unavailable message when the owned message can be edited. Even if projection is delayed, authoritative enabled state rejects interaction.

Retirement requires one declared old-message result:

- Disable owned components and preserve informational content.
- Delete the owned message.
- Replace content with a tombstone and remove interactive components.
- Abandon an external message binding while invalidating server-side routing.

The panel aggregate and historical binding remain retained according to audit policy. Database deletion without provider and tombstone state is forbidden.

### 31.12 Panel schedules and availability

A panel or ticket template may define opening hours in a named timezone, weekly intervals, calendar exceptions, emergency closures, and bypass roles or capabilities. Schedule evaluation produces `Open`, `ClosedUntil`, `ClosedIndefinitely`, or `Unavailable` with policy revision and next transition.

Panel presentation scheduling may disable components or update content through a durable occurrence. Authoritative admission always reevaluates availability; a late presentation update cannot admit a closed ticket.

Schedule occurrences are unique, persistent, fenced, and follow an explicit misfire policy. Recovery coalesces obsolete display transitions and projects only the current desired state.

### 31.13 Interaction validation

On a member selection, Support Panel validates:

1. Signed interaction, application identity, tenant, and member identity.
2. Bound message, channel, panel, active or admitted historical revision, and binding generation.
3. Component mode, option identity, template reference, and enabled state.
4. Interaction freshness and duplicate receipt.
5. Basic template health and open-source policy.

It acknowledges or defers within the provider deadline, then submits a durable Support Open Request. It does not perform cap counting, number allocation, channel creation, or full staff-policy evaluation inside the interaction handler.

Duplicate delivery returns the prior open-request or case status. A stale, deleted, forged, cross-guild, cross-message, cross-application, or unknown option receives a safe ephemeral rejection and creates no capacity reservation.

### 31.14 Optional intake form

A template may reference one immutable Form Workflow version. The panel selection creates a support-intake correlation and opens the form session. Form Workflow owns component mapping, answers, assets, submission uniqueness, and privacy.

Support Case receives only an accepted submission reference and an allowlisted summary required for routing or priority. Full answers remain in Form Workflow and are fetched only by authorized staff.

The template defines whether capacity is reserved before intake, after intake, or through a short-lived intake slot. It also defines expiration, retry, abandonment, duplicate submission, and unavailable-form behavior. A member cannot hold indefinite support capacity by leaving a modal incomplete.

### 31.15 Eligibility policy

Eligibility may include:

- Current guild membership and screening state.
- Allowlisted, blacklisted, or required roles.
- Explicit member allow or deny entries.
- Active sanction, account age, membership age, or protected-user policy.
- Existing active case relations by template, group, queue, or tenant.
- Cooldown since open, resolution, close, or cancellation.
- Availability schedule and bypass capabilities.
- Intake completion and required answer or asset state.

Rules have explicit precedence. Hard platform safety denial wins, then tenant deny, template deny, allow or whitelist requirement, bypass of named non-safety gates, and ordinary eligibility. A bypass never implies staff access or resource permissions.

Unavailable membership, role, policy, Form Workflow, or capacity facts fail closed for new resource creation unless the template declares a safe non-destructive degraded mode.

### 31.16 Atomic capacity and cooldown reservation

Applicable capacity scopes may include tenant live cases, template live cases, member live cases, member-template live cases, staff queue, route or category, priority class, and admitted custom policy groups. Each scope has hard limit, counted states, bypass policy, and release boundary.

Support Case reserves all applicable scopes and the member cooldown inside one serializable local transaction or equivalent conditional-write boundary. It uses deterministic scope order to avoid deadlocks. The same transaction allocates the next support number, creates the case, appends the opening event, and writes the outbox.

The transaction either commits every reservation and case fact or none. Count-then-insert outside this boundary is prohibited. A bypass is recorded on each affected reservation and cannot exceed non-bypassable platform or provider safety limits.

Capacity is released exactly once when the case reaches the configured resolved, closing, or closed boundary. Reopen creates a new generation and reacquires capacity before changing terminal state.

### 31.17 Support number allocation

Support number is a monotonically increasing display identifier unique within a declared tenant sequence. It is allocated inside case admission, never reused after rejection, deletion, or retention, and never treated as globally unique.

The sequence may be tenant-wide or explicitly partitioned by template family. Its scope cannot change without creating a new named sequence. Gaps are acceptable evidence of rolled-back or reserved operations; operators cannot renumber historical cases.

Public and administrative lookups always combine tenant with number. Internal contracts use stable case identity.

### 31.18 Channel and thread naming

Naming templates use an allowlisted variable catalog such as case number, safe opener label, stable type key, and configured short tag. Variables have normalized forms designed for provider channel names and do not inject arbitrary display names directly.

The renderer applies Unicode normalization, lowercase policy where desired, disallowed-character replacement, repeated-separator collapse, empty fallback, length limit, and collision suffix derived from stable case identity. Provider validation runs at execution.

Renaming a member or changing a template does not automatically rename an active resource unless a separate policy requests it. An administrator edit to the channel name creates an ownership conflict or relinquishes automated naming according to policy; it is never overwritten silently.

### 31.19 Routing and overflow

A template declares ordered resource routes. Each route defines parent category or channel, admitted resource type, priority, capacity signal, required permissions, name policy override, and fallback condition.

Support Case selects and pins a route at admission from current-enough capability and capacity facts. Support Resource revalidates immediately before creation. If the chosen route is full or unavailable, it may advance through the published overflow list under the same case generation.

Creating outside all declared routes, moving unrelated channels, or deleting categories to create capacity is forbidden. A route change after opening is an explicit move operation with provider preflight, before snapshot, archive continuity, and conflict handling.

### 31.20 Private resource provisioning

The required provisioning plan normally includes:

1. Reserve one resource-operation identity and lease.
2. Load immutable template, case generation, selected route, and desired access.
3. Preflight current parent, capacity, bot permissions, staff roles, and provider constraints.
4. Persist the ordered effect plan.
5. Create the private text channel or admitted private thread.
6. Persist the provider binding before dependent mutation.
7. Converge policy-owned access.
8. Publish opening and control presentations.
9. Publish optional mention-safe notification and log projections.
10. Mark the resource active or expose exact partial state.

The case may become `Open` when the private resource and minimum access are confirmed, even if optional opening, control, or log messages are degraded. The template declares which effects are required.

### 31.21 Access model

Access relations are opener, participant, staff pool, assigned staff, observer, bot, explicitly denied principal, and temporary guest. Each relation compiles to the smallest required Discord overwrite or thread membership and declares its owner.

Default private-channel policy denies guild-wide view, grants the bot only required management and message capabilities, grants opener and participants bounded conversation access, and grants staff according to access role policy. Notification roles receive no access unless separately configured.

Permission compilation preserves unrelated bits and overwrites. An owner can remove only claims it owns. Current provider state and fingerprint are checked before mutation. Partial multi-principal convergence remains visible.

### 31.22 Staff roles and action authority

Staff policy separates:

- `AccessStaff`: may view and participate.
- `ClaimStaff`: may claim or unclaim.
- `ManageParticipants`: may add or remove participants.
- `ResolveStaff`: may mark resolution or close.
- `EscalationStaff`: may receive or accept escalation.
- `TranscriptViewer`: may view archive artifacts.
- `SupportAdministrator`: may override workflow under audited rules.

These may map to Discord roles or workload capabilities. `ManageGuild` may be one configured source for administrator capability but does not bypass tenant safety rules automatically.

Claim authority does not imply destructive resource cleanup. Transcript authority does not imply access to all form fields. Staff-role removal invalidates future actions immediately; it does not rewrite prior event attribution.

### 31.23 Opener and participant authority

The opener may view, send, attach, close, reopen, add participants, or withdraw only as explicitly permitted. `OpenerCanClose` grants only the close transition under current case state; it is never treated as staff authority.

Participants have versioned relations with added-by identity, source, time, access state, and removal. A participant cannot add another participant unless policy grants it. Removing a participant converges resource access but retains event history and transcript attribution.

The opener leaving the guild does not delete the case automatically. Policy may restrict interaction, notify staff, resolve, retain, or close after a durable occurrence.

### 31.24 Opening and control messages

Opening presentation may include safe opener mention, support number, ticket type, intake summary, expectations, availability, service-level target, and privacy notice. Only allowlisted form fields and variables may render.

The control presentation exposes actions currently allowed by case state and actor class. It is a projection; hidden buttons do not replace authorization, and stale visible buttons cannot force a transition.

Messages are versioned Delivery intents with explicit mentions, destinations, deadlines, and post-send effects. Pinning is a separate provider effect. Failure to send or pin controls does not erase the case or private resource.

### 31.25 Case state and claim behavior

The authoritative state machine is defined in Section 10.24. Legal transitions depend on expected case version, actor capability, template policy, and current resource or archive prerequisites.

Claim is a compare-and-set from unassigned state to one staff assignment. Concurrent claims produce one winner. Unclaim records the prior assignment and may be limited to current assignee or supervisor. Assignment history is append-only.

Claim mode may be manual, automatic by queue, round-robin, least-active, or external routing only after the policy defines current workload facts and fairness. A notification acknowledgment is not a claim.

### 31.26 Waiting, priority, tags, and escalation

Waiting state identifies who or what is awaited, reason class, entered time, deadline behavior, notification, and whether waiting time is excluded from response or resolution targets. Free-form private notes are stored separately from public reasons.

Priority and tags are versioned case attributes changed only by authorized actions. They influence queue projections and automation but do not silently grant access or bypass capacity.

Escalation may be manual or timer-driven. It records source rule, prior assignee or queue, destination staff group, priority change, notification occurrence, and acceptance state. Repeated timer delivery cannot create duplicate escalation epochs.

### 31.27 Support timers and service-level targets

Supported timer classes include first staff response, waiting reminder, inactivity warning, auto-resolve, auto-close, reopen window, transcript boundary, and delayed cleanup. Each rule defines start event, pause conditions, reset events, deadline, action, notification, bypass, and misfire behavior. Every due instant is a Durable Timer registration with Schedule. Lost wake-ups are recovered by the platform due-row sweep; Support Case retains misfire and terminal-state authority.

Every occurrence is unique by case, generation, rule, and intended boundary. Workers use fenced leases and reload current case version before acting. A message event may cancel or reschedule inactivity only through a durable case or archive fact, not process-local timeout.

Service-level measurements distinguish automation from human response and waiting-on-member from staff-controlled time. Missing Message Content does not prevent metadata-based message timing when message events are still available, but it may limit classification and transcript coverage.

### 31.28 Resolution, close, and reopen

Resolution records resolution class, actor, public summary if configured, private note reference, outcome tags, satisfaction request, archive policy, and expected case version. It does not immediately imply provider deletion.

Closing releases capacity at the policy-defined boundary, prevents ordinary new participant actions, starts transcript finalization if required, freezes or archives the resource, and schedules or executes cleanup. Each consequence has independent status.

Reopen validates allowed actor, window, prior resolution, current membership, template availability, cooldown, and fresh capacity. It increments the case generation and either reactivates a safely owned retained resource or requests a new one. Historical resource and transcript generations remain linked and immutable.

### 31.29 Auto-close and auto-delete

Auto-close requires a durable qualifying state and timer occurrence. It warns through an independent Delivery intent when configured, allows a declared grace interval, and rechecks last activity, case version, waiting state, and bypass before transition.

Auto-delete is a Support Resource cleanup action, not record deletion. It begins only after close, mandatory archive resolution, legal hold evaluation, retention delay, and ownership preflight.

Failure to delete retains the provider binding and retry state. The platform never deletes the database case or releases evidence merely to hide a Discord cleanup failure.

### 31.30 Panel and resource reconciliation

Panel reconciliation verifies active revision, application identity, destination, message existence, provider ownership, content fingerprint, component fingerprint, schedule presentation, and permission health. It is bounded by tenant, panel page, and Discord request budget.

Resource reconciliation verifies case generation, channel or thread existence, parent route, safe name ownership, required access claims, control binding, frozen or active state, archive boundary, and cleanup eligibility.

Safe repair may update an owned message, recreate an authorized orphaned panel projection, restore an owned missing access bit, remove a stale owned participant claim, attach a discovered operation-owned channel, or resume cleanup. It may not adopt ambiguous resources, overwrite external changes, recreate closed cases, or claim transcript completeness.

### 31.31 Panel deletion and stale interactions

Deleting a panel from an administrative view is a retirement workflow, not immediate data deletion. It invalidates interaction admission first, then performs the chosen message behavior, retains tombstone and audit state, and finally hides the panel from active listings.

An interaction from a retired or superseded panel returns a safe unavailable response. It cannot fall back to the current template merely because its option key still exists.

Historical panel revisions and bindings are retained while referenced by a case or audit policy. Privacy deletion removes presentation content or actor identifiers according to classification without breaking case provenance.

### 31.32 Ticket logging and Activity Log boundary

Support Case publishes structured facts for open, claim, unclaim, participant, wait, escalation, resolution, close, reopen, and resource outcomes. Activity Log owns tenant activity records and optional Discord log delivery.

A configured log channel is a routing policy, not the support audit database. Log-message failure does not reverse the case event. Staff ping roles are explicit, separate from access roles, and governed by allowed mentions.

Sensitive intake, transcript, staff-note, or attachment content is excluded from ordinary activity logs. Authorized viewers follow the owning service's access path.

### 31.33 Transcript capture policy

Transcript policy declares:

- Whether capture is disabled, metadata-only, event-driven content, or event-driven plus bounded final reconciliation.
- Required Message Content capability and behavior when unavailable.
- Included resource generations, message authors, edits, deletions, replies, embeds, components, attachments, reactions, and system events.
- Identity presentation, staff-note exclusion, redaction, attachment ingestion, and content retention.
- Required completeness before cleanup and permitted incomplete outcomes.
- Artifact format, destinations, opener delivery, access lifetime, and legal hold.

Event-driven capture starts only after a case resource binding is admitted. It stores canonical provider identifiers and source times. Message edits append revisions; deletion records deletion rather than silently removing historical content unless privacy policy requires content erasure.

### 31.34 Transcript generation and delivery

Finalization pins resource generation, capture watermark, gap set, message ordering, privacy mode, policy revision, and attachment status. Generation produces a bounded immutable artifact and integrity digest through the shared rendering and Asset capabilities.

Coverage is one of complete under declared policy, incomplete with enumerated gaps, content unavailable, attachment partial, or blocked. A transcript may be delivered only when its coverage is allowed by destination policy.

Delivery to staff channel, archive destination, dashboard, or opener DM is independently authorized and tracked. Links are short-lived and access-controlled. DM failure does not cause public fallback unless expressly configured and privacy-safe.

### 31.35 Retention, redaction, and deletion

Independent retention classes apply to panel revisions, case metadata, capacity receipts, intake references, case events, participant relations, staff notes, message records, content revisions, attachments, transcripts, access records, exports, satisfaction data, and aggregate metrics.

Redaction appends an audit event and removes or replaces the authorized content while preserving lifecycle integrity. Deleting an Asset reference coordinates with Asset Service and does not leave a public provider URL as fallback.

Legal or dispute hold is explicit, authorized, time-bounded or reviewed, and visible to cleanup. Tenant deletion is a checkpointed workflow across every support owner and never deletes one side of a binding while silently retaining another.

### 31.36 Analytics and satisfaction

Privacy-safe metric facts include request count, admitted count, rejection reason class, queue time, first human response, claim duration, waiting duration, escalation, resolution duration, close duration, reopen, abandonment, transcript coverage, resource failure, and satisfaction response.

Metric definitions pin start, stop, pause, actor classification, timezone, and policy revision. Bot opening messages and automated reminders do not count as human response. Reopened cases may continue one metric lineage or create a generation metric according to the published definition.

Dashboards use aggregate projections with minimum cohort and privacy thresholds. Individual staff analytics require explicit purpose, transparency, access control, correction process, and retention; automated punitive ranking is outside this specification.

### 31.37 Operational procedures

**Publishing support policy or a ticket template:**

1. Validate authorization, precedence, roles, eligibility, capacity, cooldown, route, naming, schedule, intake, messages, automation, transcript, retention, and kill switches.
2. Preflight Form Workflow, categories, threads, roles, Message Definitions, Asset, archive, and current Discord capabilities.
3. Preview effective policy, limit exposure, provider effects, degraded behavior, and destructive cleanup implications.
4. Commit one immutable revision and dependency invalidation.
5. Warm compiled snapshots before admitting new open requests.

**Publishing a support panel:**

1. Validate destination, presentation, component mode, every option, template revision, availability, ownership, and retirement behavior.
2. Render exact preview and current provider-limit report.
3. Commit immutable revision and publication operation.
4. Project through Delivery and persist provider binding and every effect outcome.
5. Report published only after required convergence; otherwise expose degraded repair actions.

**Resolving support resource provisioning:**

1. Load case, generation, route, resource plan, bindings, access claims, attempts, and provider observations.
2. Reconcile every uncertain create or mutation before proposing retry.
3. Distinguish missing, already applied, safe retry, externally modified, orphaned, and ownership-ambiguous effects.
4. Reauthorize operator actions and compare expected versions.
5. Resume only eligible steps and preserve partial history.

**Closing a case with transcript:**

1. Commit the case resolution and archive boundary.
2. Finalize capture at a durable watermark and record gaps.
3. Generate and store the artifact with declared coverage or record terminal archive outcome.
4. Deliver authorized references independently.
5. Freeze, retain, or delete the owned resource only when the mandatory archive rule permits it.

**Repairing capacity:**

1. Fence a bounded tenant and template scope.
2. Compare active reservation states with authoritative case states and generations.
3. Report leaked, duplicate, missing, or premature releases.
4. Apply only derivable repairs with immutable audit events.
5. Require operator resolution when case history cannot prove the correct capacity owner.

### 31.38 Support-specific consistency rules

- Support policy or template revision publication and outbox publication are atomic within Support Policy Service.
- Panel revision and publication-operation creation are atomic; Discord projection remains asynchronous and versioned.
- Open admission commits capacity reservations, cooldown, number allocation, case, opening event, and outbox together.
- Form intake acceptance and Support Case admission cannot share a transaction; the immutable submission reference and open-request idempotency bridge them.
- Case transition, event sequence, timer changes, secondary-effect occurrences, and outbox are atomic inside Support Case Service.
- Support Case state and Discord resource state cannot share a transaction; every resource intent precedes provider mutation and every partial outcome is explicit.
- Participant desired state and provider access projection are separate; the case relation is authoritative while convergence remains independently observable.
- Transcript capture and case lifecycle cannot share a transaction; case close pins the archive boundary and policy determines whether cleanup must wait.
- Activity logs, notifications, transcript deliveries, and satisfaction prompts are secondary effects and cannot change a committed case transition.
- A newer policy, panel, template, or message revision never rewrites historical cases, provider bindings, transcript policy, or effect receipts.

### 31.39 Support operational kill switches

Independent authenticated, versioned, and audited controls MUST exist for:

- New panel publication, edits, relocation, schedule projection, repair, disablement, and retirement cleanup.
- New support admission globally and by template, panel, source, route, priority, or tenant.
- Intake session creation while preserving already accepted submissions and open-request resolution.
- New private-channel creation, new private-thread creation, access mutations, opening messages, control messages, pins, and log delivery.
- Claim, participant mutation, waiting, escalation, resolution, opener close, staff close, reopen, and administrative override independently.
- First-response, inactivity, waiting, escalation, auto-resolve, auto-close, and auto-delete timers independently.
- Message-content capture, attachment ingestion, transcript generation, staff delivery, opener DM, export, satisfaction, redaction, and retention deletion independently.

Disabling new admission does not close existing cases or discard pending capacity reconciliation. Disabling resource creation leaves reserved cases visibly blocked and allows safe cancellation or recovery. Disabling transcript generation does not claim a required archive boundary complete.

Disabling new access grants preserves required access removals and cleanup unless an explicit freeze blocks all resource mutation and exposes due work. Disabling panel projection still rejects interactions according to authoritative state.

No Support kill switch may stop interaction acknowledgement, Gateway heartbeats, durable event ingestion, provider rate-limit governance, case inspection, ownership reconciliation, privacy deletion, legal-hold enforcement, or visibility into pending, partial, blocked, uncertain, orphaned, and conflicted work.
