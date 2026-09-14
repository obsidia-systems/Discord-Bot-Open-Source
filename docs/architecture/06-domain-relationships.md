# Tobot Architecture — Domain Relationships

[Architecture index](README.md) · [Previous](05-state-models.md) · [Next](07-data-core.md)

## 11. Domain relationship model

```mermaid
classDiagram
    class CanonicalEvent {
        event identity
        tenant identity
        schema version
        occurrence time
        trace context
    }

    class LifecycleConfiguration {
        lifecycle type
        destination policies
        bot policy
        variant policy
    }

    class MessageDefinitionRevision {
        immutable content
        embeds and components
        mention policy
        asset references
    }

    class DeliveryIntent {
        idempotency key
        destination
        deadline
        retry policy
    }

    class RenderedMessage {
        resolved content
        resolved components
        explicit mentions
        resolved attachments
    }

    class DeliveryAttempt {
        attempt number
        provider request
        outcome class
        timing
    }

    class Asset {
        tenant owner
        content hash
        storage reference
        lifecycle state
    }

    CanonicalEvent --> LifecycleConfiguration : selects
    LifecycleConfiguration --> MessageDefinitionRevision : references
    MessageDefinitionRevision --> Asset : references
    CanonicalEvent --> DeliveryIntent : causes
    DeliveryIntent --> MessageDefinitionRevision : pins
    DeliveryIntent --> RenderedMessage : renders
    DeliveryIntent --> DeliveryAttempt : executes as
    RenderedMessage --> Asset : resolves
```
### 11.1 Moderation domain relationships

```mermaid
classDiagram
    class ModerationPolicyRevision {
        authorization rules
        protected roles
        action constraints
        notification policy
    }

    class ModerationActionRequest {
        actor and subject
        action and parameters
        reason and evidence
        idempotency key
    }

    class ModerationCase {
        immutable identity
        append only history
        primary outcome
        correlation identity
    }

    class AutoModerationPolicyRevision {
        trigger and scopes
        enforcement owner
        actions and cooldowns
        evidence policy
    }

    class ModerationIncident {
        semantic incident key
        detection path
        evidence reference
        review state
    }

    class ActivityRecord {
        observed fact
        source confidence
        privacy state
        delivery reference
    }

    class DiscordAuditObservation {
        native entry reference
        executor and target
        bounded changes
        correlation confidence
    }

    class CleanupOccurrence {
        immutable policy revision
        bounded scope
        checkpoints
        outcome counts
    }

    ModerationPolicyRevision --> ModerationActionRequest : authorizes
    ModerationActionRequest --> ModerationCase : opens
    AutoModerationPolicyRevision --> ModerationIncident : detects
    ModerationIncident --> ModerationActionRequest : may request
    ModerationCase --> ActivityRecord : publishes fact
    ModerationIncident --> ActivityRecord : publishes fact
    CleanupOccurrence --> ActivityRecord : publishes deletion outcomes
    DiscordAuditObservation --> ModerationCase : may correlate
    DiscordAuditObservation --> ActivityRecord : may attribute
```

### 11.2 Security domain relationships

```mermaid
classDiagram
    class SecurityPolicyRevision {
        detectors and thresholds
        exemptions and scopes
        response plan references
        retention and review policy
    }

    class SecurityObservation {
        provider derived identity
        subject and executor facts
        risk classification
        window reservations
    }

    class SecurityIncident {
        semantic detection key
        immutable policy revision
        threshold snapshot
        latch and quiet period
    }

    class ResponsePlanRevision {
        ordered typed steps
        failure and fallback policy
        cooldown semantics
        restoration requirements
    }

    class ContainmentOperation {
        fenced guild lease
        immutable plan
        partial outcome
        restoration state
    }

    class ResourceSnapshot {
        resource identity
        precondition fingerprint
        owned values
        original values
    }

    class ModerationCase {
        member scoped effect
        authority decision
        provider outcome
    }

    class ActivityRecord {
        incident or operation fact
        attribution confidence
        delivery reference
    }

    SecurityPolicyRevision --> SecurityObservation : evaluates
    SecurityObservation --> SecurityIncident : contributes to
    SecurityIncident --> ResponsePlanRevision : pins
    ResponsePlanRevision --> ContainmentOperation : may request
    ResponsePlanRevision --> ModerationCase : may request
    ContainmentOperation --> ResourceSnapshot : protects with
    SecurityIncident --> ActivityRecord : publishes
    ContainmentOperation --> ActivityRecord : publishes
```

