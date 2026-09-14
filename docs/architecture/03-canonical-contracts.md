# Tobot Architecture — Canonical Contracts

[Architecture index](README.md) · [Previous](02-service-topology.md) · [Next](04-runtime-flows.md)

## 8. Canonical contracts

All contracts MUST be schema-versioned, backward-readable for a defined compatibility window, and transported using a language-neutral serialization format. Unknown additive fields MUST be tolerated. Breaking semantic changes require a new major schema version.

### 8.1 Event envelope

| Field | Required | Meaning |
|---|---:|---|
| event_id | Yes | Globally unique platform event identifier |
| schema_name | Yes | Stable canonical event name |
| schema_version | Yes | Contract version |
| occurred_at | Yes | Time reported or inferred for the source event |
| received_at | Yes | Time accepted by the platform edge |
| application_id | Yes | Discord application identity |
| guild_id | Conditional | Tenant key for guild-scoped events |
| shard_id | Conditional | Gateway shard that received the event |
| session_id | Conditional | Gateway session identity |
| gateway_sequence | Conditional | Relative event position within the session |
| correlation_id | Yes | Cross-service workflow correlation |
| causation_id | Conditional | Event or command that caused this event |
| trace_context | Yes | Distributed trace propagation fields |
| payload | Yes | Canonical typed payload |

The Gateway technical deduplication key is the combination of application, shard, session, and sequence. Domain services MAY add semantic occurrence keys, but MUST NOT replace technical ingestion identity with timestamps alone.

### 8.2 Command envelope

| Field | Required | Meaning |
|---|---:|---|
| command_id | Yes | Unique command identity |
| command_name | Yes | Stable operation name |
| schema_version | Yes | Contract version |
| tenant_id | Conditional | Guild or user installation scope |
| actor | Yes | Authenticated user, service, or system actor |
| idempotency_key | Yes for mutation | Stable duplicate-suppression key |
| expected_revision | Conditional | Optimistic concurrency precondition |
| deadline | Yes | Latest useful processing time |
| trace_context | Yes | Distributed trace propagation fields |
| payload | Yes | Typed operation input |

### 8.3 Message Definition

`MessageDefinition` is a declarative, provider-neutral document. It is not a Discord request.

| Section | Functional definition |
|---|---|
| content | Optional templated textual body |
| embeds | Ordered rich-content definitions with title, description, author, footer, fields, images, color, URL, and timestamp policy |
| components | Ordered interactive layouts with stable action identifiers and access policy |
| attachments | References to owned assets or render products, never arbitrary filesystem paths |
| poll | Optional poll definition when supported by destination and provider policy |
| flags | Explicit presentation flags; incompatible combinations are rejected |
| mention_policy | Allowlist for users, roles, replied user, and everyone behavior |
| variable_policy | Declared variables, allowed contexts, escaping rules, and missing-value behavior |
| destination_policy | Allowed destination classes and fallback behavior |
| post_send_actions | Independent reactions, publication, or deletion actions |

Invariants:

- A definition MUST contain at least one renderable element.
- Published revisions are immutable.
- User-derived text MUST NOT enable mentions implicitly.
- Components that produce callbacks MUST reference registered, versioned actions.
- Attachments MUST resolve through the Asset Service.
- Provider limits MUST be validated again after variable rendering.

### 8.4 Rendered Message

| Field | Meaning |
|---|---|
| definition_revision_id | Immutable source revision |
| rendered_content | Resolved and escaped textual body |
| rendered_embeds | Resolved rich content |
| rendered_components | Resolved components and action tokens |
| resolved_attachments | Authorized artifact references with size and hash |
| allowed_mentions | Explicit provider-ready mention allowlist |
| provider_flags | Validated provider presentation flags |
| render_context_hash | Hash of normalized variables and context |
| validation_fingerprint | Version of limits and validation rules used |

### 8.5 Delivery Intent

| Field | Meaning |
|---|---|
| delivery_id | Stable delivery workflow identity |
| tenant_id | Guild or installation boundary |
| source_type | Versioned owning-domain source class such as lifecycle, schedule, moderation, community, economy, interaction, or administration |
| source_id | Source event, command, occurrence, or interaction |
| idempotency_key | Unique effect key |
| destination | Channel, thread, DM, webhook, or interaction response reference |
| definition_revision_id | Immutable message revision |
| configuration_revision_id | Immutable module policy revision |
| context_reference | Typed render context or immutable snapshot reference |
| priority | Bounded operational priority class |
| not_before | Earliest delivery time |
| deadline | Time after which delivery is no longer useful |
| retry_policy | Named bounded retry policy |
| post_send_policy | Independent optional actions |

### 8.6 Public domain events

Services publish facts, not imperative instructions. The initial public vocabulary is:

