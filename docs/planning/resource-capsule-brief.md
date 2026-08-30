# Run-scoped Resource Capsule Planning Brief

Status: Approved planning input for the formal specification

## Track

Run-scoped Resource Capsule is the repository's only active product effort. It
occupies the Starter Kit's Bouncer extension seam: request identity, Agent
ownership, server-side authorization, and the Runtime boundary.

The feature protects server-owned filesystem resources by controlling which
resources enter a Run's container namespace. It does not attempt to rebuild or
replace the Starter Kit.

## Starter Kit baseline

The CodeJam Starter Kit already provides:

- a React Web UI;
- Agent CRUD and lifecycle controls;
- a browser Playground with multi-turn sessions;
- a Fastify control plane;
- asynchronous Runs;
- JSON persistence;
- a Codex CLI Runtime backed by BytePlus ModelArk;
- persistent Agent workspaces;
- disposable local Runtime containers; and
- local-process and deployment-oriented Runtime profiles.

These capabilities remain intact. Resource Capsule extends Run admission and
the local container mount boundary without replacing ordinary Agent CRUD,
Playground, baseline Runs, or Codex thread continuity.

## Problem

An Agent can execute shell commands, traverse directories, and read files.
Hiding a resource in the Web UI or asking the Agent not to read it in a prompt
does not prevent the Agent from reaching it through another path.

The product therefore needs an enforceable server-side boundary rather than an
advisory prompt or presentation-layer filter.

## Core security invariant

> A server-owned filesystem resource that is not explicitly authorized for the
> current Run must not enter the Agent Runtime namespace.

Authorization, path validation, and mount-plan compilation must complete before
the Runtime starts. A denied Capsule Run must never call the Runner.

This invariant governs protected filesystem mounts only. It does not claim to
intercept every Codex tool call, network request, MCP call, HTTP request, or
piece of information retained from an earlier authorized Run.

## Confirmed domain concepts

- **Human Principal:** the mock demo identity resolved at the Fastify boundary.
- **Agent ownership:** the relationship between an Agent and its Human
  Principal.
- **Protected Resource:** one server-owned directory eligible for controlled
  readonly mounting.
- **Resource Registry:** the server-owned static mapping from Resource ID to
  resource metadata and source path.
- **Principal Resource Entitlement:** a principal's server-owned long-lived
  upper bound for delegating one Protected Resource.
- **Run Delegation:** a principal's explicit zero-or-one Resource choice for
  one new Run; it is the actual scope made visible to that Run.
- **Authorization Decision:** the allow or deny result produced during Run
  admission.
- **ValidatedRunMountPlan:** the immutable, server-produced mount contract
  passed to the container Runtime.
- **Decision Receipt:** the persisted audit evidence for a Capsule Run's
  authorization decision.

Agent workspace and Resource Capsule are distinct concepts. An Agent workspace
remains persistent Agent-owned working state; a Resource Capsule is a
Run-scoped set of authorized readonly mounts.

The canonical human journey and the distinction between standing Entitlement
and per-Run Delegation are in
[`scopedrun-user-flow.md`](scopedrun-user-flow.md).

## Confirmed MVP decisions

### Demo Principal

- Keep `APP_AUTH_TOKEN` as the outer access guard for a remote demo.
- Resolve a separate mock identity from a demo principal session header.
- Map `demo-session-a` to `user-a` and `demo-session-b` to `user-b` on the
  server.
- Never accept `userId`, `ownerId`, or `principalId` from a request body.
- Treat the demo session as reproducible mock identity, not authentication or a
  security secret.
- Assign each newly created Agent to the current Human Principal.
- During database migration, assign existing Agents to `user-a` so the baseline
  remains usable.

### Run admission and deny behavior

- Keep `POST /api/agents/:id/messages` as the Run admission endpoint.
- Extend its request body from `content` to `content` plus `resourceIds`.
- Treat an omitted or empty `resourceIds` list as an ordinary baseline Run.
- A Capsule Run must select exactly one Resource ID.
- Treat the selected Resource ID as a user-created Run Delegation, not as an
  Agent request for standing access.
- Re-resolve the current principal, Agent ownership, Principal Resource
  Entitlement status, and Entitlement generation for every new Capsule Run.
