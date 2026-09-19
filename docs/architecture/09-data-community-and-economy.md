# Tobot Architecture — Community and Economy Data

[Architecture index](README.md) · [Previous](08-data-safety-and-access.md) · [Next](10-data-support-integrations-automation.md)

### 12.9 Community experience models

Each community bounded context owns its transactional database and outbox. Shared identifiers create correlations only; they do not authorize cross-service SQL joins or writes.

**Progression model:**

```mermaid
erDiagram
    TENANT ||--o{ PROGRESSION_POLICY : owns
    PROGRESSION_POLICY ||--|{ PROGRESSION_POLICY_REVISION : versions
    PROGRESSION_POLICY_REVISION ||--o{ XP_LEDGER_ENTRY : governs
    MEMBER_PROGRESSION ||--o{ XP_LEDGER_ENTRY : derives_from
    PROGRESSION_POLICY_REVISION ||--o{ VOICE_XP_SESSION : governs
    VOICE_XP_SESSION ||--o{ VOICE_XP_SEGMENT : contains
    XP_LEDGER_ENTRY ||--o{ LEVEL_REWARD_OCCURRENCE : may_trigger
    PROGRESSION_POLICY_REVISION ||--o{ LEADERBOARD_DEFINITION : defines
    LEADERBOARD_DEFINITION ||--o{ LEADERBOARD_SNAPSHOT : produces
    LEADERBOARD_DEFINITION ||--o{ LEADERBOARD_REFRESH : schedules

    PROGRESSION_POLICY {
        string policy_id PK
        string tenant_id FK
        string active_revision_id
        string status
        int version
    }

    PROGRESSION_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        json source_rules
        json formula
        json multipliers
        json exclusions
        json reward_policy
        datetime published_at
    }

    MEMBER_PROGRESSION {
        string tenant_id PK
        string member_id PK
        int xp_balance
        int level
        string last_ledger_entry_id
        string state
        int version
    }

    XP_LEDGER_ENTRY {
        string ledger_entry_id PK
        string tenant_id FK
        string member_id FK
        string source_type
        string source_event_id
        string policy_revision_id FK
        string idempotency_key UK
        int delta
        int balance_after
        int level_before
        int level_after
        datetime occurred_at
    }

    VOICE_XP_SESSION {
        string session_id PK
        string tenant_id FK
        string member_id
        string policy_revision_id FK
        string state
        string channel_id
        int generation
        datetime checkpointed_at
    }

    VOICE_XP_SEGMENT {
        string segment_id PK
        string session_id FK
        string segment_key UK
        datetime started_at
        datetime ended_at
        int eligible_milliseconds
        json multiplier_facts
        string ledger_entry_id
    }

    LEVEL_REWARD_OCCURRENCE {
        string occurrence_id PK
        string ledger_entry_id FK
        int reached_level
        string reward_revision_id
        string role_assignment_id
        string state
    }

    LEADERBOARD_DEFINITION {
        string leaderboard_id PK
        string tenant_id FK
        string revision_id
        string scope
        string period
        string message_definition_id
        string state
    }

    LEADERBOARD_SNAPSHOT {
        string snapshot_id PK
        string leaderboard_id FK
        string rank_version UK
        json ranked_entries
        int total_members
        datetime calculated_at
    }

    LEADERBOARD_REFRESH {
        string refresh_id PK
        string leaderboard_id FK
        string coalescing_key UK
        string desired_snapshot_id
        string delivery_id
        string state
    }
```

**Starboard model:**

