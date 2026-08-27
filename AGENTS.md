# AI coding workflow

## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `.scratch/run-scoped-resource-capsule/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single-context layout spanning `apps/server` and `apps/web`. See `docs/agents/domain.md`.

### ScopedRun delivery loop

For any Run-scoped Resource Capsule task:

1. Read `CONTEXT.md`, the approved
   `docs/planning/resource-capsule-brief.md`, the working Spec at
   `.scratch/run-scoped-resource-capsule/spec.md`, and exactly one assigned
   ticket under `.scratch/run-scoped-resource-capsule/issues/`.
2. Deliver the ticket's smallest acceptance slice at its named seam. Keep
   shared contracts with the ticket's designated owner.
3. Use the ticket's Definition of Done as the completion boundary: run its
   stated evidence, record the result, and keep baseline behavior covered.
4. When a new product decision is necessary, update the Spec or relevant ADR
   before implementing the new behavior.

The formal brief, Spec, tickets, and ADRs are the sources of truth. This file
only tells an Agent when to read them.