| Domain | Events |
|---|---|
| Ingress | GatewayEventAccepted, InteractionAccepted |
| Lifecycle | LifecycleDecisionCreated, LifecycleDeliveryRequested, LifecycleEventSuppressed |
| Catalog | MessageDefinitionPublished, MessageDefinitionRetired |
| Schedule | ScheduleActivated, DeliveryOccurrenceDue, SchedulePaused, ScheduleCompleted |
| Auto reply | AutoReplyMatched, AutoReplySuppressed, AutoReplyDeliveryRequested |
| Moderation | ModerationCaseOpened, ModerationActionAuthorized, ModerationActionApplied, ModerationActionRejected, ModerationActionFailed, ModerationCaseNoted, ModerationEvidenceRedacted |
| Automatic moderation | ModerationPolicyPublished, NativeRuleSynchronized, ModerationIncidentDetected, ModerationIncidentDeduplicated, ModerationEnforcementRequested, ModerationIncidentReviewed |
| Retention | RetentionPolicyPublished, CountdownDeletionDue, CleanupSweepStarted, CleanupPageCompleted, CleanupSweepPartiallyCompleted, CleanupSweepCompleted, CleanupBlocked |
| Activity | ActivityRecordCreated, ActivityAttributionResolved, ActivityRedacted, ActivityDeliveryRequested |
| Discord audit | DiscordAuditPageObserved, DiscordAuditCorrelationResolved, DiscordAuditCorrelationAmbiguous |
| Security | SecurityPolicyPublished, SecurityObservationAccepted, SecurityIncidentDetected, SecurityIncidentUpdated, SecurityThresholdCrossed, SecurityResponseRequested, SecurityIncidentContained, SecurityIncidentPartiallyContained, SecurityIncidentResolved, SecurityIncidentReviewed |
| Containment | ContainmentPreviewCreated, ContainmentRequested, ContainmentStepApplied, ContainmentStepFailed, ContainmentActive, ContainmentRestoreRequested, ContainmentRestoreConflicted, ContainmentRestored, ContainmentPartiallyRestored |
| Role assignment | RolePolicyPublished, RoleAssignmentPlanned, RoleAssignmentScheduled, RoleAssignmentApplied, RoleAssignmentUnchanged, RoleAssignmentSkipped, RoleAssignmentRetryScheduled, RoleAssignmentFailed, RoleAssignmentExpired, RoleReconciliationCompleted |
| Role panel | RolePanelPublished, RolePanelPublicationDegraded, RolePanelOrphaned, RolePanelRepaired, RolePanelRetired, RolePanelInteractionAccepted, RolePanelMappingInvalidated |
| Role resource | RoleResourceMutationRequested, RoleResourceMutationApplied, RoleResourceMutationRejected, RoleResourceMutationUncertain, RoleResourceMutationReconciled, RoleDependencyInvalidated |
| Progression | ProgressionPolicyPublished, XpAwardRecorded, XpAdjustmentRecorded, LevelChanged, LevelRewardRequested, VoiceProgressionSessionChanged, LeaderboardRefreshRequested |
| Starboard | StarboardPolicyPublished, StarContributionChanged, StarboardThresholdChanged, StarboardProjectionRequested, StarboardProjectionChanged, StarboardOrphaned, StarboardReconciled |
| Giveaway | GiveawayDrafted, GiveawayPublished, GiveawayStarted, GiveawayEntryChanged, GiveawayClosingStarted, GiveawayDrawCommitted, GiveawayEnded, GiveawayCancelled, GiveawayRerolled, GiveawayPrizeRequested |
| Forms | FormDraftChanged, FormVersionPublished, FormSubmissionAccepted, FormReceptionRequested, FormReviewRecorded, FormOutcomeEffectRequested, FormResponseRedacted, FormExportCompleted |
| Temporary rooms | RoomPolicyPublished, RoomCreationRequested, RoomCreated, RoomCreationPartial, RoomActionApplied, RoomOwnershipTransferred, RoomBecameEmpty, RoomDeletionRequested, RoomDeleted, RoomDeletionPartial, RoomReconciled |
| Monetary ledger | CurrencyPolicyPublished, AccountOpened, MonetaryTransactionPosted, FundsHeld, HoldCaptured, HoldReleased, MonetaryTransactionReversed, TransferSettled, BalanceProjectionChanged, AccountFrozen, LedgerReconciled |
| Earnings | IncomePolicyPublished, IncomeActionAdmitted, IncomeActionSettled, IncomeActionRejected, StreakChanged, SalaryDistributionStarted, SalaryDistributionCompleted, EarningsAnomalyObserved |
| Commerce | CatalogPublished, ItemRevisionPublished, StockReserved, StockReservationReleased, PurchaseOrderCreated, PurchasePaymentCaptured, PurchaseFulfillmentStarted, PurchasePartiallyFulfilled, PurchaseFulfilled, PurchaseRefundRequested, PurchaseRefunded, PurchaseReconciliationRequired |
| Entitlements | EntitlementRequested, EntitlementActivated, EntitlementActivationPartial, EntitlementExpiryDue, EntitlementRevoked, EntitlementCompensationConflicted, EntitlementReconciled, ManualFulfillmentCompleted |
| Casino | CasinoPolicyPublished, GameSessionOpened, WagerHoldRequested, GameActionAccepted, GameOutcomeCommitted, WagerSettlementRequested, GameSessionSettled, GameSessionExpired, GameSessionRecovered |
| Support policy | SupportPolicyPublished, TicketTemplatePublished, TicketTemplateDegraded, SupportCapacityPolicyChanged |
| Support panel | SupportPanelPublished, SupportPanelPublicationDegraded, SupportPanelDisabled, SupportPanelOrphaned, SupportPanelRepaired, SupportPanelRetired, SupportPanelInteractionAccepted |
| Support case | SupportOpenRequested, SupportIntakeRequested, SupportCaseOpened, SupportCaseClaimed, SupportCaseWaiting, SupportCaseEscalated, SupportCaseResolved, SupportCaseClosed, SupportCaseReopened, SupportCaseBlocked, SupportParticipantChanged |
| Support resources | SupportResourceProvisioningRequested, SupportResourceActive, SupportResourcePartial, SupportResourceAccessChanged, SupportResourceOrphaned, SupportResourceCleanupRequested, SupportResourceDeleted, SupportResourceReconciled |
| Support archive | SupportCaptureGapDetected, SupportTranscriptRequested, SupportTranscriptCompleted, SupportTranscriptIncomplete, SupportTranscriptDelivered, SupportArchiveRedacted, SupportArchiveDeleted, SupportMetricObserved |
| Integration registry | IntegrationDefinitionPublished, IntegrationEnabled, IntegrationDisabled, IntegrationRetired, ExternalIdentityResolved, ExternalIdentityInvalidated, IntegrationDependencyDegraded, IntegrationTestRequested |
| Provider event ingress | ProviderEventAuthenticated, ProviderEventDeduplicated, ProviderEventRejected, ProviderSubscriptionVerificationReceived, ProviderSubscriptionRevoked, ProviderConnectionDegraded |
| Provider observation | ProviderObservationDue, ProviderObservationCompleted, ProviderObservationInconclusive, ProviderQuotaDepleted, ProviderCircuitChanged, ProviderCoverageStale |
| Provider subscription | ProviderSubscriptionRequested, ProviderSubscriptionActive, ProviderSubscriptionDegraded, ProviderSubscriptionRevoked, ProviderSubscriptionDeletionRequested, ProviderSubscriptionAbsent, ProviderSubscriptionReconciled |
| External live signal | ExternalSessionCandidateObserved, ExternalSessionStarted, ExternalSessionUpdated, ExternalSessionEnded, ExternalSessionStale, ExternalSessionConflicted, StreamAlertOccurrenceCreated, StreamAlertOccurrenceSuppressed, StreamAlertCleanupRequested |
| Custom command definitions | CustomCommandDraftChanged, CustomCommandPublished, CustomCommandActivated, CustomCommandDegraded, CustomCommandDisabled, CustomCommandSuperseded, CustomCommandRetired, CustomCommandContributionRequested |
| Application command registry | ApplicationCommandSnapshotCompiled, ApplicationCommandConflictDetected, ApplicationCommandProjectionRequested, ApplicationCommandProjectionConverged, ApplicationCommandProjectionDegraded, ApplicationCommandDriftDetected, ApplicationCommandBindingChanged |
| Custom command runtime | CustomCommandInvocationAccepted, CustomCommandInvocationRejected, CustomCommandCooldownReserved, CustomCommandActionRequested, CustomCommandActionCompleted, CustomCommandInvocationPartiallyCompleted, CustomCommandInvocationCompleted |
| Reminders | ReminderCreated, ReminderRevised, ReminderPaused, ReminderResumed, ReminderCancelled, ReminderOccurrenceScheduled, ReminderOccurrenceDue, ReminderOccurrenceDelivered, ReminderOccurrenceRetryScheduled, ReminderOccurrenceMissed, ReminderOccurrenceDeadLettered, ReminderSnoozed |
| Delivery | DeliveryQueued, DeliveryAttempted, DeliverySucceeded, DeliveryRetryScheduled, DeliveryBlocked, DeliveryFailed, DeliveryOutcomeUncertain |
| Asset | AssetFinalized, AssetRejected, AssetReferenced, AssetReleased, AssetDeleted |
| Render | RenderCompleted, RenderRejected, RenderFailed |

Internal implementation events MUST NOT be published as public contracts unless another service has a durable business dependency on them.

### 8.7 Moderation Action Request

| Field | Required | Meaning |
|---|---:|---|
| action_request_id | Yes | Stable request identity |
| tenant_id | Yes | Guild boundary |
| action_type | Yes | Warn, clear warnings, timeout, remove timeout, kick, ban, unban, purge, slowmode, lock, unlock, quarantine, remove quarantine, remove dangerous roles, or an admitted future action |
| source | Yes | Dashboard, application command, automatic moderation, security incident, or authorized internal workflow |
| actor | Yes | User or service principal requesting the action |
| subject | Conditional | Member, user, channel, message set, or role affected by the action |
| reason | Yes | Sanitized human-readable reason within provider and policy limits |
| parameters | Conditional | Typed parameters valid only for the selected action |
| evidence_references | Conditional | Immutable references to incident evidence; raw evidence is not embedded |
| policy_revision_id | Yes | Authorization and protected-target policy revision |
| idempotency_key | Yes | Semantic duplicate-suppression key |
| deadline | Yes | Latest time at which the action remains valid |
| correlation_id | Yes | End-to-end case, incident, activity, and audit correlation |

