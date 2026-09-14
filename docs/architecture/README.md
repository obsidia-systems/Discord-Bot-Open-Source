# Tobot Architecture Specification

This directory is the canonical, navigable form of the greenfield distributed architecture specification. Section numbers are stable across files and remain the normative reference identifiers.

## Recommended reading paths

- **Architecture overview:** foundations, service topology, contracts, runtime flows, state models, and invariants.
- **Platform implementation:** service topology, contracts, runtime flows, data volumes, Discord governance, operations, and recovery.
- **Product implementation:** foundations, contracts, invariants, the applicable domain data volume, and the applicable product specification.
- **Architecture review:** foundations, service topology, domain relationships, data volumes, security and operations, governance, and invariants.

## Navigation

| Order | Document | Sections | Purpose |
|---:|---|---|---|
| 1 | [Foundations](01-foundations.md) | Document status, 1–5 | Scope, goals, decisions, requirements, and system context |
| 2 | [Service topology](02-service-topology.md) | 6–7 | Logical deployment topology and service catalog |
| 3 | [Canonical contracts](03-canonical-contracts.md) | 8 | Public envelopes and domain contracts |
| 4 | [Runtime flows](04-runtime-flows.md) | 9 | End-to-end success, retry, and reconciliation flows |
| 5 | [State models](05-state-models.md) | 10 | Normative aggregate and workflow lifecycles |
| 6 | [Domain relationships](06-domain-relationships.md) | 11 | Conceptual relationships across bounded contexts |
| 7 | [Core data architecture](07-data-core.md) | 12.1–12.4 | Ownership, event, delivery, messaging, scheduling, and automatic reply data |
| 8 | [Safety and access data](08-data-safety-and-access.md) | 12.5–12.8 | Moderation, activity, security, containment, and role data |
| 9 | [Community and economy data](09-data-community-and-economy.md) | 12.9–12.10 | Community, ledger, commerce, entitlement, and casino data |
| 10 | [Support, integration, and automation data](10-data-support-integrations-automation.md) | 12.11–12.13 | Support, stream-alert, command registry, and reminder data |
| 11 | [Platform access, commercial, and AI data](10a-data-platform-access-commercial-ai.md) | 12.14 | Identity, installation, billing, platform entitlement, AI usage, template, and workflow data |
| 12 | [Partitioning, Discord safety, and backpressure](11-partitioning-discord-backpressure.md) | 13–16 | Ordering, Discord controls, retry taxonomy, concurrency, and fairness |
| 13 | [Security, observability, and deployment](12-security-observability-deployment.md) | 17–20 | Trust boundaries, security controls, telemetry, portability, and infrastructure contracts |
| 14 | [Recovery, testing, and governance](13-recovery-testing-governance.md) | 21–23 | Disaster recovery, verification, and architecture evolution |
| 15 | [Platform invariants and module boundaries](14-invariants-and-boundaries.md) | 24–25 | Non-negotiable invariants and ownership summary |
| 16 | [Moderation and safety](15-moderation.md) | 26 | Moderation, automatic moderation, activity, audit, and cleanup specification |
| 17 | [Security and containment](16-security-and-containment.md) | 27 | Raid, anti-nuke, incident, lockdown, and restoration specification |
| 18 | [Roles and member access](17-roles-and-access.md) | 28 | Automatic roles, panels, assignment, and resource governance specification |
| 19 | [Community experiences](18-community.md) | 29 | Progression, starboard, giveaway, forms, and temporary-room specification |
| 20 | [Virtual economy and commerce](19-economy.md) | 30 | Ledger, income, commerce, entitlements, and casino specification |
| 21 | [Support and ticketing](20-support.md) | 31 | Panels, case workflow, private resources, and transcript specification |
| 22 | [External integrations and stream alerts](21-integrations.md) | 32 | Provider identity, ingestion, observations, live sessions, and alert specification |
| 23 | [Custom commands and reminders](22-automation.md) | 33 | Command registry, sandboxed execution, scheduling, and reminder specification |
| 24 | [Platform access, commercial products, and AI](23-platform-access-commercial-ai.md) | 34 | Authentication, Discord installation, subscriptions, limits, AI usage, templates, workflows, and characters |

## Document conventions

- Normative keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** retain their meaning across every file.
- Cross-file references use stable section numbers first and filenames second.
- Product specifications may depend only on platform contracts and capabilities declared in sections 1–25.
- Diagrams remain normative where the surrounding text identifies lifecycle, ownership, ordering, or failure behavior.
- Every file is written in English and contains specification material rather than implementation code.
