# 01: Contracts and Fixtures Freeze

Status: ready-for-agent
Owner: All team members; P1 is the editing owner
Blocked by: None (can start immediately)
Estimated effort: 1 hour maximum

## Scope

- Freeze the additive TypeScript contracts needed by all five workstreams.
- Freeze the `X-Demo-Session` request header and its two server-side mappings.
- Freeze request and response DTOs for baseline, allowed, and denied Runs.
- Add the `denied` Run status and Decision Receipt decision/reason vocabulary.
- Freeze database version 2 shapes for Agent ownership, Resource Grants, and
  Decision Receipts.
- Freeze `HumanPrincipal`, `ProtectedResource`, `ResourceGrant`,
  `AuthorizationDecision`, `ValidatedRunMountPlan`, and `DecisionReceipt`.
- Freeze the five approved seams and factories for their mocks.
- Create the `orders-incident` and `payments-incident` directory fixtures.
- Record the initial fixture hashes and modification times used by evidence
  tests.
- Keep all additions compatible with ordinary baseline Runs.

## Out of Scope

- Implementing principal resolution or ownership enforcement.
- Implementing persistence migration, authorization, path validation, Runner
  integration, Receipts, or UI.
- Changing product behavior beyond additive contracts and fixtures.
- Spending more than one hour refining abstractions.

## Files owned

- `apps/server/src/types.ts`
- `apps/web/src/types.ts`
- A new server-side Resource Capsule contracts module, if separation is needed.
- The two server-owned Resource fixture directories and their baseline manifest.

After this Ticket is complete, these files and fixtures are frozen. P1 is the
only editor for later shared-contract changes; all such changes require review
from the affected Owners.

## Frozen interfaces

- `POST /api/agents/:agentId/messages` accepts `content` plus optional
  `resourceIds`.
- `authorizeResources(principal, agentId, resourceIds)` returns an
  `AuthorizationDecision`.
- `compileMountPlan(runId, authorizationDecision)` returns a
  `ValidatedRunMountPlan` only for an allow decision.
- `ContainerCodexRunner.run(run, validatedMountPlan)` accepts only a validated
  plan for a Capsule Run.
- `GET /api/runs/:runId/receipts` returns the Run's Capsule Receipt.
- A baseline Run omits or sends an empty `resourceIds` array.
- A Capsule Run supplies exactly one safe Resource ID.
- A denied HTTP result contains `runId`, `receiptId`, `status`, and safe
  `reason`.

## Mock/Stub strategy

- Provide small factories for principals, Resources, Grants, allow/deny
  decisions, mount plans, Runs, and Receipts.
- Defaults must represent the `user-a` / Agent A / `orders-incident` allow case.
- Overrides must make deny and stale-generation cases easy without duplicating
  object literals across workstreams.
- Mock factories contain no real authorization or path-validation logic.

## Tests

- Shared server and Web contracts typecheck.
- Baseline request contracts remain valid.
- Denied status and Receipt shapes serialize without secrets or host paths.
- Both fixture directories exist and have deterministic baseline manifests.
- Fixture hash and modification-time baselines are recorded independently.

## Demo evidence

- A one-page frozen-contract checklist reviewed by P1–P5.
- Fixture IDs, safe display names, initial hashes, and initial mtimes.
- Confirmation that five downstream workstreams can compile against the frozen
  seams without editing the same files.

## Evidence

- To be completed during the Ticket with the contract review result and fixture
  baseline values.

## Tests Run

- To be completed during the Ticket with exact commands and results.

## Known Limitations

- These are hackathon MVP contracts, not a general authorization framework.
- The demo Principal header is mock identity, not authentication.

## Integration Notes

- P2–P5 must start from the committed contract revision.
- Any necessary contract correction is routed through P1 and communicated to
  all Owners before merging.

## Definition of Done

- [ ] P1–P5 approve the contract checklist within one hour.
- [ ] Shared contracts and reason codes compile in both workspaces.
- [ ] The five approved seams have usable mock factories.
- [ ] Both fixtures and their hash/mtime baselines are committed.
- [ ] Ticket 02–06 can start without inventing incompatible interfaces.
