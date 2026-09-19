# Tobot Architecture — Support, Integration, and Automation Data

[Architecture index](README.md) · [Previous](09-data-community-and-economy.md) · [Next](10a-data-platform-access-commercial-ai.md)

### 12.11 Support policy, panel, case, resource, and archive models

```mermaid
erDiagram
    TENANT ||--o{ SUPPORT_POLICY : owns
    SUPPORT_POLICY ||--|{ SUPPORT_POLICY_REVISION : versions
    SUPPORT_POLICY_REVISION ||--o{ TICKET_TEMPLATE : defines
    TICKET_TEMPLATE ||--|{ TICKET_TEMPLATE_REVISION : versions
    TICKET_TEMPLATE_REVISION ||--o{ TEMPLATE_ROLE_RULE : authorizes
    TICKET_TEMPLATE_REVISION ||--o{ TEMPLATE_ROUTE : routes
    TICKET_TEMPLATE_REVISION ||--o{ TEMPLATE_AUTOMATION_RULE : automates
    TENANT ||--o{ SUPPORT_PANEL : owns
    SUPPORT_PANEL ||--|{ SUPPORT_PANEL_REVISION : versions
    SUPPORT_PANEL_REVISION ||--|{ SUPPORT_PANEL_OPTION : contains
    SUPPORT_PANEL_OPTION }o--|| TICKET_TEMPLATE_REVISION : binds
    SUPPORT_PANEL_REVISION ||--o{ SUPPORT_PANEL_PUBLICATION : projects
    SUPPORT_PANEL_PUBLICATION ||--o| SUPPORT_PANEL_PROVIDER_BINDING : confirms
    SUPPORT_PANEL ||--o{ PANEL_REPAIR_RUN : repairs

    SUPPORT_POLICY {
        string policy_id PK
        string tenant_id FK
        string active_revision_id FK
        string state
        int version
    }

    SUPPORT_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        json authorization
        json default_capacity
        json default_routing
        json default_messages
        json retention
        datetime published_at
    }

    TICKET_TEMPLATE {
        string template_id PK
        string policy_id FK
        string type_key
        string active_revision_id FK
        string state
        int version
    }

    TICKET_TEMPLATE_REVISION {
        string revision_id PK
        string template_id FK
        string display_name
        json eligibility
        json capacity
        json cooldown
        json naming_policy
        string intake_form_revision_id
        json transcript_policy
        datetime published_at
    }

    TEMPLATE_ROLE_RULE {
        string rule_id PK
        string revision_id FK
        string role_id
        string relation_type
        int priority
    }

    TEMPLATE_ROUTE {
        string route_id PK
        string revision_id FK
        string parent_id
        string resource_mode
        int priority
        json capacity_rule
    }

    TEMPLATE_AUTOMATION_RULE {
        string rule_id PK
        string revision_id FK
        string trigger_type
        string action_type
        json deadline_policy
        string message_revision_id
    }

    SUPPORT_PANEL {
        string panel_id PK
        string tenant_id FK
        string active_revision_id FK
        string state
        int version
    }

    SUPPORT_PANEL_REVISION {
        string revision_id PK
        string panel_id FK
        string display_name
        boolean enabled
        string destination_id
        string presentation_revision_id
        string component_mode
        json availability
        datetime published_at
    }

    SUPPORT_PANEL_OPTION {
        string option_id PK
        string revision_id FK
        string template_revision_id FK
        string label
        string description
        string emoji_ref
        string style
        int ordinal
    }

    SUPPORT_PANEL_PUBLICATION {
        string publication_id PK
        string panel_id FK
        string revision_id FK
        string operation_type
        string state
        string lease_token
        string idempotency_key UK
    }

    SUPPORT_PANEL_PROVIDER_BINDING {
        string binding_id PK
        string publication_id FK
        string application_id
        string channel_id
        string message_id UK
        string ownership_mode
        string component_fingerprint
        string health
    }

    PANEL_REPAIR_RUN {
        string run_id PK
        string panel_id FK
        string state
        string checkpoint
        int checked_count
        int repaired_count
    }
```

`SUPPORT_PANEL_PUBLICATION` and `SUPPORT_PANEL_PROVIDER_BINDING` are Support Panel aggregates (DR-015). They are not Role Panel's `ROLE_PANEL_PUBLICATION` or `ROLE_PANEL_PROVIDER_BINDING`.

