# Tobot Architecture — Core Data

[Architecture index](README.md) · [Previous](06-domain-relationships.md) · [Next](08-data-safety-and-access.md)

## 12. Data architecture

### 12.1 Ownership rules

- Every mutable aggregate has exactly one owning service.
- A service MUST NOT write another service's tables.
- Cross-service reads use APIs, events, or local projections; they MUST NOT use cross-service SQL joins.
- A physical relational cluster MAY host multiple service databases or schemas, but ownership and credentials remain isolated.
- Each transactional service owns its inbox and outbox in the same transactional boundary as its aggregates.
- Durable event-bus retention is not a substitute for authoritative service storage.
- Cache, compiled matchers, due-work notifications, and read projections are rebuildable.
- Object bytes and object metadata have one owner: the Asset Service.

### 12.2 Core event and delivery data model

```mermaid
erDiagram
    TENANT ||--o{ EVENT_INBOX : receives
    EVENT_INBOX ||--o| EVENT_OUTBOX : publishes
    TENANT ||--o{ DELIVERY_INTENT : owns
    DELIVERY_INTENT ||--o{ DELIVERY_ATTEMPT : executes
    DELIVERY_INTENT ||--o{ DELIVERY_ACTION : includes
    DELIVERY_INTENT ||--o| RECONCILIATION_CASE : may_require

    TENANT {
        string tenant_id PK
        string tenant_type
        datetime created_at
    }

    EVENT_INBOX {
        string event_id PK
        string tenant_id FK
        string schema_name
        int schema_version
        int shard_id
        string session_id
        bigint gateway_sequence
        datetime occurred_at
        datetime received_at
        string payload_hash
        string processing_status
    }

    EVENT_OUTBOX {
        string outbox_id PK
        string event_id FK
        string topic
        string partition_key
        datetime available_at
        datetime published_at
        int publish_attempts
    }

    DELIVERY_INTENT {
        string delivery_id PK
        string tenant_id FK
        string idempotency_key UK
        string source_type
        string source_id
        string destination_type
        string destination_id
        string definition_revision_id
        string configuration_revision_id
        string status
        datetime not_before
        datetime deadline
        datetime created_at
    }

    DELIVERY_ATTEMPT {
        string attempt_id PK
        string delivery_id FK
        int attempt_number
        string lease_token
        string provider_nonce
        string provider_message_id
        string outcome_class
        string error_code
        datetime started_at
        datetime completed_at
        datetime retry_at
    }

    DELIVERY_ACTION {
        string action_id PK
        string delivery_id FK
        string action_type
        string status
        string provider_resource_id
        string error_code
    }

    RECONCILIATION_CASE {
        string case_id PK
        string delivery_id FK
        string state
        string evidence_summary
        datetime expires_at
        datetime resolved_at
    }
```
### 12.3 Message catalog and lifecycle model

```mermaid
erDiagram
    TENANT ||--o{ MESSAGE_DEFINITION : owns
    MESSAGE_DEFINITION ||--o{ MESSAGE_REVISION : versions
    MESSAGE_REVISION ||--o{ MESSAGE_ASSET_REFERENCE : contains
    ASSET ||--o{ MESSAGE_ASSET_REFERENCE : referenced_by
    TENANT ||--o{ LIFECYCLE_CONFIGURATION : owns
    LIFECYCLE_CONFIGURATION ||--o{ LIFECYCLE_CONFIGURATION_REVISION : versions
    MESSAGE_REVISION ||--o{ LIFECYCLE_CONFIGURATION_REVISION : selected_by
    LIFECYCLE_CORRELATION ||--o| DELIVERY_INTENT_REFERENCE : resolves_to

    MESSAGE_DEFINITION {
        string definition_id PK
        string tenant_id FK
        string name
        string state
        string current_revision_id
        datetime created_at
    }

    MESSAGE_REVISION {
        string revision_id PK
        string definition_id FK
        int revision_number
        int schema_version
        string content_hash
        json definition_document
        datetime published_at
        string published_by
    }

    MESSAGE_ASSET_REFERENCE {
        string revision_id PK, FK
        string asset_id PK, FK
        string usage_type PK
    }

    ASSET {
        string asset_id PK
        string tenant_id FK
        string content_hash
        string media_type
        bigint byte_size
        string storage_key
        string lifecycle_state
        datetime created_at
    }

    LIFECYCLE_CONFIGURATION {
        string configuration_id PK
        string tenant_id FK
        string lifecycle_type
        string state
        string current_revision_id
    }

    LIFECYCLE_CONFIGURATION_REVISION {
        string revision_id PK
        string configuration_id FK
        int revision_number
        string message_revision_id FK
        json destination_policy
        json event_policy
        json variant_policy
        datetime published_at
    }

    LIFECYCLE_CORRELATION {
        string correlation_id PK
        string tenant_id FK
        string subject_user_id
        string removal_event_id
        string ban_event_id
        string state
        datetime expires_at
    }

    DELIVERY_INTENT_REFERENCE {
        string delivery_id PK
        string correlation_id FK
    }
```

### 12.4 Scheduling and automatic reply model

```mermaid
erDiagram
    TENANT ||--o{ SCHEDULE : owns
    SCHEDULE ||--o{ SCHEDULE_REVISION : versions
    SCHEDULE_REVISION ||--o{ SCHEDULE_OCCURRENCE : produces
    MESSAGE_REVISION ||--o{ SCHEDULE_REVISION : referenced_by
    TENANT ||--o{ AUTO_REPLY_RULE : owns
    AUTO_REPLY_RULE ||--o{ AUTO_REPLY_REVISION : versions
    AUTO_REPLY_REVISION ||--o{ AUTO_REPLY_RESPONSE : contains
    MESSAGE_REVISION ||--o{ AUTO_REPLY_RESPONSE : referenced_by
    AUTO_REPLY_REVISION ||--o{ COOLDOWN_RESERVATION : reserves

    SCHEDULE {
        string schedule_id PK
        string tenant_id FK
        string state
        string current_revision_id
        datetime next_run_at
        datetime created_at
    }

    SCHEDULE_REVISION {
        string revision_id PK
        string schedule_id FK
        int revision_number
        string message_revision_id FK
        string timezone
        json recurrence
        string misfire_policy
        datetime published_at
    }

    SCHEDULE_OCCURRENCE {
        string occurrence_id PK
        string schedule_id FK
        string revision_id FK
        string occurrence_key UK
        datetime intended_at
        string misfire_decision
        string delivery_id
        string status
    }

    AUTO_REPLY_RULE {
        string rule_id PK
        string tenant_id FK
        string state
        int priority
        string current_revision_id
    }

    AUTO_REPLY_REVISION {
        string revision_id PK
        string rule_id FK
        int revision_number
        string match_mode
        string normalized_trigger
        json conditions
        json response_policy
        int cooldown_seconds
        datetime published_at
    }

    AUTO_REPLY_RESPONSE {
        string response_id PK
        string revision_id FK
        string message_revision_id FK
        int weight
        int position
    }

    COOLDOWN_RESERVATION {
        string reservation_key PK
        string revision_id FK
        string subject_user_id
        datetime reserved_at
        datetime expires_at
        string delivery_id
    }
```
