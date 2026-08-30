# Run-scoped Resource Capsule

Status: final-submission candidate — Issue #10 delivery merged and Resource
Advisor integrated; current audit dated 2026-08-30

## Problem Statement

The CodeJam Starter Kit lets an Agent execute shell commands, traverse
directories, and read files while completing a Run. A Web UI that hides a
resource, or a prompt that asks the Agent not to read it, does not prevent the
Agent from reaching an unauthorized server-owned filesystem path by another
route.

The user needs an enforceable Run-scoped boundary with this invariant:

> A server-owned filesystem resource that is not explicitly authorized for the
> current Run must not enter the Agent Runtime namespace.

This feature must extend the existing Agent CRUD, Playground, asynchronous Run,
JSON persistence, Agent workspace, Codex thread, and local container behavior.
It must not rebuild those capabilities or imply that filesystem mount control
intercepts every Codex tool, network request, MCP call, or HTTP call.

## Solution

Add a Run-scoped Resource Capsule to the existing message admission flow. A
Capsule Run selects exactly one directory Resource by Resource ID. That value
is the Human Principal's explicit Run Delegation, not a request for the Agent
to gain standing access. The Fastify request boundary resolves a mock Human
Principal, verifies Agent ownership and the current Principal Resource
Entitlement, resolves the Resource through a server-owned Registry, validates
its canonical host path, and compiles an immutable readonly
`ValidatedRunMountPlan` before invoking the Runtime.

Only `ContainerCodexRunner` may execute a Capsule Run. It mounts the validated
directory at a server-generated `/resources/<resourceId>` target in a real
container. After the request resolves an Agent owned by the current principal,
a well-formed Capsule request that fails admission becomes a terminal denied
Run with a correlated Decision Receipt. The Runner is never called for that
Run. A missing or non-owned Agent is instead hidden by a uniform `404` before
any Run, Message, or Receipt is created. Ordinary Runs that select no Resource
retain their current behavior, including support for the local-process profile
and multi-turn Codex sessions.

The MVP includes two mock principals, three static fixture Resources, a static
read Entitlement matrix, a deterministic metadata-only Resource Advisor,
explicit per-Run Delegation, allow/deny/revoke/unsupported-runtime behavior, a
minimal Resource Picker, a minimal Receipt view, automated tests, and
real-container evidence.

## Canonical product flow

The detailed source of truth is
`docs/planning/scopedrun-user-flow.md`. It defines the required distinction:

- a Principal Resource Entitlement is the server-owned upper bound of what a
  person may delegate;
- a Run Delegation is that person's explicit zero-or-one Resource choice for a
  new Run; and
- only the intersection of current Entitlement, Agent ownership, explicit
  Delegation, and server validation can become a container mount.

The Resource Picker is a human approval step. A Resource Advisor may make
metadata-only suggestions, but cannot read protected contents, change an
Entitlement, or authorize/mount a Resource. The manual picker remains the
complete supported MVP. The MVP supports readonly access only.

## User Stories

