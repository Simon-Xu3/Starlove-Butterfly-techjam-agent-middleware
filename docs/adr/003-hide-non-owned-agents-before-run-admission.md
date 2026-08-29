# ADR-003: Hide non-owned Agents before Run admission

- **Status:** Accepted
- **Date:** 2026-08-29
- **Decision owners:** Starlove Butterfly TechJam team

## Context

The working Spec previously said both that Agent-scoped operations enforce
ownership and that an ownership failure creates a denied Run and Decision
Receipt. Applying the latter literally would reveal that another principal's
Agent exists, write a Run and prompt-bearing Message against that Agent, and
return a Receipt ID the requester cannot read through the principal-scoped
Receipt API.

## Decision

Resolve an Agent through the current Human Principal before baseline or Capsule
Run admission. A missing Agent and an Agent owned by another principal both
return the same `404` response. Neither case creates a Run, Message, Decision
Receipt, Codex thread, or Runner call.

`ownership_denied` remains in the lower-level authorizer vocabulary as a
defence-in-depth fail-closed result. It is not an externally reachable outcome
of the ownership-scoped HTTP message endpoint.

Version 2 database files written before this decision may already contain an
`ownership_denied` Receipt. Those records remain readable through the owning
principal's Receipt endpoint for migration compatibility, but the admission
and Receipt-write seams reject creation of any new record with that reason.

## Consequences

- The HTTP API does not become an Agent-existence oracle.
- A principal cannot cause cross-principal Run, Message, or Receipt writes.
- Ownership probes do not produce Capsule Decision Receipts. A future
  security-event stream may audit probes without attaching records to another
  principal's Agent; that facility is outside this MVP.
- Existing owner-scoped audit history remains loadable without reopening
  `ownership_denied` as a new HTTP response or write path.