```mermaid
erDiagram
    TENANT ||--o{ STARBOARD_POLICY : owns
    STARBOARD_POLICY ||--|{ STARBOARD_POLICY_REVISION : versions
    STARBOARD_POLICY_REVISION ||--o{ STARBOARD_SOURCE : governs
    STARBOARD_SOURCE ||--o{ STAR_CONTRIBUTION : contains
    STARBOARD_SOURCE ||--o| STARBOARD_BINDING : projects
    STARBOARD_SOURCE ||--o{ STARBOARD_EFFECT : requests
    STARBOARD_POLICY_REVISION ||--o{ STARBOARD_RECONCILIATION : governs
    STARBOARD_RECONCILIATION ||--o{ STARBOARD_RECONCILIATION_PAGE : checkpoints

    STARBOARD_POLICY {
        string board_id PK
        string tenant_id FK
        string active_revision_id
        string status
        int version
    }

    STARBOARD_POLICY_REVISION {
        string revision_id PK
        string board_id FK
        string destination_channel_id
        json source_scope
        json emoji_keys
        int threshold
        json contributor_policy
        string message_definition_id
        string content_policy
        datetime published_at
    }

    STARBOARD_SOURCE {
        string board_source_id PK
        string revision_id FK
        string tenant_id FK
        string source_channel_id
        string source_message_id
        string source_author_id
        int unique_count
        string threshold_state
        string desired_projection_state
        string source_state
        int version
    }

    STAR_CONTRIBUTION {
        string contribution_id PK
        string board_source_id FK
        string user_id
        string emoji_key
        string source_event_id
        boolean active
        boolean eligible
        string eligibility_reason
        datetime observed_at
    }

    STARBOARD_BINDING {
        string binding_id PK
        string board_source_id FK
        string board_channel_id
        string board_message_id UK
        string desired_fingerprint
        string observed_fingerprint
        string state
    }

    STARBOARD_EFFECT {
        string effect_id PK
        string board_source_id FK
        string effect_type
        string idempotency_key UK
        string delivery_id
        string outcome
        datetime requested_at
    }

    STARBOARD_RECONCILIATION {
        string run_id PK
        string revision_id FK
        string state
        string lease_token
        int checked_count
        int repaired_count
        int failed_count
    }

    STARBOARD_RECONCILIATION_PAGE {
        string page_id PK
        string run_id FK
        string provider_cursor
        string state
        datetime completed_at
    }
```

**Giveaway model:**

```mermaid
erDiagram
    TENANT ||--o{ GIVEAWAY_MANAGER_POLICY : owns
    TENANT ||--o{ GIVEAWAY : owns
    GIVEAWAY ||--|{ GIVEAWAY_REVISION : versions
    GIVEAWAY_REVISION ||--o{ GIVEAWAY_ENTRY : receives
    GIVEAWAY ||--o{ GIVEAWAY_OCCURRENCE : schedules
    GIVEAWAY ||--o{ ENTRANT_SNAPSHOT : freezes
    ENTRANT_SNAPSHOT ||--o{ ENTRANT_SNAPSHOT_MEMBER : contains
    GIVEAWAY ||--o{ GIVEAWAY_DRAW : produces
    GIVEAWAY_DRAW ||--o{ GIVEAWAY_WINNER : selects
    GIVEAWAY_DRAW ||--o{ PRIZE_FULFILLMENT : requests
    GIVEAWAY ||--o{ GIVEAWAY_EFFECT : projects

    GIVEAWAY_MANAGER_POLICY {
        string policy_id PK
        string tenant_id FK
        json manager_roles
        json action_permissions
        int version
    }

    GIVEAWAY {
        string giveaway_id PK
        string tenant_id FK
        string active_revision_id
        string state
        int version
        string current_draw_id
        datetime starts_at
        datetime closes_at
    }

    GIVEAWAY_REVISION {
        string revision_id PK
        string giveaway_id FK
        int revision_number
        string prize
        string description
        int winner_count
        json eligibility_policy
        json entry_policy
        json notification_policy
        json prize_policy
        string message_definition_id
        datetime published_at
    }

    GIVEAWAY_ENTRY {
        string entry_id PK
        string revision_id FK
        string member_id
        string entry_key UK
        string state
        json eligibility_snapshot
        int weight
        datetime entered_at
        datetime withdrawn_at
    }

    GIVEAWAY_OCCURRENCE {
        string occurrence_id PK
        string giveaway_id FK
        string occurrence_type
        string occurrence_key UK
        datetime intended_at
        string state
        string lease_token
    }

    ENTRANT_SNAPSHOT {
        string snapshot_id PK
        string giveaway_id FK
        string revision_id FK
        string snapshot_hash
        int eligible_count
        datetime frozen_at
    }

    ENTRANT_SNAPSHOT_MEMBER {
        string snapshot_id PK, FK
        string member_id PK
        int effective_weight
        string eligibility_hash
    }

    GIVEAWAY_DRAW {
        string draw_id PK
        string giveaway_id FK
        string snapshot_id FK
        int draw_number
        string prior_winner_policy
        string randomness_receipt
        datetime committed_at
    }

    GIVEAWAY_WINNER {
        string draw_id PK, FK
        string member_id PK
        int ordinal
    }

    PRIZE_FULFILLMENT {
        string fulfillment_id PK
        string draw_id FK
        string member_id
        string prize_type
        string owner_service
        string external_intent_id
        string state
    }

    GIVEAWAY_EFFECT {
        string effect_id PK
        string giveaway_id FK
        string draw_id FK
        string effect_type
        string idempotency_key UK
        string delivery_id
        string state
    }
```