1. As a demo user, I want to select an approved incident Resource for a Run, so that my Agent can analyze the necessary files.
2. As a demo user, I want Resource selection to use an opaque Resource ID, so that I never send a host path from the browser.
3. As a demo user, I want the Resource Picker to show safe Resource metadata, so that I can choose a fixture without learning server paths.
3a. As a demo user, I want a suggested Resource to remain a suggestion until I explicitly approve it for this Run.
3b. As a reviewer, I want the Advisor to use only entitled safe metadata, so that recommendation cannot leak or authorize protected contents.
4. As a demo user, I want exactly one directory Resource in a Capsule Run, so that the two-day MVP remains understandable and testable.
5. As a demo user, I want an ordinary Run with no selected Resource to behave as it did before, so that existing Playground workflows continue to work.
6. As a demo user, I want an allowed Capsule Run to read the selected directory, so that the Agent can complete the requested analysis.
7. As a demo user, I want an unauthorized selection to be denied before execution, so that the protected Resource never enters the Runtime.
8. As a demo user, I want a denied Run to remain visible as a terminal Run, so that the rejection is understandable rather than disappearing as a generic request error.
9. As a demo user, I want the UI to show a safe denial reason and Receipt, so that I can explain the decision during the demo.
10. As a demo user, I want a revoked Entitlement to block later Capsule Runs, so that revocation has visible prospective effect.
11. As a demo user, I want historical Runs and Receipts to remain after revocation, so that prior decisions remain auditable.
12. As a demo user, I want the application to state that revocation does not erase prior model memory, so that the demo does not overclaim its protection.
13. As `user-a`, I want newly created Agents to belong to me, so that another demo principal cannot operate them as its own.
14. As `user-b`, I want my Agent views and operations scoped to my identity, so that Agent ownership is demonstrable.
15. As an existing Starter Kit user, I want migrated Agents to remain usable under `user-a`, so that the schema upgrade does not break the baseline.
16. As a remote demo operator, I want `APP_AUTH_TOKEN` to remain the outer access guard, so that the existing remote-demo protection is preserved.
17. As a reviewer, I want the demo session to be clearly labeled mock identity, so that it is not mistaken for production authentication.
18. As a reviewer, I want principal and owner identifiers rejected from request bodies, so that callers cannot self-assert identity.
19. As a reviewer, I want host source paths to come only from the Resource Registry, so that the client cannot select arbitrary host files.
20. As a reviewer, I want canonical path containment checked with `realpath`, so that traversal and symlink escapes fail closed.
21. As a reviewer, I want duplicate and overlapping Registry paths rejected deterministically, so that protected boundaries cannot be made ambiguous.
22. As a reviewer, I want mount targets generated by the server, so that callers cannot shadow `/workspace`, `/codex-home`, or another reserved target.
23. As a reviewer, I want every approved Resource mount to be readonly, so that the Agent cannot modify the protected host fixture.
24. As a reviewer, I want an unauthorized Resource absent from the mount manifest, so that denial is demonstrated at the namespace boundary.
25. As a reviewer, I want the Runner call count to remain zero on denial, so that authorization is proven to precede execution.
26. As a reviewer, I want host hashes and modification times unchanged after allow and deny tests, so that the readonly and non-exposure claims have objective evidence.
27. As a reviewer, I want each Capsule decision correlated to Human Principal, Agent, Run, Resource, Entitlement generation, and Runner-start evidence, so that the result is traceable.
28. As a reviewer, I want Receipts to exclude tokens, secrets, full prompts, and Resource bodies, so that evidence does not create a second data leak.
29. As a maintainer, I want all admission failures to use stable safe reason codes, so that the UI and tests do not depend on sensitive internal errors.
30. As a maintainer, I want malformed requests rejected before Run creation, so that syntax errors are distinct from auditable authorization decisions.
31. As a maintainer, I want a Capsule Run rejected when the active profile is local-process, so that the service never claims namespace isolation it did not provide.
32. As a maintainer, I want ordinary local-process Runs to remain supported, so that Resource Capsule does not remove a baseline profile.
33. As a maintainer, I want one immutable validated plan passed to the container Runtime, so that validation and execution do not reinterpret paths differently.
34. As a maintainer, I want Entitlement generations rechecked on every new Run, so that stale authorizations cannot be reused after revoke or re-grant.
35. As a maintainer, I want the JSON database migrated compatibly, so that existing Agents, Messages, Runs, workspaces, and Codex threads survive the upgrade.
36. As a maintainer, I want shared contracts frozen quickly, so that five people can implement independent workstreams in parallel.
37. As a presenter, I want allow, deny, revoke, and unsupported-runtime scenarios reproducible in three minutes, so that the security boundary is clear under hackathon constraints.
38. As a presenter, I want a one-page architecture diagram and concise README instructions, so that reviewers can reproduce and understand the proof.

## Implementation Decisions

### Scope and compatibility

- Run-scoped Resource Capsule is the only product effort in this specification.
- Agent CRUD, Agent lifecycle, the Playground, baseline Runs, persistent Agent
  workspaces, JSON persistence, Codex thread resume, and BytePlus ModelArk
  integration remain in place.
- A baseline Run is a message request whose `resourceIds` field is omitted or
  empty. It follows the existing execution path.
