# Tobot S6 — Guild ledger and one earning action

[Roadmap](../26-implementation-roadmap.md) · [Method](../25-implementation-roadmap-method.md) · [S5 ledger](S05-support-ticket.md)

## Plan status

| Attribute | Value |
|---|---|
| Status | Planned, not implemented. Work packages below have no exit evidence yet. |
| Slice | S6 — first conserved guild-money plane |
| Outcome | A member uses `/daily` once, receives a fixed amount of non-redeemable guild currency, and reads the committed wallet balance on `dash.*`. |
| Normative inputs | 02 §§7.32–7.33 and §6.4; 03 §§8.1–8.2, 8.6, 8.21–8.22, 8.55 and DR-065; 05 §§10.18–10.19; 09 §12.10 monetary and income models; 19 §§30.1–30.9, 30.14–30.15, 30.21, 30.43–30.47; 13 monetary/income recovery and ledger tests; shared 14 §25 forbidden columns and invariants 73–80, 88–89. |
| Entry evidence | S5's Discord button, persisted ticket, and dashboard claim/close outcome were demonstrated. Its WP6 live checks remain in S05 and are not counted as passed here. S0 release gates remain Partial. |
| Boundary | Guild virtual units cannot be redeemed, purchased for real consideration, cashed out, transferred across tenants, or substituted for `CommercialPayment` or `AiCreditReservation`. |
| Next slice | S7 stays closed until this slice demonstrates conserved postings, idempotent income settlement, and an honest wallet read. |

This is an implementation plan, not a change to RFC sections 01–23. If a choice here conflicts with those RFCs, the RFC wins. The existing platform implementation uses `dash.tobot.test` for the cookie site; the normative `app.*` surface in 26 maps to that origin for this slice.

26 §1 requires **one earning action plus wallet read**. The chosen action is a fixed `/daily` claim with an exact 24-hour elapsed cooldown measured by the server Clock. “Daily” is the command name, not a civil-calendar or timezone promise. The operator publishes an immutable currency policy and an immutable income-policy revision before claims are enabled. If only one publication succeeds, the operator screen reports setup as incomplete and `/daily` rejects admission until both active revisions are compatible. The demo policy uses one wallet-only currency, a one-time starting grant of 100 units, and a fixed claim of 10 units; those numbers are demo configuration, not hardcoded product defaults. No bank or second currency is enabled in S6.

## 1. Outcome

- **Discord:** a guild member invokes `/daily`. Edge defers an ephemeral response within the interaction deadline. Earnings records one durable claim and asks Monetary Ledger to settle it. The final response states the awarded amount and the **committed** wallet balance, or states that settlement is pending. A second claim inside the cooldown states the next available time and creates no posting.
- **`dash.*`:** the signed-in member sees their own guild wallet's current and available balance, currency identity, source watermark, and recent S6 postings. Before an account exists, the page says “No wallet yet”; it does not turn a read into account creation. An authorized guild operator can publish the minimal currency and daily policies and inspect health on the same module screen. No client-supplied member id, balance, policy revision, or permission bit is authority.

```mermaid
sequenceDiagram
    participant Member
    participant Edge as Discord Edge
    participant Earnings as Earnings in Control Plane
    participant Ledger as Monetary Ledger
    participant Delivery
    participant Dash as dash.*
    Member->>Edge: /daily interaction
    Edge->>Member: Ephemeral defer
    Edge-->>Earnings: Durable InteractionAccepted fact
    Earnings->>Earnings: Admit one action and cooldown reservation
    Earnings->>Ledger: Command-HTTP with VirtualPayment family and semantic key
    Ledger->>Ledger: Ensure wallet/grant; balanced income posting
    Ledger-->>Earnings: Committed receipt or explicit rejection/uncertainty
    Earnings->>Delivery: Edit original ephemeral response
    Dash->>Ledger: Tenant- and member-scoped wallet read through Control API
```

The Discord response is presentation, never a prerequisite for a monetary commit. If the interaction token expires, the action and settlement remain durable and the dashboard still shows the result. A missing ledger response is `SettlementUncertain`, never proof that no posting occurred.

