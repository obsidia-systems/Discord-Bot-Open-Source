# Tobot Architecture — Platform Access, Commercial, and AI Data

[Architecture index](README.md) · [Previous](10-data-support-integrations-automation.md) · [Next](11-partitioning-discord-backpressure.md)

### 12.14 Platform access, commercial, AI usage, template, and workflow models

This volume separates real-world commercial state from the guild virtual economy defined in section 12.10. Billing amounts, provider customers, invoices, disputes, tax evidence, subscription products, and AI Credit balances MUST NOT share accounts, journals, transaction identifiers, or mutation APIs with guild currency. Cross-service references are opaque identifiers carried by versioned contracts; no service writes another service's tables.

#### 12.14.1 Identity, session, guild authority, and installation

```mermaid
erDiagram
    PLATFORM_ACCOUNT ||--o{ EXTERNAL_IDENTITY : links
    PLATFORM_ACCOUNT ||--o{ AUTHORIZATION_SESSION : owns
    AUTHORIZATION_SESSION ||--o{ SESSION_GRANT : contains
    PLATFORM_ACCOUNT ||--o{ GUILD_ACCESS_OBSERVATION : receives
    DISCORD_APPLICATION_INSTALLATION ||--o{ INSTALLATION_GENERATION : versions
    INSTALLATION_GENERATION ||--o{ INSTALLATION_CAPABILITY_RESULT : evaluates
    INSTALLATION_GENERATION ||--o{ COMMAND_PROJECTION_REFERENCE : observes
    PLATFORM_ACCOUNT ||--o{ BILLING_OWNERSHIP_MEMBERSHIP : participates
    BILLING_OWNER ||--o{ BILLING_OWNERSHIP_MEMBERSHIP : authorizes
    BILLING_OWNER ||--o{ BILLING_SCOPE_BINDING : funds
    BILLING_SCOPE_BINDING }o--|| DISCORD_APPLICATION_INSTALLATION : applies_to

    PLATFORM_ACCOUNT {
        string account_id PK
        string status
        datetime created_at
        datetime security_changed_at
        bigint version
    }
    EXTERNAL_IDENTITY {
        string identity_id PK
        string account_id FK
        string provider
        string provider_subject_id
        string link_state
        datetime verified_at
        bigint version
    }
    AUTHORIZATION_SESSION {
        string session_id PK
        string account_id FK
        string state
        string authentication_strength
        string credential_generation
        datetime created_at
        datetime idle_expires_at
        datetime absolute_expires_at
        datetime revoked_at
        bigint version
    }
    SESSION_GRANT {
        string grant_id PK
        string session_id FK
        string audience
        string capability_set_ref
        datetime issued_at
        datetime expires_at
    }
    GUILD_ACCESS_OBSERVATION {
        string observation_id PK
        string account_id FK
        string guild_id
        string source
        string permission_bits
        boolean owner
        datetime observed_at
        datetime valid_until
    }
    DISCORD_APPLICATION_INSTALLATION {
        string installation_id PK
        string application_id
        string guild_id
        string installation_context
        string state
        string active_generation_id
        datetime last_confirmed_at
        bigint version
    }
    INSTALLATION_GENERATION {
        string generation_id PK
        string installation_id FK
        string requested_scope_set
        string requested_permission_set
        string callback_receipt_ref
        string bot_presence_state
        string command_context_state
        datetime created_at
    }
    INSTALLATION_CAPABILITY_RESULT {
        string result_id PK
        string generation_id FK
        string module_key
        string status
        string missing_capabilities
        datetime observed_at
    }
    COMMAND_PROJECTION_REFERENCE {
        string reference_id PK
        string generation_id FK
        string registry_snapshot_id
        string projection_state
        datetime observed_at
    }
    BILLING_OWNER {
        string billing_owner_id PK
        string owner_type
        string state
        bigint version
    }
    BILLING_OWNERSHIP_MEMBERSHIP {
        string membership_id PK
        string billing_owner_id FK
        string account_id FK
        string authority
        datetime valid_from
        datetime valid_until
    }
    BILLING_SCOPE_BINDING {
        string binding_id PK
        string billing_owner_id FK
        string installation_id FK
        string commercial_scope
        string state
        bigint version
    }
```

