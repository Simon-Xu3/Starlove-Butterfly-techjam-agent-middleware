# ADR-001: Use a run-scoped resource capsule

- **Status:** Accepted
- **Date:** 2026-08-27
- **Decision owners:** Starlove Butterfly TechJam team

## Context

The Starter Kit intentionally lacks user identity and resource authorization.
Its shared bearer token is not a principal model, and each Runtime receives a
fixed workspace mount. The existing Codex Runner is a one-way process wrapper:
JSONL events are observed after actions complete, so they cannot serve as a
universal before-tool authorization hook.

The team needs a two-day middleware story with a real enforcement point, a
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
- The scope remains small with two demo principals, three resources, and one
  read-only action.

## Rejected alternatives

### UI-only resource picker

Direct API calls and alternate Agent execution paths bypass the browser. A
picker supports the experience but cannot be the policy boundary.

### Prompt-based policy

The desired behavior is a validated runtime view. Prompt content cannot provide
that execution guarantee.

### Universal before-tool gateway

The current Runner has no bidirectional before-tool interception contract.
Observed JSONL completion events are evidence, not pre-action enforcement.

### Full OAuth/RBAC or production multi-tenancy

The approved MVP proves one authorization contract; a general identity product
does not fit the delivery window.

### Standalone trace dashboard

Authorization receipts are valuable evidence, but the primary result must be a
changed Runtime capability rather than observation alone.

## Consequences

### Positive

- Clear least-privilege boundary for each Run.
- Deterministic denial with zero Runner invocation.
- Focused integration with the existing control plane and container code.
- No cloud deployment or real external service is required.

### Known boundaries

- The capsule does not prevent use of content after it has legitimately entered
  the Runtime.
- It is not a hardened multi-tenant isolation mechanism.
- Active resource revocation requires stopping the current Runtime.
- Local-process Runs cannot offer equivalent enforcement and fail closed.
- Container mount behavior must be verified before implementation expands.

## Validation gate

The formal container gate passed on Docker Desktop and was reproduced during
the Day 2 feature freeze on Docker 29.5.2 through Colima. The evidence proves
that the delegated Resource is readable, the undelegated Resource is absent,
the mount rejects writes, and host hashes and modification times remain
unchanged. See
[`day2-feature-freeze-2026-08-29.md`](../evidence/day2-feature-freeze-2026-08-29.md).
