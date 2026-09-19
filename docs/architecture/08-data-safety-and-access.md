# Tobot Architecture — Safety and Access Data

[Architecture index](README.md) · [Previous](07-data-core.md) · [Next](09-data-community-and-economy.md)

### 12.5 Moderation cases and automatic moderation model

```mermaid
erDiagram
    TENANT ||--o{ MODERATION_POLICY : owns
    MODERATION_POLICY ||--o{ MODERATION_POLICY_REVISION : versions
    TENANT ||--o{ MODERATION_CASE : owns
    MODERATION_CASE ||--o{ MODERATION_CASE_EVENT : records
    MODERATION_CASE ||--o{ MODERATOR_NOTE : contains
    MODERATION_CASE ||--o{ CASE_EVIDENCE_REFERENCE : references
    TENANT ||--o{ AUTO_MOD_POLICY : owns
    AUTO_MOD_POLICY ||--o{ AUTO_MOD_POLICY_REVISION : versions
    AUTO_MOD_POLICY_REVISION ||--o{ NATIVE_RULE_BINDING : may_manage
    AUTO_MOD_POLICY_REVISION ||--o{ MODERATION_INCIDENT : detects
    MODERATION_INCIDENT ||--o{ INCIDENT_EVENT_REFERENCE : observed_through
    MODERATION_INCIDENT ||--o{ MODERATION_CASE : may_create

    MODERATION_POLICY {
        string policy_id PK
        string tenant_id FK
        string state
        string current_revision_id
    }

    MODERATION_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        int revision_number
        json actor_capabilities
        json protected_targets
        json action_constraints
        json notification_policy
        datetime published_at
    }

    MODERATION_CASE {
        string case_id PK
        string tenant_id FK
        string idempotency_key UK
        string source_type
        string source_id
        string actor_id
        string subject_type
        string subject_id
        string action_type
        string reason
        string status
        string policy_revision_id FK
        string incident_id FK
        string correlation_id
        datetime created_at
        datetime finalized_at
    }

    MODERATION_CASE_EVENT {
        string case_event_id PK
        string case_id FK
        int sequence_number UK
        string event_type
        string outcome_class
        string provider_resource_id
        string error_code
        datetime occurred_at
    }

    MODERATOR_NOTE {
        string note_id PK
        string case_id FK
        string author_id
        string privacy_class
        string note_content
        datetime created_at
        datetime redacted_at
    }

    CASE_EVIDENCE_REFERENCE {
        string evidence_reference_id PK
        string case_id FK
        string evidence_type
        string resource_reference
        string content_hash
        string privacy_class
        datetime expires_at
    }

    AUTO_MOD_POLICY {
        string policy_id PK
        string tenant_id FK
        string state
        string current_revision_id
    }

    AUTO_MOD_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        int revision_number
        string enforcement_owner
        json triggers
        json scopes
        json exemptions
        json actions
        json evidence_policy
        datetime published_at
    }

    NATIVE_RULE_BINDING {
        string binding_id PK
        string revision_id FK
        string provider_rule_id UK
        string ownership_marker
        string desired_hash
        string observed_hash
        string sync_status
        datetime synchronized_at
    }

    MODERATION_INCIDENT {
        string incident_id PK
        string tenant_id FK
        string semantic_incident_key UK
        string revision_id FK
        string rule_id
        string enforcement_owner
        string subject_user_id
        string channel_id
        string message_id
        string detection_path
        string evidence_reference
        string review_state
        string correlation_id
        datetime detected_at
    }

    INCIDENT_EVENT_REFERENCE {
        string incident_id PK, FK
        string event_id PK
        string observation_type
    }
```

`MODERATION_POLICY_REVISION.protected_targets` is the protected-user and protected-role product policy (DR-020). Discord Capability MUST NOT write this aggregate.

### 12.6 Activity, audit correlation, and retention cleanup model