An action request MUST describe one provider mutation. Compound operator workflows create multiple explicitly ordered action requests or a bounded process manager; they MUST NOT hide several non-atomic Discord mutations behind one success flag.

### 8.8 Moderation Case

| Field | Meaning |
|---|---|
| case_id | Stable tenant-scoped public identifier |
| tenant_id | Guild owner |
| source | Manual, automatic moderation, or authorized system workflow |
| actor_snapshot | Actor identity and authority at decision time |
| subject_snapshot | Target identity and relevant hierarchy state at decision time |
| action_type | Requested moderation operation |
| reason | Sanitized reason and optional private-note references |
| status | Requested, rejected, executing, applied, failed, uncertain, compensated, or closed |
| provider_resource_ids | Discord user, member, channel, message, or audit references |
| policy_revision_id | Policy used for authorization and protected-target evaluation |
| incident_id | Optional originating automatic moderation incident |
| correlation_id | Shared workflow correlation |
| created_at | Case creation time |
| finalized_at | Time the primary mutation reached a final state |

Cases are append-only histories. Corrective changes are new case events, notes, redactions, or compensating cases; the original action record is never rewritten.

### 8.9 Automatic Moderation Incident

| Field | Meaning |
|---|---|
| incident_id | Stable incident identity |
| tenant_id | Guild boundary |
| policy_revision_id | Immutable evaluated policy revision |
| rule_id | Matched rule |
| enforcement_owner | Discord native, platform, or observe only |
| source_event_ids | Native execution and message-event identities used for deduplication |
| subject_user_id | Member or user evaluated |
| channel_id | Event channel when applicable |
| message_id | Message identity when available |
| detection | Filter category, matched policy, confidence class, and evaluation path |
| evidence_reference | Minimized encrypted evidence or hash reference according to privacy policy |
| requested_actions | Typed enforcement requests |
| action_outcomes | References to case, deletion, alert, or no-op outcomes |
| review_state | Unreviewed, confirmed, false positive, policy adjusted, or redacted |
| correlation_id | Cross-service workflow identity |

One semantic incident may be observed through both a Discord native execution event and a Gateway message event. The incident identity and ownership policy ensure that observation does not become duplicate punishment.

### 8.10 Retention Sweep Occurrence

| Field | Meaning |
|---|---|
| occurrence_id | Unique scheduled or manual sweep execution |
| tenant_id | Guild boundary |
| policy_revision_id | Immutable retention policy |
| intended_at | Scheduled civil occurrence converted to UTC |
| mode | Execute or dry run |
| scope_snapshot | Channel, thread, forum, media, and filter scope at start |
| checkpoint | Last completed provider page and partition |
| matched_count | Messages selected by policy |
| deleted_count | Confirmed deletions |
| skipped_count | Pinned, changed, out-of-scope, or already absent messages |
| failed_count | Failed deletions |
| status | Pending, running, partially completed, completed, blocked, failed, or cancelled |
| lease_token | Current fenced execution ownership |
| correlation_id | End-to-end operation correlation |

### 8.11 Security Observation

| Field | Meaning |
|---|---|
| observation_id | Stable provider-derived or deterministic event identity |
| tenant_id | Guild boundary |
| observation_type | Member join, member screening change, or privileged audit action |
| occurred_at | Provider occurrence time when available, otherwise the accepted Gateway time with provenance |
| subject_reference | Joining member or affected Discord resource |
| executor_reference | Audit executor when supplied by Discord; absent remains unknown |
| action_key | Normalized destructive-action category when applicable |
| risk_facts | Bounded facts such as account age class, bot flag, screening state, and action category |
| source_event_id | Canonical ingress event identity used for inbox deduplication |
| policy_revision_id | Immutable policy revision selected for evaluation |
| window_reservations | Raw-join, risky-join, or executor/action counter results with window bounds |
| exemption_result | Matched exemption and reason, or explicit non-exempt result |
| evidence_reference | Minimized evidence reference; never an unbounded provider payload |
| correlation_id | End-to-end incident correlation |

An observation is an immutable fact, not an instruction. Audit-log entry identity is the preferred idempotency source for privileged actions. A member-add identity is derived from tenant, member, canonical event identity, and observed join occurrence; account creation time alone is not unique evidence of a join.

### 8.12 Security Incident and Containment Request

| Field | Meaning |
|---|---|
| incident_id | Stable tenant-scoped incident identity |
| incident_type | Join raid or privileged destructive action |
| tenant_id | Guild boundary |
| policy_revision_id | Immutable policy used for every recorded decision |
| detection_key | Rule, window class, executor/action, and threshold-crossing identity |
| observation_references | Ordered references to bounded contributing observations |
| first_observed_at | First admitted observation time |
| last_observed_at | Most recent incident observation time |
| threshold_snapshot | Threshold, window, observed count, and counter class at detection |
| state | Detected, evaluating, active, contained, partially contained, failed, monitoring, resolved, or reviewed |
| response_plan_revision_id | Immutable ordered response plan selected for the incident |
| action_references | Moderation cases, containment operations, alerts, or observe-only outcomes |
| quiet_until | Earliest resolution evaluation time after the last qualifying observation |
| cooldown_until | Earliest time the same semantic sanction may be requested again |
| review_state | Unreviewed, confirmed, false positive, policy adjusted, or redacted |
| correlation_id | Shared identity across security, moderation, containment, activity, and delivery |

A containment request identifies one immutable plan and one incident or authorized operator command. It includes the requested transition, expected current state, capability-report reference, reason, deadline, and idempotency key. The plan contains ordered typed steps; the request never embeds raw Discord payloads.

### 8.13 Role Assignment Intent

| Field | Required | Meaning |
|---|---:|---|
| assignment_intent_id | Yes | Stable tenant-scoped intent identity |
| tenant_id | Yes | Guild boundary |
| member_id | Yes | Discord member receiving the desired state |
| role_id | Yes | Target Discord role |
| desired_state | Yes | Present or absent |
| source | Yes | Automatic join policy, panel interaction, expiry, sticky rejoin, reconciliation, or admitted internal workflow |
| source_event_id | Yes | Canonical event or command identity |
| policy_revision_id | Yes | Immutable role policy or panel policy governing the decision |
| ownership_key | Yes | Policy scope allowed to claim or remove this role relationship |
| group_key | Conditional | Cardinality or mutual-exclusion group when applicable |
| eligibility_snapshot | Yes | Human/bot, screening, source, exclusion, and timing facts used by the planner |
| expected_member_role_fingerprint | Conditional | Optimistic precondition for grouped changes |
| execute_at | Yes | Earliest admitted execution time |
| expires_at | Conditional | Time at which a temporary assignment should become absent |
| deadline | Yes | Latest time the intent remains valid |
| idempotency_key | Yes | Semantic duplicate-suppression identity |
| correlation_id | Yes | Cross-service event, panel, assignment, activity, and audit correlation |

One intent describes one desired member-role relation. Exclusive groups are coordinated as a bounded set of individually observable intents under one group operation; they are not falsely represented as one atomic Discord mutation.

### 8.14 Role Panel Definition

| Field | Meaning |
|---|---|
| panel_id | Stable tenant-scoped panel identity |
| tenant_id | Guild boundary |
| revision_id | Immutable desired panel revision |
| destination | Guild channel and bound message identity when known |
| ownership_mode | Platform-managed message or linked external message |
| transport | Reaction, button, string select, or admitted future presentation adapter |
| content_revision_reference | Optional immutable Message Definition revision |
| mappings | Stable mapping IDs with presentation key, role ID, label, description, emoji reference, and action semantics |
| activation_action | Add, remove, toggle, or no role mutation |
| deactivation_action | Add, remove, or no role mutation |
| group_policy | Minimum, maximum, exclusivity, and cross-panel group identity |
| eligibility_policy | Member, role, screening, and exclusion requirements |
| notification_policy | Silent or explicit ephemeral outcomes by result class |
| publication_state | Draft, preflight failed, publishing, published, degraded, orphaned, deleting, or deleted |
| provider_binding | Message, channel, content, component, and reaction fingerprints |
| version | Optimistic aggregate version |