**Form model:**

```mermaid
erDiagram
    TENANT ||--o{ FORM : owns
    FORM ||--o{ FORM_DRAFT : edits
    FORM ||--|{ FORM_VERSION : publishes
    FORM_VERSION ||--|{ FORM_QUESTION : defines
    FORM_VERSION ||--o{ FORM_PUBLICATION : projects
    FORM_VERSION ||--o{ FORM_SESSION : opens
    FORM_VERSION ||--o{ FORM_SUBMISSION : receives
    FORM_SUBMISSION ||--|{ FORM_ANSWER : contains
    FORM_SUBMISSION ||--o{ FORM_ASSET_REFERENCE : attaches
    FORM_SUBMISSION ||--o{ FORM_REVIEW_EVENT : reviews
    FORM_SUBMISSION ||--o{ FORM_EFFECT : requests
    FORM_VERSION ||--o{ FORM_EXPORT : exports

    FORM {
        string form_id PK
        string tenant_id FK
        string draft_id
        string published_version_id
        string state
        int version
    }

    FORM_DRAFT {
        string draft_id PK
        string form_id FK
        json editable_schema
        int version
        datetime updated_at
    }

    FORM_VERSION {
        string form_version_id PK
        string form_id FK
        int version_number
        json eligibility_policy
        json reviewer_policy
        json privacy_policy
        json submission_policy
        string invitation_definition_id
        datetime published_at
    }

    FORM_QUESTION {
        string question_id PK
        string form_version_id FK
        int ordinal
        string question_type
        string label
        json validation
        json choices
        string privacy_class
    }

    FORM_PUBLICATION {
        string publication_id PK
        string form_version_id FK
        string channel_id
        string message_id
        string delivery_id
        string state
    }

    FORM_SESSION {
        string session_id PK
        string form_version_id FK
        string member_id
        string interaction_id UK
        string state
        datetime expires_at
    }

    FORM_SUBMISSION {
        string submission_id PK
        string form_version_id FK
        string member_id
        string submission_key UK
        string state
        json eligibility_snapshot
        datetime submitted_at
        datetime redacted_at
    }

    FORM_ANSWER {
        string submission_id PK, FK
        string question_id PK, FK
        string value_type
        json normalized_value
        string privacy_class
    }

    FORM_ASSET_REFERENCE {
        string reference_id PK
        string submission_id FK
        string question_id FK
        string asset_id
        datetime expires_at
    }

    FORM_REVIEW_EVENT {
        string review_event_id PK
        string submission_id FK
        int expected_version
        string reviewer_id
        string decision
        string reason
        datetime reviewed_at
    }

    FORM_EFFECT {
        string effect_id PK
        string submission_id FK
        string effect_type
        string owner_service
        string external_intent_id
        string state
    }

    FORM_EXPORT {
        string export_id PK
        string form_version_id FK
        string requested_by
        json field_scope
        string state
        string artifact_reference
        datetime expires_at
    }
```

**Temporary room model:**