### 11.3 Roles domain relationships

```mermaid
classDiagram
    class RolePolicyRevision {
        predicates and gates
        delay and expiry
        ownership and exclusions
        reconciliation policy
    }

    class RolePanelRevision {
        transport and mappings
        activation and deactivation
        cardinality policy
        content reference
    }

    class RoleAssignmentIntent {
        member and role
        desired state
        source and policy
        idempotency identity
    }

    class RoleRelationClaim {
        member and role
        ownership key
        desired state
        validity and version
    }

    class AssignmentAttempt {
        capability reference
        provider request
        typed outcome
        timing
    }

    class PanelPublication {
        desired revision
        provider binding
        effect receipts
        health state
    }

    class RoleResourceMutation {
        actor and operation
        before and after
        privilege delta
        reconciliation state
    }

    class DiscordRoleProjection {
        role identity
        hierarchy and managed state
        permissions fingerprint
        observed revision
    }

    RolePolicyRevision --> RoleRelationClaim : creates
    RolePanelRevision --> RoleRelationClaim : creates
    RoleRelationClaim --> RoleAssignmentIntent : produces
    RoleAssignmentIntent --> AssignmentAttempt : executes as
    RolePanelRevision --> PanelPublication : projects through
    RoleResourceMutation --> DiscordRoleProjection : changes provider state
    DiscordRoleProjection --> RolePolicyRevision : validates targets
    DiscordRoleProjection --> RolePanelRevision : validates mappings
```

### 11.4 Community domain relationships

```mermaid
classDiagram
    class ProgressionPolicyRevision {
        sources and eligibility
        formula and multipliers
        rewards and boards
    }

    class XpLedgerEntry {
        source identity
        immutable delta
        balance and level result
    }

    class StarboardPolicyRevision {
        sources and emojis
        contributor rules
        threshold and template
    }

    class StarboardSource {
        contribution set
        unique count
        desired projection
    }

    class GiveawayRevision {
        schedule and eligibility
        entry and prize policy
        presentation reference
    }

    class GiveawayDraw {
        entrant snapshot
        winner set
        randomness receipt
    }

    class FormVersion {
        immutable questions
        eligibility and review
        privacy and effects
    }

    class FormSubmission {
        typed answers
        asset references
        review history
    }

    class RoomPolicyRevision {
        hub and template
        quotas and actions
        cleanup and access
    }

    class TemporaryRoom {
        owner and resources
        owned permissions
        lifecycle generation
    }

    class RoleAssignmentIntent {
        desired member role
        ownership identity
    }

    class DeliveryIntent {
        message projection
        notification outcome
    }

    class Asset {
        validated attachment
        privacy and expiry
    }

    ProgressionPolicyRevision --> XpLedgerEntry : evaluates into
    XpLedgerEntry --> RoleAssignmentIntent : may reward
    XpLedgerEntry --> DeliveryIntent : may announce
    StarboardPolicyRevision --> StarboardSource : governs
    StarboardSource --> DeliveryIntent : projects through
    GiveawayRevision --> GiveawayDraw : closes with
    GiveawayDraw --> RoleAssignmentIntent : may award
    GiveawayDraw --> DeliveryIntent : announces through
    FormVersion --> FormSubmission : receives
    FormSubmission --> Asset : references
    FormSubmission --> RoleAssignmentIntent : may request
    FormSubmission --> DeliveryIntent : projects through
    RoomPolicyRevision --> TemporaryRoom : creates
    TemporaryRoom --> DeliveryIntent : may notify through
```

### 11.5 Economy domain relationships