```mermaid
erDiagram
    TENANT ||--o{ SUPPORT_SEQUENCE : allocates
    SUPPORT_SEQUENCE ||--o{ SUPPORT_CASE : numbers
    TICKET_TEMPLATE_REVISION ||--o{ SUPPORT_CASE : governs
    MEMBER ||--o{ SUPPORT_CASE : opens
    SUPPORT_CASE ||--o{ SUPPORT_CAPACITY_RESERVATION : consumes
    SUPPORT_CASE ||--o{ SUPPORT_CASE_EVENT : records
    SUPPORT_CASE ||--o{ SUPPORT_PARTICIPANT : includes
    SUPPORT_CASE ||--o{ SUPPORT_ASSIGNMENT : assigns
    SUPPORT_CASE ||--o{ SUPPORT_TIMER_OCCURRENCE : schedules
    SUPPORT_CASE ||--o{ SUPPORT_RESOURCE_OPERATION : provisions
    SUPPORT_RESOURCE_OPERATION ||--|{ SUPPORT_RESOURCE_STEP : contains
    SUPPORT_RESOURCE_OPERATION ||--o{ SUPPORT_RESOURCE_BINDING : binds
    SUPPORT_RESOURCE_BINDING ||--o{ SUPPORT_ACCESS_CLAIM : projects
    SUPPORT_RESOURCE_OPERATION ||--o{ SUPPORT_RESOURCE_RECONCILIATION : repairs

    SUPPORT_SEQUENCE {
        string sequence_id PK
        string tenant_id FK
        string scope_key UK
        bigint next_number
        int version
    }

    SUPPORT_CASE {
        string case_id PK
        string tenant_id FK
        bigint support_number
        string opener_id
        string template_revision_id FK
        string intake_submission_id
        string state
        string assignee_id
        string priority
        int generation
        int version
        datetime opened_at
        datetime closed_at
    }

    SUPPORT_CAPACITY_RESERVATION {
        string reservation_id PK
        string case_id FK
        string scope_type
        string scope_key
        int units
        string state
        string idempotency_key UK
        datetime released_at
    }

    SUPPORT_CASE_EVENT {
        string event_id PK
        string case_id FK
        int sequence UK
        string event_type
        string actor_type
        string actor_id
        string policy_revision_id
        json bounded_payload
        datetime occurred_at
    }

    SUPPORT_PARTICIPANT {
        string participant_id PK
        string case_id FK
        string member_id
        string relation_type
        string state
        string source_event_id
        int version
    }

    SUPPORT_ASSIGNMENT {
        string assignment_id PK
        string case_id FK
        string staff_id
        string assignment_type
        string state
        datetime assigned_at
        datetime released_at
    }

    SUPPORT_TIMER_OCCURRENCE {
        string occurrence_id PK
        string case_id FK
        int generation
        string rule_id
        string occurrence_key UK
        datetime intended_at
        string state
        string lease_token
    }

    SUPPORT_RESOURCE_OPERATION {
        string operation_id PK
        string case_id FK
        int case_generation
        string operation_type
        string state
        string lease_token
        int version
        datetime deadline
    }

    SUPPORT_RESOURCE_STEP {
        string step_id PK
        string operation_id FK
        int ordinal
        string step_type
        string resource_id
        json desired_owned_values
        json before_owned_values
        string state
    }

    SUPPORT_RESOURCE_BINDING {
        string binding_id PK
        string operation_id FK
        string resource_type
        string provider_resource_id UK
        string application_id
        string ownership_mode
        string state
    }

    SUPPORT_ACCESS_CLAIM {
        string claim_id PK
        string binding_id FK
        string principal_type
        string principal_id
        string relation_type
        json owned_permissions
        string state
        int version
    }

    SUPPORT_RESOURCE_RECONCILIATION {
        string run_id PK
        string operation_id FK
        string state
        string checkpoint
        int repaired_count
        int conflict_count
        datetime completed_at
    }
```