```mermaid
erDiagram
    TENANT ||--o{ ROOM_GENERATOR : owns
    ROOM_GENERATOR ||--|{ ROOM_GENERATOR_REVISION : versions
    ROOM_GENERATOR_REVISION ||--o{ TEMPORARY_ROOM : creates
    TEMPORARY_ROOM ||--o{ ROOM_OPERATION : changes_through
    ROOM_OPERATION ||--|{ ROOM_OPERATION_STEP : contains
    TEMPORARY_ROOM ||--o{ ROOM_RESOURCE_BINDING : binds
    TEMPORARY_ROOM ||--o{ ROOM_ACCESS_CLAIM : grants
    TEMPORARY_ROOM ||--o{ ROOM_TIMER_OCCURRENCE : schedules
    TEMPORARY_ROOM ||--o{ ROOM_ACTION_RECORD : records
    ROOM_GENERATOR_REVISION ||--o{ ROOM_RECONCILIATION : governs
    ROOM_RECONCILIATION ||--o{ ROOM_RECONCILIATION_PAGE : checkpoints

    ROOM_GENERATOR {
        string generator_id PK
        string tenant_id FK
        string active_revision_id
        string state
        int version
    }

    ROOM_GENERATOR_REVISION {
        string revision_id PK
        string generator_id FK
        string mode
        string hub_channel_id
        string category_id
        json room_template
        json quotas
        json allowed_actions
        json linked_text_policy
        int empty_grace_seconds
        datetime published_at
    }

    TEMPORARY_ROOM {
        string room_id PK
        string tenant_id FK
        string generator_revision_id FK
        string lifecycle_key UK
        string owner_id
        string state
        int generation
        int version
        datetime empty_since
        datetime created_at
    }

    ROOM_OPERATION {
        string operation_id PK
        string room_id FK
        string operation_type
        string idempotency_key UK
        string state
        string lease_token
        datetime deadline
    }

    ROOM_OPERATION_STEP {
        string step_id PK
        string operation_id FK
        int ordinal
        string step_type
        string resource_id
        json original_owned_values
        json desired_owned_values
        string state
        string provider_request_id
    }

    ROOM_RESOURCE_BINDING {
        string binding_id PK
        string room_id FK
        string resource_type
        string provider_resource_id UK
        string ownership_mode
        string observed_fingerprint
        string state
    }

    ROOM_ACCESS_CLAIM {
        string claim_id PK
        string room_id FK
        string principal_type
        string principal_id
        json owned_permissions
        string source
        int version
    }

    ROOM_TIMER_OCCURRENCE {
        string occurrence_id PK
        string room_id FK
        int generation
        string occurrence_key UK
        datetime intended_at
        string state
        string lease_token
    }

    ROOM_ACTION_RECORD {
        string action_id PK
        string room_id FK
        string actor_id
        string action_type
        int expected_room_version
        string outcome
        datetime requested_at
    }

    ROOM_RECONCILIATION {
        string run_id PK
        string generator_revision_id FK
        string state
        string lease_token
        int checked_count
        int repaired_count
        int failed_count
    }

    ROOM_RECONCILIATION_PAGE {
        string page_id PK
        string run_id FK
        string provider_cursor
        string state
        datetime completed_at
    }
```

Entrant, contributor, form member, XP member, and room principal identifiers are tenant-scoped even when a diagram omits the repeated tenant foreign key for readability. Unique constraints include tenant identity whenever provider identifiers are not globally sufficient for authorization.

### 12.10 Economy, commerce, entitlement, and casino models

Monetary records use integer minor virtual units. Floating-point values are forbidden for balances, prices, stakes, postings, percentages, and payout settlement. Percentage and multiplier policies store bounded rational or fixed-scale decimal parameters and one explicit rounding rule. Commercial billing and AI Credits follow the same integer-minor rule on isolated planes (DR-016) and MUST NOT share this journal.