Transport presentation does not define role semantics. Presets such as toggle, add only, remove only, exclusive, verification, reverse, persistent, or group lock compile into activation, deactivation, eligibility, and cardinality rules.

### 8.15 Role Resource Mutation

| Field | Meaning |
|---|---|
| mutation_id | Stable tenant-scoped mutation identity |
| tenant_id | Guild boundary |
| mutation_type | Create, update, delete, or reorder |
| actor | Authenticated user or authorized service principal |
| role_id | Existing provider role when applicable |
| desired_patch | Typed admitted fields or bounded position set |
| before_snapshot | Provider state observed immediately before execution |
| expected_fingerprint | Optimistic precondition supplied or refreshed for execution |
| privilege_delta | Added, removed, and risk-classified permission changes |
| reason | Sanitized operator reason and stable mutation reference |
| idempotency_key | Semantic duplicate-suppression identity |
| deadline | Latest valid execution time |
| status | Requested, rejected, executing, applied, failed, uncertain, reconciled, or compensated |
| provider_receipt | Returned role set, audit reference, or normalized provider evidence |
| after_snapshot | Confirmed provider state after mutation when available |
| correlation_id | Resource, activity, security, and audit correlation |

Role creation has no provider-side idempotency guarantee assumed by this specification. If the response is lost after transmission, reconciliation searches bounded role and audit observations using the mutation reference and expected attributes before any retry is authorized.

### 8.16 XP Ledger Entry and Level Transition

| Field | Meaning |
|---|---|
| ledger_entry_id | Stable tenant-scoped immutable entry identity |
| tenant_id | Guild boundary |
| member_id | Progression subject |
| source_type | Text, voice segment, admitted reaction, manual adjustment, import, reset, or restoration |
| source_event_id | Canonical event, session segment, or administrator command identity |
| policy_revision_id | Immutable policy governing eligibility and amount |
| award_basis | Base amount or range result, multiplier facts, rounding, and exclusion decision |
| delta | Signed XP change committed by this entry |
| balance_after | Authoritative balance after the transaction |
| level_before | Level derived before this entry |
| level_after | Level derived after this entry |
| idempotency_key | Unique source and revision identity |
| occurred_at | Source occurrence time |
| recorded_at | Ledger commit time |
| correlation_id | Reward, leaderboard, activity, and announcement correlation |

A level transition references the ledger entry, formula revision, every crossed level, selected reward occurrences, and announcement intent. Balance projection may be rebuilt from retained ledger entries and verified checkpoints.

### 8.17 Starboard Source Aggregate

| Field | Meaning |
|---|---|
| board_source_id | Stable identity derived from tenant, board policy, and source message |
| tenant_id | Guild boundary |
| board_policy_revision_id | Immutable board rules |
| source_channel_id | Original channel |
| source_message_id | Original message identity |
| source_author_id | Author used for eligibility when available |
| source_state | Available, unavailable, deleted, or inaccessible |
| unique_contributor_count | Current derived eligible-user count |
| threshold_state | Below, at or above threshold |
| desired_projection_state | Absent or present |
| projection_binding | Optional board channel and message reference |
| content_evidence_state | Available, redacted, unauthorized, expired, or unavailable |
| aggregate_version | Optimistic contribution revision |
| last_reconciled_at | Freshness of provider verification |
| correlation_id | Contribution, projection, and activity correlation |

Each contribution is uniquely keyed by board source, user, normalized emoji, and provider reaction direction state. The unique contributor projection counts an eligible user once even when that user holds several configured reactions.

### 8.18 Giveaway Aggregate and Draw

| Field | Meaning |
|---|---|
| giveaway_id | Stable tenant-scoped giveaway identity |
| tenant_id | Guild boundary |
| revision_id | Immutable published definition |
| state | Draft, scheduled, publishing, running, closing, ended, cancelled, or publication degraded |
| schedule | Start, close, timezone-independent instants, and misfire policy |
| eligibility_policy | Role, membership-age, account-age, bot, and admitted entry rules |
| entry_policy | Toggle or one-way semantics, per-member maximum, and visibility |
| winner_count | Number requested within policy and eligible population limits |
| projection_binding | Published Discord channel and message reference |
| aggregate_version | Optimistic transition version |
| current_draw_id | Latest committed draw when ended |
| correlation_id | Schedule, entry, draw, projection, notification, and prize correlation |

| Draw field | Meaning |
|---|---|
| draw_id | Unique immutable draw or reroll identity |
| giveaway_id | Owning giveaway |
| draw_number | Monotonic initial draw or reroll number |
| entrant_snapshot_id | Frozen eligible entrant set and hash |
| eligibility_revision_id | Exact eligibility rules used at close |
| prior_winner_policy | Whether and which prior winners are excluded |
| winner_ids | Persisted selected winners |
| randomness_receipt | Non-predictive metadata sufficient for operational audit without exposing future randomness |
| committed_at | Time winners became authoritative |

### 8.19 Form Version, Submission, and Review

| Field | Meaning |
|---|---|
| form_id | Stable tenant-scoped form identity |
| form_version_id | Immutable published schema identity |
| tenant_id | Guild boundary |
| questions | Stable question IDs, types, validation, choices, required state, and presentation |
| eligibility_policy | Member, role, submission-frequency, and closure rules |
| reviewer_policy | Actor permissions, manager roles, and viewer scope |
| privacy_policy | Identity presentation, answer classification, attachment retention, and export controls |
| publication_binding | Invitation message and channel reference |
| published_at | Version publication time |

| Submission field | Meaning |
|---|---|
| submission_id | Stable immutable response identity |
| form_version_id | Exact schema answered |
| member_id | Confidential policy subject; may be hidden from reviewers but not falsely absent from the system |
| session_id | Short-lived interaction session that admitted the submission |
| answers | Typed values keyed by immutable question ID |
| asset_references | Validated Asset Service references, never durable ephemeral URLs |
| eligibility_snapshot | Rules and member facts revalidated at commit |
| state | Received, under review, accepted, rejected, withdrawn, or redacted |
| submitted_at | Durable receipt time |
| correlation_id | Reception, review, role effect, activity, and export correlation |

A review event contains expected submission state, decision, reviewer authorization snapshot, reason, timestamp, and version. Role, thread, message, mention, or reaction effects are references with independent status.

### 8.20 Temporary Room Aggregate

| Field | Meaning |
|---|---|
| room_id | Stable platform room identity independent from provider channel IDs |
| tenant_id | Guild boundary |
| generator_revision_id | Immutable generator or existing-link policy |
| lifecycle_key | Unique tenant, generator, and owner/member creation identity |
| mode | Ephemeral join-to-create or existing-link |
| owner_id | Current owner under optimistic room version |
| state | Requested, creating, active, empty grace, deleting, deleted, partial, orphaned, or blocked |
| voice_channel_id | Bound Discord voice channel |
| text_channel_id | Optional owned or linked text channel |
| owned_overwrite_references | Snapshots for only service-owned permission values |
| current_generation | Token fencing empty timers and lifecycle retries |
| room_version | Optimistic command and ownership version |
| empty_since | Time the last eligible member left |
| correlation_id | Creation, action, timer, cleanup, activity, and notification correlation |