OAuth access and refresh tokens are secret material stored through the secret-management boundary. The relational model stores only encrypted-secret references, token generation, scopes, expiry, revocation state, and audit metadata. OAuth state and proof-key material are single-use, short-lived records isolated from ordinary sessions.

`GUILD_ACCESS_OBSERVATION` is a discovery hint, not durable authorization. Discord's current-user guild permission value excludes channel overwrites and implicit permissions. Every sensitive write therefore revalidates current identity, guild membership, ownership or required guild capability, installation binding, and the owning service's policy. Cached observations have short explicit freshness windows and fail closed for destructive or billing actions.

#### 12.14.2 Commercial catalog, billing, and platform entitlement

```mermaid
erDiagram
    COMMERCIAL_PRODUCT ||--|{ COMMERCIAL_PRODUCT_REVISION : versions
    COMMERCIAL_PRODUCT_REVISION ||--o{ PRODUCT_COMPONENT : expands_to
    PRODUCT_COMPONENT }o--|| FEATURE_DEFINITION : grants
    PRODUCT_COMPONENT }o--o| LIMIT_DEFINITION : modifies
    BILLING_OWNER ||--o{ COMMERCIAL_ORDER : places
    COMMERCIAL_ORDER ||--|{ ORDER_LINE : contains
    COMMERCIAL_ORDER ||--o{ CHECKOUT_ATTEMPT : initiates
    COMMERCIAL_ORDER ||--o{ PAYMENT_PROVIDER_EVENT : correlates
    BILLING_OWNER ||--o{ COMMERCIAL_SUBSCRIPTION : owns
    COMMERCIAL_SUBSCRIPTION ||--|{ SUBSCRIPTION_LINE : contains
    SUBSCRIPTION_LINE }o--|| COMMERCIAL_PRODUCT_REVISION : pins
    COMMERCIAL_SUBSCRIPTION ||--o{ SUBSCRIPTION_TRANSITION : records
    BILLING_OWNER ||--o{ PLATFORM_ENTITLEMENT : receives
    BILLING_SCOPE_BINDING ||--o{ PLATFORM_ENTITLEMENT : scopes
    PLATFORM_ENTITLEMENT }o--|| FEATURE_DEFINITION : authorizes
    PLATFORM_ENTITLEMENT ||--o{ LIMIT_GRANT : contributes
    PLATFORM_ENTITLEMENT ||--o{ PERK_GRANT : contributes
    PLATFORM_ENTITLEMENT ||--o{ ENTITLEMENT_PROJECTION_REVISION : projects

    COMMERCIAL_PRODUCT {
        string product_id PK
        string product_kind
        string stable_key
        string state
        bigint version
    }
    COMMERCIAL_PRODUCT_REVISION {
        string revision_id PK
        string product_id FK
        string display_definition_ref
        string billing_terms
        string compatibility_policy
        string tax_classification_ref
        datetime effective_from
        datetime retired_at
    }
    PRODUCT_COMPONENT {
        string component_id PK
        string revision_id FK
        string feature_id FK
        string limit_id FK
        string grant_kind
        decimal quantity
        string unit
    }
    FEATURE_DEFINITION {
        string feature_id PK
        string stable_key
        string owning_service
        string state
        bigint version
    }
    LIMIT_DEFINITION {
        string limit_id PK
        string stable_key
        string aggregation_rule
        string enforcement_mode
        string unit
        bigint version
    }
    COMMERCIAL_ORDER {
        string order_id PK
        string billing_owner_id FK
        string catalog_revision_set
        string currency
        decimal total_amount
        string state
        string semantic_key
        bigint version
    }
    ORDER_LINE {
        string order_line_id PK
        string order_id FK
        string product_revision_id
        string purchase_kind
        decimal quantity
        decimal unit_amount
        string terms_snapshot_ref
    }
    CHECKOUT_ATTEMPT {
        string checkout_attempt_id PK
        string order_id FK
        string provider_adapter
        string provider_session_ref
        string idempotency_key
        string state
        datetime expires_at
    }
    PAYMENT_PROVIDER_EVENT {
        string provider_event_id PK
        string provider_adapter
        string provider_account_scope
        string provider_object_ref
        string event_type
        string signature_generation
        datetime provider_created_at
        datetime received_at
        string processing_state
    }
    COMMERCIAL_SUBSCRIPTION {
        string subscription_id PK
        string billing_owner_id FK
        string provider_subscription_ref
        string state
        datetime current_period_start
        datetime current_period_end
        datetime grace_until
        bigint provider_version
        bigint version
    }
    SUBSCRIPTION_LINE {
        string subscription_line_id PK
        string subscription_id FK
        string product_revision_id FK
        decimal quantity
        string state
        datetime effective_at
        datetime ends_at
    }
    SUBSCRIPTION_TRANSITION {
        string transition_id PK
        string subscription_id FK
        string from_state
        string to_state
        string source_event_id
        string reason_class
        datetime effective_at
    }
    PLATFORM_ENTITLEMENT {
        string entitlement_id PK
        string billing_owner_id FK
        string binding_id FK
        string feature_id FK
        string source_kind
        string source_ref
        string state
        datetime valid_from
        datetime valid_until
        bigint generation
    }
    LIMIT_GRANT {
        string limit_grant_id PK
        string entitlement_id FK
        string limit_id
        decimal quantity
        string unit
        string precedence
        datetime valid_until
    }
    PERK_GRANT {
        string perk_grant_id PK
        string entitlement_id FK
        string perk_key
        string value_ref
        datetime valid_until
    }
    ENTITLEMENT_PROJECTION_REVISION {
        string projection_id PK
        string entitlement_id FK
        string scope_key
        string effective_features
        string effective_limits
        string state
        datetime computed_at
    }
```