```mermaid
erDiagram
    TENANT ||--o{ CURRENCY_POLICY : owns
    CURRENCY_POLICY ||--|{ CURRENCY_POLICY_REVISION : versions
    CURRENCY_POLICY ||--o{ MONETARY_ACCOUNT : governs
    MONETARY_ACCOUNT ||--o{ MONETARY_POSTING : receives
    MONETARY_TRANSACTION ||--|{ MONETARY_POSTING : contains
    MONETARY_TRANSACTION ||--o| MONETARY_TRANSACTION : reverses
    MONETARY_ACCOUNT ||--o{ MONETARY_HOLD : reserves
    MONETARY_RESERVATION ||--|{ MONETARY_HOLD : groups
    MONETARY_RESERVATION ||--o| MONETARY_TRANSACTION : captured_as
    MONETARY_HOLD ||--o| MONETARY_TRANSACTION : captured_as
    MONETARY_ACCOUNT ||--|| BALANCE_PROJECTION : projects
    CURRENCY_POLICY_REVISION ||--o{ TRANSFER_RECORD : governs
    MONETARY_TRANSACTION ||--o| TRANSFER_RECORD : settles
    MONETARY_TRANSACTION ||--o| ADJUSTMENT_RECORD : documents
    CURRENCY_POLICY ||--o{ LEDGER_RECONCILIATION : verifies

    CURRENCY_POLICY {
        string currency_id PK
        string tenant_id FK
        string active_revision_id FK
        string state
        int version
    }

    CURRENCY_POLICY_REVISION {
        string revision_id PK
        string currency_id FK
        string display_name
        string display_symbol_ref
        json account_rules
        json transfer_rules
        json tax_destination
        json authorization_policy
        datetime published_at
    }

    MONETARY_ACCOUNT {
        string account_id PK
        string tenant_id FK
        string currency_id FK
        string owner_type
        string owner_id
        string account_class
        string state
        int version
    }

    MONETARY_TRANSACTION {
        string transaction_id PK
        string tenant_id FK
        string currency_id FK
        string transaction_type
        string source_type
        string source_id
        string idempotency_key UK
        string reversal_of_id FK
        datetime effective_at
        datetime recorded_at
    }

    MONETARY_POSTING {
        string posting_id PK
        string transaction_id FK
        string account_id FK
        string direction
        bigint amount
        bigint balance_after
        int account_version
    }

    MONETARY_HOLD {
        string hold_id PK
        string account_id FK
        string owner_service
        string source_id
        bigint amount
        string state
        string idempotency_key UK
        datetime expires_at
        int version
    }

    MONETARY_RESERVATION {
        string reservation_id PK
        string tenant_id FK
        string owner_service
        string source_id
        bigint total_amount
        string funding_policy
        string state
        string idempotency_key UK
        datetime expires_at
        int version
    }

    BALANCE_PROJECTION {
        string account_id PK
        bigint current_balance
        bigint held_balance
        bigint available_balance
        int projection_version
        datetime updated_at
    }

    TRANSFER_RECORD {
        string transfer_id PK
        string transaction_id FK
        string policy_revision_id FK
        string sender_account_id FK
        string recipient_account_id FK
        string tax_account_id FK
        bigint gross_amount
        bigint tax_amount
        bigint net_amount
    }

    ADJUSTMENT_RECORD {
        string adjustment_id PK
        string transaction_id FK
        string actor_id
        string reason_ref
        string correction_of_id FK
    }

    LEDGER_RECONCILIATION {
        string run_id PK
        string currency_id FK
        string state
        string checkpoint
        bigint transactions_checked
        bigint projection_repairs
        datetime completed_at
    }
```

```mermaid
erDiagram
    TENANT ||--o{ INCOME_POLICY : owns
    INCOME_POLICY ||--|{ INCOME_POLICY_REVISION : versions
    INCOME_POLICY_REVISION ||--o{ INCOME_SOURCE_RULE : contains
    INCOME_POLICY_REVISION ||--o{ SALARY_PLAN : contains
    SALARY_PLAN ||--o{ SALARY_OCCURRENCE : schedules
    SALARY_OCCURRENCE ||--o{ SALARY_RECIPIENT_DECISION : pages
    INCOME_POLICY_REVISION ||--o{ INCOME_ACTION : governs
    INCOME_ACTION ||--o| INCOME_COOLDOWN : reserves
    INCOME_ACTION ||--o| MONETARY_SETTLEMENT_REFERENCE : requests
    INCOME_ACTION ||--o{ EARNINGS_ANOMALY : may_observe
    MEMBER ||--o{ STREAK_STATE : owns
    INCOME_POLICY_REVISION ||--o{ STREAK_STATE : governs

    INCOME_POLICY {
        string policy_id PK
        string tenant_id FK
        string active_revision_id FK
        string state
        int version
    }

    INCOME_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        json authorization
        json stacking
        json abuse_controls
        datetime published_at
    }

    INCOME_SOURCE_RULE {
        string source_rule_id PK
        string revision_id FK
        string action_type
        json eligibility
        json formula
        json cooldown
        json loss_policy
        int priority
    }

    SALARY_PLAN {
        string salary_plan_id PK
        string revision_id FK
        string role_id
        string mode
        json formula
        string stacking_group
        json schedule
    }

    SALARY_OCCURRENCE {
        string occurrence_id PK
        string salary_plan_id FK
        datetime intended_at
        string occurrence_key UK
        string state
        string lease_token
        string checkpoint
    }

    SALARY_RECIPIENT_DECISION {
        string decision_id PK
        string occurrence_id FK
        string member_id
        string eligibility_result
        string income_action_id FK
    }

    INCOME_ACTION {
        string income_action_id PK
        string revision_id FK
        string member_id
        string source_event_id
        string action_type
        string decision
        json formula_receipt
        string idempotency_key UK
        string settlement_state
        datetime decided_at
    }

    INCOME_COOLDOWN {
        string cooldown_id PK
        string income_action_id FK
        string scope_key
        datetime available_at
        int generation
    }

    MONETARY_SETTLEMENT_REFERENCE {
        string reference_id PK
        string income_action_id FK
        string request_type
        string ledger_idempotency_key UK
        string transaction_id
        string state
    }

    STREAK_STATE {
        string streak_id PK
        string member_id
        string revision_id FK
        int count
        datetime last_qualified_at
        int version
    }

    EARNINGS_ANOMALY {
        string anomaly_id PK
        string income_action_id FK
        string anomaly_class
        json bounded_facts
        datetime observed_at
    }
```

