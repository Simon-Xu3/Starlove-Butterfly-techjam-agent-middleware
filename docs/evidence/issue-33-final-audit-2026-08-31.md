# Issue #33 final audit

Date: 2026-08-31

Branch: `fix/issue-33-security-lifecycle-reliability`

## Verdict

The Issue #33 implementation passes the repository's deterministic typecheck,
test, production-build, dependency, Compose, real-container isolation, and
browser smoke-test gates. Two independent reviews found no remaining security,
functional, or API blocker after their findings were repaired and retested.

The work hardens the hackathon implementation within its documented trust
model. It does not claim that `local-process` is a tenant-security boundary or
that the demo identity headers are production authentication.

## Issue #33 repairs

- Managed `AGENTS.md` writes now use platform-derived paths, canonical path
  validation, no-follow final replacement, and per-Agent serialization.
- Agent stop/delete and baseline/Capsule admission now share the same FIFO gate,
  including cancellation checks in the final transaction, so a deleted Agent
  cannot start a queued Runner.
- Each Agent receives a separate Codex home. Container Runs mount only that
  Agent's state rather than the shared parent directory.
- Deterministic Capsule denials are persisted before Ark configuration is
  required, so a missing provider key cannot hide authorization evidence.
- Create, update, and delete filesystem/database transitions compensate on
  injected failures instead of leaving split-brain state.
- Web polling tolerates transient Run and Receipt failures, preserves the last
  admitted Run/proof, exposes an explicit retry, and stops old polling when the
  selected Agent changes.
- The UI and API describe `local-process` honestly as having no per-Run
  container isolation.
- Registry startup fails closed when configured Resource paths are missing,
  escape the fixture root, overlap another Resource, or are not directories.
- Runtime Docker packaging now includes the Resource fixtures required by that
  startup validation.
- The Spec, architecture, security notes, Demo runbook, README, and ADR 005 now
  describe the same lifecycle, path, state-isolation, and Runtime contracts.

## Independent review trail

The security reviewer examined symlink handling, filesystem identity, Codex
state isolation, admission/delete/update ordering, cancellation, missing-row
execution, and lock ordering. Its initial review found a reverse Delete race,
cross-Agent symlink aliases, and update/admission split-brain risk. Those paths
were repaired and covered by regression tests. The final security review found
no blocker and no lock cycle.

The functional/API reviewer examined CRUD compensation, startup behavior,
legacy thread compatibility, Docker packaging, polling and Receipt behavior,
and API/UI Runtime descriptions. Its initial findings led to fixture packaging,
legacy-thread, serialization, and retry changes. Its final pass found one P2 UI
case where Agent A's failed poll could appear after switching to Agent B; the
selection/session guards and a boundary test were added before this audit was
closed.

## Executed evidence

| Gate | Result |
| --- | --- |
| `npm run check` | Pass; Server 21 files passed and 1 container-gated file skipped, 166 tests passed and 1 skipped; Web 6 files and 50 tests passed; all TypeScript checks and production Web/Server builds passed. |
| Final Web selection/polling regression suite | Pass; 6 files and 50 tests passed. |
| Real Docker Agent-state and Resource Capsule gate | Pass; 1 file and 1 test passed. The selected Resource was readable and immutable; unselected Resources and the sibling Agent's private Codex state were absent. |
| Built production Docker image | Pass; runtime image built with the validated fixture registry and reported healthy on loopback. |
| Production browser smoke test | Pass; login page loaded, the local test token opened the SPA, and both navigation and Runtime panels displayed `Local process · no per-Run isolation` wording. |
| `npm audit --audit-level=low` | Pass; zero vulnerabilities. |
| `LAUNCHPAD_ENV_FILE=.env.example docker compose config --quiet` | Pass. |
| `git diff --check` | Pass. |
| Two-agent cross-review | Pass after repairs; no remaining security, functional, or API blocker. |

The normal Server suite intentionally skips the real-container test unless
`RUN_CONTAINER_TESTS=1` is set. The explicit Docker result above is separately
executed evidence.

## Boundary cases covered

- external and cross-Agent workspace symlinks;
- external and cross-Agent Codex-home symlinks;
- target-file symlink replacement without following the target;
- update versus final Run admission;
- Run admission versus stop/delete in both orderings;
- datastore failure during create, update, and delete lifecycle transitions;
- missing Agent/Run immediately before execution;
- missing Ark credentials during deterministic Capsule denial;
- stale legacy shared-state thread IDs;
- transient Run reads, transient Receipt reads, repeated failures, manual retry,
  and switching Agents while an old poll fails;
- missing, escaping, overlapping, and non-directory Registry entries; and
- real-container absence of undelegated Resource namespaces and sibling Agent
  state.

## Remaining documented limitations

- `local-process` runs as the application user and can read host paths that the
  OS user can read. It is explicitly not a per-Run or tenant isolation boundary.
- A same-UID malicious local process can theoretically race pathname validation;
  production multi-tenant isolation requires a stronger sandbox/runtime.
- `X-Demo-Session` and the shared demo token are demonstration controls, not
  production identity.
- Terraform was not installed on this workstation, so this audit does not claim
  a fresh local `terraform fmt`, `validate`, or `plan` result.
- The Docker and browser checks executed for this Issue #33 audit used
  placeholder Ark configuration and did not submit a model request. They are
  distinct from the separately recorded successful
  [real ModelArk live allow-path test](p3-resource-capsule-live-e2e-test-2026-08-30.md),
  which is evidence for its named revision rather than a claim that this audit
  itself called Ark.

## Merge safety

Immediately before push, the branch is fetched against `origin/main` and
checked for divergence and merge conflicts. The exact pushed head and the
result of that final comparison are recorded in the pull request.