```mermaid
classDiagram
    class CurrencyPolicyRevision {
        currency identity
        account and ceiling rules
        transfer and tax rules
    }

    class MonetaryAccount {
        owner and account class
        current pending available
        projection version
    }

    class MonetaryTransaction {
        immutable source
        balanced postings
        reversal linkage
    }

    class MonetaryHold {
        owner workflow
        reserved amount
        capture or release state
    }

    class MonetaryReservation {
        funding policy
        grouped account holds
        atomic capture or release
    }

    class IncomePolicyRevision {
        source and eligibility
        formula and cooldown
        schedule and abuse rules
    }

    class IncomeAction {
        occurrence identity
        deterministic decision
        settlement reference
    }

    class ItemRevision {
        price and availability
        eligibility and limits
        reward descriptors
    }

    class PurchaseOrder {
        stock reservation
        payment reference
        fulfillment summary
    }

    class Entitlement {
        benefit and beneficiary
        ownership and expiry
        effect receipts
    }

    class CasinoRuleRevision {
        wager and payout policy
        immutable game rules
        responsible play limits
    }

    class GameSession {
        player actions
        immutable outcome
        wager settlement
    }

    class DeliveryIntent {
        presentation only
        independent outcome
    }

    CurrencyPolicyRevision --> MonetaryAccount : governs
    MonetaryTransaction --> MonetaryAccount : posts to
    MonetaryHold --> MonetaryAccount : reserves
    MonetaryReservation --> MonetaryHold : groups
    IncomePolicyRevision --> IncomeAction : decides
    IncomeAction --> MonetaryTransaction : requests
    ItemRevision --> PurchaseOrder : purchased as
    PurchaseOrder --> MonetaryReservation : reserves payment through
    PurchaseOrder --> MonetaryTransaction : captures or reverses through
    PurchaseOrder --> Entitlement : requests
    CasinoRuleRevision --> GameSession : governs
    GameSession --> MonetaryHold : reserves wager through
    GameSession --> MonetaryTransaction : settles through
    IncomeAction --> DeliveryIntent : may present through
    PurchaseOrder --> DeliveryIntent : may present through
    GameSession --> DeliveryIntent : projects through
```

### 11.6 Support domain relationships

```mermaid
classDiagram
    class SupportPolicyRevision {
        tenant defaults
        authorization and capacity
        routing and retention
    }

    class TicketTemplateRevision {
        type and eligibility
        access and messages
        automation and archive
    }

    class SupportPanelRevision {
        presentation
        component mode
        option bindings
    }

    class SupportPanelOption {
        stable option identity
        label and emoji
        template reference
    }

    class FormVersion {
        immutable intake schema
        eligibility and privacy
    }

    class SupportCase {
        number and opener
        lifecycle and assignment
        capacity and generation
    }

    class SupportParticipant {
        member identity
        relation and authority
        validity interval
    }

    class SupportResourceOperation {
        desired private resource
        access projection
        effect receipts
    }

    class SupportTranscript {
        coverage and watermark
        artifact and integrity
        privacy and retention
    }

    class DeliveryIntent {
        panel or case message
        independent outcome
    }

    SupportPolicyRevision --> TicketTemplateRevision : supplies defaults to
    SupportPanelRevision --> SupportPanelOption : contains
    SupportPanelOption --> TicketTemplateRevision : pins
    TicketTemplateRevision --> FormVersion : may reference
    TicketTemplateRevision --> SupportCase : governs
    SupportCase --> SupportParticipant : includes
    SupportCase --> SupportResourceOperation : requests
    SupportCase --> SupportTranscript : archives through
    SupportPanelRevision --> DeliveryIntent : projects through
    SupportResourceOperation --> DeliveryIntent : projects through
    SupportTranscript --> DeliveryIntent : distributes through
```

### 11.7 External integration and stream-alert relationships

```mermaid
classDiagram
    class ProviderCapabilityProfile {
        identity and transport modes
        metadata and lifecycle signals
        quota and freshness semantics
    }

    class CanonicalExternalIdentity {
        provider stable identifier
        normalized locator
        mutable display metadata
    }

    class StreamAlertRevision {
        destination and presentation
        mention and lifecycle policy
        freshness and suppression
    }

    class ProviderSubscription {
        desired and observed state
        endpoint and secret generation
        provider ownership receipt
    }

    class ProviderIngressReceipt {
        authentication and replay identity
        source generation
        acknowledgement outcome
    }

    class ProviderObservation {
        classification and provenance
        source time and cursor
        normalized metadata
    }

    class ExternalLiveSession {
        provider session identity
        durable transition state
        source watermark
    }

    class StreamAlertOccurrence {
        alert and transition generation
        unique effect identity
        delivery reference
    }

    class DeliveryIntent {
        Discord projection
        independent outcome
    }

    ProviderCapabilityProfile --> CanonicalExternalIdentity : validates
    CanonicalExternalIdentity --> StreamAlertRevision : monitored by
    CanonicalExternalIdentity --> ProviderSubscription : conditions
    ProviderSubscription --> ProviderIngressReceipt : authenticates generation of
    ProviderIngressReceipt --> ProviderObservation : normalizes into
    CanonicalExternalIdentity --> ProviderObservation : observed as
    ProviderObservation --> ExternalLiveSession : advances
    ExternalLiveSession --> StreamAlertOccurrence : emits through revisions
    StreamAlertRevision --> StreamAlertOccurrence : governs
    StreamAlertOccurrence --> DeliveryIntent : projects through
```