```mermaid
erDiagram
    TENANT ||--o{ CATALOG : owns
    CATALOG ||--o{ CATALOG_CATEGORY : contains
    CATALOG ||--o{ ITEM : lists
    ITEM ||--|{ ITEM_REVISION : versions
    ITEM_REVISION ||--o{ REWARD_DEFINITION : offers
    ITEM_REVISION ||--o{ STOCK_BUCKET : limits
    STOCK_BUCKET ||--o{ STOCK_RESERVATION : reserves
    MEMBER ||--o{ PURCHASE_ORDER : places
    ITEM_REVISION ||--o{ PURCHASE_ORDER : purchased_as
    PURCHASE_ORDER ||--o| STOCK_RESERVATION : owns
    PURCHASE_ORDER ||--o{ PURCHASE_REWARD_LINE : contains
    PURCHASE_REWARD_LINE ||--o| ENTITLEMENT : requests
    ENTITLEMENT ||--o{ ENTITLEMENT_EFFECT : executes
    ENTITLEMENT ||--o{ ENTITLEMENT_TIMER : expires_through
    ENTITLEMENT ||--o{ ENTITLEMENT_RECONCILIATION : repairs
    ENTITLEMENT ||--o| MANUAL_FULFILLMENT_CASE : may_require

    CATALOG {
        string catalog_id PK
        string tenant_id FK
        string active_revision_id
        string state
        int version
    }

    CATALOG_CATEGORY {
        string category_id PK
        string catalog_id FK
        string name
        int sort_order
        string state
    }

    ITEM {
        string item_id PK
        string catalog_id FK
        string active_revision_id FK
        string state
        int version
    }

    ITEM_REVISION {
        string revision_id PK
        string item_id FK
        string name
        string description_ref
        string icon_asset_id
        bigint price
        json eligibility
        json purchase_limits
        datetime available_from
        datetime available_until
    }

    REWARD_DEFINITION {
        string reward_id PK
        string revision_id FK
        string reward_type
        json parameters
        boolean required
        int ordinal
        json compensation_policy
    }

    STOCK_BUCKET {
        string stock_bucket_id PK
        string revision_id FK
        string stock_mode
        bigint capacity
        bigint reserved
        bigint consumed
        int version
    }

    STOCK_RESERVATION {
        string reservation_id PK
        string stock_bucket_id FK
        bigint quantity
        string state
        string idempotency_key UK
        datetime expires_at
    }

    PURCHASE_ORDER {
        string purchase_id PK
        string tenant_id FK
        string buyer_id
        string item_revision_id FK
        bigint unit_price
        bigint quantity
        string payment_reservation_id
        string payment_transaction_id
        string state
        string idempotency_key UK
        int version
    }

    PURCHASE_REWARD_LINE {
        string reward_line_id PK
        string purchase_id FK
        string reward_definition_id FK
        string state
        string entitlement_id FK
        boolean required
    }

    ENTITLEMENT {
        string entitlement_id PK
        string tenant_id FK
        string beneficiary_id
        string source_purchase_id FK
        string entitlement_type
        string ownership_key
        string state
        datetime starts_at
        datetime expires_at
        int generation
        int version
    }

    ENTITLEMENT_EFFECT {
        string effect_id PK
        string entitlement_id FK
        string effect_type
        string owner_service
        string idempotency_key UK
        string provider_resource_id
        string state
        json ownership_snapshot
    }

    ENTITLEMENT_TIMER {
        string occurrence_id PK
        string entitlement_id FK
        int generation
        string occurrence_key UK
        datetime intended_at
        string state
        string lease_token
    }

    ENTITLEMENT_RECONCILIATION {
        string run_id PK
        string entitlement_id FK
        string state
        int attempts
        datetime next_attempt_at
        string resolution
    }

    MANUAL_FULFILLMENT_CASE {
        string case_id PK
        string entitlement_id FK
        string state
        string assignee_policy_id
        string evidence_ref
        string completed_by
        datetime completed_at
    }
```

