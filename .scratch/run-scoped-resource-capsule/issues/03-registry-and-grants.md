# 03: Resource Registry, Grants, Revoke, and Persistence

Status: ready-for-agent
Owner: P2
Blocked by: 01: Contracts and Fixtures Freeze
Estimated effort: 7–8 hours

## Scope

- Upgrade the JSON database from version 1 to version 2 compatibly.
- Preserve existing Agents, Messages, Runs, workspace paths, and Codex thread
  IDs; assign migrated Agents to `user-a`.
- Initialize empty Grant and Decision Receipt collections for migrated data.
- Implement the server-owned static Protected Resource Registry for the two
  frozen directory fixtures.
- Return only safe Resource metadata and never expose host source paths.
- Persist active and revoked read Grants with monotonically increasing
  generation.
- Implement grant, re-grant, revoke, and Agent Grant query operations.
- Provide Resources and Grants route plugins for P1 to register.
- Preserve historical Grants and generations needed by Receipts.
- Delegate canonical path-set validation to P3's frozen seam when integrated.

## Out of Scope

- Principal resolution and central AgentService orchestration.
- Implementing realpath containment or `ValidatedRunMountPlan`.
- Container mounts, Resource Picker, and Receipt presentation.
- Write permission, multi-Resource Grants, general RBAC, or policy language.

## Files owned

- `apps/server/src/store.ts`
- `apps/server/src/store.test.ts`
- `apps/server/src/config.ts`
- New Resource Registry module and tests.
- New Resource Grant service, route plugin, and tests.
- Database migration helpers owned by this workstream.

P2 does not edit central application composition; P1 registers exported plugins
at the integration gate.

## Frozen interfaces

- Database version 2, Agent owner, Protected Resource, Resource Grant, and
  Decision Receipt record shapes from Ticket 01.
- Registry lookups accept only Resource IDs and return server-trusted entries.
- Grant queries are scoped by current Agent and Resource ID.
- Initial grant generation and every re-grant generation follow the frozen
  monotonic rule.

## Mock/Stub strategy

- Inject a fake Principal/ownership result into route-plugin tests.
- Inject a deterministic clock for generation timestamps.
- Use temporary JSON stores for migration and persistence tests.
- Use P3's fake Registry-path validator until its real implementation lands.
- Do not copy authorization logic into the Grant service.

## Tests

- Version 1 database migrates once to version 2 without losing baseline data.
- Migrated Agents belong to `user-a`.
- Fresh and migrated databases contain usable Grant and Receipt collections.
- Registry exposes safe metadata but no host path or file contents.
- Duplicate Resource IDs and invalid static entries fail initialization.
- Grant, revoke, and re-grant persist correct status, timestamps, and generation.
- Historical generation data survives revoke and re-grant.
- Cross-Agent and cross-principal API access is rejected through the ownership
  stub.
- Store atomic-write and serialization regressions remain green.

## Demo evidence

- A version 1 fixture database starts successfully as version 2.
- Agent A receives one read Grant for `orders-incident`, then shows revoked and
  re-granted generations deterministically.
- Resource API output contains IDs/display metadata but no source paths.

## Evidence

- Owner records migration before/after summaries, generation history, and safe
  API samples.

## Tests Run

- Owner records focused migration, Registry, Grant, and API test commands and
  results.

## Known Limitations

- Owner records fixture/config portability issues and any persistence risk.
- Registry and Grants are single-process hackathon implementations.

## Integration Notes

- Owner records the actual Registry/path-validator adapter used with P3 and the
  persistence adapter consumed by P5.

## Definition of Done

- [ ] Version 1 data migrates safely and baseline records remain usable.
- [ ] Registry host paths remain server-only.
- [ ] Grant/re-grant/revoke and generation semantics match the Spec.
- [ ] Resources and Grants operations are ready for P1 registration.
- [ ] P3 and P5 can consume the frozen persistence contracts without editing
      P2-owned files.
- [ ] Evidence, Tests Run, Known Limitations, and Integration Notes are updated.
