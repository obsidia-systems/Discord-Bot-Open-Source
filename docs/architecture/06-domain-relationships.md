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

    class DeliveryIntent {
        idempotency key
        effect kind
        target message
    }

    ModerationPolicyRevision --> ModerationActionRequest : authorizes
    ModerationActionRequest --> ModerationCase : opens
    AutoModerationPolicyRevision --> ModerationIncident : detects
    ModerationIncident --> ModerationActionRequest : may request
    ModerationIncident --> DeliveryIntent : may request platform owned delete
    ModerationCase --> ActivityRecord : publishes fact
    ModerationIncident --> ActivityRecord : publishes fact
    CleanupOccurrence --> ActivityRecord : publishes deletion outcomes
    DiscordAuditObservation --> ModerationCase : may correlate
    DiscordAuditObservation --> ActivityRecord : may attribute
```

`ModerationPolicyRevision` owns protected-user and protected-role product lists (DR-020). Discord Capability evaluates live Discord hierarchy and MAY apply a pinned revision snapshot; it does not own that policy.

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

    class RolePanelPublication {
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
    RolePanelRevision --> RolePanelPublication : projects through
    RoleResourceMutation --> DiscordRoleProjection : changes provider state
    DiscordRoleProjection --> RolePolicyRevision : validates targets
    DiscordRoleProjection --> RolePanelRevision : validates mappings
```