```mermaid
erDiagram
    SUPPORT_CASE ||--o{ SUPPORT_CAPTURE_POLICY_BINDING : archives_under
    SUPPORT_CAPTURE_POLICY_BINDING ||--o{ SUPPORT_MESSAGE_RECORD : admits
    SUPPORT_MESSAGE_RECORD ||--o{ SUPPORT_MESSAGE_REVISION : versions
    SUPPORT_MESSAGE_RECORD ||--o{ SUPPORT_ATTACHMENT_REFERENCE : references
    SUPPORT_CASE ||--o{ SUPPORT_CAPTURE_GAP : reports
    SUPPORT_CASE ||--o{ SUPPORT_TRANSCRIPT_JOB : exports
    SUPPORT_TRANSCRIPT_JOB ||--o| SUPPORT_TRANSCRIPT_ARTIFACT : produces
    SUPPORT_TRANSCRIPT_ARTIFACT ||--o{ TRANSCRIPT_DELIVERY_REFERENCE : distributes
    SUPPORT_TRANSCRIPT_ARTIFACT ||--o{ TRANSCRIPT_ACCESS_RECORD : audits
    SUPPORT_TRANSCRIPT_ARTIFACT ||--o{ SUPPORT_ARCHIVE_RETENTION : expires_through
    SUPPORT_CASE ||--o{ SUPPORT_METRIC_FACT : measures

    SUPPORT_CAPTURE_POLICY_BINDING {
        string binding_id PK
        string case_id FK
        string policy_revision_id
        string resource_binding_id
        string content_mode
        datetime started_at
        datetime ended_at
    }

    SUPPORT_MESSAGE_RECORD {
        string record_id PK
        string binding_id FK
        string provider_message_id UK
        string author_subject_id
        datetime provider_created_at
        string privacy_class
        string current_state
    }

    SUPPORT_MESSAGE_REVISION {
        string revision_id PK
        string record_id FK
        int sequence
        string content_ref
        string content_hash
        string availability
        datetime observed_at
    }

    SUPPORT_ATTACHMENT_REFERENCE {
        string reference_id PK
        string record_id FK
        string asset_id
        string provider_attachment_id
        string state
        string privacy_class
    }

    SUPPORT_CAPTURE_GAP {
        string gap_id PK
        string case_id FK
        string gap_type
        datetime from_time
        datetime to_time
        string recovery_state
    }

    SUPPORT_TRANSCRIPT_JOB {
        string job_id PK
        string case_id FK
        string format
        string identity_mode
        string source_watermark
        string state
        string lease_token
        datetime requested_at
    }

    SUPPORT_TRANSCRIPT_ARTIFACT {
        string transcript_id PK
        string job_id FK
        string asset_id
        string coverage
        string integrity_digest
        int message_count
        datetime generated_at
    }

    TRANSCRIPT_DELIVERY_REFERENCE {
        string reference_id PK
        string transcript_id FK
        string destination_type
        string delivery_id
        string state
    }

    TRANSCRIPT_ACCESS_RECORD {
        string access_id PK
        string transcript_id FK
        string actor_id
        string purpose
        datetime accessed_at
    }

    SUPPORT_ARCHIVE_RETENTION {
        string occurrence_id PK
        string transcript_id FK
        string occurrence_key UK
        datetime intended_at
        string state
        string lease_token
    }

    SUPPORT_METRIC_FACT {
        string fact_id PK
        string case_id FK
        string metric_type
        bigint duration_ms
        string classification
        datetime observed_at
    }
```

Support sequence numbers are unique only within their declared tenant scope and are never reused. Provider message, channel, and thread identities remain opaque external bindings, not primary case identity. Form submissions and Asset objects are cross-service references rather than foreign keys into another owner's tables.

### 12.12 External integration, provider observation, and stream-alert models

Integration Registry Service owns configuration and identity bindings. Provider Event Edge owns authenticated transport receipts. Provider Observation Scheduler owns poll execution. Provider Subscription Orchestrator owns provider resource convergence. External Live Signal Service owns session truth and alert occurrences. References between these stores are opaque identifiers carried by contracts, never cross-service foreign keys.

Stream channel identity is `STREAM_CANONICAL_IDENTITY` (DR-017). It is not Identity's `PLATFORM_EXTERNAL_IDENTITY`. Aliases are `STREAM_CANONICAL_IDENTITY_ALIAS`.

