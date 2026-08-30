# Issue #10 final delivery evidence

Date: 2026-08-30  
Branch: `codex/issue-10-final-delivery`  
Feature-freeze base: `a8e1d63`  
Final commit: recorded in GitHub Issue #10 to avoid a self-referential hash in
the commit that contains this file.

## Outcome

The Issue #10 documentation and reproducibility gates pass. The delivery adds
no product behavior after feature freeze: the final diff is limited to README,
architecture, demo, and evidence material. The trusted flow is documented as:

```text
task -> eligible safe metadata -> optional advisory suggestion
     -> explicit human approval -> server recheck
     -> one read-only Resource mount -> Decision Receipt
```

Entitlement is described only as the upper bound of what a Human Principal may
delegate. It is never described as automatic Agent visibility, and the
optional Advisor is never described as an authorization authority.

## Integrated feature-freeze revisions

| Workstream | Integrated revision |
| --- | --- |
| Contracts and fixtures | `ce34b68` (PR #11) |
| Run admission, identity, ownership | `c570cc8` (PR #12) |
| Registry, Entitlements, persistence | `19b6596` (PR #15) |
| Path security and mount plan | `0d292d5` (PR #17) |
| Container Runtime | `b05c5b1` (PR #14) |
| Receipt and Web UI | `0c97647` (PR #18) |
| Day 1 integration gate | `8d8a995` (PR #19) |
| Day 2 feature freeze | `a8e1d63` (PR #20) |

The following check returned exit `0`, confirming no Issue #10 change to the
frozen application, fixtures, Runtime image, scripts, or dependency manifests:

```text
git diff --quiet a8e1d63 -- apps/server apps/web fixtures \
  Dockerfile.runtime package.json package-lock.json scripts
```

## Test environment

- Host OS/architecture: macOS arm64
- Node.js: 24.15.0 (project minimum: 22)
- npm: 11.12.1
- Docker client/server: 28.3.3 / 28.3.3
- Runtime profile for namespace evidence: local container
- Terraform CLI: unavailable on this host; the Terraform formatting command
  was not represented as passed
- Live Ark credentials: intentionally unavailable to this run

No hostname, user-home path, credential, or environment value is included in
this evidence.

## Acceptance results

### Final deterministic gate

Command:

```text
npm run check
```

Result: exit `0`.

- Server: 18 files passed and 1 opt-in container file skipped; 133 tests passed
  and 1 skipped.
- Web: 4 files and 18 tests passed.
- Server and Web typechecks passed.
- Server and Web production builds passed.

The skipped test is the real-container gate, which was explicitly enabled and
passed separately below.

### Focused four-scenario HTTP gate

Command:

```text
npx vitest run src/capsule-http-gate.test.ts \
  --root apps/server --reporter=verbose
```

Result: exit `0`; 1 file and 5 tests passed. The suite covers allow, unentitled
deny, prospective revoke with retained history, concurrent revoke at the final
Runtime seam, and `local-process` rejection. It uses the production Registry,
Entitlement, authorizer, path compiler, store, routes, and Receipt service. Its
deterministic Runner double supplies exact Runner-call counts; it does not prove
the container namespace.

### Focused Web evidence

Command:

```text
npx vitest run src/resource-capsule.test.tsx \
  src/resource-capsule-e2e.test.tsx \
  --root apps/web --reporter=verbose
```

Result: exit `0`; 2 files and 5 tests passed. The tests cover explicit manual
selection/removal, exactly-one-Resource request construction, denial handling,
Receipt lookup, and safe allow/deny rendering.

### Formal real-container gate

Command:

```text
RUN_CONTAINER_TESTS=1 CONTAINER_ENGINE=docker \
  npx vitest run src/container-resource-capsule.integration.test.ts \
  --root apps/server --reporter=verbose
```

Result: exit `0`; 1 file and 1 test passed in 4.16 seconds. The test used the
production `ContainerCodexRunner`, a real Docker container, and a deterministic
local Codex stub. It proved:

- the delegated `orders-incident` directory was readable;
- `payments-incident` was absent from the container namespace;
- a write through the delegated mount was rejected;
- fixture hashes and modification times were unchanged; and
- the temporary image, container, and write probe were removed.

This gate proves mount mechanics and host integrity. It does not call Ark and
does not prove a model answer.

### Production-server demo choreography

Two production builds were started with fresh state: one used the real
container profile and one used `local-process`. No HTTP test harness or fake
Runner was involved. A fixed non-sensitive rehearsal request exercised the
safe API sequence in 19 seconds, including active-Run cleanup:

| Scenario | Observed result |
| --- | --- |
| Allow `orders-incident` | HTTP `202`; allow Receipt; `runnerStarted: true` |
| Deny `payments-incident` | HTTP `403`; `entitlement_missing` |
| Revoke then retry | `revoked`; later `entitlement_revoked`; historical allow Receipt still readable |
| Capsule under `local-process` | HTTP `403`; `runtime_profile_unsupported` |

The allow case crossed the real `ContainerCodexRunner` invocation seam. It used
an intentionally non-secret placeholder model configuration, so no successful
model answer is claimed. The formal presentation must complete the
[runbook preflight](../SCOPEDRUN_DEMO.md#presenter-preflight--not-part-of-the-three-minutes)
with valid credentials and quota before the audience arrives.

The timed run sheet allocates exactly 3:00. The measured 19-second backend
choreography leaves 2:41 for the architecture, browser approval step, evidence
explanation, and closing limitations. Image builds, dependency installation,
credential entry, and model warm-up are explicitly outside the timer.

### Configuration and clean-checkout smoke

Commands:

```text
LAUNCHPAD_ENV_FILE=.env.example docker compose config --quiet
git archive <final-commit> | tar -x -C <empty-temporary-directory>
npm ci
npm run check
```

Result: Compose configuration returned exit `0`. The final committed tree was
exported into an empty temporary directory, dependencies were installed from
the lockfile, and `npm run check` returned exit `0`. A production-build smoke
then confirmed the public health endpoint, system endpoint, and
principal-scoped safe Resource catalog from fresh state. The temporary checkout
and smoke state were removed after verification.

`terraform fmt -check -recursive deploy/volcengine` was not run because the
Terraform CLI is not installed on this host. ECS is outside the frozen
Resource Capsule scope; this unavailable optional tool is recorded rather than
silently reported as a pass.

## Evidence hygiene review

Automated pattern checks and a manual diff review found no concrete bearer
token, Ark key, demo credential, absolute user-home path, canonical source path,
private prompt, or Protected Resource body in the delivery material. One older
Kill Test excerpt that repeated a fixture heading was replaced by the factual
statement that the expected test sentinel was observed.

The review intentionally permits:

- the documented mock header values `demo-session-a` and `demo-session-b`;
- obvious placeholders such as `your-ark-api-key` and `<final-commit>`;
- opaque Run, Receipt, and Agent identifiers;
- Resource IDs, relative fixture filenames, hashes, and modification times; and
- container paths such as `/resources/orders-incident`.

Raw Fastify/Vitest output was not copied into this artifact because framework
diagnostics can include hostnames, working directories, intentionally hostile
test inputs, and path-shaped errors.

## Accepted limitations — demo closing statement

- `X-Demo-Session` is caller-selectable mock identity. `APP_AUTH_TOKEN` is only
  a shared outer demo guard. Neither is production authentication.
- The container boundary is hackathon-grade, not hardened multi-tenant
  isolation.
- ScopedRun controls registered server-owned filesystem mounts. Network,
  generic MCP/HTTP tools, DLP, and prompt-injection detection are outside the
  boundary.
- Revocation blocks future Runner starts. It does not hot-unmount an active
  Run or erase information retained in a prior model, thread, Message, output,
  or Agent workspace.
- The MVP supports zero or one directory Resource per Run, read-only. Capsule
  Runs require the local container profile; baseline Runs remain supported
  under `local-process`.

## Definition of Done

- [x] `npm run check` passes.
- [x] README setup and the one-page trust-boundary diagram are accurate and
  reproducible.
- [x] The three-minute runbook covers allow, deny, revoke, and unsupported
  Runtime without using a test double as formal live evidence.
- [x] The evidence bundle contains no prohibited sensitive data.
- [x] Mock identity, prospective revoke, retained memory, tool/network scope,
  and isolation limitations are explicit in README and demo narration.
- [x] The committed tree reproduces the deterministic result from an empty
  checkout, with the real-container gate recorded separately.