- A Capsule Run is a message request with exactly one Resource ID. Individual
  file Resources and multiple Resources are unsupported.

### Demo Principal and Agent ownership

- Retain `APP_AUTH_TOKEN` as the existing outer remote-demo access guard.
- Use `X-Demo-Session` as a separate mock-identity header. Map
  `demo-session-a` to `user-a` and `demo-session-b` to `user-b` on the server.
- The demo header is neither a secret nor production authentication. README and
  demo materials must say so explicitly.
- Identity-sensitive APIs reject a missing or unknown demo session before
  creating a Run or Receipt. Health and outer-auth discovery remain independent
  of mock identity.
- Request bodies must not accept `userId`, `ownerId`, or `principalId`.
- New Agents receive the resolved `ownerPrincipalId`.
- Agent-scoped CRUD, lifecycle, Message, Run, and Receipt operations enforce
  ownership. Collection results are scoped to the current principal.
- Agent lookup is ownership-scoped before Run admission. Missing and non-owned
  Agent IDs produce the same `404` response and create no Run, Message, or
  Receipt. This avoids an Agent-existence oracle and cross-principal writes.
- Existing version 1 Agents migrate to `ownerPrincipalId: "user-a"`.
- Principal Resource Entitlements are server-owned policy. A current principal
  may delegate only an entitled Resource to a Run; this is an MVP control, not
  general RBAC.

### HTTP contracts

- Preserve `POST /api/agents/:agentId/messages` as the Run admission seam.
- Extend the body to accept `content` and optional `resourceIds`.
- Omitted or empty `resourceIds` means baseline Run; exactly one syntactically
  valid ID means Capsule Run; more than one ID or a path-shaped/invalid ID is a
  `400` validation failure with no Run or Receipt.
- For a Capsule Run, the selected ID is the explicit Run Delegation. A request
  never creates or expands a Principal Resource Entitlement.
- After an owned Agent is resolved, a syntactically valid Capsule request that
  fails Registry, Entitlement, Runtime-profile, or canonical-path admission
  creates a terminal denied Run and deny Receipt, then returns `403` with
  `runId`, `receiptId`, `status: "denied"`, and a safe reason code.
- Denied Runs do not call the Runner, start a Codex thread, or save an assistant
  Message.
- Successful admission retains the existing asynchronous `202` response and
  Run polling behavior.
- Provide minimal principal-scoped operations to list safe eligible Resources,
  list current Entitlements, grant or re-grant read access, revoke access, and
  query Receipts.
- `GET /api/runs/:runId/receipts` is the Receipt evidence seam. A Capsule Run
  has one authorization Receipt; a baseline Run returns no Capsule Receipt.
- Resource responses expose IDs and safe display metadata, never canonical host
  paths.
- Stable HTTP denial reasons include unknown Resource, missing or revoked
  Entitlement, stale Entitlement generation, unsupported Runtime profile, and
  invalid registered Resource path. `ownership_denied` remains a lower-seam
  fail-closed authorizer reason, but is not exposed through the Agent-scoped
  HTTP admission path. Internal filesystem details must not appear in HTTP
  responses.
- Historical version 2 Receipts with `ownership_denied` remain owner-scoped
  readable evidence for compatibility. New HTTP responses and Receipt writes
  must not create that reason.
- `POST /api/resources/suggest` accepts only bounded transient task text in a
  `content` field. It evaluates the current principal's active read
  Entitlements and returns `{ "suggestion": null }` for no match or a top tie;
  otherwise it returns one safe Advisor Resource projection, safe matched
  terms, and a stable reason (`tag_match`, `display_name_match`, or
  `description_match`). It never persists task text or advice and creates no
  Run, Message, Receipt, mount plan, Codex task, or Runner call.

### Run admission and authorization

- Keep the existing atomic one-active-Run-per-Agent admission behavior.
- For every Capsule Run, resolve the Human Principal and an Agent owned by that
  principal, then call `authorizeResources(principal, agentId, resourceIds)`
  before Runtime invocation. The submitted Resource ID is the human's explicit
  Run Delegation.