```mermaid
erDiagram
    PROVIDER_CAPABILITY_PROFILE ||--o{ STREAM_CANONICAL_IDENTITY : validates
    STREAM_CANONICAL_IDENTITY ||--o{ STREAM_CANONICAL_IDENTITY_ALIAS : presents_as
    STREAM_CANONICAL_IDENTITY ||--o{ STREAM_ALERT : monitored_by
    STREAM_ALERT ||--|{ STREAM_ALERT_REVISION : versions
    STREAM_ALERT_REVISION ||--o{ ALERT_DEPENDENCY_HEALTH : depends_on
    STREAM_ALERT_REVISION ||--o{ ALERT_TEST_OCCURRENCE : tests

    PROVIDER_CAPABILITY_PROFILE {
        string profile_revision_id PK
        string provider_type
        string adapter_contract_version
        json identity_capabilities
        json transport_capabilities
        json observation_capabilities
        json quota_semantics
        datetime effective_at
    }

    STREAM_CANONICAL_IDENTITY {
        string identity_id PK
        string provider_type
        string canonical_id
        string normalized_locator
        string display_name
        string canonical_url
        string resolution_status
        bigint revision
        datetime confirmed_at
    }

    STREAM_CANONICAL_IDENTITY_ALIAS {
        string alias_id PK
        string identity_id FK
        string alias_type
        string normalized_value
        datetime valid_from
        datetime valid_until
    }

    STREAM_ALERT {
        string alert_id PK
        string tenant_id
        string identity_id
        string lifecycle_state
        bigint current_revision
        datetime created_at
    }

    STREAM_ALERT_REVISION {
        string revision_id PK
        string alert_id FK
        bigint revision_number
        string destination_type
        string destination_id
        string online_definition_revision_id
        string offline_definition_revision_id
        json mention_policy
        json lifecycle_policy
        json freshness_policy
        json suppression_policy
        string dependency_fingerprint
        datetime effective_from
    }

    ALERT_DEPENDENCY_HEALTH {
        string health_id PK
        string revision_id FK
        string dependency_type
        string dependency_id
        string status
        string fingerprint
        datetime observed_at
    }

    ALERT_TEST_OCCURRENCE {
        string test_id PK
        string revision_id FK
        string idempotency_key UK
        string actor_id
        string delivery_id
        string state
        datetime requested_at
    }
```

The uniqueness boundary for an enabled definition is configurable but MUST prevent accidental duplicate monitoring of the same canonical identity and equivalent effect policy within one tenant. Multiple alert definitions for one identity are admitted only when their destinations or declared product purpose differ and tenant limits permit them.

```mermaid
erDiagram
    PROVIDER_CALLBACK_ENDPOINT ||--o{ PROVIDER_SUBSCRIPTION : receives
    PROVIDER_SUBSCRIPTION ||--o{ SUBSCRIPTION_OPERATION : changes_through
    PROVIDER_SUBSCRIPTION ||--o{ PROVIDER_INGRESS_RECEIPT : authenticates
    OBSERVATION_SCHEDULE ||--o{ OBSERVATION_ATTEMPT : executes
    OBSERVATION_BATCH ||--|{ OBSERVATION_ATTEMPT : groups
    OBSERVATION_ATTEMPT ||--o| PROVIDER_OBSERVATION : yields
    PROVIDER_INGRESS_RECEIPT ||--o| PROVIDER_OBSERVATION : normalizes
    PROVIDER_BUDGET ||--o{ PROVIDER_BUDGET_RESERVATION : allocates

    PROVIDER_CALLBACK_ENDPOINT {
        string endpoint_id PK
        string provider_type
        bigint callback_generation
        string secret_generation_ref
        string state
        datetime valid_from
        datetime valid_until
    }

    PROVIDER_SUBSCRIPTION {
        string subscription_id PK
        string provider_type
        string canonical_id
        string event_type
        string endpoint_id FK
        string provider_resource_id
        string condition_fingerprint
        string desired_state
        string observed_state
        datetime expires_at
        bigint version
    }

    SUBSCRIPTION_OPERATION {
        string operation_id PK
        string subscription_id FK
        string operation_type
        string idempotency_key UK
        string state
        string lease_token
        string provider_request_id
        datetime retry_at
    }

    PROVIDER_INGRESS_RECEIPT {
        string receipt_id PK
        string endpoint_id FK
        string provider_message_id
        bigint source_generation
        string message_type
        string authentication_result
        string acknowledgement_result
        datetime provider_timestamp
        datetime received_at
    }

    OBSERVATION_SCHEDULE {
        string schedule_id PK
        string provider_type
        string canonical_id
        string credential_scope_ref
        string mode
        datetime next_due_at
        string circuit_state
        bigint version
    }

    OBSERVATION_BATCH {
        string batch_id PK
        string provider_type
        string credential_scope_ref
        string request_shape_hash
        string lease_token
        string state
        datetime started_at
    }

    OBSERVATION_ATTEMPT {
        string attempt_id PK
        string batch_id FK
        string schedule_id FK
        string fencing_token
        string provider_request_id
        string outcome_class
        datetime observed_at
        datetime retry_at
    }

    PROVIDER_OBSERVATION {
        string observation_id PK
        string source_record_id UK
        string provider_type
        string canonical_id
        string source_mode
        string source_generation
        string classification
        string provider_session_id
        boolean conclusive
        datetime provider_occurred_at
        datetime received_at
    }

    PROVIDER_BUDGET {
        string budget_id PK
        string provider_type
        string credential_scope_ref
        string window_key
        bigint allowed_units
        bigint reserved_units
        datetime resets_at
    }

    PROVIDER_BUDGET_RESERVATION {
        string reservation_id PK
        string budget_id FK
        string attempt_id
        bigint units
        string state
        datetime expires_at
    }
```

