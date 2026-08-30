# ScopedRun user flow and authorization model

Status: Approved product-flow source of truth

## The one-sentence promise

For every Agent Run, a person explicitly delegates a small, read-only subset
of the project material they are entitled to use. Only that delegated subset
enters the Run's container filesystem view.

## The authorization ladder

The following layers are distinct and must not be collapsed into one generic
"permission" concept:

1. **Resource Catalog** — every server-owned Protected Resource known to the
   product, with safe metadata and a server-only source path.
2. **Principal Resource Entitlement** — the long-lived upper bound of what a
   Human Principal may delegate. The server owns this policy. In the demo it is
   a small, reproducible fixture matrix, not a user-editable RBAC product.
3. **Run Delegation** — the Human Principal's explicit choice of zero or one
   entitled Resource for one new Run. This is the actual scope requested by
   the user, not a standing Agent capability.
4. **ValidatedRunMountPlan** — the immutable server-produced plan created only
   after ownership, Entitlement, Delegation, Registry, and path checks pass.
5. **Runtime namespace** — the container filesystem view containing exactly
   the readonly Resource described by the validated plan, if any.

The effective Resource scope is:

```text
Principal Resource Entitlement
∩ explicit Run Delegation
∩ current Agent ownership
∩ server validation
```

A Human Principal's Entitlement is never a reason to mount every Resource they
could use. A Resource visible in a suggestion is never a reason to mount it.

## Canonical user journey

### 1. Start a task request

The user chooses an Agent and writes the task prompt. A task request is the
user's intent before a Run begins; the MVP does not need a new persistent
`Task` database entity.

### 2. See only eligible choices

The product lists only safe metadata for Resources the current principal is
entitled to delegate. It never exposes host paths, file contents, tokens, or
mount syntax. The user may run a normal baseline Run with no Resource selected.

### 3. Optionally receive a suggestion

A Resource Advisor may suggest relevant eligible Resources from the task text
and safe catalog metadata such as name, tags, and description. It is advisory:

- it cannot inspect protected Resource contents merely to make a suggestion;
- it cannot suggest a Resource outside the current principal's Entitlements;
- it cannot create a Run Delegation or alter Entitlements; and
- the manual picker remains the complete supported MVP path.

The demo uses a deterministic metadata-only Advisor. `POST
/api/resources/suggest` receives transient task text only and evaluates the
current principal's active Entitlements. Exact normalized tag matches outrank
display-name matches, which outrank description matches. A zero match or equal
top score returns no suggestion. The response carries one safe Advisor
projection, bounded normalized tags, safe matched terms, and a stable reason;
it never carries a path or protected content. An LLM-based Advisor remains out
of scope and the manual picker remains the complete supported MVP path.

### 4. Explicitly delegate the scope for this Run

Before starting the Run, the user accepts, removes, or manually chooses one
eligible Resource. This creates the logical Run Delegation represented by the
request's single `resourceIds` value.

For the hackathon MVP, the choices are deliberately narrow:

- zero Resources means a baseline Run;
- exactly one directory Resource means a Capsule Run;
- the delegated Resource is read-only; and
- the delegation ends with that Run.

There is no write delegation, multi-Resource delegation, arbitrary file path,
or Agent-initiated scope expansion.

### 5. Recheck immediately before execution

The server re-resolves the principal and resolves the Agent through that
principal. A missing or non-owned Agent produces the same `404` before any Run,
Message, or Receipt is written. For an owned Agent, the server verifies current
Entitlement status and generation, the explicit delegation, Registry entry,
canonical path, and Runtime profile. It does not trust earlier UI state.

On allow, the server produces one immutable readonly mount plan and persists
the Run, user Message, Agent state transition, and authorization Receipt in one
atomic commit. It rechecks Entitlement status and generation at the final
Runtime seam. A concurrent revoke finalizes the Run and Receipt as denied
without invoking the Runner. A user cancellation received during admission or
before that seam remains active through the execution handoff and keeps the
allow Receipt with `runnerStarted: false`, because cancellation does not
rewrite the authorization decision.

### 6. Show the result and evidence

The UI shows whether the Run was baseline, allowed, or denied. A Capsule
Receipt shows safe correlation facts: principal, Agent, Run, selected Resource,
allow/deny reason, Entitlement generation, and whether the Runner started.

## What the product deliberately does not do

- It does not give an Agent every Resource its user could possibly delegate.
- It does not let an AI suggestion act as an authorization decision.
- It does not accept user-provided host paths, mount targets, or access modes.
- It does not grant write access to server-owned Resources in the MVP.
- It does not promise hot-unmount of an already running container or model
  memory erasure after an earlier authorized Run.

## Demo fixture matrix

The initial demonstration uses two principals and three Resource directories:

| Principal | Entitled Resource(s) | Not entitled Resource |
| --- | --- | --- |
| `user-a` | `orders-incident`, `inventory-incident` | `payments-incident` |
| `user-b` | `payments-incident` | `orders-incident`, `inventory-incident` |

The allow scenario is `user-a` explicitly delegating `orders-incident` to one
Run. The deny scenario is `user-a` requesting `payments-incident`; it must be
denied before the Runtime starts.