- Authorization checks Agent ownership, exact Resource cardinality, current
  Principal Resource Entitlement status, `permission: "read"`, and current
  generation.
- Unknown Resources, absent Entitlements, revoked Entitlements, stale decisions, and
  ownership mismatches fail closed.
- An Authorization Decision contains only the server-trusted information needed
  to compile a plan or record denial. Client-provided paths and mount flags are
  never carried forward.
- Re-grant creates a monotonically newer generation. Each Receipt records the
  generation used by the Run. `grantGeneration` is nullable when denial occurs
  before any matching Entitlement generation exists.
- Revoke prevents future plans and Runner starts but does not interrupt an
  already running container.
- Recheck the same principal, Resource, permission, status, and generation at
  the final Runtime seam, after admission persistence. If a revoke or re-grant
  completed before Runner invocation, finalize the Run and Receipt as denied
  with `stale_entitlement_generation`; no Runner call occurs.
- A stop or delete request received while Capsule admission persistence is
  pending remains effective through the admission-to-execution handoff. If it
  wins before Runner invocation, the Run is cancelled and the allow Receipt
  remains `runnerStarted: false`.
- Pre-Runner cancellation or late Entitlement denial must publish its Receipt,
  Run, and Agent terminal state atomically. After a recoverable one-shot store
  failure, it must converge without a `runnerStarted: true` Receipt when the
  Runner was never called.

### Persistence

- Upgrade the JSON database from version 1 to version 2 with an in-place
  compatible read migration followed by normal atomic persistence.
- Preserve existing Agents, Messages, Runs, workspace paths, and Codex thread
  identifiers.
- Add `ownerPrincipalId` to Agents and add `denied` to terminal Run statuses.
- Persist Principal Resource Entitlements with `principalId`, `resourceId`,
  `permission: "read"`, `status`, `generation`, `createdAt`, and nullable
  `revokedAt`.
- Persist Receipts with `receiptId`, `runId`, `humanPrincipalId`, `agentId`,
  `resourceId`, `decision`, safe `reason`, nullable `grantGeneration`,
  `runnerStarted`, and `createdAt`.
- Persist the initial Capsule Run, user Message, Agent state transition, and
  Receipt in one atomic store commit before returning a successful admission
  or denial response. A failed commit publishes none of those records.
- A Receipt never contains an auth token, demo session value, secret, full
  prompt, Resource body, or host source path.
- Historical Entitlements, Runs, Messages, Receipts, workspaces, and Codex
  threads remain after revoke. Re-grant updates the current authorization
  generation without rewriting historical Receipts.
- The existing destructive Agent-delete lifecycle removes that Agent's Runs,
  Messages, and correlated Receipts in one store transaction. Revoke never
  invokes this deletion behavior.

### Protected Resource Registry and fixtures

- Use a server-owned static Registry with three directory fixtures:
  `orders-incident`, `inventory-incident`, and `payments-incident`.
- Configure one server-owned allowed Resource root. Registry source paths are
  resolved relative to or underneath that root and are never supplied by the
  client.
- Resource IDs are safe slugs suitable for deterministic target generation;
  path separators, `..`, absolute paths, and encoded path-shaped variants are
  rejected at request validation.
- Registry initialization canonicalizes every configured directory and rejects
  missing, non-directory, duplicate, nested, or otherwise overlapping canonical
  paths.
- Safe client metadata may include Resource ID, display name, and directory
  type, but not host path or file contents.
- The initial reproducible fixture state has two principals, three Resources,
  and a static Entitlement matrix: `user-a` may delegate `orders-incident` and
  `inventory-incident`; `user-b` may delegate only `payments-incident`.

### Path validation and mount-plan contract

- `compileMountPlan(runId, authorizationDecision)` is the only seam that
  produces a `ValidatedRunMountPlan`.
- Compilation reuses only a successful current Authorization Decision and
  server-owned Registry entry.
- Resolve the selected source using `realpath` and verify boundary-safe
  containment within the canonical allowed Resource root. A string-prefix
  comparison without a path-boundary check is insufficient.
- Reject root escape, symlink escape, missing paths, non-directories, Registry
  overlap, stale Entitlement generation, invalid IDs, and target collisions.