Ingress-receipt uniqueness is scoped by provider, endpoint or connection generation, and provider message identity. Provider payload retention is bounded and may be reduced to a digest plus verification evidence after normalization. Observation batches never imply one shared classification: every requested canonical identity owns a result or an explicit inconclusive outcome.

```mermaid
erDiagram
    EXTERNAL_LIVE_SESSION ||--|{ LIVE_SESSION_EVIDENCE : supported_by
    EXTERNAL_LIVE_SESSION ||--o{ LIVE_METADATA_REVISION : describes
    EXTERNAL_LIVE_SESSION ||--o{ STREAM_ALERT_OCCURRENCE : fans_out
    STREAM_ALERT_OCCURRENCE ||--o{ ALERT_PROJECTION_BINDING : projects
    STREAM_ALERT_OCCURRENCE ||--o{ ALERT_LIFECYCLE_DEADLINE : schedules
    EXTERNAL_LIVE_SESSION ||--o{ LIVE_SIGNAL_CONFLICT : may_open

    EXTERNAL_LIVE_SESSION {
        string session_id PK
        string provider_type
        string canonical_id
        string provider_session_id
        string state
        string confirmation_basis
        bigint state_version
        datetime first_seen_at
        datetime started_at
        datetime last_conclusive_at
        datetime ended_at
    }

    LIVE_SESSION_EVIDENCE {
        string evidence_id PK
        string session_id FK
        string source_record_id UK
        string source_mode
        bigint source_generation
        string classification
        datetime source_time
        datetime accepted_at
    }

    LIVE_METADATA_REVISION {
        string metadata_revision_id PK
        string session_id FK
        bigint revision_number
        string title
        string category
        string watch_url
        string preview_asset_ref
        string metadata_hash
        datetime observed_at
    }

    STREAM_ALERT_OCCURRENCE {
        string occurrence_id PK
        string session_id FK
        string tenant_id
        string alert_revision_id
        string transition_type
        string occurrence_key UK
        string state
        string delivery_id
        datetime deadline
        datetime created_at
    }

    ALERT_PROJECTION_BINDING {
        string binding_id PK
        string occurrence_id FK
        string application_id
        string channel_id
        string message_id
        string ownership_fingerprint
        bigint projected_metadata_revision
        string state
        datetime confirmed_at
    }

    ALERT_LIFECYCLE_DEADLINE {
        string deadline_id PK
        string occurrence_id FK
        string deadline_type
        bigint generation
        string occurrence_key UK
        datetime intended_at
        string state
        string lease_token
    }

    LIVE_SIGNAL_CONFLICT {
        string conflict_id PK
        string session_id FK
        string conflict_type
        string evidence_set_hash
        string resolution_state
        datetime opened_at
        datetime resolved_at
    }
```

The live-session uniqueness rule is provider type, `STREAM_CANONICAL_IDENTITY`, and provider session identity. The alert-occurrence uniqueness rule additionally pins alert revision, transition type, and lifecycle generation. Delivery and Discord message identifiers are projection references and never determine whether the external session exists.

### 12.13 Custom command, registry, invocation, and reminder models

