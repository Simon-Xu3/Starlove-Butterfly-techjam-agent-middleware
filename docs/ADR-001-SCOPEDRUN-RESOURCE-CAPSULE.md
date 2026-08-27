# ADR-001: Use a run-scoped resource capsule

- **Status:** Proposed — validate with Day 1 spike
- **Date:** 2026-08-27
- **Decision owners:** Starlove Butterfly TechJam team

## Context

The Starter Kit intentionally lacks user identity and resource authorization.
Its shared bearer token is not a principal model, and each Runtime currently
receives a fixed workspace mount. The existing Codex Runner is a one-way
process wrapper: JSONL events are primarily observed after actions complete,
so they cannot honestly serve as a universal before-tool authorization hook.

The team needs a three-day middleware story with a real enforcement point, a
deterministic denial case, automated verification, and a three-minute demo.

## Decision

Build **ScopedRun**, a run-scoped resource capsule:

1. resolve a small server-side demo principal;
2. authorize the principal, Agent, requested resource, and `read` action;
3. map resource IDs to server-owned canonical paths;
4. freeze a validated read-only mount plan for the Run;
5. deny before Runner invocation when authorization or validation fails;
6. launch container Runs with only the approved external resources mounted;
7. record a structured, secret-safe decision receipt.

The initial implementation supports only the container Runtime profile. A
capsule-enabled local-process Run fails closed.

## Rationale

- `AgentService` Run admission and `ContainerCodexRunner` mount construction are
  existing trusted seams in the Starter Kit.
- The control changes what the Agent can actually observe, rather than asking
  the model to comply.
- Both success and denial can be proved with resource, Runner, mount, and hash
  facts that do not depend on model wording.
- The scope is small enough for three days when limited to two demo principals,
  two resources, and one read-only action.

## Rejected alternatives

### UI-only resource picker

Rejected because direct API calls and alternate Agent execution paths bypass
the browser. It may be part of the experience, but not the policy boundary.

### Prompt-based policy

Rejected because it is advisory and can be ignored, misunderstood, or altered
by untrusted context.

### Universal before-tool gateway

Rejected for this baseline because the current Runner has no bidirectional
before-tool interception contract. Observed JSONL completion events are not a
pre-action enforcement point.

### Full OAuth/RBAC or production multi-tenancy

Rejected as unnecessary for proving the middleware contract and too broad for
a three-day hackathon.

### Standalone trace dashboard

Rejected as the core project because observation alone does not alter the
protected resource. ScopedRun will still expose narrow authorization receipts.

## Consequences

### Positive

- Clear least-privilege boundary for each Run.
- Deterministic negative path with zero Runner invocation.
- Small, testable integration with existing control-plane and container code.
- No cloud deployment or real external service is required.

### Negative

- Does not protect data after it has legitimately entered the Runtime.
- Does not provide hardened tenant isolation.
- Active resource revocation requires stopping the current Runtime.
- Local-process Runs cannot offer equivalent enforcement and must fail closed.
- Container-engine mount semantics must be verified before implementation.

## Validation gate

The decision remains **Proposed** until every central check in
`SCOPEDRUN_DAY1_SPIKE.md` passes on the target container engine. If the mount or
path boundary cannot be proved, this ADR will be superseded rather than
reinterpreted as a prompt or UI convention.
