# 05: Container Runtime and Readonly Mount Evidence

Status: ready-for-agent
Owner: P4
Blocked by: 01: Contracts and Fixtures Freeze
Estimated effort: 7–8 hours

## Scope

- Spend the first two hours completing the real-container Kill Test before
  extending the full Runner implementation.
- The Kill Test must prove: `orders-incident` is readable,
  `payments-incident` is absent, readonly writes fail, host hash/mtime remain
  unchanged, and the Runner accepts only a `ValidatedRunMountPlan`.
- Change the Capsule Runtime seam so `ContainerCodexRunner` cannot accept raw
  source, target, or mode values from callers.
- Translate the validated plan into exactly one readonly Docker/Podman-compatible
  bind mount.
- Keep the existing workspace, Codex home, limits, cancellation, timeout,
  output parsing, and thread behavior intact.
- Keep baseline container Runs working without a Capsule mount.
- Make exact mount-manifest evidence inspectable in deterministic tests.
- Add a focused real-container integration suite for the supported local
  container profile.

## Out of Scope

- Authorization, Grant lookup, path validation, or mount-plan compilation.
- Host-process fallback for Capsule Runs.
- ECS support, hardened multi-tenant isolation, network policy, or hot unmount.
- Resource Picker and Receipt UI.

## Files owned

- `apps/server/src/container-codex-runner.ts`
- `apps/server/src/container-codex-runner.test.ts`
- `apps/server/src/runner-factory.ts`
- New focused real-container Resource Capsule integration tests and helpers.

P4 does not edit shared contracts or generate/repair mount plans inside the
Runner.

## Frozen interfaces

- `ContainerCodexRunner.run(run, validatedMountPlan)` for Capsule Runs.
- `ValidatedRunMountPlan` is the only accepted source of Resource mount data.
- The plan target, source, readonly flag, Run ID, Agent ID, Resource ID, and
  generation are immutable inputs.
- Baseline Runner behavior accepts no Resource plan and remains compatible.

## Mock/Stub strategy

- Use the frozen valid-plan factory for deterministic argument tests.
- Use a fake process launcher only to assert invocation and error handling.
- Use the actual configured Docker/Colima/Podman engine for the Kill Test and
  final integration evidence.
- Never bypass plan validation by constructing raw mount strings in higher
  layers.

## Tests

- **First-two-hour Kill Test:** real container reads `orders-incident`.
- **First-two-hour Kill Test:** `payments-incident` path does not exist in the
  container namespace.
- **First-two-hour Kill Test:** write through the Resource mount fails.
- **First-two-hour Kill Test:** host fixture hash and mtime are unchanged.
- **First-two-hour Kill Test:** raw/unvalidated mount input cannot be passed to
  the Runner API.
- Container argv contains exactly the validated readonly Resource mount.
- Baseline container invocation contains no Resource mount and still works.
- Cancellation, timeout, output bounds, Podman user namespace, and thread-resume
  tests remain green.
- Engine-unavailable behavior is explicit without weakening the formal Demo
  requirement.

## Demo evidence

- Timestamped Kill Test output captured within the first two hours.
- Sanitized mount manifest showing only `orders-incident` at its generated
  readonly target.
- Read succeeds, write fails, payments is absent, and before/after host
  hash/mtime values match.

## Evidence

- Owner records the Kill Test environment, container engine/version, sanitized
  invocation, and all five required observations.

## Tests Run

- Owner records the first-two-hour Kill Test command, deterministic Runner test
  commands, and final real-container suite result.

## Known Limitations

- Owner records Docker/Colima/Podman differences and any engine prerequisite.
- The container is hackathon-grade and does not provide hardened multi-tenant
  isolation or network-policy enforcement.

## Integration Notes

- Owner records the exact frozen plan revision received from P3 and the Runner
  result/Receipt handoff required by P1 and P5.

## Definition of Done

- [ ] All five Kill Test claims are proven within the first two hours.
- [ ] Runner accepts only the frozen validated-plan contract for Capsule mounts.
- [ ] Unauthorized Resource data is absent from the mount manifest and namespace.
- [ ] Readonly and unchanged-host evidence is reproducible on the demo profile.
- [ ] Baseline container and existing Runner behavior remain green.
- [ ] Evidence, Tests Run, Known Limitations, and Integration Notes are updated.