Every room operation contains ordered typed resource steps, a fencing token, provider request and result receipts, compensation state, deadline, and final partial accounting. Existing-link mode never owns channel deletion.

### 8.21 Monetary Transaction and Hold

| Transaction field | Meaning |
|---|---|
| transaction_id | Stable tenant-scoped immutable journal identity |
| tenant_id | Guild boundary |
| currency_id | Immutable economic unit identity, independent from display metadata |
| transaction_type | Starting grant, deposit, withdrawal, transfer, tax, adjustment, income, fine, purchase, refund, wager, payout, reversal, expiry, or admitted future class |
| source_reference | Typed owning-domain command, occurrence, order, entitlement, or game reference |
| policy_revision_id | Currency and product policy revisions authorizing the posting |
| idempotency_key | Unique semantic settlement identity |
| state | Posted or reversed; drafts are not journal transactions |
| effective_at | Business occurrence time |
| recorded_at | Commit time |
| reversal_of | Optional prior transaction reversed by equal and opposite postings |
| actor_context | Authorized user or service principal and reason class |
| correlation_id | Cross-domain and audit correlation |

Every posted transaction contains at least two immutable posting lines. Each line identifies one account, debit or credit direction, positive amount in minor virtual units, and resulting account projection version. For a currency, total debits MUST equal total credits inside the transaction.

A hold contains hold identity, account, amount, available-balance reservation, owner service, source reference, expiry, capture policy, current state, idempotency key, and optimistic version. Capture converts reserved value into one posted transaction exactly once. Release removes the reservation without creating or destroying value. Expiry follows the published owner policy and never guesses whether an external workflow succeeded.

A monetary reservation groups one or more account holds created atomically under one owner request. It supports funding policies such as wallet only, bank only, wallet then bank, or an explicitly ordered admitted account set. The group amount equals the sum of its hold lines; capture posts one balanced transaction across all funding accounts, and release terminates every still-active line atomically.

### 8.22 Income Action

| Field | Meaning |
|---|---|
| income_action_id | Stable tenant-scoped occurrence identity |
| tenant_id | Guild boundary |
| member_id | Beneficiary or initiating subject |
| action_type | Daily, weekly, monthly, salary, job, crime, robbery, activity, or authorized adjustment request |
| policy_revision_id | Immutable income rule revision |
| source_event_id | Interaction, timer occurrence, or canonical activity identity |
| eligibility_snapshot | Membership, role, channel, streak, limit, and exclusion facts with freshness |
| cooldown_key | Durable uniqueness and next-availability scope |
| decision | Accepted, rejected, skipped, won, lost, or unavailable |
| formula_receipt | Inputs, selected range value, multiplier, cap, rounding, and non-secret random decision metadata |
| monetary_request | Posting, fine, or transfer request identity sent to Monetary Ledger Service |
| settlement_state | Not required, requested, settled, rejected, uncertain, or reversed |
| idempotency_key | Semantic duplicate-suppression identity |
| correlation_id | Interaction, ledger, notification, and anomaly correlation |

### 8.23 Purchase Order and Reward Line

| Purchase field | Meaning |
|---|---|
| purchase_id | Stable tenant-scoped order identity |
| tenant_id | Guild boundary |
| buyer_id | Member account holder |
| item_revision_id | Immutable purchased catalog offer |
| unit_price | Price confirmed at admission |
| quantity | Positive bounded quantity |
| stock_reservation_id | Finite-stock claim or explicit unlimited marker |
| eligibility_snapshot | Requirements and purchase-limit facts used at commit |
| payment_reservation_id | Monetary reservation grouping one or more account holds |
| payment_transaction_id | Capture transaction when committed |
| state | Reserving, awaiting payment, paid, fulfilling, partially fulfilled, fulfilled, cancellation requested, compensating, refunding, partially refunded, refunded, failed, or reconciliation required |
| idempotency_key | Unique buyer and purchase-attempt identity |
| version | Optimistic aggregate version |
| correlation_id | Payment, reward, entitlement, delivery, and refund correlation |

Each reward line pins reward identity, type, immutable parameters, fulfillment owner, required or optional status, ordering dependency, entitlement request, current outcome, compensation policy, and attempt deadline. A purchase summary is derived from payment and reward facts; it is not a substitute for them.

### 8.24 Entitlement Aggregate

| Field | Meaning |
|---|---|
| entitlement_id | Stable tenant-scoped grant identity |
| tenant_id | Guild boundary |
| beneficiary_id | Member or explicitly admitted tenant subject |
| source_purchase_id | Purchase order and reward line that owns the request |
| entitlement_type | Role, private text channel, progression boost, economy boost, or manual fulfillment |
| grant_revision | Immutable typed desired benefit and constraints |
| ownership_key | Authority allowed to activate, renew, revoke, or compensate this benefit |
| state | Requested, activating, active, activation partial, expiring, revoked, compensation conflict, failed, or reconciled |
| starts_at | Admitted activation time |
| expires_at | Optional bounded expiry |
| provider_bindings | Role relation, channel, message, or other external effect references |
| current_generation | Timer and retry fencing token |
| version | Optimistic aggregate version |
| correlation_id | Purchase, effect, expiry, activity, and reconciliation correlation |

Manual fulfillment adds assignee policy, instructions reference, staff case state, evidence receipt, completion actor, and completion time. Delivery of a staff notification is not a completion receipt.

### 8.25 Casino Game Session and Wager

| Field | Meaning |
|---|---|
| session_id | Stable tenant-scoped game identity |
| tenant_id | Guild boundary |
| player_id | Authorized controlling member |
| game_type | Coinflip, European roulette, slots, blackjack, or admitted future game |
| rule_revision_id | Immutable game rules and payout table |
| state | Opening, awaiting choice, active, dealer turn, outcome committed, settling, settled, expired, cancelled, recovery required, or blocked |
| wager_hold_id | Monetary reservation for the active stake |
| stake | Positive bounded virtual-currency amount |
| action_sequence | Monotonic accepted player-action sequence |
| game_state | Typed rule-engine state sufficient for deterministic continuation |
| outcome_receipt | Immutable result, payout basis, and non-secret randomness evidence |
| settlement_request_id | Unique capture and payout request reference |
| message_binding | Discord interaction message projection and current presentation version |
| deadline | Inactivity or turn expiry |
| version | Optimistic session version and fencing basis |
| correlation_id | Interaction, ledger, outcome, delivery, cooldown, and recovery correlation |

An outcome is committed once before monetary settlement or public presentation. Settlement can be retried or reconciled against that outcome but cannot replace it with a new random result.

### 8.26 Ticket Template Revision

| Field | Meaning |
|---|---|
| template_revision_id | Immutable tenant-scoped ticket-type policy |
| tenant_id | Guild boundary |
| template_id | Stable template lineage |
| type_key | Stable internal type identity, not trusted component input |
| routing_policy | Primary category or parent, overflow routes, channel or thread mode |
| access_policy | Staff, notification, escalation, opener, participant, blacklist, whitelist, and bypass rules |
| admission_policy | Tenant, template, member, role, cooldown, schedule, and capacity limits |
| intake_form_revision_id | Optional immutable Form Workflow version |
| naming_policy | Validated variables, normalization, collision behavior, and provider bounds |
| message_references | Opening, control, waiting, close, reopen, and notification definition revisions |
| automation_policy | First-response, inactivity, waiting, escalation, close, and delete occurrences |
| transcript_policy | Capture, completeness, format, destinations, access, and retention |
| publication_state | Published, degraded, retired, or blocked |
| published_at | Immutable activation time |

### 8.27 Support Panel Revision and Binding

