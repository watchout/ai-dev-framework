# Data Authority / Normalization Standard

## Status
Normative for Shirube design gates.

## Purpose
Stateful systems must model mutable facts with one canonical owner. The same
business fact must not be registered as independent truth in multiple tables,
runtime registries, queues, caches, or projections.

This is a design-time rule, not an optimization preference. Violations create
update anomalies: changing agent, bot, routing, identity, or ownership metadata
in one location can leave other locations stale.

## Canonical References
- [E. F. Codd, "A Relational Model of Data for Large Shared Data Banks", CACM, 1970](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks). IBM summarizes the paper as introducing relations and applying them to redundancy and consistency problems.
- [PostgreSQL documentation, "5.5 Constraints"](https://www.postgresql.org/docs/current/ddl-constraints.html): use primary key, unique, check, not-null, and foreign key constraints to keep invalid data out and preserve referential integrity.
- [SQLite documentation, "Foreign Key Support"](https://www.sqlite.org/foreignkeys.html): foreign keys preserve parent/child relationships; SQLite deployments must account for foreign-key enforcement behavior explicitly.

## Rules
1. Every mutable fact must have exactly one authoritative owner.
2. Other tables must reference that owner by stable key instead of copying the fact.
3. Database constraints must encode identity and integrity whenever the backend supports them: `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `NOT NULL`, and `CHECK`.
4. Program code must use named resolver/adapter boundaries for current data lookup. Direct ad hoc lookup of duplicated fields is not acceptable.
5. Projections, caches, materialized views, denormalized read models, and evidence snapshots are allowed only as derived data.
6. Derived data must name its source, derivation rule, invalidation/regeneration rule, and whether it is read-only or append-only evidence.
7. Queue or event rows may keep immutable evidence snapshots, but those snapshots are not the current truth for mutable agent/bot/routing identity.
8. If a mutable fact changes, only the canonical owner is updated; dependent views are regenerated, invalidated, or resolved dynamically.

## Required Design Section
Any design touching DB schemas, migrations, registries, queues, identity, routing,
state stores, projections, caches, or snapshots must include:

```markdown
## Data Authority / Normalization

| Mutable fact | Canonical owner / SSOT | References / constraints | Projection or snapshot rule |
|---|---|---|---|
| agent identity | agent_registry | FK from queue rows; UNIQUE provider identity | no duplicate current truth |
```

The section must answer:
- Which table/module owns each mutable fact?
- Which fields are references rather than copied truth?
- Which DB constraints enforce identity and referential integrity?
- Which code resolver/adapter is the only way to read current state?
- Which projections/caches/snapshots exist, and how are they regenerated or invalidated?

## Gate Behavior
`shirube gate design --strict` blocks DB/state designs when:
- the Data Authority / Normalization section is missing;
- the section does not identify canonical owners;
- the section does not describe DB or programmatic reference integrity;
- a design stores the same mutable fact as independent truth in multiple tables;
- a projection/cache/snapshot has no source, derivation, invalidation, or regeneration rule.