## 2. Enabled modules and installation

Enable only Monetary Ledger and Earnings and Income for this slice. `/daily` is a guild application command registered through the existing command-install path. It needs no new bot permission bit, privileged intent, message-content access, or member-role mutation. The install permission union and Gateway identify intents stay at their already published values; verify this against the current manifest before deployment. Existing `Installed` generations are not force-degraded or repaired just to enable S6.

The member wallet page needs a server-validated link from the OAuth account's Discord user id to the guild member. Extend the member read path without granting access to the operator settings routes. Guild discovery or a dashboard-posted member id is not a balance-read authorization receipt. Policy publication remains operator-only with the existing session, Origin, CSRF, tenant, and fresh authority checks.

## 3. Services and ownership

Monetary Ledger is a **new private process and database**. In local Compose use a separate `tobot_ledger` database and `TOBOT_LEDGER_DATABASE_URL`; production must preserve the separate writable database and credential boundary. The Ledger process alone receives its write credential. It receives no Discord bot token and cannot call Discord. It exposes typed, authenticated command-HTTP and scoped read endpoints only to Control Plane. Service authentication alone does not authorize a money command: the Ledger also verifies a tenant- and operation-scoped actor or owner-service receipt, its freshness, and the active policy. It publishes facts from its own transactional outbox to the existing `tobot:events:v1` stream. No fourth money plane, shared `balance` table, or direct SQL join from Control Plane is allowed.

Earnings and Income may be hosted in Control Plane for this first action, but owns its own schema, inbox, outbox, action, policy, cooldown, and settlement reference. It does **not** write Ledger accounts or postings. Its due settlements and reconciliation claims use bounded, tenant-fair batches with 15-second fenced leases; an in-process queue is only a wake-up hint. Query and Status owns only a rebuildable wallet projection; it may lag the journal and must expose its watermark. Control API may use an authoritative Ledger read when a required watermark has not reached Query, or return `ProjectionPending` within a bounded budget.

| Place | S6 change |
|---|---|
| `tobot-envelope` | Add conditional `schema_family` to command and event envelopes; require `VirtualPayment` on S6 money-plane leaves while preserving N/N-1 reading of existing non-money facts. |
| `tobot-monetary-ledger` / Ledger persistence | Separate binary, migration set, balanced journal, accounts, one-time grant, idempotency receipts, transactional projections and outbox, reconciliation, read/write circuits. |
| Earnings owner in Control Plane | Immutable fixed-claim policy, durable action/cooldown decision, semantic settlement request, Ledger receipt reconciliation, ephemeral response state. |
| Discord Edge / Delivery | Register and route `/daily`; defer ephemerally and edit the original response. No direct balance or Ledger writes. |
| Query / `dash.*` | Wallet read with freshness and a minimal operator policy surface. The member sees only their own account. |

## 4. Inbound contracts

S6 admits these narrowly scoped commands. The owner authenticates and binds `tenant_id`; `schema_family` is exactly `VirtualPayment` on every money-bearing command. Public HTTP or Discord interaction data cannot name a Ledger settlement source arbitrarily.

| Command | Owner and admission |
|---|---|
| `PublishCurrencyPolicy` | Ledger, from an authorized Control API operator command. One wallet-only currency, explicit issuance account, one-time grant, fixed ceilings, and write switches. Immutable revision. |
| `PublishIncomePolicy` | Earnings, from the same operator authority. Exactly one fixed `/daily` rule, positive integer payout, exact elapsed cooldown, ceiling, and policy revision. Requires a usable currency revision. |
| `EnsureMemberWallet` | Ledger, private Earnings caller with a scoped owner-service receipt. Stable member and onboarding-grant identity; creates one wallet and at most one starting-grant transaction. |
| `SettleIncomeAction` | Ledger, private Earnings caller with a scoped owner-service receipt. Pins the admitted `income_action_id`, member, amount, policy revision, source interaction, and semantic idempotency key. Ledger revalidates account/currency/ceiling and returns its committed receipt. |

