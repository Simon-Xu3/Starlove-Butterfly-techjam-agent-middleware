# 02: Run Admission, Demo Principal, and Agent Ownership

Status: ready-for-agent
Owner: P1
Blocked by: 01: Contracts and Fixtures Freeze
Estimated effort: 7–8 hours

## Scope

- Resolve `demo-session-a` to `user-a` and `demo-session-b` to `user-b` from
  the frozen demo session header.
- Preserve `APP_AUTH_TOKEN` as a separate outer remote-demo access guard.
- Reject missing or unknown demo sessions on identity-sensitive APIs without
  accepting identity fields from request bodies.
- Assign the current principal as owner of each new Agent.
- Enforce Agent ownership across Agent-scoped CRUD, lifecycle, Message, Run,
  Grant, and Receipt operations.
- Extend the existing message endpoint with optional `resourceIds` while
  preserving baseline Run behavior.
- Keep the existing one-active-Run-per-Agent admission guarantee.
- Orchestrate the frozen authorization, mount-plan, Receipt, and Runner seams.
- Create terminal denied Runs and safe `403` responses for well-formed Capsule
  admission failures.
- Deny Capsule Runs under `local-process` with
  `runtime_profile_unsupported`, a deny Receipt, and zero Runner calls.
- Do not create an assistant Message or new Codex thread for denied Runs.

## Out of Scope

- Registry and Grant persistence implementation.
- Canonical path validation or mount-plan internals.
- Container argument generation and real bind mounts.
- Receipt UI or Resource Picker implementation.
- Production authentication, OAuth, RBAC, or policy language.

## Files owned

- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/agent-service.ts`
- `apps/server/src/agent-service.test.ts`
- `apps/server/src/index.ts`
- New demo Principal and Agent ownership modules and tests.

P1 is the sole owner of central application composition and Run orchestration.
Other workstreams provide route plugins or services for P1 to register during
integration.

## Frozen interfaces

- The request/response, Principal, Agent owner, Run, Authorization Decision,
  mount-plan, Receipt, and Runner contracts from Ticket 01.
- The five approved seams must not be renamed or reshaped locally.
- A baseline Run uses no Resource; a Capsule Run uses exactly one Resource ID.
- Runner invocation occurs only after an allow decision and validated plan.

## Mock/Stub strategy

- Use the frozen fake ResourceAuthorizer to drive allow, no-grant, revoked,
  ownership, and unsupported-runtime branches.
- Use the frozen fake MountPlanCompiler for the allowed orchestration path.
- Use an in-memory ReceiptStore until P5's real service integrates.
- Use a call-counting AgentRunner to prove zero calls on denial.
- Keep mocks at the approved seams rather than mocking internal functions.

## Tests

- Fastify injection tests for session mapping, missing/unknown sessions, body
  identity rejection, Agent list scoping, and cross-principal ownership.
- HTTP tests for baseline Run compatibility and exactly-one Resource validation.
- HTTP allow/deny response shapes and terminal `denied` Run persistence.
- `runtime_profile_unsupported` produces a Receipt and zero Runner calls.
- Deny creates no assistant Message and no new Codex thread.
- Existing Agent lifecycle, concurrency, cancellation, and multi-turn tests
  remain green.

## Demo evidence

- `user-a` can create and operate Agent A; `user-b` cannot operate Agent A.
- An ordinary Run still works without a Resource.
- A local-process Capsule request returns the stable denied response and shows
  Runner call count zero.

## Evidence

- Owner records request/response samples, Runner call counts, and links to the
  relevant test output before handoff.

## Tests Run

- Owner records every focused test command plus final relevant workspace checks.

## Known Limitations

- Owner records any uncovered admission edge or temporary integration stub.
- Demo sessions remain mock identity and are not security secrets.

## Integration Notes

- Owner records which P2–P5 implementations replaced each stub and any reason
  code or composition issue found at the Day 1 gate.

## Definition of Done

- [ ] Baseline Run behavior remains compatible.
- [ ] Agent ownership is enforced at all approved Agent-scoped boundaries.
- [ ] Capsule admission calls only frozen seams in the approved order.
- [ ] All pre-Runtime denial paths leave Runner call count at zero.
- [ ] Denied Run, Receipt reference, safe `403`, Message, and thread behavior
      match the Spec.
- [ ] Evidence, Tests Run, Known Limitations, and Integration Notes are updated.
