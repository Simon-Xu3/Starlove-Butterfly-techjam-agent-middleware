# 06: Decision Receipt, Resource Picker, UI, and E2E

Status: ready-for-agent
Owner: P5
Blocked by: 01: Contracts and Fixtures Freeze
Estimated effort: 7–8 hours

## Scope

- Implement Decision Receipt creation/query services against the frozen version
  2 persistence contract.
- Persist one redacted Receipt for every syntactically valid Capsule Run after
  principal resolution, for allow or deny.
- Expose the frozen Run Receipt query seam through an independent route plugin.
- Enforce ownership on Receipt lookup and return safe correlation fields only.
- Add a minimal Resource Picker that submits zero or one Resource ID.
- Preserve the baseline composer path with no selected Resource.
- Render terminal denied Runs and their safe Receipt instead of discarding the
  `403` as a generic error.
- Render minimal allow Receipt evidence after an authorized Run.
- Add end-to-end coverage that can begin with mocked APIs and switch to the real
  HTTP seams at the integration gate.

## Out of Scope

- Principal resolution and central Run admission.
- Registry/Grant persistence, path validation, or container mounts.
- General audit UI, policy editor, write grants, or multi-Resource selection.
- Displaying host paths, prompts, tokens, secrets, sessions, or Resource bodies.

## Files owned

- New Decision Receipt service, route plugin, and tests.
- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/styles.css`
- New Web helpers/tests and Resource Capsule E2E tests.
- `apps/web/package.json` and root `package-lock.json` only if test tooling is
  genuinely required; no other Owner edits dependency manifests.

P5 does not edit central Fastify composition; P1 registers the Receipt plugin at
the integration gate.

## Frozen interfaces

- Receipt record, allow/deny decision, nullable generation, Runner-start, and
  redaction contracts from Ticket 01.
- `GET /api/runs/:runId/receipts`.
- Message request with optional `resourceIds` and safe denied `403` body.
- Resource and Grant query adapters exported by P2.
- Baseline Run UI remains available with no Resource selected.

## Mock/Stub strategy

- Start UI work with frozen mock Resource, Grant, Run, and Receipt responses.
- Use an in-memory Receipt persistence adapter until P2's store integration is
  ready.
- Use a fake AgentService/Runner at the HTTP evidence seam to produce stable
  allow and deny cases.
- Replace happy-path mocks at Ticket 07 without coupling UI tests to internals.

## Tests

- Receipt correlates principal, Agent, Run, Resource, decision, reason,
  generation, Runner-start, and timestamp.
- Receipt serialization excludes tokens, sessions, secrets, host paths, full
  prompts, and Resource bodies.
- Cross-principal Receipt access is rejected.
- Picker submits no Resource for baseline or exactly one ID for Capsule Run.
- UI handles denied `403` as terminal Run plus Receipt.
- Allow and deny states render safe fields and reason codes.
- Baseline composer, polling, messages, and multi-turn session behavior remain
  usable.
- Web typecheck/build and focused E2E tests pass.

## Demo evidence

- Picker selects `orders-incident` for an allow flow.
- Selecting `payments-incident` produces a denied Run and correlated safe
  Receipt view.
- Receipt inspection demonstrates that no host path, prompt, token, session, or
  body is present.

## Evidence

- Owner records screenshots or captured states for baseline, allow, deny, and
  Receipt redaction.

## Tests Run

- Owner records focused Receipt, Web, E2E, typecheck, and build commands/results.

## Known Limitations

- Owner records UI accessibility or test-tooling gaps that remain at freeze.
- The UI represents mock identity and prospective revoke only.

## Integration Notes

- Owner records the P2 persistence adapter, P1 route registration, and exact
  allow/deny payload differences encountered during Ticket 07.

## Definition of Done

- [ ] Allow and deny Capsule Runs have queryable redacted Receipts.
- [ ] Picker supports baseline and exactly-one Resource behavior.
- [ ] Denied `403` is presented as a terminal Run and Receipt.
- [ ] Receipt UI exposes no prohibited sensitive fields.
- [ ] Web typecheck/build and focused E2E coverage pass.
- [ ] Evidence, Tests Run, Known Limitations, and Integration Notes are updated.