`InteractionAccepted` remains the ingress fact; it does not acquire a money-plane family merely because its payload names `/daily`. Earnings accepts only the registered guild command with matching tenant, application, installation generation, actor, and interaction identity. It mints the Ledger commands after admission. A duplicate interaction maps to the existing income action. A different interaction during an active or pending cooldown produces no second action or payout.

The S6 public facts admitted from §8.6 are `CurrencyPolicyPublished`, `AccountOpened`, `MonetaryTransactionPosted`, `BalanceProjectionChanged`, `LedgerReconciled`, `IncomePolicyPublished`, `IncomeActionAdmitted`, `IncomeActionSettled`, and `IncomeActionRejected`. All S6 money-plane facts carry `schema_family: "VirtualPayment"`, an immutable source reference, correlation id, and owner outbox identity. `*Requested` facts, if emitted internally, are **facts**, not a substitute for a §8.2 Ledger command.

Fail closed: an absent or wrong family on an S6 leaf; unprefixed `Payment`, `Reservation`, or money `Catalog`; `CommercialPayment`, `AiCreditReservation`, `PurchasePaymentCaptured`, `StockReserved`, and all S7/S8 leaves at S6 handlers; float, zero, negative, overflowing, cross-tenant, client-chosen settlement, or stale-version monetary inputs; and unsupported income classes or account operations. Existing non-money leaves keep their existing parse behavior.

## 5. Outbound Discord

Only the current `INTERACTION_CREATE` Gateway path and Delivery's deferred-response edit are needed. Edge sends callback type 5 with ephemeral flag 64 before waiting for Earnings, Ledger, Redis publication, or Query. Delivery edits `@original` with a settled amount and Ledger-confirmed balance, an ineligible next-available time, a rejected policy result, or “processing pending.” A successful Discord edit cannot commit money, and an edit failure cannot reverse a committed posting. `/probe`, `/timeout`, and the S5 support button keep their current routing and ACK behavior.

## 6. Data and transaction boundary

The new Ledger database owns its independent versioned migrations. It stores `currency_policy` and immutable revisions; system and member `monetary_account`; immutable `monetary_transaction` and at least two `monetary_posting` lines per transaction; transactional `balance_projection`; semantic `idempotency_receipt`; one-time `starting_grant_receipt`; reconciliation checkpoint/report; private service authorization and write-switch state; inbox and outbox. The separate platform database's next available migrations after `0023` add Earnings policy/revision, `income_action`, cooldown reservation, settlement reference, inbox/outbox, and a Query wallet projection. No cross-database foreign key or shared writable table is introduced.

Every amount is a checked bounded integer in minor virtual units. A posted transaction has one tenant and currency, equal debits and credits, positive posting amounts, and an explicit issuance source or destination. Member wallet current and available values cannot be negative or exceed the active ceiling. System issuance exposure is tracked against its configured ceiling. Transaction header, postings, affected balance projections, idempotency receipt, and outbox facts commit in **one Ledger database transaction**. A rollback leaves no value movement. The projection is derived truth at a journal watermark, never an independent balance edit.

On first claim, `EnsureMemberWallet` creates the member account, starting-grant transaction and receipt in one local commit when the grant is configured. It uses a stable onboarding-grant policy identity that does not change when a new policy revision is published. The later 10-unit demo income settlement is a separate balanced transaction with its own semantic key. If the grant succeeds but the income posting is pending or rejected, the grant remains posted and the user response states the actual state; no synthetic 110-unit balance is shown.

Earnings atomically commits the admitted action, policy/formula receipt, and one cooldown reservation before calling Ledger. The receipt pins the fixed payout and server-derived next-available instant. Pending settlement blocks a second claim for that member/rule. A confirmed settlement activates the 24-hour cooldown. A terminal Ledger rejection ends the reservation according to the published rule and does not count as a successful claim. A lost response is reconciled by the **same** Ledger key before any retry; no new payout decision is made. Worker recovery must never regenerate the action identity or fixed amount.

