# IYASAKA Orchestration Shared DB Plan

Status: draft
Date: 2026-06-25
Owner package for this document: Shirube / ai-dev-framework

## Purpose

This document records the shared architecture direction for integrating the following packages into a future orchestration package while preserving standalone operation for each package:

- Shirube: `watchout/ai-dev-framework`
- AUN / agent-com: `watchout/agent-comms-mcp`
- Kusabi / wasurezu: `watchout/agent-memory`
- Kodama: `watchout/kodama`
- Rasen: `watchout/rasen`

The core decision is:

> Use one shared database for cross-package visibility, evidence, and linking, but do not turn that database into shared ownership of every package's internal state.

Each package keeps its own responsibility boundary and standalone mode. The shared DB is used for projection, references, evidence, and orchestration handoff.

## Tracking issues

- Shirube: https://github.com/watchout/ai-dev-framework/issues/511
- AUN / agent-com: https://github.com/watchout/agent-comms-mcp/issues/814
- Kusabi / wasurezu: https://github.com/watchout/agent-memory/issues/211
- Kodama: https://github.com/watchout/kodama/issues/23
- Rasen: https://github.com/watchout/rasen/issues/5

## Responsibility boundaries

| Package | Owns | Must not own |
|---|---|---|
| Shirube | SSOT, Work Orders, delivery graph, gates, audit, acceptance checks, stop reasons | job queue, distributed locks, notification channels, session restart, runtime lifecycle |
| AUN | agent identity, runtime instances, message delivery, queue claim/finalization, conversations, batons, leases, dispatch safety | SSOT/gates, memory retention, restart-pack content, product strategy |
| Kusabi | decisions, task state, knowledge, redacted event memory, recovery config, recovery quality, selected restart packs | AUN queue mutation, baton mutation, delivery/finalization/reply/close |
| Kodama | source registration, permissions, retrieval evidence, context packs, provenance, citations, omissions, redaction/injection-risk labels | runtime execution, memory retention policy, restart policy, Shirube gates |
| Rasen | product strategy, offers, campaigns, leads, delivery templates, metrics, learning loops | runtime worker, queue owner, memory engine, gate engine |

## Target database layout

Use one PostgreSQL database with package-separated schemas.

```text
core.*
  events
  artifact_refs
  evidence_refs
  entity_links
  outbox

shirube.*
  work_orders
  gate_runs
  acceptance_checks
  delivery_graph_nodes
  delivery_graph_edges
  ssot_refs
  run_state_snapshots

aun.*
  agents
  agent_workspaces
  agent_runtime_instances
  agent_messages
  message_queue
  conversations
  conversation_batons
  control_plane_leases
  audit_log

kusabi.*
  decisions
  task_states
  knowledge
  raw_events
  conversation_events
  recovery_config
  recovery_quality_log
  selected_restart_packs

kodama.*
  sources
  source_permissions
  source_chunks
  retrieval_runs
  context_packs
  context_pack_items
  omissions
  permission_snapshots

rasen.*
  products
  offers
  offer_versions
  campaigns
  leads
  sales_pipeline
  deal_events
  delivery_templates
  metrics
  learning_log
```

## Minimal shared core schema

The first shared layer should be intentionally small.

```sql
create schema if not exists core;

create table core.artifact_refs (
  id uuid primary key,
  owner_package text not null,
  artifact_kind text not null,
  uri text not null,
  repo_full_name text,
  path text,
  commit_sha text,
  content_hash text,
  sensitivity text not null default 'internal',
  created_at timestamptz not null default now()
);

create table core.events (
  id uuid primary key,
  schema_version text not null,
  producer text not null,
  event_type text not null,
  org_id text not null default 'default',
  project text,
  agent_id text,
  session_id text,
  conversation_id uuid,
  task_id text,
  artifact_ref_id uuid references core.artifact_refs(id),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create table core.evidence_refs (
  id uuid primary key,
  evidence_kind text not null,
  producer text not null,
  subject_type text not null,
  subject_id text not null,
  artifact_ref_id uuid references core.artifact_refs(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table core.entity_links (
  id uuid primary key,
  from_type text not null,
  from_id text not null,
  relation text not null,
  to_type text not null,
  to_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Add `core.outbox` only when event dispatch becomes necessary. Until then, package adapters can write direct projection events.

## Primary orchestration flow

```text
Rasen
  product / offer / campaign / lead / learning source
      ↓
Shirube
  Work Order / SSOT / Gate / Acceptance Check
      ↓
Kodama
  context-pack/v1 with provenance, permission, redaction, citation, omission evidence
      ↓
AUN
  agent / runtime / queue / conversation / baton execution
      ↓
Kusabi
  decision / task state / knowledge / restart-pack evidence
      ↓