| Field | Meaning |
|---|---|
| panel_revision_id | Immutable desired panel revision |
| tenant_id | Guild boundary |
| panel_id | Stable panel lineage |
| display_name | Administrative identity not required in Discord presentation |
| enabled | Whether new interactions may be admitted |
| destination | Guild channel and optional existing message binding policy |
| presentation_revision_id | Immutable Message Definition reference |
| component_mode | Buttons or string select |
| options | Ordered stable option identities and template revision references |
| availability_policy | Optional visible or interactive schedule and bypass rules |
| retirement_policy | Disable, delete owned message, preserve tombstone, or abandon external binding |
| version | Optimistic aggregate version |

A provider binding records application identity, channel, message, ownership mode, projected panel revision, component fingerprint, last confirmed effect, health, and tombstone. An interaction token references panel, revision, option, binding generation, and action opaquely; it contains no authorization claim.

### 8.28 Support Open Request and Case

| Open-request field | Meaning |
|---|---|
| open_request_id | Stable semantic admission identity |
| tenant_id | Guild boundary |
| opener_id | Signed member identity |
| source | Panel option, application command, dashboard, or admitted workflow |
| source_binding | Panel, message, interaction, command, and option references |
| template_revision_id | Immutable ticket template selected before admission |
| intake_submission_id | Optional accepted Form Workflow submission |
| eligibility_snapshot | Member, role, schedule, cooldown, and policy facts with freshness |
| idempotency_key | Duplicate-suppression identity |
| deadline | Latest time admission remains valid |
| correlation_id | Intake, case, resource, notification, and archive correlation |

| Case field | Meaning |
|---|---|
| case_id | Stable tenant-scoped support identity |
| support_number | Unique display number within the declared tenant sequence |
| opener_id | Original member subject |
| template_revision_id | Immutable workflow policy |
| state | Intake pending, provisioning, open, claimed, waiting, escalated, resolved, closing, close blocked, closed, reopening, blocked, recovery required, or cancelled |
| capacity_reservations | Tenant, template, member, and other active-slot references |
| participant_relations | Opener, participant, staff observer, assignee, and removed relations |
| assignee_id | Current claimed staff identity when present |
| priority_and_tags | Authorized operational classification |
| resource_reference | Support Resource operation and active binding state |
| transcript_reference | Optional archive job and artifact state |
| current_generation | Reopen and automation fencing generation |
| version | Optimistic case version |
| correlation_id | Shared support workflow identity |

Every case transition is an append-only event containing expected prior state, actor authorization snapshot, reason class, policy revision, timestamp, resulting version, and secondary-effect occurrences.

### 8.29 Support Resource Operation

| Field | Meaning |
|---|---|
| operation_id | Stable tenant-scoped resource workflow identity |
| tenant_id | Guild boundary |
| case_id | Owning Support Case reference |
| case_generation | Reopen or resource generation fenced by the request |
| operation_type | Provision, change access, move route, freeze, reopen, archive presentation, or cleanup |
| desired_resource | Channel or admitted thread mode, parent, safe name, topic, and owned presentation |
| desired_access | Typed opener, participant, staff, observer, bot, and denied-principal claims |
| steps | Ordered typed provider effects with dependency and compensation metadata |
| state | Requested, preflight blocked, executing, active, partial, outcome uncertain, conflicted, orphaned, deleting, or deleted |
| lease_token | Fenced worker ownership |
| provider_bindings | Owned channel, thread, message, and overwrite identities |
| deadline | Latest useful mutation time |
| version | Optimistic workflow version |
| correlation_id | Case, provider, delivery, activity, and archive correlation |

### 8.30 Support Transcript

| Field | Meaning |
|---|---|
| transcript_id | Stable tenant-scoped archive identity |
| case_id | Owning support case reference |
| capture_policy_revision_id | Immutable privacy and completeness policy |
| resource_binding_id | Exact channel or thread generation captured |
| source_watermark | Last canonical message event or bounded provider page included |
| coverage | Complete under policy, incomplete, content unavailable, event gap, attachment partial, or permission blocked |
| message_count | Admitted message records represented |
| participant_identity_mode | Full, role-labeled, pseudonymized, or redacted |
| format | Versioned admitted artifact representation |
| asset_id | Immutable tenant Asset Service artifact |
| integrity_digest | Digest over normalized ordered archive records and policy |
| retention_class | Expiry and legal-hold behavior |
| state | Requested, capturing, generating, completed, incomplete, delivery partial, redacted, deleting, or deleted |
| generated_at | Artifact creation time |
| correlation_id | Case, archive, delivery, privacy, and audit correlation |

A transcript is a privacy-governed historical artifact, not authoritative support-case state. Missing content or events remain explicit and cannot be repaired by inventing text from logs.

### 8.31 Canonical External Identity and Provider Capability Profile

| Field | Meaning |
|---|---|
| provider_type | Stable logical provider type independent from adapter implementation |
| canonical_id | Provider-issued stable channel or broadcaster identity |
| normalized_locator | Normalized handle or channel locator retained for presentation and repair |
| display_name | Last confirmed mutable provider display name |
| canonical_url | Provider-confirmed public watch or channel URL |
| identity_revision | Monotonic identity-binding revision |
| resolution_status | Confirmed, not found, unauthorized, ambiguous, stale, migrated, or blocked |
| adapter_contract_version | Normalization and classification contract used |
| credential_scope_ref | Non-secret reference to the credential or public-access scope used |
| capability_profile_revision | Versioned provider behavior applicable to this identity |
| observed_at | Last identity confirmation time |

The capability profile declares accepted locator classes, stable identifiers, available event types, supported transport modes, observation operations, metadata fields, lifecycle signals, request grouping, pagination, quota and rate-limit semantics, credential modes, freshness classes, and known degraded alternatives. Capability availability is time-varying and never inferred from provider name alone.

### 8.32 Stream Alert Definition Revision

| Field | Meaning |
|---|---|
| alert_id | Stable tenant-scoped alert identity |
| revision_id | Immutable published revision |
| tenant_id | Guild boundary |
| provider_identity_ref | Canonical external identity and identity revision |
| destination | Typed Discord destination reference |
| message_definition_revision_id | Immutable online presentation definition |
| offline_definition_revision_id | Optional immutable offline presentation definition |
| mention_policy | Explicit allowed role, everyone, here, or none policy with authorization evidence |
| lifecycle_policy | Live-start, refresh, offline, retention, and owned-cleanup behavior |
| freshness_policy | Desired freshness class and permitted degraded mode |
| suppression_policy | Minimum confirmation, duplicate, transient-session, and quiet-time behavior |
| enabled_state | Draft, enabled, disabled, degraded, blocked, or retired |
| dependency_fingerprint | Provider, credential, destination, role, and message dependency versions |
| effective_from | Earliest observation or event time governed by this revision |
| correlation_id | Configuration, provider, transition, and delivery correlation |

### 8.33 Provider Event or Observation

| Field | Meaning |
|---|---|
| source_record_id | Stable internal receipt identity |
| provider_type | Logical provider |
| canonical_id | Stable external identity |
| source_mode | Authenticated event, event-stream message, poll, reconciliation probe, or operator verification |
| source_message_id | Provider message or request identity when available |
| source_generation | Subscription, connection, credential, or lease generation |
| classification | Live, offline, unchanged, rate limited, quota exhausted, unauthorized, forbidden, not found, unavailable, invalid, or inconclusive |
| provider_session_id | Stable live-session identifier when reported |
| event_type | Online, offline, metadata changed, revocation, keepalive, or observation |
| provider_occurred_at | Provider event time when trustworthy |
| observed_at | Time the provider state was queried or received |
| received_at | Platform durable-ingress time |
| metadata_ref | Bounded normalized title, category, start time, preview, URL, and provider extension data |
| provenance | Adapter, request, subscription, cursor, signature-verification, and classification references |
| conclusive | Whether the record may advance authoritative session state |

