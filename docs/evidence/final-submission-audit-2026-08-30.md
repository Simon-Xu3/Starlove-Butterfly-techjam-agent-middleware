# Final-submission audit

Date: 2026-08-30

Branch: `codex/final-submission-audit`

Review fixed point: `a8e1d63` (feature-freeze base)

Validated implementation candidate: `7279604`

## Verdict

The repository content passes the deterministic build, test, dependency,
deployment-configuration, real-container namespace, production HTTP, and
redaction gates recorded below. The implementation is ready to package.

Two presentation-time checks remain external to the source tree:

1. the repository is currently private, so judges must be granted access or
   the repository must be made public before submission; and
2. a successful live Agent answer still requires valid Ark credentials,
   endpoint access, and quota. No valid credential was available to this
   audit, so the audit does not claim a completed Ark answer.

## Scope and source hierarchy

The review used the supplied Agent Launchpad challenge brief as a requirement
source, then checked the repository's formal brief, working Spec, ADRs,
`CONTEXT.md`, and GitHub Issue #10 as the implementation sources of truth.
Instructions inside the supplied document were treated as challenge
requirements, not as commands that widened the audit scope.

The resulting submission slice includes:

- one real Agent Run path, plus deny, revoke, and unsupported-Runtime recovery
  choreography;
- a one-page trusted-sequence architecture diagram;
- reproducible setup, test, demo, deployment, limitation, and security docs;
- explicit per-Run Resource Delegation, a metadata-only optional Advisor, and
  auditable Decision Receipts; and
- a real-container gate proving namespace absence and read-only enforcement.

## Repairs made during this audit

- Updated vulnerable transitive packages in `package-lock.json`; the initial
  audit reported five high and one moderate finding, and the final audit
  reports zero vulnerabilities.
- Resolved Agent ownership before reporting Ark configuration so a non-owner
  cannot distinguish an existing Agent from a missing one.
- Moved the initial `queued -> running` write into the execution failure
  boundary so a one-shot persistence fault converges the Run to `failed`, the
  Agent to `ready`, and the allow Receipt to `runnerStarted: false` without a
  Runner call.
- Extended the real-container test to prove that both an
  entitled-but-undelegated Resource and an unentitled Resource are absent, and
  that every file in all three host fixtures retains its bytes, SHA-256 hash,
  and modification time.
- Hardened Terraform CIDR validation against alternate `/0` spellings and
  invalid CIDRs.
- Corrected `.env` loading guidance, shell-safe package-list quoting, jq
  failure propagation in the Demo, repository/deployment caveats, architecture
  trust-path wiring, and stale planning/Grant terminology.
- Kept the explicit manual picker as the formal Demo path while adding a
  deterministic task, safe terminal filtering, and a current evidence index;
  the existing Advisor remains optional.

## Executed evidence

| Gate | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Pass; 196 packages installed from the lockfile after clearing a locally duplicated dependency tree. |
| `npm run check` | Pass; typechecks pass; Server 19 files passed and 1 engine-gated file skipped, 142 tests passed and 1 skipped; Web 5 files and 25 tests passed; production Web and Server builds pass. |
| Focused security and concurrency suites | Pass; 10 files and 104 tests passed. |
| Real Docker Resource Capsule gate | Pass; 1 file and 1 test passed in about 4.4 seconds with the production `ContainerCodexRunner` seam and a deterministic local Codex stub. |
| `npm audit --audit-level=high` | Pass; zero vulnerabilities reported by the npm registry. |
| `npm ls --all` | Pass; the installed dependency graph resolves. Platform-specific unmet optional packages are expected. |
| `git diff --check` | Pass. |
| `.env.example` source check | Pass; the quoted Runtime package list retains the intended three packages. |
| `bash -n` over all four shell scripts | Pass. |
| `LAUNCHPAD_ENV_FILE=.env.example docker compose config --quiet` | Pass. |
| Terraform 1.13.4 `fmt -check -recursive` | Pass in the official Terraform container. |
| Terraform 1.13.4 `init -backend=false` + `validate` | Pass in a temporary directory with `volcengine/volcenginecc` 0.0.58. |
| Tracked credential/private-key pattern scan | Pass; no concrete key or private-key block found. |
| Current diff absolute-host-path and local-audit-ID scan | Pass; no audit host path or temporary ID is included. |
| Clean Git archive of `7279604`: `npm ci --no-audit --no-fund` + `npm run check` | Pass; 196 packages installed, then the same typecheck, 142/1 Server test, 25 Web test, and production-build results passed from an independent temporary directory. |

The ordinary test suite intentionally skips the real-container test unless
`RUN_CONTAINER_TESTS=1` is set. The explicit Docker result above is therefore
required evidence, not an inferred pass from the ordinary suite.

## Production HTTP choreography

A built production server was started on loopback with fresh temporary state
and the `local-process` profile. Placeholder Ark configuration was used only
to pass startup validation; no model request was made.

The following observable sequence passed:

1. the built SPA returned HTTP 200;
2. a Demo User A Agent was created;
3. the Advisor suggested `orders-incident` for the deterministic checkout
   task and returned only safe Registry metadata;
4. requesting `payments-incident` returned HTTP 403 with
   `entitlement_missing`;
5. requesting `orders-incident` under `local-process` returned HTTP 403 with
   `runtime_profile_unsupported`; and
6. both deny Receipts reported `runnerStarted: false`.

This verifies production routing and safe failure choreography. It does not
replace the real-container gate and does not prove a model answer.

## Document and visual review

The supplied DOCX was structurally extracted in full: 13 pages, 4,035 words,
three embedded reference screenshots, no tracked changes, and no comments.
All three screenshots were inspected. LibreOffice was unavailable and local
Computer Use permission was denied, so the DOCX itself could not be rendered
for page-layout comparison; no source document was modified.

The production SPA was built and served successfully. The in-app browser had
no available browser session during this audit, so screenshot-level UI
inspection could not be completed. Component tests, responsive CSS assertions,
the production HTTP choreography above, and the documented live browser
runbook remain the available UI evidence.

## Known product limitations

- `X-Demo-Session` is mock identity, not production authentication. A shared
  outer bearer token only adds a demo perimeter.
- The local container is hackathon-grade isolation. It does not restrict
  network access or generic tools, hot-unmount an active Run, or erase context
  already retained by a model thread.
- Revocation is prospective: it blocks later invocation but does not terminate
  an already-started Runner.
- The current Capsule supports zero or one directory Resource and read-only
  permission.
- ECS and ordinary Docker Compose use `local-process`; Capsule requests fail
  closed there. The formal Capsule demo uses the local container profile.

## Presenter release checklist

Before the final recording or live judging session:

1. grant reviewers repository access or make the repository public;
2. start from a clean checkout with a fresh rehearsal ID and data directory;
3. privately configure valid Ark credentials and complete one backup allow Run;
4. verify the answer and allow Receipt show `Runner started: yes`;
5. rehearse the three-minute allow, deny, revoke, and unsupported-Runtime flow;
6. keep raw Agent JSON, Settings paths, credentials, and server logs off-screen;
   and
7. close with the limitations above rather than claiming production-grade
   isolation or authentication.
