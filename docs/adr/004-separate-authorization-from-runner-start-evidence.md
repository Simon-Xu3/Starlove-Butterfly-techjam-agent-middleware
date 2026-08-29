# ADR-004: Separate authorization from Runner-start evidence

- **Status:** Accepted
- **Date:** 2026-08-29
- **Decision owners:** Starlove Butterfly TechJam team

## Context

The first Receipt contract made `runnerStarted: true` mandatory for every allow
decision. That conflated two different facts. A Capsule Run can be authorized
and persisted, then be cancelled before Runtime invocation. It can also be
invalidated by a concurrent revoke after mount-plan compilation but before the
Runner call.

Deferring the only Receipt until immediately before the Runner made its
`runnerStarted` claim truthful for started Runs, but left pre-Runner
cancellation with no Receipt and left Receipt persistence fire-and-forget.

## Decision

Treat authorization and execution evidence as separate fields of one Receipt:

1. an allow Receipt may carry `runnerStarted: false` or `true`;
2. cancellation before invocation leaves the authorization decision as allow
   and finalizes `runnerStarted: false`;
3. Receipt writes and pre-Runtime updates are awaited, and one stable Receipt
   ID is retained for the Run;
4. immediately before invocation, recheck the current Entitlement after the
   awaited Receipt update; no await occurs between the successful final check
   and the Runner call; and
5. if Entitlement status or generation changed, finalize the Run and Receipt
   as denied with `stale_entitlement_generation` and do not call the Runner.

The initial Run, user Message, Agent busy transition, and Receipt are one
atomic JSON-store commit. A persistence failure publishes none of them. A stop
or delete request registered while that commit is pending remains active until
admission either fails or registers its execution, so a pre-Runner
cancellation cannot be lost in the handoff.

Pre-Runner cancellation, stale-Entitlement denial, and their Receipt
correction are likewise committed with the Run and Agent terminal state. If a
single transient store write interrupts that transition after
`runnerStarted:true`, execution retries or atomically restores the false
evidence before publishing a terminal Run.

The Receipt may transition only while the Run is pre-Runtime. Once the Runner
invocation is attempted, `runnerStarted: true` is immutable even if execution
later fails or is cancelled.

## Consequences

- Every admitted Capsule Run remains distinguishable from a baseline Run.
- `runnerStarted` reports what happened rather than restating the allow/deny
  decision.
- A Receipt-store failure prevents Runner invocation and is surfaced as an
  internal admission/execution failure rather than silently losing evidence.
- The implementation needs an asynchronous add/update Receipt seam and a final
  synchronous Entitlement read at the Runtime boundary.
- Concurrent failure cleanup cannot reset a later Run's Agent state because
  there is no compensating rollback mutation after a failed Receipt write.
- A recovered one-shot persistence fault cannot leave `runnerStarted:true`
  beside a Run for which the Runner call count stayed zero.