- Resolve the Agent through the current principal before Capsule admission. A
  missing or non-owned Agent returns the same `404` and creates no Run,
  Message, or Decision Receipt.
- After an owned Agent is resolved, a well-formed Capsule request that fails
  Registry, Entitlement, Runtime-profile, or canonical-path admission creates
  a terminal Run with status `denied` and persists a deny Decision Receipt.
- Return HTTP `403` with `runId`, `receiptId`, `status`, and a safe reason.
- Do not call the Runner, create a Codex thread, or save an assistant message
  for a denied Run.
- Reject structurally malformed requests before Run creation with an ordinary
  request-validation response.
- Persist the authorization Receipt before returning an admitted Capsule Run.
  An allowed Run cancelled before Runner invocation keeps its allow Receipt
  with `runnerStarted: false`; cancellation is not an authorization denial.
- Commit the initial Capsule Run, user Message, Agent state transition, and
  Decision Receipt atomically. Retain a stop or delete request that arrives
  during that commit through the handoff to execution.
- Commit pre-Runner cancellation or late-denial Receipt correction together
  with the Run terminal state, including recovery from a one-shot store fault.
- Recheck the Entitlement generation at the final Runtime seam. A concurrent
  revoke that completes before Runner invocation finalizes the Run and Receipt
  as denied and leaves the Runner call count at zero.
- Preserve existing behavior for ordinary Runs that select no Protected
  Resource.

### Persistence and migration

- Increment the JSON database schema version once and migrate existing version
  1 data compatibly.
- Add `ownerPrincipalId` to each Agent.
- Persist Principal Resource Entitlements with: `principalId`, `resourceId`,
  `permission` (`read`),
  `status`, `generation`, `createdAt`, and `revokedAt`.
- Persist Decision Receipts with: `receiptId`, `runId`,
  `humanPrincipalId`, `agentId`, `resourceId`, `decision`, `reason`,
  `grantGeneration`, `runnerStarted`, and `createdAt`.
- Permit `grantGeneration` to be absent or null when denial occurs before a
  matching grant generation exists.
- Never store tokens, secrets, complete prompts, or resource bodies in a
  Receipt.
- Retain historical Runs, Messages, Receipts, workspaces, and Codex threads
  after revocation.
- When the user explicitly deletes an Agent under the existing destructive
  lifecycle contract, delete its Runs, Messages, and correlated Receipts
  together so no orphaned Receipt remains.
- Continue reading owner-scoped historical version 2 Receipts whose reason is
  `ownership_denied`, while prohibiting that reason in new Receipt writes and
  HTTP denial responses.

### Protected Resource Registry and Entitlements

- Use a server-owned static Registry with three directory fixture resources for
  the MVP: `orders-incident`, `inventory-incident`, and `payments-incident`.
- Accept Resource IDs from clients, never source paths, target paths, mount
  modes, owners, or principals.
- Provide minimal operations to list safe Resource metadata visible to the
  current demo principal, list current Entitlements, grant or re-grant read
  access, revoke access, and retrieve a Run's Receipt.
- Apply Agent ownership checks to Agent-scoped Resource, Run, Message, and
  Receipt operations.
- Keep Entitlement policy server-owned for this mock demo. The user may choose
  only from that upper bound for one Run; this is not a general authorization
  model.
- Increment generation monotonically for each new grant or re-grant so a
  Receipt identifies the authorization generation used by a Run.

### Resource Advisor contract

- `POST /api/resources/suggest` accepts only bounded transient task text in a
  `content` field and never persists the request or result.
- The Advisor evaluates only the current principal's active read Entitlements.
  It returns either no suggestion or one safe Advisor Resource projection with
  bounded description, normalized tags, safe matched terms, and one stable
  reason code (`tag_match`, `display_name_match`, or `description_match`).
- Exact normalized tag matches outrank display-name matches, which outrank
  description matches. A zero-match or equal top score returns
  `{ "suggestion": null }`.
- The Advisor cannot create a Run, Message, Receipt, mount plan, Codex task,
  or Runner call; the Web action never auto-selects or submits a Resource.

### ValidatedRunMountPlan

- Support exactly one directory Resource per Capsule Run.
- Do not support individual file Resources or multiple Resources.
- Generate the container target on the server as
  `/resources/<resourceId>`.