```mermaid
erDiagram
    TENANT ||--o{ ACTIVITY_CONFIGURATION : owns
    ACTIVITY_CONFIGURATION ||--o{ ACTIVITY_CONFIGURATION_REVISION : versions
    TENANT ||--o{ ACTIVITY_RECORD : owns
    ACTIVITY_RECORD ||--o{ ACTIVITY_ATTRIBUTION : may_have
    ACTIVITY_RECORD ||--o{ ACTIVITY_DELIVERY_REFERENCE : may_route
    TENANT ||--o{ AUDIT_CORRELATION : owns
    TENANT ||--o{ RETENTION_POLICY : owns
    RETENTION_POLICY ||--o{ RETENTION_POLICY_REVISION : versions
    RETENTION_POLICY_REVISION ||--o{ COUNTDOWN_DELETION : schedules
    RETENTION_POLICY_REVISION ||--o{ CLEANUP_OCCURRENCE : produces
    CLEANUP_OCCURRENCE ||--o{ CLEANUP_PAGE : checkpoints
    CLEANUP_PAGE ||--o{ CLEANUP_MESSAGE_RESULT : records

    ACTIVITY_CONFIGURATION {
        string configuration_id PK
        string tenant_id FK
        string state
        string current_revision_id
    }

    ACTIVITY_CONFIGURATION_REVISION {
        string revision_id PK
        string configuration_id FK
        int revision_number
        json enabled_events
        json routing_policy
        json exclusion_policy
        json content_policy
        json retention_policy
        datetime published_at
    }

    ACTIVITY_RECORD {
        string activity_id PK
        string tenant_id FK
        string semantic_event_key UK
        string category
        string event_type
        string source_type
        string source_id
        string actor_id
        string target_type
        string target_id
        string channel_id
        string content_state
        string correlation_id
        datetime occurred_at
        datetime expires_at
    }

    ACTIVITY_ATTRIBUTION {
        string attribution_id PK
        string activity_id FK
        string executor_id
        string evidence_type
        string evidence_reference
        string confidence
        datetime resolved_at
    }

    ACTIVITY_DELIVERY_REFERENCE {
        string activity_id PK, FK
        string delivery_id PK
        string route_type
    }

    AUDIT_CORRELATION {
        string correlation_id PK
        string tenant_id FK
        string provider_audit_entry_id
        string case_id
        string activity_id
        string match_state
        string confidence
        datetime observed_at
        datetime expires_at
    }

    RETENTION_POLICY {
        string policy_id PK
        string tenant_id FK
        string state
        string current_revision_id
    }

    RETENTION_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        int revision_number
        string mode
        json schedule
        json channel_scope
        json message_filter
        string misfire_policy
        json execution_limits
        datetime published_at
    }

    COUNTDOWN_DELETION {
        string deletion_id PK
        string revision_id FK
        string tenant_id FK
        string message_id
        string channel_id
        string idempotency_key UK
        datetime delete_at
        string status
        int attempt_count
        datetime retry_at
    }

    CLEANUP_OCCURRENCE {
        string occurrence_id PK
        string revision_id FK
        string tenant_id FK
        string occurrence_key UK
        string mode
        string status
        string lease_token
        int matched_count
        int deleted_count
        int skipped_count
        int failed_count
        datetime intended_at
        datetime completed_at
    }

    CLEANUP_PAGE {
        string page_id PK
        string occurrence_id FK
        string channel_id
        string thread_id
        string provider_cursor
        string status
        int attempt_count
        datetime completed_at
    }

    CLEANUP_MESSAGE_RESULT {
        string result_id PK
        string page_id FK
        string message_id
        string operation_type
        string outcome
        string error_code
    }
```

### 12.7 Security incident and containment model

The Security Policy and Incident Service owns the policy, observation, window-reservation, incident, and response-decision records. The Containment Orchestrator owns operation, lease, snapshot, step, attempt, conflict, and acknowledgement records. A distributed counter adapter may use a non-relational TTL store, but its reservation identity and threshold-crossing decision are durably anchored to the security incident database. Counter storage is coordination state, not the incident ledger.