- Generate the target as `/resources/<resourceId>` and reject any collision
  with reserved Runtime mounts or another planned target.
- The immutable plan contains `runId`, `agentId`, `resourceId`, validated
  canonical source, generated target, `readonly: true`, and `grantGeneration`.
- No API or UI accepts source, target, or mount mode.
- No unvalidated client value is interpolated into the container engine's mount
  source or target.

### Runtime contract

- The Runtime seam is `ContainerCodexRunner.run(run, validatedMountPlan)` for a
  Capsule Run.
- The Runner translates the plan into one readonly bind mount and keeps the
  existing Agent workspace and Codex-home behavior required by the Starter Kit.
- The mounted Protected Resource appears only at its generated target.
- A Capsule Run may not execute through the host-process Runner.
- When `local-process` is active, create a denied Run and Receipt with reason
  `runtime_profile_unsupported` and `runnerStarted: false`; Runner call count is
  zero.
- The formal demo uses the local container profile.
- `runnerStarted` is execution evidence, independent of the authorization
  decision. It is false before Runtime invocation and true once the authorized
  Runner invocation is attempted, even if the Runtime later fails. Therefore
  an allowed Capsule Run cancelled before invocation has an allow Receipt with
  `runnerStarted: false`.
- Existing cancellation, timeout, output limits, one-active-container behavior,
  Codex event parsing, and thread persistence remain applicable.

### Decision Receipts and UI

- Persist one Decision Receipt for each syntactically valid Capsule Run after
  principal and owned-Agent resolution, whether allow or deny. Receipt writes
  are awaited; they are not fire-and-forget.
- The Receipt correlates Human Principal, Agent, Run, explicit Resource
  Delegation, decision, reason, applicable Entitlement generation,
  Runner-start evidence, and timestamp.
- The minimal Receipt UI displays the safe correlation fields and reason but no
  host path, prompt, token, secret, or Resource body.
- The Resource Picker supports an explicit accept/remove/manual-choice step and
  submits only the approved `resourceIds` value. It supports one Resource and
  must preserve the ability to submit an ordinary Run without a Resource.
- The Resource Advisor is limited to safe metadata for Resources already
  eligible to the principal; it cannot authorize or auto-submit a selection.
  Its explicit Web action has idle, loading, suggested, no-match, and
  recoverable-error states. Prompt or principal changes suppress stale advice.
- A `403` denied response is rendered as a terminal denied Run and Receipt, not
  discarded as an unstructured UI error.
- The UI retries Receipt lookup while an admitted Capsule Run is active so a
  Receipt finalized at the Runtime seam is not hidden by an earlier empty
  lookup.

### Revocation and known security boundary

- Each new Run rechecks current Entitlement status and generation plus its
  explicit Run Delegation; no prior allow decision or mount plan is reusable.
- Revoke affects future admission only. It does not hot-unmount an active bind
  mount and does not delete historical data.
- Revoke does not guarantee that a model forgets data legitimately included in
  an earlier Codex thread, Message, output, or Agent workspace.
- README and demo narration must state these limitations.
- The feature controls server-owned filesystem namespace exposure. It does not
  provide production authentication, general RBAC, hardened multi-tenant
  isolation, DLP, prompt-injection detection, network policy, or generic tool
  interception.

### Delivery

- Five people have two days. Shared contracts and fixtures must freeze within
  the first hour so five balanced workstreams can proceed in parallel.
- Shared core files require a single owner; dependent streams use agreed mocks
  and stubs until integration.
- Use a Day 1 integration gate and Day 2 feature-freeze gate.
- Every workstream owns implementation, automated tests, documentation, and
  demo evidence.
- Final deliverables are reproducible code, a three-minute demo, one-page
  architecture diagram, updated README, and passing `npm run check`.

## Testing Decisions

- Tests assert externally observable security behavior rather than private call
  structure. The primary acceptance seam is the existing HTTP message endpoint;
  focused lower seams exist only where filesystem attacks or real container
  behavior cannot be proven safely at the HTTP layer alone.