- Resolve the source only from the server-owned Resource Registry.
- Canonicalize and validate the source with `realpath` before compiling the
  plan.
- Require the canonical source to remain within the configured allowed
  resource root.
- Mount the Resource readonly in all cases.
- Associate the plan with `runId`, `agentId`, `resourceId`, canonical validated
  source, generated target, `readonly`, and `grantGeneration`.
- Fail closed for an unknown or syntactically invalid Resource ID, `..`, an
  arbitrary absolute path, root escape, symlink escape, target collision, or
  another invalid plan input.
- Reject duplicate or overlapping canonical Registry paths deterministically
  during Registry initialization or plan compilation.
- Never pass an unvalidated path-shaped client value to the container engine.

### Runtime profile

- Continue supporting ordinary baseline Runs through the existing
  `local-process` profile.
- Require `ContainerCodexRunner` for every Capsule Run.
- When the active profile is `local-process`, fail a Capsule Run closed before
  Runner invocation.
- Persist a denied Run and Receipt with reason
  `runtime_profile_unsupported` and `runnerStarted: false`.
- Never silently downgrade a Capsule Run to a host process while claiming
  namespace isolation.
- Use the local container profile for the formal demo.

### Revoke and thread memory

- Check the current Principal Resource Entitlement status and generation and
  the explicit Run Delegation for every new Run.
- A revoke prevents future mount-plan creation and future Runner starts.
- Do not claim immediate revocation of an already running bind mount.
- Do not delete historical Runs, Messages, Receipts, workspaces, or Codex
  threads when revoking.
- Do not claim that the model forgets content legitimately read into a prior
  thread or output.
- State this limitation in the formal Spec, README, and demo narration.

## Scenarios

### Allow

1. `user-a` owns Agent A.
2. `user-a` has a current read Entitlement for `orders-incident`.
3. `user-a` starts a Capsule Run and selects `orders-incident`.
4. The server resolves the principal and verifies Agent ownership, the current
   Entitlement, and the registered Resource.
5. The server canonicalizes the registered source and validates containment.
6. The server compiles a readonly `ValidatedRunMountPlan`.
7. `ContainerCodexRunner` starts a real container with the approved mount.
8. The Agent reads `orders-incident` and completes its analysis.
9. The server persists one allow Decision Receipt. Its `runnerStarted` field is
   false until the invocation is actually attempted and true thereafter.

### Deny

1. Agent A requests the ungranted `payments-incident` Resource.
2. The server creates a stable Run, denies it before Runner invocation, and
   persists a deny Decision Receipt.
3. The Runner call count remains zero.
4. `payments-incident` is absent from the container mount manifest.
5. Its host files retain the same hash and modification time.
6. No Codex thread or assistant message is created for the denied Run.

### Revoke

1. Revoke `user-a`'s read Entitlement for `orders-incident`.
2. A later Capsule Run rechecks current status and generation.
3. The later Run is denied before mount-plan creation and Runner invocation.
4. Historical evidence remains available.
5. No claim is made about hot revocation or erasing prior model memory.

### Unsupported Runtime

1. Submit a well-formed Capsule Run while `local-process` is active.
2. Create a terminal denied Run and Decision Receipt with reason
   `runtime_profile_unsupported`.
3. Leave the Runner call count at zero.
4. Do not compile or execute a host-process fallback.

## Minimal modules

- demo Principal resolver;
- Agent ownership checks;
- static Protected Resource Registry;
- Principal Resource Entitlement service and persistence;
- Resource path validator;
- mount-plan compiler;
- `ContainerCodexRunner` readonly mount integration;
- Decision Receipt persistence and APIs;
- minimal Resource Picker, with optional safe metadata-only suggestions; and
- minimal Receipt view.

## API decisions

- Preserve `POST /api/agents/:id/messages` and add `resourceIds` to its body.
- Keep identity in the server-resolved demo session header, never the body.
- Provide minimal APIs for visible Resources, Principal Entitlements,
  grant/re-grant,
  revoke, and Receipt lookup.
- Use `GET /api/runs/:runId/receipts` as the evidence lookup seam.
- Return only safe Resource metadata to the client; never expose host source
  paths.
- A syntactically valid denied Capsule request returns `403` with stable Run and
  Receipt identifiers.