```mermaid
erDiagram
    TENANT ||--o{ SECURITY_POLICY : owns
    SECURITY_POLICY ||--|{ SECURITY_POLICY_REVISION : versions
    SECURITY_POLICY_REVISION ||--o{ SECURITY_DETECTOR_RULE : defines
    SECURITY_POLICY_REVISION ||--o{ SECURITY_EXEMPTION : defines
    SECURITY_POLICY_REVISION ||--o{ RESPONSE_PLAN_REVISION : selects
    SECURITY_POLICY_REVISION ||--o{ SECURITY_OBSERVATION : evaluates
    SECURITY_OBSERVATION ||--o{ WINDOW_RESERVATION : records
    SECURITY_POLICY_REVISION ||--o{ SECURITY_INCIDENT : governs
    SECURITY_INCIDENT ||--|{ INCIDENT_OBSERVATION : aggregates
    SECURITY_OBSERVATION ||--o{ INCIDENT_OBSERVATION : contributes
    SECURITY_INCIDENT ||--o{ THRESHOLD_CROSSING : reserves
    SECURITY_INCIDENT ||--o{ INCIDENT_ACTION_REFERENCE : tracks
    RESPONSE_PLAN_REVISION ||--o{ CONTAINMENT_OPERATION : instantiates
    SECURITY_INCIDENT ||--o{ CONTAINMENT_OPERATION : may_request
    CONTAINMENT_OPERATION ||--|{ CONTAINMENT_STEP : contains
    CONTAINMENT_STEP ||--o| RESOURCE_SNAPSHOT : protects
    CONTAINMENT_STEP ||--o{ CONTAINMENT_ATTEMPT : executes
    CONTAINMENT_STEP ||--o{ RESTORATION_CONFLICT : may_raise
    CONTAINMENT_OPERATION ||--o| CONTAINMENT_ACKNOWLEDGEMENT : may_resolve

    SECURITY_POLICY {
        string policy_id PK
        string tenant_id FK
        string active_revision_id
        string status
        int version
    }

    SECURITY_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        int revision_number
        string activation_mode
        json evidence_policy
        datetime published_at
    }

    SECURITY_DETECTOR_RULE {
        string rule_id PK
        string revision_id FK
        string detector_type
        string counter_class
        int threshold
        int window_seconds
        int quiet_period_seconds
        int cooldown_seconds
        string response_plan_revision_id
    }

    SECURITY_EXEMPTION {
        string exemption_id PK
        string revision_id FK
        string subject_type
        string subject_id
        string detector_scope
        datetime expires_at
    }

    RESPONSE_PLAN_REVISION {
        string response_plan_revision_id PK
        string tenant_id FK
        int revision_number
        string mode
        json ordered_steps
        json fallback_policy
        datetime published_at
    }

    SECURITY_OBSERVATION {
        string observation_id PK
        string tenant_id FK
        string source_event_id UK
        string observation_type
        string subject_id
        string executor_id
        string action_key
        json risk_facts
        string policy_revision_id
        datetime occurred_at
    }

    WINDOW_RESERVATION {
        string reservation_id PK
        string observation_id FK
        string counter_key_hash
        string counter_class
        int observed_count
        datetime window_started_at
        datetime window_ends_at
    }

    SECURITY_INCIDENT {
        string incident_id PK
        string tenant_id FK
        string incident_key UK
        string incident_type
        string policy_revision_id
        string response_plan_revision_id
        string state
        datetime first_observed_at
        datetime last_observed_at
        datetime quiet_until
        datetime cooldown_until
    }

    INCIDENT_OBSERVATION {
        string incident_id FK
        string observation_id FK
        datetime linked_at
    }

    THRESHOLD_CROSSING {
        string crossing_id PK
        string incident_id FK
        string crossing_key UK
        string rule_id
        int threshold
        int observed_count
        datetime reserved_at
    }

    INCIDENT_ACTION_REFERENCE {
        string action_reference_id PK
        string incident_id FK
        string action_kind
        string external_aggregate_id
        string state
    }

    CONTAINMENT_OPERATION {
        string operation_id PK
        string tenant_id FK
        string incident_id FK
        string idempotency_key UK
        string response_plan_revision_id
        string transition
        string state
        string lease_token
        datetime deadline
        datetime started_at
        datetime completed_at
    }

    CONTAINMENT_STEP {
        string step_id PK
        string operation_id FK
        int ordinal
        string step_type
        string resource_id
        string required_state
        string state
        string precondition_hash
    }

    RESOURCE_SNAPSHOT {
        string snapshot_id PK
        string step_id FK
        string resource_type
        string resource_id
        json original_owned_values
        json applied_owned_values
        string snapshot_hash
    }

    CONTAINMENT_ATTEMPT {
        string attempt_id PK
        string step_id FK
        int attempt_number
        string fencing_token
        string provider_request_id
        string outcome
        string error_code
        datetime attempted_at
    }

    RESTORATION_CONFLICT {
        string conflict_id PK
        string step_id FK
        string current_state_hash
        string expected_applied_hash
        string resolution
        datetime detected_at
    }

    CONTAINMENT_ACKNOWLEDGEMENT {
        string acknowledgement_id PK
        string operation_id FK
        string actor_id
        string reason
        datetime acknowledged_at
    }
```