`CATALOG` and `PURCHASE_ORDER.payment_reservation_id` are guild-shop virtual commerce. Public capture facts are `VirtualPayment`. This `CATALOG` is not §8.43 commercial catalog (DR-065). The `ENTITLEMENT` row is the guild commerce-reward aggregate; public contracts are `GuildRewardEntitlement`. Module 7.35 is not deleted. It is not Platform Entitlement (DR-066). Unprefixed `Entitlement*` names MUST fail closed at parse. This table MUST NOT be Platform Entitlement's journal (DR-069).

```mermaid
erDiagram
    TENANT ||--o{ CASINO_POLICY : owns
    CASINO_POLICY ||--|{ CASINO_POLICY_REVISION : versions
    CASINO_POLICY_REVISION ||--o{ GAME_RULE_REVISION : contains
    GAME_RULE_REVISION ||--o{ GAME_SESSION : governs
    MEMBER ||--o{ GAME_SESSION : plays
    GAME_SESSION ||--o{ GAME_ACTION : records
    GAME_SESSION ||--o{ RANDOMNESS_RECEIPT : consumes
    GAME_SESSION ||--o| WAGER_REFERENCE : reserves
    GAME_SESSION ||--o| GAME_OUTCOME : commits
    GAME_OUTCOME ||--o| SETTLEMENT_REFERENCE : settles
    GAME_SESSION ||--o| GAME_MESSAGE_BINDING : projects
    GAME_SESSION ||--o{ GAME_RECOVERY_CASE : may_require

    CASINO_POLICY {
        string policy_id PK
        string tenant_id FK
        string active_revision_id FK
        string state
        int version
    }

    CASINO_POLICY_REVISION {
        string revision_id PK
        string policy_id FK
        bigint minimum_bet
        bigint maximum_bet
        json exposure_limits
        json responsible_play
        json authorization
        datetime published_at
    }

    GAME_RULE_REVISION {
        string rule_revision_id PK
        string policy_revision_id FK
        string game_type
        json rules
        json payout_table
        json timeout_policy
        string validation_fingerprint
    }

    GAME_SESSION {
        string session_id PK
        string rule_revision_id FK
        string tenant_id FK
        string player_id
        string state
        bigint stake
        json game_state
        int action_sequence
        datetime deadline
        int version
    }

    GAME_ACTION {
        string action_id PK
        string session_id FK
        int sequence UK
        string actor_id
        string action_type
        json action_value
        string result_state
        datetime accepted_at
    }

    RANDOMNESS_RECEIPT {
        string receipt_id PK
        string session_id FK
        int action_sequence
        string purpose
        string commitment
        string outcome_digest
        datetime generated_at
    }

    WAGER_REFERENCE {
        string wager_id PK
        string session_id FK
        string hold_id UK
        bigint stake
        string state
    }

    GAME_OUTCOME {
        string outcome_id PK
        string session_id FK
        string outcome_type
        bigint payout
        json formula_receipt
        string outcome_digest
        datetime committed_at
    }

    SETTLEMENT_REFERENCE {
        string settlement_id PK
        string outcome_id FK
        string ledger_idempotency_key UK
        string transaction_id
        string state
    }

    GAME_MESSAGE_BINDING {
        string binding_id PK
        string session_id FK
        string channel_id
        string message_id
        int projected_version
        string state
    }

    GAME_RECOVERY_CASE {
        string recovery_id PK
        string session_id FK
        string state
        string lease_token
        string resolution
        datetime deadline
    }
```

Tenant identity participates in every account-owner, member, item, purchase, entitlement, and session uniqueness constraint. References to ledger transactions and Discord resources are opaque cross-service identities, not foreign keys across service-owned databases.
