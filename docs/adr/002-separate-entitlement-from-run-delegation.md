# ADR-002: Separate entitlement from per-Run delegation

- **Status:** Accepted
- **Date:** 2026-08-27
- **Decision owners:** Starlove Butterfly TechJam team

## Context

ScopedRun needs to show two different controls: a person's standing right to
use a project Resource, and the much smaller set of material they deliberately
give to one Agent Run. Calling both controls a "Grant" makes it easy to build
an all-or-nothing per-user file view, which is not the product promise.

The original planning language also left room for an AI to infer a Resource
from a task and silently treat that inference as permission.

## Decision

Model Resource access as two layers:

1. a server-owned **Principal Resource Entitlement** is the upper bound of
   what a Human Principal may delegate; and
2. an explicit **Run Delegation** is the zero-or-one eligible Resource chosen
   by that principal for one new Run.

The server checks both layers again during Run admission and compiles the
validated readonly mount plan from the approved Run Delegation only.

A Resource Advisor may suggest candidates using task text and safe metadata
filtered by Entitlement, but it is never an authorization authority and never
reads protected contents to decide.

## Consequences

- A user retains control over whether an eligible Resource enters a particular
  Run.
- An Agent cannot receive every Resource the user could delegate by default.
- The initial product remains testable: one read-only directory per Capsule
  Run and a static demo Entitlement matrix.
- Existing references to an Agent-specific standing Resource Grant are
  superseded by this decision. The implementation stores Entitlements by
  principal and records the one-Run delegation in the Run/Receipt correlation.
- Write access, multiple Resources, and autonomous scope expansion remain out
  of scope.