Custom Command Definition Service owns authored behavior. Application Command Registry owns the complete provider registry and bindings. Custom Command Runtime owns invocation decisions and reservations. Reminder Service owns personal schedule and occurrence state. Delivery IDs, Message Catalog revisions, Asset IDs, Discord roles, channels, messages, and Activity Log records are cross-service references rather than writable foreign relations.

```mermaid
erDiagram
    CUSTOM_COMMAND ||--|{ CUSTOM_COMMAND_REVISION : versions
    CUSTOM_COMMAND_REVISION ||--|{ COMMAND_ARGUMENT_REVISION : declares
    CUSTOM_COMMAND_REVISION ||--|{ COMMAND_ACTION_REVISION : executes
    CUSTOM_COMMAND_REVISION ||--o{ COMMAND_ACCESS_RULE : authorizes
    CUSTOM_COMMAND_REVISION ||--o{ COMMAND_DEPENDENCY_HEALTH : depends_on
    CUSTOM_COMMAND_REVISION ||--o| COMMAND_CONTRIBUTION : publishes

    CUSTOM_COMMAND {
        string definition_id PK
        string tenant_id
        string canonical_name
        string lifecycle_state
        bigint current_revision
        datetime created_at
    }

    CUSTOM_COMMAND_REVISION {
        string revision_id PK
        string definition_id FK
        bigint revision_number
        string command_type
        string description
        json localization_refs
        json invocation_policy
        json cooldown_policy
        string compiled_plan_hash
        string state
        datetime published_at
    }

    COMMAND_ARGUMENT_REVISION {
        string argument_id PK
        string revision_id FK
        string stable_key
        string provider_name
        string value_type
        boolean required
        json constraints
        json default_policy
        bigint position
    }

    COMMAND_ACTION_REVISION {
        string action_id PK
        string revision_id FK
        string action_type
        string message_revision_id
        string destination_policy
        json variable_contract
        json deletion_policy
        bigint position
    }

    COMMAND_ACCESS_RULE {
        string rule_id PK
        string revision_id FK
        string subject_type
        string subject_id
        string effect
        bigint priority
    }

    COMMAND_DEPENDENCY_HEALTH {
        string health_id PK
        string revision_id FK
        string dependency_type
        string dependency_id
        string state
        string fingerprint
        datetime observed_at
    }

    COMMAND_CONTRIBUTION {
        string contribution_id PK
        string revision_id FK
        string owner_service
        string normalized_schema_hash
        string desired_state
        bigint generation
    }
```

Names are unique within application installation, command type, and provider localization rules after reserved built-in contributions are composed. Argument stable keys survive provider-name localization and permit historical invocation interpretation.

```mermaid
erDiagram
    COMMAND_OWNER ||--o{ COMMAND_CONTRIBUTION_RECORD : contributes
    COMMAND_REGISTRY_SNAPSHOT ||--|{ COMMAND_SNAPSHOT_ENTRY : contains
    COMMAND_CONTRIBUTION_RECORD ||--o{ COMMAND_SNAPSHOT_ENTRY : selected_as
    COMMAND_REGISTRY_SNAPSHOT ||--o{ COMMAND_PROJECTION_OPERATION : projects
    COMMAND_PROJECTION_OPERATION ||--|{ COMMAND_PROJECTION_ATTEMPT : attempts
    COMMAND_SNAPSHOT_ENTRY ||--o| PROVIDER_COMMAND_BINDING : binds
    COMMAND_REGISTRY_SNAPSHOT ||--o{ COMMAND_REGISTRY_CONFLICT : may_have

    COMMAND_OWNER {
        string owner_id PK
        string service_identity
        string command_namespace
        string state
    }

    COMMAND_CONTRIBUTION_RECORD {
        string contribution_id PK
        string owner_id FK
        string installation_scope
        string stable_definition_id
        string definition_revision_id
        string command_type
        string command_name
        string schema_hash
        string desired_state
    }

    COMMAND_REGISTRY_SNAPSHOT {
        string snapshot_id PK
        string application_id
        string installation_scope
        bigint projection_generation
        string desired_fingerprint
        string observed_fingerprint
        string state
        datetime compiled_at
    }

    COMMAND_SNAPSHOT_ENTRY {
        string entry_id PK
        string snapshot_id FK
        string contribution_id FK
        string normalized_schema_hash
        string desired_provider_id
        bigint position
    }

    PROVIDER_COMMAND_BINDING {
        string binding_id PK
        string entry_id FK
        string application_id
        string provider_command_id
        string provider_schema_hash
        bigint projection_generation
        datetime confirmed_at
    }

    COMMAND_PROJECTION_OPERATION {
        string operation_id PK
        string snapshot_id FK
        string operation_type
        string idempotency_key UK
        string lease_token
        string state
        datetime deadline
    }

    COMMAND_PROJECTION_ATTEMPT {
        string attempt_id PK
        string operation_id FK
        string provider_request_id
        string request_fingerprint
        string outcome
        datetime attempted_at
    }

    COMMAND_REGISTRY_CONFLICT {
        string conflict_id PK
        string snapshot_id FK
        string conflict_type
        string entry_set_hash
        string state
        datetime opened_at
    }
```