### 11.8 Automation command and reminder relationships

```mermaid
classDiagram
    class CustomCommandRevision {
        command and arguments
        policy and cooldown
        bounded response plan
    }

    class CommandContribution {
        owner and revision
        normalized provider schema
    }

    class ApplicationCommandSnapshot {
        complete desired registry
        projection generation
        provider bindings
    }

    class CustomCommandInvocation {
        signed context and arguments
        policy and cooldown receipt
        action outcomes
    }

    class MessageDefinitionRevision {
        immutable presentation
        variables and mentions
    }

    class ReminderRevision {
        owner and content
        civil schedule and recurrence
        delivery route policy
    }

    class ReminderOccurrence {
        intended instant
        frozen revision
        claim and terminal outcome
    }

    class DeliveryIntent {
        interaction DM or channel effect
        independent outcome
    }

    CustomCommandRevision --> CommandContribution : publishes
    CommandContribution --> ApplicationCommandSnapshot : composes
    ApplicationCommandSnapshot --> CustomCommandInvocation : routes
    CustomCommandRevision --> CustomCommandInvocation : governs
    CustomCommandRevision --> MessageDefinitionRevision : references
    CustomCommandInvocation --> DeliveryIntent : executes through
    ReminderRevision --> ReminderOccurrence : schedules
    ReminderRevision --> MessageDefinitionRevision : may reference
    ReminderOccurrence --> DeliveryIntent : delivers through
```

### 11.9 Platform access, commercial, AI, template, and workflow relationships

```mermaid
classDiagram
    class PlatformAccount {
        account identity and status
        external identity links
    }
    class AuthorizationSession {
        credential generation
        idle and absolute expiry
    }
    class DiscordInstallation {
        application context and guild
        generation and health
    }
    class BillingOwner {
        accountable party
        authorized memberships
    }
    class CommercialCatalogRevision {
        plans add-ons bundles and packs
        immutable terms and components
    }
    class CommercialSubscription {
        provider-neutral lifecycle
        pinned product revisions
    }
    class PlatformEntitlementSnapshot {
        feature grants
        effective limits and perks
    }
    class AICreditAccount {
        source lots and journal
        posted and reserved balance
    }
    class AIOperation {
        pricing and policy snapshot
        provider attempts and result
    }
    class AICharacterRevision {
        behavior context and moderation
        presentation and spending policy
    }
    class TemplatePackageRevision {
        portable component manifest
        permissions and integrity
    }
    class TemplateInstallation {
        target tenant and plan
        effects and compensation
    }
    class WorkflowRevision {
        trigger and compiled graph
        dependency and policy manifest
    }
    class WorkflowExecution {
        trigger fact and action occurrences
        partial and terminal outcomes
    }

    PlatformAccount --> AuthorizationSession : authenticates through
    PlatformAccount --> BillingOwner : participates in
    BillingOwner --> DiscordInstallation : funds authorized scope
    CommercialCatalogRevision --> CommercialSubscription : pins terms for
    CommercialSubscription --> PlatformEntitlementSnapshot : projects
    BillingOwner --> PlatformEntitlementSnapshot : receives
    PlatformEntitlementSnapshot --> AICreditAccount : grants lots to
    AICreditAccount --> AIOperation : reserves for
    AICharacterRevision --> AIOperation : requests
    AIOperation --> WorkflowExecution : may fulfill AI action
    TemplatePackageRevision --> TemplateInstallation : instantiates
    TemplatePackageRevision --> WorkflowRevision : may contain
    WorkflowRevision --> WorkflowExecution : governs
    WorkflowExecution --> DiscordInstallation : requires capabilities from
    WorkflowExecution --> PlatformEntitlementSnapshot : requires grants from
```

These relationships are references across bounded contexts, not shared aggregate ownership. Billing never authorizes a Discord mutation by itself; identity, current guild authority, installation capability, platform entitlement, and the owning module's policy remain independent gates. A template can declare a workflow, but the installed workflow becomes a tenant-owned aggregate with its own revision and lifecycle.