The first slice does not expose holds, payment reservations, bank deposits or withdrawals, transfers, tax, reversals, arbitrary adjustments, or account freezes as user commands. Their names and handlers fail closed; they are not simulated by mutable balance updates. Ledger schema and private APIs must leave room for later append-only classes without pre-implementing Commerce or Casino.

## 7. Tests and release gates

Use disposable `tobot_test` and a separate disposable Ledger test database. No test connects to the live `tobot` or `tobot_ledger` databases. The S6 test matrix is the subset of 13 and 19 exercised by this slice:

- Contract tests: `schema_family` required and exactly `VirtualPayment` for S6 leaves and commands; existing non-money N/N-1 envelopes still parse; wrong-plane and unprefixed money names fail closed.
- Ledger property and PostgreSQL tests: every posted transaction balances by tenant/currency; no partial header/posting/projection/outbox commit; checked integer overflow and ceiling rejection; no negative wallet; duplicate key returns the original receipt; same key with different normalized request conflicts; concurrent first-use yields one wallet and one starting grant even after policy revision; journal replay rebuilds the same projection.
- Earnings tests: concurrent and repeated `/daily` clicks admit one action per cooldown; a rejected or pending settlement follows its explicit cooldown rule; response loss and worker restart reuse one semantic Ledger key; a forged member, tenant, policy revision, or amount cannot authorize a payout.
- Read tests: the signed-in member cannot read another member's wallet or another guild's wallet; GET creates no account; Query lag is explicit and never displays an older balance as the confirmed result; unauthenticated and foreign-tenant requests fail closed.
- Recovery tests: kill Earnings before Ledger response and after Ledger commit; restart discovers the one posting by key and produces one action outcome within 60 seconds. Kill Ledger before commit and after commit-before-response; retry returns zero or one committed transaction as appropriate, never two. Reconcile before write readiness and open the affected write circuit on imbalance or projection divergence. Discord edit failure does not alter the journal.
- Operational tests: credit and daily-claim switches reject new actions when disabled while permitting reads and integrity inspection; the Ledger process has no bot token; Control Plane cannot write Ledger tables; public Ledger routes and metrics are rejected.

The S6 release gate is **not** merely a passing `/daily` reply. It requires a balanced journal, one starting grant, one claim posting, independent projection verification, idempotent crash recovery, and a member-scoped wallet read. Keep S0 release gates and the S05 WP6 carry-forward checks in their own ledgers.

## 8. Explicitly out of scope

- Fiat or redeemable value, cash-out, real-money purchase of units, exchange, lending, credit, debt, cross-guild transfers, or externally tradable tokens.
- Shop, catalog, stock, purchase, refund, guild reward entitlement, casino, wagers, payment holds, and AI Credits. Their public names remain unadmitted by S6 handlers.
- Bank UI, deposit, withdrawal, member transfer, tax, arbitrary adjustment, wealth leaderboard, multiple currencies, currency conversion, and user-defined currency policy.
- Civil-calendar daily resets, streaks, weekly/monthly claims, salary, job, crime, robbery, activity income, randomized formulas, or scheduled distribution.
- New Discord permissions/intents, public balance messages, a second event stream, a product WebSocket, or direct Discord HTTP from Earnings or Ledger.
- Closing S0 release gates, S05 WP6 evidence, or the open S2–S4 demos by implication.

## 9. Demo script