## Starter Kit baseline gaps

At approval time, this brief was based on the following Starter Kit gaps. They
record the starting point that motivated the target design; they are not a
current implementation-status checklist:

- Fastify had only an optional shared bearer token and no Human Principal
  resolver.
- Agents had no owner, and Agent CRUD/list/read operations were not scoped by
  principal.
- Run admission accepted only prompt content.
- `AgentService` had a useful atomic one-active-Run admission point but no
  Resource authorization or mount-plan compilation.
- `RunnerRequest` contained Agent ID, workspace path, prompt, and thread ID but
  no Run ID or validated mount plan.
- `ContainerCodexRunner` mounted only the Agent workspace and Codex home; it
  had no Protected Resource mount manifest.
- `CodexRunner` was a host process and could not supply the required container
  namespace evidence.
- JSON schema version 1 had no owner, Registry, Entitlement, or Receipt
  records.
- The Playground had no Resource Picker or Receipt view.

The target design called for extending the existing seams rather than
duplicating the Run pipeline.

## Confirmed test seams

1. **HTTP Run seam:** `POST /api/agents/:agentId/messages`
2. **Authorization seam:**
   `authorizeResources(principal, agentId, resourceIds)`
3. **Mount Plan seam:**
   `compileMountPlan(runId, authorizationDecision)`
4. **Runtime seam:**
   `ContainerCodexRunner.run(run, validatedMountPlan)`
5. **Evidence seam:** `GET /api/runs/:runId/receipts`

Most acceptance coverage should exercise the HTTP Run seam. Path attacks and
real bind-mount behavior should use focused integration seams.

## Automated tests and objective evidence

- HTTP allow, deny, revoke, and unsupported-runtime scenarios.
- Cross-principal Agent ownership denial.
- Missing, unknown, revoked, and stale-generation grants.
- Invalid Resource IDs and attempts to submit path-shaped values.
- Canonical root containment and symlink-escape rejection.
- Duplicate and overlapping Registry path rejection.
- Mount target collision rejection.
- Exact container mount manifest assertions.
- Runner call count of zero for every pre-Runtime denial.
- A real local container that can read the allowed fixture.
- Absence of an unauthorized fixture from the container namespace.
- A failed write through the readonly Resource mount.
- Stable host file hash and modification time before and after the Run.
- Receipt correlation across Human Principal, Agent, Run, Resource, decision,
  grant generation, and Runner-start evidence.
- Regression coverage for ordinary Runs, Agent CRUD, Playground behavior, and
  multi-turn Codex sessions.
- Final `npm run check` success.

## Delivery constraints and parallelism

- Team: five people.
- Development window: two days.
- Freeze shared contracts and fixtures in no more than one hour.
- Before opening parallel workstreams, prove on the intended container engine
  that an allowed fixture is readonly and an unauthorized fixture is absent
  from the Runtime namespace. Stop and revisit the design if that boundary
  cannot be demonstrated.
- Begin five balanced workstreams in parallel after that freeze.
- Each workstream owns implementation, automated tests, documentation, and
  demo evidence.
- Give shared core files a single owner to reduce merge conflicts.
- Integrate through mocks and stubs until dependent work is ready.
- Use a Day 1 integration gate and a Day 2 feature-freeze gate.

Required deliverables are reproducible code, a three-minute demo, one
architecture diagram, updated README documentation, and a passing
`npm run check`.

## Out of Scope

- production OAuth;
- general RBAC or a general policy language;
- write grants;
- multi-Resource Capsules;
- generic MCP or HTTP tool interception;
- prompt-injection detection;
- DLP;
- a hardened multi-tenant sandbox;
- hot revocation of a running bind mount;
- Workspace Change Capsule;
- EffectSafe Action Ledger; and
- ECS deployment.

## Known limitations

- Demo Principal sessions are mock identity and are not secrets or production
  authentication.
- The container boundary is hackathon-grade, not hardened multi-tenant
  isolation.
- Network and non-filesystem tool access remain outside this control.
- Revocation affects future admission only.
- Previously authorized content may remain in Messages, outputs, Agent
  workspaces, or a resumed Codex thread.
- The MVP supports one directory Resource per Capsule Run and read permission
  only.
- Capsule Runs are unavailable under the `local-process` Runtime profile.