Only Application Command Registry may own a provider command binding or issue a complete registry overwrite. A binding retains owner and definition revision so Interaction Edge can route without trusting a command name alone.

```mermaid
erDiagram
    CUSTOM_COMMAND_INVOCATION ||--o| CUSTOM_COMMAND_COOLDOWN_RESERVATION : reserves
    CUSTOM_COMMAND_INVOCATION ||--|{ INVOCATION_ARGUMENT : binds
    CUSTOM_COMMAND_INVOCATION ||--|{ COMMAND_ACTION_OCCURRENCE : executes
    REMINDER ||--|{ REMINDER_REVISION : versions
    REMINDER_REVISION ||--|{ REMINDER_OCCURRENCE : schedules
    REMINDER_OCCURRENCE ||--o{ REMINDER_DELIVERY_ROUTE_ATTEMPT : tries
    REMINDER_OCCURRENCE ||--o{ REMINDER_MUTATION_RECEIPT : changes_by

    CUSTOM_COMMAND_INVOCATION {
        string invocation_id PK
        string interaction_id UK
        string tenant_id
        string definition_revision_id
        string actor_id
        string context_hash
        string policy_receipt_hash
        string state
        datetime accepted_at
        datetime completed_at
    }

    CUSTOM_COMMAND_COOLDOWN_RESERVATION {
        string reservation_id PK
        string invocation_id FK
        string scope_key
        string occurrence_key UK
        datetime reserved_at
        datetime expires_at
    }

    INVOCATION_ARGUMENT {
        string value_id PK
        string invocation_id FK
        string argument_key
        string value_type
        string protected_value_ref
        string normalized_hash
        string privacy_class
    }

    COMMAND_ACTION_OCCURRENCE {
        string occurrence_id PK
        string invocation_id FK
        string action_revision_id
        string occurrence_key UK
        string delivery_id
        string state
        datetime deadline
    }

    REMINDER {
        string reminder_id PK
        string tenant_id
        string owner_id
        string lifecycle_state
        bigint current_revision
        datetime created_at
    }

    REMINDER_REVISION {
        string revision_id PK
        string reminder_id FK
        bigint revision_number
        string content_ref
        json schedule_spec
        string timezone_id
        json ambiguity_policy
        json recurrence_policy
        json delivery_route_policy
        json origin_reference
        datetime effective_at
    }

    REMINDER_OCCURRENCE {
        string occurrence_id PK
        string revision_id FK
        string occurrence_key UK
        bigint schedule_generation
        datetime intended_at
        string local_time_receipt
        string content_snapshot_ref
        string state
        string lease_token
        datetime next_attempt_at
        datetime deadline
        datetime delivered_at
    }

    REMINDER_DELIVERY_ROUTE_ATTEMPT {
        string attempt_id PK
        string occurrence_id FK
        string route_type
        string destination_id
        string delivery_id
        string outcome
        string provider_error_class
        datetime attempted_at
    }

    REMINDER_MUTATION_RECEIPT {
        string receipt_id PK
        string occurrence_id FK
        string command_id UK
        string mutation_type
        string actor_id
        bigint prior_generation
        bigint resulting_generation
        datetime applied_at
    }
```

An interaction ID creates at most one invocation. A `CUSTOM_COMMAND_COOLDOWN_RESERVATION` occurrence key is independent from delivery success and is not Auto Reply's `AUTO_REPLY_COOLDOWN_RESERVATION` (DR-015). A reminder occurrence key is reminder, schedule generation, and intended instant; recurrence expansion, retry, snooze, and reschedule cannot reuse it ambiguously.