1. Start the separate Ledger database and process with its own credential. Verify Control Plane, Edge, and Delivery cannot write its tables; the Ledger process has no bot token. Publish the wallet-only currency policy and the fixed `/daily` policy from an authorized `dash.*` session.
2. Record tenant, currency id, policy revision ids, installation generation, initial journal watermark, and system issuance totals. An unauthorized operator and a member cannot publish either policy.
3. With a non-bot member account, invoke `/daily`. Discord defers ephemerally, then returns the fixed 10-unit award and Ledger-confirmed 110-unit demo wallet balance. Record interaction id, income action id, starting-grant transaction id, income transaction id, and journal watermark.
4. Open the member's wallet page on `dash.*`. It shows that member's current and available balance, currency id, and a watermark at least as new as the claim. A different member, foreign guild, and unauthenticated browser cannot see it. A pre-claim wallet GET creates nothing.
5. Retry the same interaction and then invoke `/daily` again before 24 hours. The first maps to the original action/transactions; the second reports the next eligible time. Journal and member balance do not change.
6. Kill Earnings after the action is durable but before the Ledger response; restart and reconcile by semantic key within 60 seconds. Kill Ledger in a disposable run on both sides of its commit boundary. Each run leaves exactly one balanced income posting or none and never a fabricated success response.
7. Rebuild the wallet projection from the journal checkpoint. Record matching balances and issuance totals. Deliberately corrupt a **disposable** projection and verify write readiness closes until reconciliation; do not corrupt the live database.
8. Disable daily admission and credit writes through authenticated audited controls. New claims reject, while wallet reads and integrity inspection still work. Restore the switches and record health. Existing `Installed` generations remain in their original state throughout.

## 10. Work packages

Implement in order. A later package may be reviewed early, but it does not merge against an open owner, money-plane contract, or journal invariant from an earlier package.

### WP1 — Contracts and boundaries

Extend the envelope with conditional `schema_family`, add only the S6 leaves and typed command-HTTP payloads from §4, and pin the chosen policy shape. Publish fail-closed examples for other money planes and unsupported operations. Confirm the install permission union and the member identity path before wiring `/daily`.

**Exit:** contract tests prove correct `VirtualPayment` family, wrong-plane rejection, non-money backward compatibility, tenant binding, and bounded integer payloads.

### WP2 — Monetary Ledger owner

Add the separate binary/database and migrations, private command/read API, currency-policy revisions, wallet and issuance accounts, one-time grant, balanced journal, transactional projections, idempotency receipts, outbox, reconciliation, and write circuits. No Discord credential or Control Plane write grant enters this process.

**Exit:** PostgreSQL proofs pass for balance, atomicity, ceilings, concurrent first use, duplicate/conflicting keys, projection rebuild, and kill/retry around commit.

### WP3 — Earnings decision owner

Add immutable fixed `/daily` policy, action occurrence, cooldown reservation, formula receipt, settlement reference, and a reconciler that uses Ledger's semantic key. Earnings does not read or write Ledger SQL.

**Exit:** one winner under concurrent claims; pending or rejected settlement is honest; retries and process restart create no second action or payout.

### WP4 — Discord path

Register `/daily` for guild installations. Route the verified interaction through Edge, defer it ephemerally, admit it in Earnings, and edit the original response through Delivery. Preserve the S0/S1/S5 interaction paths.

**Exit:** the callback fits the three-second budget, one confirmed award names the Ledger receipt, an uncertain settlement says pending, and presentation failure does not reverse money.

### WP5 — Wallet screen and query

Add the member-scoped wallet route and operator policy controls on `dash.*`, plus a Query projection with watermark and an authoritative read fallback or `ProjectionPending`. The GET path is read-only and the member id comes from the session.

**Exit:** own-wallet read succeeds with a committed watermark; foreign member/tenant reads and unauthorized policy writes fail; stale Query never masquerades as a current post-claim balance.

### WP6 — Recovery and live proof

Run §7 and §9, record artifact ids and balances below, and exercise the independent read/write circuits. Leave the S05 carry-forward ledger untouched and S0 release gates Partial.

**Exit:** all eight demo steps have recorded evidence, one tenant-currency journal balances, the wallet projection reconciles, and worker loss does not mint an extra unit.

## 11. Execution tracking

This ledger begins at planning time. A package becomes Complete only when its exit evidence is recorded here; implementation intent or a green UI alone is not proof.

| Package | Status | Evidence |
|---|---|---|
| WP1 — Contracts and boundaries | Planned | — |
| WP2 — Monetary Ledger owner | Planned | — |
| WP3 — Earnings decision owner | Planned | — |
| WP4 — Discord path | Planned | — |
| WP5 — Wallet screen and query | Planned | — |
| WP6 — Recovery and live proof | Planned | — |