Product kinds are `Plan`, `CapacityAddOn`, `ModuleAddOn`, `Bundle`, `AICreditPack`, and `Promotion`. Capacity tiers are immutable product revisions, not account levels. Bundles expand into ordinary feature, limit, perk, and AI-credit grants so downstream services never need bundle-specific logic.

An effective limit is a deterministic projection of active base grants, compatible add-on grants, and bounded promotional grants using the limit definition's aggregation and precedence rules. Usage is recorded by the owning product service or the dedicated AI ledger; the commercial service does not own every module's operational counters. A reduced limit blocks new admissions when usage exceeds capacity, while existing data remains readable and follows its independent retention policy.

Commercial subscriptions and invoices are provider-neutral aggregates. Adapter references preserve provider object identity without exposing it as domain authority. Checkout return pages are informational only. Verified asynchronous provider events and reconciliation drive payment and subscription truth. Provider events are deduplicated by provider account scope and event identity, processed under object ordering rules, and retained independently from normalized commercial transitions.

#### 12.14.3 AI Credit accounting and AI execution

```mermaid
erDiagram
    BILLING_SCOPE_BINDING ||--o{ AI_CREDIT_ACCOUNT : scopes
    AI_CREDIT_ACCOUNT ||--o{ AI_CREDIT_JOURNAL_ENTRY : records
    AI_CREDIT_ACCOUNT ||--o{ AI_CREDIT_LOT : holds
    AI_CREDIT_LOT ||--o{ AI_CREDIT_ALLOCATION : funds
    AI_OPERATION ||--|| AI_CREDIT_RESERVATION : reserves
    AI_CREDIT_RESERVATION ||--o{ AI_CREDIT_ALLOCATION : allocates
    AI_OPERATION ||--o{ AI_PROVIDER_ATTEMPT : executes
    AI_OPERATION ||--o| AI_USAGE_RECEIPT : settles
    AI_PRICING_RULE ||--|{ AI_PRICING_RULE_REVISION : versions
    AI_OPERATION }o--|| AI_PRICING_RULE_REVISION : pins
    AI_CHARACTER ||--|{ AI_CHARACTER_REVISION : versions
    AI_CHARACTER_REVISION ||--o{ AI_OPERATION : initiates

    AI_CREDIT_ACCOUNT {
        string ai_credit_account_id PK
        string binding_id FK
        string state
        decimal posted_balance
        decimal reserved_balance
        bigint version
    }
    AI_CREDIT_LOT {
        string lot_id PK
        string ai_credit_account_id FK
        string source_kind
        string source_ref
        decimal granted_amount
        decimal available_amount
        datetime granted_at
        datetime expires_at
        string refund_policy
    }
    AI_CREDIT_JOURNAL_ENTRY {
        string entry_id PK
        string ai_credit_account_id FK
        string entry_type
        decimal amount
        string source_ref
        string semantic_key
        datetime committed_at
    }
    AI_CREDIT_RESERVATION {
        string reservation_id PK
        string operation_id FK
        decimal estimated_amount
        decimal captured_amount
        string state
        datetime expires_at
        bigint version
    }
    AI_CREDIT_ALLOCATION {
        string allocation_id PK
        string reservation_id FK
        string lot_id FK
        decimal reserved_amount
        decimal captured_amount
    }
    AI_PRICING_RULE {
        string pricing_rule_id PK
        string operation_class
        string stable_key
        string state
    }
    AI_PRICING_RULE_REVISION {
        string pricing_revision_id PK
        string pricing_rule_id FK
        string rating_formula
        string provider_cost_mapping
        datetime effective_from
        datetime retired_at
    }
    AI_OPERATION {
        string operation_id PK
        string scope_key
        string actor_id
        string operation_class
        string pricing_revision_id FK
        string input_ref
        string state
        string semantic_key
        datetime deadline
        bigint version
    }
    AI_PROVIDER_ATTEMPT {
        string attempt_id PK
        string operation_id FK
        string provider_adapter
        string model_class
        string provider_request_ref
        string state
        datetime started_at
        datetime finished_at
    }
    AI_USAGE_RECEIPT {
        string usage_receipt_id PK
        string operation_id FK
        string provider_usage
        decimal rated_amount
        string result_class
        datetime settled_at
    }
    AI_CHARACTER {
        string character_id PK
        string tenant_id
        string state
        string active_revision_id
        bigint version
    }
    AI_CHARACTER_REVISION {
        string revision_id PK
        string character_id FK
        string behavior_policy_ref
        string presentation_ref
        string channel_policy
        string context_policy
        string moderation_policy
        string spending_policy
        datetime published_at
    }
```