The unique incident key contains tenant, detector rule, semantic subject, response epoch, and policy revision. A new policy revision or an elapsed cooldown may admit a new incident; repeated observations inside the same latch update the existing aggregate. Observation-to-incident links may be retention-pruned after aggregate counters and evidence requirements are satisfied, while incident and action history follow the configured security audit duration.

### 12.8 Role policy, panel, assignment, and resource model

Role Policy and Assignment owns policy, desired member-role relation, assignment, timer, and reconciliation records, including Cases-owned punitive intents it executes. Role Panel owns panel, revision, mapping, `ROLE_PANEL_PUBLICATION`, `ROLE_PANEL_PROVIDER_BINDING`, projection, and health records. Role Resource owns administrative mutation history and the rebuildable `DISCORD_ROLE_PROJECTION` guild-role catalog (DR-014). Discord Capability owns rebuildable guild, member, channel, overwrite, member-role, and permission reports used for preflight; it MUST NOT write `DISCORD_ROLE_PROJECTION`. Discord remains provider-authoritative for live role bytes. Moderation Cases owns punitive desired state and MUST NOT call Transport for member-role add or remove (DR-068).

```mermaid
erDiagram
    TENANT ||--o{ ROLE_POLICY : owns
    ROLE_POLICY ||--|{ ROLE_POLICY_REVISION : versions
    ROLE_POLICY_REVISION ||--o{ ROLE_POLICY_RULE : defines
    ROLE_POLICY_REVISION ||--o{ ROLE_RELATION_CLAIM : may_create
    ROLE_POLICY_REVISION ||--o{ ROLE_ASSIGNMENT_INTENT : plans
    ROLE_PANEL ||--|{ ROLE_PANEL_REVISION : versions
    ROLE_PANEL_REVISION ||--|{ ROLE_PANEL_MAPPING : contains
    ROLE_PANEL_REVISION ||--o{ ROLE_PANEL_PUBLICATION : projects
    ROLE_PANEL_PUBLICATION ||--o{ PANEL_EFFECT_RECEIPT : records
    ROLE_PANEL ||--o| ROLE_PANEL_PROVIDER_BINDING : binds
    ROLE_PANEL_MAPPING ||--o{ ROLE_ASSIGNMENT_INTENT : requests
    ROLE_PANEL_MAPPING ||--o{ ROLE_RELATION_CLAIM : may_create
    ROLE_RELATION_CLAIM ||--o{ ROLE_ASSIGNMENT_INTENT : produces
    ROLE_ASSIGNMENT_INTENT ||--o{ ROLE_ASSIGNMENT_ATTEMPT : executes
    ROLE_ASSIGNMENT_INTENT ||--o| ROLE_EXPIRY_OCCURRENCE : may_schedule
    ROLE_POLICY_REVISION ||--o{ STICKY_ROLE_RECORD : may_retain
    ROLE_POLICY_REVISION ||--o{ ROLE_RECONCILIATION_RUN : governs
    ROLE_RECONCILIATION_RUN ||--o{ ROLE_RECONCILIATION_PAGE : checkpoints
    TENANT ||--o{ ROLE_RESOURCE_MUTATION : requests
    ROLE_RESOURCE_MUTATION ||--o{ ROLE_RESOURCE_ATTEMPT : executes
    ROLE_RESOURCE_MUTATION ||--o| ROLE_RESOURCE_RECONCILIATION : may_require
    TENANT ||--o{ DISCORD_ROLE_PROJECTION : catalogs

    ROLE_POLICY {
        string policy_id PK
        string tenant_id FK
        string policy_type
        string active_revision_id
        string status
        int version
    }

    ROLE_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        int revision_number
        string activation_mode
        json timing_policy
        json ownership_policy
        json retention_policy
        datetime published_at
    }

    ROLE_POLICY_RULE {
        string rule_id PK
        string revision_id FK
        int priority
        json predicates
        string role_id
        string desired_state
        string screening_gate
        int delay_seconds
        int duration_seconds
    }

    ROLE_RELATION_CLAIM {
        string claim_id PK
        string tenant_id FK
        string member_id
        string role_id
        string ownership_key
        string source_revision_id
        string desired_state
        string status
        datetime valid_until
        int version
    }

    ROLE_PANEL {
        string panel_id PK
        string tenant_id FK
        string active_revision_id
        string state
        int version
        datetime created_at
    }

    ROLE_PANEL_REVISION {
        string revision_id PK
        string panel_id FK
        int revision_number
        string transport
        string ownership_mode
        string content_revision_id
        json group_policy
        json notification_policy
        datetime published_at
    }

    ROLE_PANEL_MAPPING {
        string mapping_id PK
        string revision_id FK
        string transport_key
        string role_id
        string activation_action
        string deactivation_action
        json presentation
        string health
    }

    ROLE_PANEL_PUBLICATION {
        string publication_id PK
        string panel_id FK
        string revision_id FK
        string idempotency_key UK
        string state
        string lease_token
        datetime deadline
        datetime completed_at
    }

    PANEL_EFFECT_RECEIPT {
        string receipt_id PK
        string publication_id FK
        string effect_type
        string provider_resource_id
        string desired_fingerprint
        string observed_fingerprint
        string outcome
        string error_code
    }

    ROLE_PANEL_PROVIDER_BINDING {
        string binding_id PK
        string panel_id FK
        string channel_id
        string message_id
        string ownership_mode
        string binding_fingerprint
        datetime last_observed_at
    }

    ROLE_ASSIGNMENT_INTENT {
        string assignment_intent_id PK
        string tenant_id FK
        string member_id
        string role_id
        string desired_state
        string source
        string source_event_id
        string policy_revision_id
        string ownership_key
        string idempotency_key UK
        string state
        datetime execute_at
        datetime deadline
    }

    ROLE_ASSIGNMENT_ATTEMPT {
        string attempt_id PK
        string assignment_intent_id FK
        int attempt_number
        string lease_token
        string capability_report_id
        string expected_fingerprint
        string provider_request_id
        string outcome
        string error_code
        datetime attempted_at
    }

    ROLE_EXPIRY_OCCURRENCE {
        string occurrence_id PK
        string assignment_intent_id FK
        string occurrence_key UK
        datetime intended_at
        string state
        string removal_intent_id
    }

    STICKY_ROLE_RECORD {
        string sticky_record_id PK
        string revision_id FK
        string member_id
        string role_id
        string ownership_key
        datetime retained_at
        datetime expires_at
    }

    ROLE_RECONCILIATION_RUN {
        string run_id PK
        string revision_id FK
        string tenant_id FK
        string mode
        string state
        string lease_token
        int planned_count
        int changed_count
        int skipped_count
        int failed_count
    }

    ROLE_RECONCILIATION_PAGE {
        string page_id PK
        string run_id FK
        string provider_cursor
        string state
        datetime completed_at
    }

    ROLE_RESOURCE_MUTATION {
        string mutation_id PK
        string tenant_id FK
        string role_id
        string mutation_type
        string actor_id
        string idempotency_key UK
        string expected_fingerprint
        json before_snapshot
        json desired_patch
        json after_snapshot
        string state
        datetime deadline
    }

    ROLE_RESOURCE_ATTEMPT {
        string attempt_id PK
        string mutation_id FK
        int attempt_number
        string provider_request_id
        string outcome
        string error_code
        datetime attempted_at
    }

    ROLE_RESOURCE_RECONCILIATION {
        string reconciliation_id PK
        string mutation_id FK
        string evidence_state
        string decision
        datetime expires_at
        datetime resolved_at
    }

    DISCORD_ROLE_PROJECTION {
        string projection_id PK
        string tenant_id FK
        string provider_role_id
        string name
        json permissions
        int position
        boolean managed
        string fingerprint
        string observed_revision
        datetime rebuilt_at
    }
```

The role-assignment idempotency key contains tenant, member, role, desired state, ownership key, policy revision, and source event or occurrence identity. A newer policy may supersede pending work, but confirmed history is never rewritten. Panel transport keys are unique within one revision. Provider role and message identifiers are references, not aggregate keys across tenants. `DISCORD_ROLE_PROJECTION` is unique per tenant and provider role identity and is written only by Role Resource. `ROLE_PANEL_PUBLICATION` is Role Panel's publication aggregate (DR-015). It is not Support Panel's `SUPPORT_PANEL_PUBLICATION`.