AUN
  restart / requeue / handoff / finalization when required
      ↓
Shirube
  gate / audit / completion evidence
      ↓
Rasen
  delivery, metrics, case study, lost reason, next improvement
```

## Package-specific integration requirements

### Shirube

Shirube keeps `.framework/` and `run-state.json` as standalone-authoritative state. Shared DB use starts as additive projection only.

Required additions:

- document the Work Order / Gate / Acceptance Check DB projection contract;
- mirror lifecycle events into `core.events` when shared DB is configured;
- attach `core.evidence_refs` for audit results, acceptance checks, Kodama context packs, and Kusabi recovery evidence;
- keep `shirube status --json`, `shirube run --start-only --json`, `shirube run --heartbeat --json`, and `shirube audit all` working without DB.

Tracking issue: https://github.com/watchout/ai-dev-framework/issues/511

### AUN / agent-com

AUN is the runtime control-plane owner.

Required additions:

- consume Shirube Work Orders without parsing `.framework/` internals;
- convert approved work into queue/conversation/baton execution;
- attach Kodama context-pack evidence to runtime execution;
- call Kusabi recovery tools when restart/requeue evidence is needed;
- keep queue claim, heartbeat, finalization, failure, and baton transitions DB-visible;
- preserve PostgreSQL full mode and file-based fallback mode.

Tracking issue: https://github.com/watchout/agent-comms-mcp/issues/814

### Kusabi / wasurezu

Kusabi is the memory and restart-pack evidence owner.

Required additions:

- make `restart_prepare` stable enough for AUN to consume;
- return selected restart-pack refs, recovery confidence, missing-context notes, and provenance;
- link recovery evidence to AUN conversations and Shirube Work Orders through refs;
- avoid direct mutation of AUN queue, baton, delivery, finalization, reply, or close state;
- keep SQLite default standalone mode and PostgreSQL/pgvector mode working.

Tracking issue: https://github.com/watchout/agent-memory/issues/211

### Kodama

Kodama is the shared context and evidence provider.

Required additions:

- implement durable source and retrieval stores, starting with SQLite and later PostgreSQL/shared-DB mode;
- persist context-pack refs and retrieval evidence;
- keep `context-pack/v1` as schema-validated structured output;
- preserve permission, provenance, sensitivity, redaction, injection-risk, citation, and omission evidence;
- keep local/self-hosted MCP operation working without the orchestration stack.

Tracking issue: https://github.com/watchout/kodama/issues/23

### Rasen

Rasen is the business/product Growth OS owner.

Required additions:

- document product/campaign/deal/metric projection shape;
- keep YAML/Markdown files as source of truth at first;
- convert selected product/campaign work into explicit Shirube Work Order drafts;
- require explicit acceptance criteria before AUN execution;
- make weekly reports and learning logs referenceable by Kodama with provenance;
- keep repo-only operation working with no DB.

Tracking issue: https://github.com/watchout/rasen/issues/5

## Standalone operation rule

Every package must keep a no-shared-DB path.

| Package | Standalone source of truth |
|---|---|
| Shirube | `.framework/`, `run-state.json`, CLI JSON output |
| AUN | existing PostgreSQL mode or file fallback mode |
| Kusabi | SQLite default local memory or standalone PostgreSQL mode |
| Kodama | local/self-hosted MCP server and local store |
| Rasen | repository YAML/Markdown files |

## Implementation order

1. Create this cross-repo plan and package-specific issues.
2. Add the minimal `core.*` schema contract in Shirube docs.
3. Harden AUN as runtime/queue owner and shared event/evidence consumer.
4. Harden Kusabi restart-pack evidence contract for AUN consumption.
5. Add Kodama durable context-pack storage.
6. Add Shirube projection adapter for Work Orders, gates, and evidence.
7. Add Rasen file-to-record projection and Shirube Work Order handoff.
8. Add a thin future orchestration package that runs migrations, adapters, health checks, and service startup, without owning package business logic.

## Explicit non-goals

- Do not build one giant ORM model that owns every package's internals.
- Do not let one package write arbitrary rows into another package's internal tables.
- Do not move Shirube gates into AUN.
- Do not move AUN queue mutation into Kusabi.
- Do not move Kodama context retrieval into Kusabi memory.
- Do not make Rasen a runtime worker.
- Do not make the shared DB mandatory for local single-package use.

## Decision summary

The shared DB is a visibility, evidence, and handoff substrate. It is not a reason to collapse package boundaries.

Use shared records for:

- events;
- artifact references;
- evidence references;
- entity links;
- projections;
- orchestration handoff.

Keep package-local ownership for:

- Shirube gates and SSOT;
- AUN queues and runtime lifecycle;
- Kusabi memory and restart-pack content;
- Kodama source/context policy;
- Rasen product and growth records.