Provider-specific response bodies are adapter-private. Only the normalized bounded record crosses into the live-signal domain.

### 8.34 External Live Session and Alert Occurrence

| Field | Meaning |
|---|---|
| session_id | Stable internal session aggregate identity |
| provider_identity_ref | Canonical external identity |
| provider_session_id | Provider live-session identity |
| state | Unknown, candidate, live, ending, ended, stale, or conflicted |
| confirmation_basis | Event, observation, corroboration, timeout, or operator resolution |
| first_seen_at | First accepted evidence time |
| started_at | Provider start time when available |
| last_conclusive_at | Latest conclusive state evidence |
| ended_at | Confirmed or policy-inferred terminal time |
| metadata_revision | Latest accepted normalized metadata version |
| occurrence_id | Stable per-alert transition effect identity |
| alert_revision_id | Immutable alert policy used |
| transition_type | Online, refresh, offline, cleanup, or test |
| occurrence_key | Unique alert, provider session, transition, and generation key |
| delivery_id | Optional shared Delivery workflow reference |
| projection_message_id | Provider message identity after confirmed delivery |
| state_version | Optimistic aggregate version |
| correlation_id | Provider ingress, session, occurrence, delivery, and reconciliation correlation |

### 8.35 Provider Subscription Operation

| Field | Meaning |
|---|---|
| operation_id | Stable desired-state workflow identity |
| provider_type | Logical provider |
| canonical_id | Subscription condition subject |
| event_type | Provider event class requested |
| desired_state | Active or absent |
| transport_mode | Webhook, managed event stream, or another admitted provider transport |
| callback_generation | Opaque callback endpoint generation |
| secret_generation_ref | Non-secret reference to verification-secret generation |
| provider_subscription_id | Provider-owned resource identifier when known |
| condition_fingerprint | Normalized provider condition and version fingerprint |
| state | Requested, creating, verifying, active, degraded, revoked, deleting, absent, uncertain, or conflicted |
| provider_status | Last normalized external status and reason |
| lease_token | Fenced reconciler ownership |
| expires_at | Provider resource expiry when applicable |
| retry_at | Earliest eligible retry or probe time |
| correlation_id | Registry, endpoint, provider, ingress, and observation correlation |

### 8.36 Custom Command Definition Revision

| Field | Meaning |
|---|---|
| definition_id | Stable tenant-scoped custom-command identity |
| revision_id | Immutable published revision |
| command_name | Canonical application-command name |
| command_type | Admitted application-command type, initially chat input |
| description | Default description and optional localization references |
| argument_schema | Ordered typed arguments, choices, required/default/range and missing-value behavior |
| invocation_policy | Enabled state, entitlement, user, role, channel, age-restricted context, and bot policy |
| cooldown_policy | Scope, duration, capacity, reservation and user-feedback behavior |
| response_plan | Ordered bounded action descriptors referencing immutable messages and assets |
| variable_contract | Allowed variables, privacy class, source, escaping, and missing-value behavior |
| deletion_policy | Optional owned response-deletion timing and eligibility |
| dependency_fingerprint | Roles, channels, messages, assets, registry, and provider capability revisions |
| effective_from | Earliest provider interaction generation governed by the revision |
| state | Draft, published, active, degraded, blocked, superseded, or retired |

### 8.37 Application Command Registry Snapshot

| Field | Meaning |
|---|---|
| snapshot_id | Immutable desired-registry identity |
| application_id | Discord application identity |
| installation_scope | Guild or admitted global or user installation boundary |
| projection_generation | Monotonic desired-state generation |
| contributions | Ordered owner, command type, stable definition, revision, and normalized schema references |
| conflict_set | Name, type, localization, option, context, or ownership conflicts that block projection |
| desired_fingerprint | Digest of the complete normalized desired registry |
| observed_fingerprint | Last confirmed Discord registry digest |
| provider_bindings | Provider command IDs mapped to owners and definition revisions |
| operation_id | Current projection or reconciliation workflow |
| state | Compiling, ready, projecting, converged, degraded, conflicted, or retired |
| correlation_id | Owner contribution, provider operation, interaction, and drift correlation |

### 8.38 Custom Command Invocation

| Field | Meaning |
|---|---|
| invocation_id | Stable execution identity derived from the interaction receipt |
| tenant_id | Guild boundary |
| application_id | Signed provider application identity |
| provider_command_id | Discord command binding invoked |
| definition_revision_id | Immutable custom-command behavior |
| actor_id | Invoking member subject |
| interaction_context | Guild, channel, installation, command, locale, age-restricted and deadline facts |
| argument_snapshot | Validated typed option values with privacy classifications |
| variable_snapshot_ref | Immutable bounded render context |
| policy_receipt | Entitlement, user, role, channel, cooldown, concurrency, and capability decisions |
| action_occurrences | Ordered finite response-effect identities and states |
| state | Accepted, rejected, deferred, executing, partially completed, completed, expired, or failed |
| correlation_id | Interaction, definition, cooldown, response, Delivery, and Activity Log correlation |

### 8.39 Reminder Definition Revision

| Field | Meaning |
|---|---|
| reminder_id | Stable owner-scoped reminder identity |
| revision_id | Immutable reminder revision |
| tenant_id | Guild context in which the reminder was created |
| owner_id | Member who controls the reminder |
| content_ref | Bounded immutable message content or Message Catalog reference |
| schedule_spec | Relative, absolute, or bounded recurrence semantics |
| timezone_id | IANA civil-time zone used to interpret schedule input |
| ambiguity_policy | Daylight-saving gap and overlap resolution |
| recurrence_policy | Frequency, count, end boundary, catch-up and misfire behavior |
| delivery_route_policy | DM, origin channel, configured channel, admitted fallback, and privacy behavior |
| origin_reference | Optional guild, channel, message and jump-link metadata |
| mention_policy | Owner-only or no-mention behavior for channel delivery |
| state | Active, paused, completed, cancelled, expired, superseded, or deleted by retention |
| version | Optimistic aggregate version |

### 8.40 Reminder Occurrence

| Field | Meaning |
|---|---|
| occurrence_id | Stable immutable scheduled-delivery identity |
| reminder_revision_id | Frozen definition revision |
| occurrence_key | Unique reminder, schedule generation, and intended instant key |
| intended_at | UTC instant at which the occurrence becomes due |
| local_time_receipt | Civil time, timezone rules version, offset, ambiguity decision, and parser version |
| content_snapshot_ref | Immutable execution content |
| delivery_route_policy | Frozen ordered route plan |
| origin_reference | Frozen optional creation-message reference |
| state | Pending, claimed, delivering, delivered, retry scheduled, cancelled, missed, expired, dead letter, or superseded |
| lease_token | Fenced worker ownership |
| attempts | Bounded normalized attempt history references |
| next_attempt_at | Earliest retry time |
| deadline | Time after which delivery is no longer useful |
| delivered_at | Confirmed completion time |
| correlation_id | Definition, schedule, claim, Delivery, cancellation, and audit correlation |

### 8.41 Authenticated Session and Guild Authority Observation

| Field | Meaning |
|---|---|
| session_id | Opaque platform session identity; never a Discord token |
| account_id | Stable platform account linked to the provider subject |
| credential_generation | Revocation generation against which every request is checked |
| authentication_strength | Authentication and recent-verification class available to policy |
| issued_at | Session creation time |
| idle_expires_at | Sliding inactivity boundary |
| absolute_expires_at | Non-extendable session boundary |
| guild_observations | Bounded guild identifiers, owner flags, permission bits, source, observation time, and expiry |
| state | Active, expired, revoked, compromised, or terminated |
| correlation_id | OAuth transaction, session, revalidation, and audit correlation |