- **HTTP Run seam:** exercise `POST /api/agents/:agentId/messages` for baseline,
  allow, deny, revoke (including a concurrent revoke after Run persistence),
  unsupported Runtime, ownership-scoped `404` with zero side effects,
  cancellation before and after Runner invocation, safe response shape, Run
  persistence, Receipt persistence, and Runner call count.
- **Authorization seam:** exercise
  `authorizeResources(principal, agentId, resourceIds)` for owner mismatch,
  unknown Resource, missing/revoked/current Entitlement, explicit Delegation,
  permission, cardinality, and generation behavior.
- **Mount Plan seam:** exercise
  `compileMountPlan(runId, authorizationDecision)` for canonical containment,
  traversal-shaped IDs, arbitrary absolute paths, symlink escape, missing or
  non-directory sources, duplicate/overlapping Registry entries, target
  collision, stale generation, and immutable readonly output.
- **Runtime seam:** exercise
  `ContainerCodexRunner.run(run, validatedMountPlan)` and the generated real
  container invocation. Assert the approved readonly mount is present, the
  unauthorized Resource is absent, reads succeed, writes fail, and host hashes
  and modification times remain unchanged.
- **Evidence seam:** exercise `GET /api/runs/:runId/receipts` for ownership,
  allow/deny correlation, safe reason codes, nullable generation, accurate
  `runnerStarted`, and redaction of prompts, paths, bodies, sessions, tokens,
  and secrets.
- Use the existing Fastify injection pattern as prior art for high-level API
  acceptance tests.
- Use the existing fake `AgentRunner` pattern as prior art for deterministic
  call-count-zero and Run lifecycle assertions.
- Use the existing container argument-builder tests as prior art for exact
  Docker/Podman-compatible mount-manifest assertions.
- Use the existing JSON store tests as prior art for version 1 to version 2
  migration, atomic persistence, and historical-data retention.
- Add focused Web UI tests where practical, and always require Web typecheck and
  production build coverage for Resource Picker, denied result, and Receipt
  rendering.
- Add regression tests for Agent CRUD, ordinary local-process Runs, ordinary
  container Runs, Playground polling, cancellation, and multi-turn thread
  resume.
- Real-container tests must be clearly separable from deterministic unit and
  HTTP tests when a container engine is unavailable, but the formal demo and
  release evidence require the real-container suite to pass on the supported
  local container profile.
- Final acceptance requires `npm run check` to pass.

## Out of Scope

- Production OAuth or any claim that demo sessions are secure authentication.
- General RBAC or a general policy language.
- Write access or write delegation.
- Individual file Resources.
- Multiple Resources in one Capsule Run.
- Generic MCP or HTTP tool interception.
- Network-policy enforcement.
- Prompt-injection detection.
- DLP.
- Hardened multi-tenant sandboxing.
- Hot revocation of a running bind mount.
- Erasure of content retained in an earlier Codex thread or output.
- Workspace Change Capsule.
- EffectSafe Action Ledger.
- ECS deployment or ECS-specific Runtime support.
- Rebuilding Agent CRUD, Playground, baseline Runs, Agent workspaces, or Codex
  session persistence.

## Further Notes

- The demo must show four scenarios: allow `orders-incident`, deny
  `payments-incident`, revoke `orders-incident` then deny a later Run, and deny
  a Capsule Run under `local-process` without invoking the Runner.
- The strongest evidence is namespace absence, zero Runner calls on denial,
  readonly write failure, unchanged host hash and modification time, and a
  correlated redacted Receipt.
- The architecture diagram should show the trusted sequence from Fastify
  request boundary through principal resolution, Agent ownership, Resource
  authorization, canonical path validation, `ValidatedRunMountPlan`, and
  `ContainerCodexRunner` mount namespace.
- The README and three-minute demo must distinguish the mock identity layer from
  `APP_AUTH_TOKEN`, state that the container is hackathon-grade rather than
  hardened multi-tenant isolation, and explain prospective-only revoke plus
  retained thread memory.
- The main implementation risks are cross-platform Docker/Podman readonly-mount
  behavior, safe version 1 data migration, avoiding shared-file merge conflicts,
  keeping denial persistence atomic, and obtaining reproducible real-container
  evidence inside the two-day window.
