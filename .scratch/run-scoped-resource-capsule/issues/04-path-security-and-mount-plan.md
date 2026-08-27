# 04: Path Security and Validated Run Mount Plan

Status: ready-for-agent
Owner: P3
Blocked by: 01: Contracts and Fixtures Freeze
Estimated effort: 7 hours

## Scope

- Implement `authorizeResources(principal, agentId, resourceIds)` against the
  frozen ownership, Registry, and Grant query contracts.
- Produce safe allow/deny decisions without accepting client paths or mount
  flags.
- Implement canonical Resource-root containment using `realpath` and a
  path-boundary-safe comparison.
- Reject unknown and invalid Resource IDs, `..`, absolute/path-shaped inputs,
  missing/non-directory sources, root escape, and symlink escape.
- Reject duplicate, nested, or overlapping canonical Registry sources.
- Implement `compileMountPlan(runId, authorizationDecision)`.
- Generate `/resources/<resourceId>` and reject reserved-target or target
  collisions.
- Produce an immutable readonly `ValidatedRunMountPlan` with the current Grant
  generation.
- Fail closed on stale, denied, or malformed decisions.

## Out of Scope

- HTTP session parsing and Agent lifecycle orchestration.
- Registry/Grant persistence or mutation APIs.
- Container invocation and readonly bind-mount syntax.
- UI and Receipt rendering.
- Generic host filesystem sandboxing outside registered Resources.

## Files owned

- New Resource authorization module and tests.
- New Resource path validator module and tests.
- New mount-plan compiler module and tests.
- Security-focused temporary fixture builders used only by this workstream's
  tests.

P3 does not edit the shared frozen contracts, Registry persistence, central
AgentService, or Container runner.

## Frozen interfaces

- `authorizeResources(principal, agentId, resourceIds)`.
- `compileMountPlan(runId, authorizationDecision)`.
- Protected Resource lookup and Resource Grant query adapters.
- `ValidatedRunMountPlan` fields and fixed readonly target rules.
- Stable safe denial reasons; filesystem internals never enter client reasons.

## Mock/Stub strategy

- Use frozen fake principals, Agents, Resources, and Grants.
- Build temporary real directory/symlink trees for path-security cases.
- Use literal independent expected canonical paths and targets.
- Do not mock `realpath` for the integration-focused path suite.
- Pass frozen mount-plan fixtures to P4; do not invoke a container here.

## Tests

- Owner/current Grant permits an allow decision; ownership mismatch, missing
  Grant, revoked Grant, wrong permission, and stale generation deny.
- Zero, one, and multiple Resource cardinality behavior matches the Spec.
- Invalid slug, `..`, path separators, absolute path, unknown ID, missing path,
  and non-directory source fail closed.
- Canonical root containment accepts a child and rejects sibling-prefix tricks.
- Symlink escape is rejected.
- Duplicate, nested, and overlapping canonical Registry paths are rejected.
- Target is exactly `/resources/<resourceId>` and cannot collide with reserved
  mounts.
- Result is immutable, readonly, correlated to Run/Agent/Resource/generation,
  and contains no client path.

## Demo evidence

- One accepted `orders-incident` plan with canonical source and fixed target.
- A compact attack matrix showing every path-shaped or escape attempt rejected.
- Confirmation that `payments-incident` never appears in an unauthorized plan.

## Evidence

- Owner records the attack matrix, representative safe denial reasons, and one
  valid plan with sensitive host details redacted from presentation output.

## Tests Run

- Owner records authorization, path-security, and mount-plan commands/results.

## Known Limitations

- Owner records cross-platform realpath or symlink behavior encountered.
- Protection covers registered server-owned directories, not generic network or
  tool access.

## Integration Notes

- Owner records the concrete Registry/Grant adapters from P2 and the plan handoff
  verified with P4.

## Definition of Done

- [ ] Authorization uses only server-trusted Registry and Grant information.
- [ ] All specified traversal, symlink, overlap, and collision cases fail closed.
- [ ] The compiler is the only producer of a validated readonly plan.
- [ ] P1 and P4 consume the frozen seams without reconstructing paths.
- [ ] Security tests use independent expected values and real filesystem cases.
- [ ] Evidence, Tests Run, Known Limitations, and Integration Notes are updated.
