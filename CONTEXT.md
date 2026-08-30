# Domain Context: Run-scoped Resource Capsule

## Context boundary

This repository has one product context spanning both `apps/server` and `apps/web`.

The server and web applications are delivery components of the same product,
not separate domain contexts. Do not create per-application `CONTEXT.md` files
or split the domain solely along package boundaries.

Formal project documentation belongs under `docs/`. This root `CONTEXT.md` is
the domain glossary and context entry point required by the engineering Skill
workflow. Architecture decisions belong under `docs/adr/`.

## Current product focus

The only active product mainline is **Run-scoped Resource Capsule**.

Its fixed feature slug is:

`run-scoped-resource-capsule`

Planning, specifications, tickets, and implementation proposals should remain
focused on that mainline unless the user explicitly changes the project scope.

Do not infer unresolved Resource Capsule behavior from its name alone. Its
contents, lifecycle, persistence, limits, and user experience must come from an
approved specification or ADR.

## Glossary

### Agent

A configured agent that owns its workspace, instructions, and conversation
continuity.

### Run

One asynchronous execution initiated for an Agent. A Run has its own identity
and observable lifecycle.

### Resource Capsule

The product capability currently being developed. A Resource Capsule is scoped
to a specific Run rather than treated as unscoped global state.

One Capsule contains only the Resource explicitly delegated to that Run after
the current principal's Entitlement, Agent ownership, and server validation
are checked. Use the approved specification and ADRs for the exact contract.

### Protected Resource

A server-owned directory eligible for controlled readonly mounting.

### Principal Resource Entitlement

The server-owned upper bound of which Protected Resources a Human Principal
may delegate. It is not the set of Resources automatically visible to an
Agent.

### Run Delegation

The Human Principal's explicit choice of zero or one entitled Protected
Resource for one new Run. It ends with that Run and determines the candidate
Resource filesystem view.

### Control plane

The server-side application boundary that exposes APIs, coordinates Runs, and
connects product state to a Runtime provider.

### Web UI

The browser-facing application through which users configure Agents and
interact with Runs. It is part of the same product context as the control plane.

### Runtime provider

The execution boundary used by the control plane to run Codex-backed work.

### Resource Advisor

A built-in advisory feature whose use is optional. It suggests eligible
Resources from task text and safe Resource metadata. It cannot inspect
protected contents, change an Entitlement, or create a Run Delegation.

### Agent workspace

Persistent files associated with an Agent. Do not use “Agent workspace” and
“Resource Capsule” interchangeably unless an approved specification explicitly
defines that relationship.

## Delivery constraints

- Team size: five people.
- Development window: two days.
- Prefer the smallest coherent design that can be completed and validated
  within the development window.
- Avoid introducing additional domain contexts unless the product scope
  materially changes.
- Keep formal project documentation under `docs/`.
- Store the current Spec at
  `.scratch/run-scoped-resource-capsule/spec.md`.
- Track current Tickets as `scopedrun`-labelled GitHub Issues in
  `Simon-Xu3/Starlove-Butterfly-techjam-agent-middleware`.