Guild observations support discovery only. A sensitive command also carries the target tenant, expected aggregate version, required platform capability, and a fresh authorization receipt from the owning service.

### 8.42 Discord Installation Aggregate

| Field | Meaning |
|---|---|
| installation_id | Stable application and Discord context identity |
| application_id | Discord application identity |
| installation_context | Guild, user, or another explicitly admitted Discord integration context |
| guild_id | Guild identity when the installation context is guild-scoped |
| generation | Monotonic authorization or repair generation |
| requested_scopes | Minimal scope set selected from the published module manifest |
| requested_permissions | Minimal bot permission set for enabled module capabilities |
| presence_observation | Provider-observed application or bot presence and observation time |
| command_projection_ref | Application Command Registry snapshot and convergence state |
| module_capabilities | Per-module healthy, degraded, blocked, unavailable, or not-required results |
| state | Not installed, authorization pending, verifying, installed, degraded, removed, or conflicted |
| version | Optimistic aggregate version |

### 8.43 Commercial Catalog Revision

| Field | Meaning |
|---|---|
| catalog_revision_id | Immutable published commercial catalog identity |
| products | Stable product keys and pinned revisions for plans, add-ons, bundles, AI Credit packs, and promotions |
| components | Expanded feature, limit, perk, and AI Credit grant definitions |
| compatibility_rules | Admitted base-plan, add-on, scope, region, currency, and coexistence rules |
| pricing_references | Provider-neutral price references and effective intervals |
| tax_classification_refs | Product classification references subject to jurisdictional configuration |
| effective_from | Earliest order or subscription time that may pin this revision |
| retired_at | Optional boundary after which no new purchase may pin it |
| integrity_digest | Canonical revision digest used by checkout and reconciliation |

### 8.44 Commercial Order, Subscription, and Payment Event

| Field | Meaning |
|---|---|
| commercial_id | Stable order, subscription, invoice, refund, or dispute identity |
| billing_owner_id | Account or organization responsible for billing |
| scope_bindings | Authorized Discord installation scopes funded by the purchase |
| catalog_revision_set | Immutable product and terms revisions |
| provider_adapter | Payment adapter class, not domain behavior |
| provider_object_refs | Protected customer, checkout, payment, subscription, invoice, refund, and dispute references |
| provider_event_identity | Provider account scope and unique event identity for deduplication |
| provider_ordering | Provider occurrence time, object version, and reconciliation generation |
| state | Domain-specific commercial lifecycle state |
| effective_at | Time at which the normalized commercial transition takes effect |
| correlation_id | Checkout, webhook, reconciliation, entitlement, invoice, and audit correlation |

### 8.45 Platform Entitlement Snapshot

| Field | Meaning |
|---|---|
| projection_id | Immutable effective entitlement projection identity |
| commercial_scope | Billing owner and bound Discord installation scope |
| generation | Monotonic invalidation and cache generation |
| active_features | Stable feature keys with source and validity interval |
| effective_limits | Limit keys, units, totals, contributors, and enforcement mode |
| perks | Non-quantitative benefits and validity intervals |
| source_refs | Subscription, one-time purchase, promotion, compensation, or achievement grants |
| grace_state | None, payment grace, downgrade overage, suspended, or disputed |
| computed_at | Projection time |
| valid_until | Maximum cache lifetime before revalidation |

### 8.46 AI Credit Reservation and Usage Receipt

| Field | Meaning |
|---|---|
| reservation_id | Stable reservation identity derived from AI operation identity |
| account_id | AI Credit account within one commercial scope |
| operation_id | Billable AI operation identity |
| pricing_revision_id | Frozen internal rating rule |
| estimated_amount | Maximum credits reserved before provider execution |
| lot_allocations | Source-aware credit lots and reserved amounts |
| actual_amount | Final rated charge after normalized usage |
| state | Requested, reserved, partially captured, captured, released, refunded, expired, or disputed |
| provider_usage_receipt | Normalized usage quantities and integrity evidence, never provider credentials |
| semantic_key | Stable duplicate-prevention identity |
| correlation_id | Entitlement, spending limit, provider attempt, settlement, refund, and audit correlation |

### 8.47 AI Operation

| Field | Meaning |
|---|---|
| operation_id | Stable idempotent AI request identity |
| operation_class | Text generation, image generation, image processing, OCR, transcription, moderation, workflow action, or character response |
| tenant_and_actor_scope | Tenant, user, character, workflow, and purpose boundaries where applicable |
| input_ref | Protected immutable input reference and privacy classification |
| model_class | Provider-neutral admitted capability and quality class |
| policy_snapshot | Moderation, spending, concurrency, retention, fallback, and deadline policy |
| pricing_revision_id | Frozen AI Credit rating revision |
| reservation_id | Required credit reservation before a billable provider call |
| attempts | Bounded provider-adapter attempts and uncertainty state |
| result_ref | Protected output reference and moderation result |
| usage_receipt | Normalized provider usage used for settlement |
| state | Requested, rejected, reserved, executing, uncertain, succeeded, failed, cancelled, or settled |

### 8.48 Template Package and Installation

| Field | Meaning |
|---|---|
| template_id | Stable package identity |
| revision_id | Immutable portable template revision |
| author_ref | Platform account attribution and publication standing |
| manifest | Component types, dependencies, permissions, resource ceilings, destructive effects, and compatibility |
| integrity_digest | Canonical package digest |
| moderation_state | Draft, scanning, review required, approved, restricted, rejected, suspended, or retired |
| target_tenant | Installation tenant and Discord installation context |
| installation_plan | Ordered typed commands grouped by owning service |
| effect_receipts | Per-step operation identity, before-state reference, outcome, and ownership evidence |
| rollback_state | Not requested, compensating, completed, partial, conflicted, or ineligible |

### 8.49 Workflow Definition and Execution

| Field | Meaning |
|---|---|
| workflow_id | Stable tenant-scoped workflow identity |
| revision_id | Immutable compiled workflow revision |
| trigger_definition | Canonical event, schedule, authenticated webhook, command, or module-event selector |
| graph | Finite typed condition and action graph with bounded expansion |
| policy_snapshot | Authorization, channel, role, level, entitlement, rate, concurrency, recursion, and deadline rules |
| dependency_manifest | Required modules, capabilities, secrets, assets, destinations, and schemas |
| execution_id | Stable trigger-event and revision execution identity |
| fact_snapshot | Immutable authoritative facts used by conditions |
| action_occurrences | Stable typed action identities and independently observable outcomes |
| state | Accepted, rejected, executing, waiting, partially completed, completed, failed, cancelled, compensating, or dead letter |
| correlation_id | Trigger, schedule, action, downstream effect, replay, and audit correlation |

### 8.50 AI Character Revision

| Field | Meaning |
|---|---|
| character_id | Stable tenant-scoped character identity |
| revision_id | Immutable published behavior revision |
| identity_presentation | Name, avatar asset, disclosure label, and optional application-owned webhook presentation |
| behavior_policy | Bounded instructions, tone, forbidden behavior, and response policy |
| channel_policy | Allowed destinations, invocation modes, mention policy, and cooldowns |
| context_policy | Conversation boundaries, maximum history, retrieval sources, and retention |
| moderation_policy | Input and output safety gates and failure behavior |
| spending_policy | Per-response, daily, monthly, and character AI Credit ceilings |
| entitlement_policy | Required feature and model-class grants |
| state | Draft, validating, active, paused, degraded, suspended, or retired |