AI Credits are the only prepaid internal unit for AI operations. They are not money, XP, capacity tiers, generic payment credits, provider tokens, or guild virtual currency. Lots preserve source, expiry, refund, and consumption order. Purchased lots normally remain non-expiring unless law, refund policy, or explicit purchase terms require otherwise; monthly and promotional lots may expire under their frozen grant terms.

Reservation, provider execution, rating, capture, release, refund, expiration, and adjustment are distinct journaled transitions. The operation pins the pricing revision before reservation. Settlement charges actual rated usage, releases unused reservation, and cannot exceed the authorized ceiling without a new explicit reservation. An uncertain provider outcome remains reserved until bounded reconciliation or the published uncertainty deadline; it is not automatically retried when a duplicate billable result is possible.

Provider tokens remain inside the AI provider-adapter boundary. Input, generated content, conversation context, OCR documents, images, and transcripts use independent privacy classes and retention. Character context is tenant-, character-, channel-, and conversation-scoped; it never crosses characters or tenants. Persona presentation through Discord webhooks is optional and passes through Delivery ownership, mention controls, webhook rotation, and anti-impersonation labeling.

#### 12.14.4 Templates and workflows

```mermaid
erDiagram
    TEMPLATE_PACKAGE ||--|{ TEMPLATE_PACKAGE_REVISION : versions
    TEMPLATE_PACKAGE_REVISION ||--o{ TEMPLATE_COMPONENT : contains
    TEMPLATE_PACKAGE ||--o{ TEMPLATE_REVIEW : reviewed_by
    TEMPLATE_PACKAGE ||--o{ TEMPLATE_RATING : rated_by
    TEMPLATE_PACKAGE_REVISION ||--o{ TEMPLATE_INSTALLATION : installs
    TEMPLATE_INSTALLATION ||--o{ TEMPLATE_INSTALLATION_STEP : applies
    TEMPLATE_INSTALLATION ||--o{ TEMPLATE_ROLLBACK_STEP : compensates
    WORKFLOW_DEFINITION ||--|{ WORKFLOW_REVISION : versions
    WORKFLOW_REVISION ||--o{ WORKFLOW_TRIGGER : starts_from
    WORKFLOW_REVISION ||--o{ WORKFLOW_NODE : contains
    WORKFLOW_EXECUTION }o--|| WORKFLOW_REVISION : pins
    WORKFLOW_EXECUTION ||--o{ WORKFLOW_ACTION_OCCURRENCE : performs
    WORKFLOW_EXECUTION ||--o{ WORKFLOW_EXECUTION_EVENT : records

    TEMPLATE_PACKAGE {
        string template_id PK
        string author_account_id
        string category
        string visibility
        string moderation_state
        string active_revision_id
        bigint version
    }
    TEMPLATE_PACKAGE_REVISION {
        string revision_id PK
        string template_id FK
        string manifest_ref
        string dependency_manifest
        string permission_manifest
        string integrity_digest
        datetime published_at
    }
    TEMPLATE_COMPONENT {
        string component_id PK
        string revision_id FK
        string component_type
        string portable_definition_ref
        string conflict_policy
    }
    TEMPLATE_REVIEW {
        string review_id PK
        string template_id FK
        string review_type
        string state
        string findings_ref
        datetime decided_at
    }
    TEMPLATE_RATING {
        string rating_id PK
        string template_id FK
        string rater_account_id
        int score
        string eligibility_receipt_ref
        datetime created_at
    }
    TEMPLATE_INSTALLATION {
        string installation_id PK
        string template_revision_id FK
        string target_tenant_id
        string state
        string preflight_ref
        string semantic_key
        bigint version
    }
    TEMPLATE_INSTALLATION_STEP {
        string step_id PK
        string installation_id FK
        string owner_service
        string operation_ref
        string state
        string before_snapshot_ref
    }
    TEMPLATE_ROLLBACK_STEP {
        string rollback_step_id PK
        string installation_id FK
        string original_step_id
        string state
        string conflict_ref
    }
    WORKFLOW_DEFINITION {
        string workflow_id PK
        string tenant_id
        string state
        string active_revision_id
        bigint version
    }
    WORKFLOW_REVISION {
        string revision_id PK
        string workflow_id FK
        string compiled_graph_ref
        string policy_snapshot_ref
        string dependency_manifest
        datetime published_at
    }
    WORKFLOW_TRIGGER {
        string trigger_id PK
        string revision_id FK
        string trigger_type
        string filter_ref
        string source_scope
    }
    WORKFLOW_NODE {
        string node_id PK
        string revision_id FK
        string node_type
        string definition_ref
        string successors
    }
    WORKFLOW_EXECUTION {
        string execution_id PK
        string revision_id FK
        string trigger_event_id
        string state
        string semantic_key
        datetime deadline
        bigint version
    }
    WORKFLOW_ACTION_OCCURRENCE {
        string action_occurrence_id PK
        string execution_id FK
        string node_id
        string owner_service
        string operation_ref
        string state
        bigint attempt
    }
    WORKFLOW_EXECUTION_EVENT {
        string event_id PK
        string execution_id FK
        string event_type
        string bounded_facts
        datetime occurred_at
    }
```

Templates contain portable declarative definitions, never database rows, provider tokens, raw Discord objects, executable code, or ownership claims over pre-existing resources. Each installation pins one immutable revision, validates dependencies and permissions against the target tenant, obtains per-owner plans, and records every effect. Rollback is a compensating workflow and removes only effects proven to be created or owned by that installation; external edits become visible conflicts.

Workflow graphs are finite, acyclic after admitted bounded-loop expansion, and compiled before publication. Triggers use canonical events, durable schedules, authenticated webhooks, or explicit module events. Conditions are deterministic and side-effect-free. Actions are typed commands to owning services, never direct database writes or raw Discord calls. Each action occurrence has a stable semantic identity, timeout, retry policy, authorization context, and independently observable result. Custom commands are a constrained trigger-and-response surface that may reuse workflow primitives without surrendering the stricter guarantees in section 33.

The template marketplace is permanently free. Template packages and installations have no price, purchase order, subscription, payment-provider reference, revenue-share agreement, payout, paid placement, or commercial entitlement. AI Credits and guild virtual currency cannot purchase templates, improve ranking, or compensate authors. Authorship, moderation, ratings, reputation, attribution, and optional capped promotional rewards remain non-transferable governance mechanisms rather than marketplace payment instruments.