`DiscordRoleProjection` is the rebuildable guild-role catalog. **Role Resource** is its sole owner (DR-014). Discord remains provider-authoritative for live role bytes; the projection is rebuilt from Gateway role events and Transport inspect, never a second live truth. Discord Capability reads that catalog, or a disposable local copy, to produce permission, hierarchy, and member-role reports. Role Policy and Assignment owns desired member-role relations and MUST NOT write the catalog row. The mutation arrow records that a Role Resource mutation changes provider state and therefore the catalog; Capability and Assignment do not write that aggregate. `RolePanelPublication` is Role Panel's publication aggregate, not Support Panel publication (DR-015). Punitive member-role relations are Cases-owned desired state published as assignment intents; Assignment is the sole Transport client for add and remove (DR-068).

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

    class GuildRewardEntitlement {
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
    PurchaseOrder --> GuildRewardEntitlement : requests
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

    class StreamCanonicalIdentity {
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

    ProviderCapabilityProfile --> StreamCanonicalIdentity : validates
    StreamCanonicalIdentity --> StreamAlertRevision : monitored by
    StreamCanonicalIdentity --> ProviderSubscription : conditions
    ProviderSubscription --> ProviderIngressReceipt : authenticates generation of
    ProviderIngressReceipt --> ProviderObservation : normalizes into
    StreamCanonicalIdentity --> ProviderObservation : observed as
    ProviderObservation --> ExternalLiveSession : advances
    ExternalLiveSession --> StreamAlertOccurrence : emits through revisions
    StreamAlertRevision --> StreamAlertOccurrence : governs
    StreamAlertOccurrence --> DeliveryIntent : projects through
```

`StreamCanonicalIdentity` is Integration Registry's stream-channel aggregate (`STREAM_CANONICAL_IDENTITY`, DR-017). It is not Identity's platform login link (`PLATFORM_EXTERNAL_IDENTITY`).

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

Custom Command Definition, Application Command Registry, and Custom Command Runtime are three modules (DR-019). Workflow Definition and Runtime is one module and is not this graph.

### 11.9 Platform access, commercial, AI, template, and workflow relationships

```mermaid
classDiagram
    class PlatformAccount {
        account identity and status
        platform external identity links
    }
    class AuthorizationSession {
        opaque server-side identity
        idle and absolute expiry
    }
    class DiscordInstallation {
        application context and guild or user
        TENANT registry owner
        generation and health
    }
    class BillingOwner {
        accountable payer identity
        authorized memberships
        not a provider Customer
    }
    class CommercialCatalogRevision {
        plans add-ons bundles and packs
        immutable terms and components
    }
    class CommercialSubscription {
        provider-neutral lifecycle
        pinned product revisions
    }
    class CommercialInvoice {
        platform invoice identity
        integer minor units
        provider object as evidence
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
    class AIProtectedContent {
        purpose privacy and asset_id
    }
    class AICharacterRevision {
        behavior context and moderation
        presentation and spending policy
    }
    class AIConversation {
        bounded turns not bodies
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
    BillingOwner --> CommercialInvoice : owns
    CommercialSubscription --> CommercialInvoice : may issue
    CommercialCatalogRevision --> CommercialSubscription : pins terms for
    CommercialSubscription --> PlatformEntitlementSnapshot : projects
    BillingOwner --> PlatformEntitlementSnapshot : receives
    PlatformEntitlementSnapshot ..> AICreditAccount : grant-source events only
    AICreditAccount --> AIOperation : reserves for
    AICharacterRevision --> AIOperation : requests
    AIOperation --> AIProtectedContent : pins input and result
    AICharacterRevision --> AIConversation : isolates
    AIConversation --> AIProtectedContent : turns reference
    WorkflowExecution --> AIOperation : may request
    TemplatePackageRevision --> TemplateInstallation : instantiates
    TemplatePackageRevision --> WorkflowRevision : may contain
    WorkflowRevision --> WorkflowExecution : governs
    WorkflowExecution --> DiscordInstallation : requires capabilities from
    WorkflowExecution --> PlatformEntitlementSnapshot : requires grants from
```

These relationships are references across bounded contexts, not shared aggregate ownership. Billing never authorizes a Discord mutation by itself; identity, current guild authority, installation capability, platform entitlement, and the owning module's policy remain independent gates. A template can declare a workflow, but the installed workflow becomes a tenant-owned aggregate with its own revision and lifecycle. Workflow Definition and Runtime remains one module (DR-019); `WorkflowRevision` and `WorkflowExecution` share that owner. There is no domain Customer aggregate. `BillingOwner` is the payer; a provider Customer object is mapping evidence. Two owners MUST NOT concurrently fund the same installation (DR-055). Dunning retries collect one Open renewal invoice and MUST NOT mint a new order (DR-056). Mid-period money uses a pinned proration quote in integer minor units; unused time is not a refund (DR-057). A mixed Recurring+OneTime Bundle splits into two sibling orders under a checkout group; Recurring checkout is first; `Partial` is not an automatic refund (DR-058). Discord Installation owns the TENANT registry; first-product `tenant_type` is `Guild` or `User`; `tenant_id` is not a Discord snowflake (DR-059). Due-work claim leases use 15 Clock-port second TTL so worker-loss recovery stays strictly below 60 seconds (DR-060).

Platform Entitlement MUST NOT write AI Credit lots, reservations, or journal rows. It MAY publish AI-credit grant-source facts after applying a `GRANT_SOURCE` row (plan grant, pack, promotion, compensation, achievement). Billing publishes commercial grant facts to Entitlement only; it MUST NOT write lots or Entitlement `GRANT_SOURCE` tables. AI Usage Ledger is the only module that creates lots and posts the journal. A workflow that needs AI requests an AI operation; an AI operation does not own workflow execution. Conserved commercial and AI Credit amounts are integer minor units (DR-016). Public money-plane contracts set `schema_family` `VirtualPayment`, `CommercialPayment`, or `AiCreditReservation`; §8.6 leaves stay (DR-065). Guild commerce-reward public contracts are `GuildRewardEntitlement`; module 7.35 is not deleted (DR-066). Unprefixed `Entitlement*` names MUST fail closed at parse; consumers MUST NOT infer the plane from payload fields (DR-069). Lot `expires_at` is frozen at mint; new reservations skip expired lots; allocation is earliest `expires_at` first; reservation TTL is 15 Clock-port minutes and MUST NOT auto-release (DR-061). Reservation `Disputed` is Ledger review; the paired operation MUST remain `Uncertain` and MUST NOT gain `Disputed` (DR-070). Provider HTTP 429 is `RateLimited` and MAY retry; timeout after transmit is `Uncertain` and MUST NOT blind-retry or auto-fallback (DR-062). Asset is the sole durable AI byte store; Execution owns protected content; Character owns bounded conversation turns (DR-063). Owner-schema tables are not envelope majors; breaking private DDL follows expand, dual-write, contract, then drop (DR-064).

#### Decision Record DR-003

**Status:** Accepted.

**Decision:** AI Usage Ledger is the sole writer of AI Credit lots and journal entries. Platform Entitlement emits grant-source events. Workflow execution may request an AI operation; the reverse arrow is forbidden.

**Rejected Alternative:** Platform Entitlement as lot owner; AI operations fulfilling or owning workflow executions.

#### Decision Record DR-054

**Status:** Accepted.

**Decision:** `GRANT_SOURCE` is owned by Platform Entitlement. Billing commercial grant facts are inputs. Only Entitlement publishes AI-credit grant-source to the Ledger.

**Rejected Alternative:** Billing writing lots; Billing writing Entitlement grant-source tables; dual Billing and Entitlement lot publishers.

#### Decision Record DR-055

**Status:** Accepted.

**Decision:** There is no domain Customer aggregate. `BillingOwner` is the payer identity. Provider Customer objects are mapping evidence.

**Rejected Alternative:** Stripe Customer as payer identity; a second Customer type beside BillingOwner.

#### Decision Record DR-056

**Status:** Accepted.

**Decision:** Dunning retries collect one Open renewal invoice. They MUST NOT mint a new CommercialOrder. Exhaustion at `grace_until` restricts the subscription.

**Rejected Alternative:** A new order per retry; webhook ACK as Restricted.

#### Decision Record DR-057

**Status:** Accepted.

**Decision:** Proration is a Billing quote in integer minor units. Negative delta is next-invoice credit, not a refund.

**Rejected Alternative:** Stripe preview as the amount; unused time as a refund row.

#### Decision Record DR-058

**Status:** Accepted.

**Decision:** Mixed Recurring+OneTime Bundles split into two sibling orders under a checkout group. Recurring hosted session first. A single order MUST NOT mix modes. Mixed Recurring intervals fail closed. Partial fulfillment is not an automatic refund.

**Rejected Alternative:** One hosted session spanning both modes; forbidding mixed Bundles in the catalog; auto-refunding the paid sibling.

#### Decision Record DR-059

**Status:** Accepted.

**Decision:** Discord Installation owns the TENANT registry. First-product `tenant_type` is `Guild` or `User`. `tenant_id` is platform identity, not a Discord snowflake. Uninstall does not delete TENANT.

**Rejected Alternative:** Identity or Billing owning TENANT; `tenant_id` equal to a Discord snowflake; deleting TENANT on Installation `Removed`.

#### Decision Record DR-060

**Status:** Accepted.

**Decision:** Due-work claim `lease_ttl` is 15 Clock-port seconds. Heartbeat is at most one-third of TTL. Worker-loss recovery stays strictly below 60 seconds.

**Rejected Alternative:** TTL of 60 seconds; a Durable Timer per lease expiry.

#### Decision Record DR-061

**Status:** Accepted.

**Decision:** Lot `expires_at` is frozen at mint. Reservation TTL is 15 Clock-port minutes and MUST NOT auto-release. TTL without a confirmed outcome becomes `Uncertain`.

**Rejected Alternative:** Silent TTL release; expiring reserved allocations in place; FIFO ignoring earlier `expires_at`.

#### Decision Record DR-062

**Status:** Accepted.

**Decision:** HTTP 429 is `RateLimited`, not `Uncertain`. Timeout after transmit is `Uncertain` and MUST NOT release or blind-retry.

**Rejected Alternative:** Treating 429 as `Uncertain`; releasing on response timeout; auto-fallback after unknown outcome.

#### Decision Record DR-063

**Status:** Accepted.

**Decision:** Asset is the sole durable AI byte store. Execution owns protected content. Character owns bounded conversation turns.

**Rejected Alternative:** Asset as conversation or OCR authority; a second object store; Support Archive for character history.

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
