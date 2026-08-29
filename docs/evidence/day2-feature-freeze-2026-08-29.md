# Day 2 feature-freeze evidence

Run on 2026-08-29 for Issue #9 from base revision `8d8a995` (PR #19 merged
into `origin/main`). This is the canonical feature-freeze evidence bundle for
the Run-scoped Resource Capsule MVP.

## Outcome

The feature-freeze gate passed. The product scope is frozen to one explicitly
delegated, read-only directory per Capsule Run. A Principal Resource
Entitlement is only the upper bound; it does not automatically expose a
Resource, and an advisory suggestion is not authorization.

No Spec blocker remains in the tested MVP boundary.

## Integrated revisions

| Workstream | Integrated revision |
| --- | --- |
| Contracts and fixtures | `ce34b68` (PR #11) |
| Run admission, identity, ownership | `c570cc8` (PR #12) |
| Registry, Entitlements, persistence | `19b6596` (PR #15) |
| Path security and mount plan | `0d292d5` (PR #17) |
| Container Runtime | `b05c5b1` (PR #14) |
| Receipt and Web UI | `0c97647` (PR #18) |
| Day 1 integration gate | `8d8a995` (PR #19) |

Issue #9 adds only feature-freeze evidence and a test-harness portability fix;
the frozen production contracts are unchanged.

## Environment

- Host: macOS arm64
- Container VM: Colima 0.10.3 using the Apple Virtualization framework
- Docker client: 29.7.2
- Docker server: 29.5.2, Linux arm64
- Runtime profile under test: local container

## Complete deterministic gate

Command:

```text
npm run check
```

Result:

```text
Server: 18 test files passed, 1 skipped; 133 tests passed, 1 skipped
Web:     4 test files passed; 18 tests passed
Typecheck: server and Web passed
Build:     server and Web production builds passed
```

The one skipped test is the opt-in real-container gate recorded separately
below. The deterministic suite covers HTTP admission, authorization,
path-attack rejection, Registry initialization, migration and persistence,
Receipt correlation/redaction, Agent lifecycle regressions, the Resource
Picker, polling, and Web rendering.

## Clean-state four-scenario rehearsal

Command:

```text
npx vitest run src/capsule-http-gate.test.ts --root apps/server --reporter=verbose
```

Result: 1 file and 5 tests passed. Each case creates fresh persisted state and
uses the production Registry, Entitlement, authorizer, path validator,
mount-plan compiler, Receipt repository, routes, and AgentService composition.
The Runtime is a deterministic test double here so Runner call counts are
exact; the real Runtime boundary is proven independently in the next section.

| Scenario | HTTP/result | Runner calls | Receipt evidence |
| --- | --- | ---: | --- |
| Allow `orders-incident` | `202`; one plan at `/resources/orders-incident`, `readOnly:true`, generation 1 | 1 | `allow`, `allowed`, `runnerStarted:true` |
| Deny `payments-incident` | `403 entitlement_missing`; terminal denied Run | 0 | `deny`, `entitlement_missing`, `runnerStarted:false` |
| Revoke then retry | Revoke `200`; later Run `403 entitlement_revoked`; earlier history remains readable | 1 total, from the pre-revoke Run | historical allow retained; later deny persisted |
| Concurrent revoke at Runtime seam | admitted response converges to terminal `denied` after a simulated one-shot persistence fault | 0 | `deny`, `stale_entitlement_generation`, `runnerStarted:false` |
| Capsule under `local-process` | `403 runtime_profile_unsupported`; an ordinary baseline Run still completes | 0 for Capsule | deny Receipt; baseline has no Capsule Receipt |

The allow case also grants the principal another eligible Registry Resource
and proves it does not enter the plan unless explicitly delegated.

## Formal real-container gate

Command:

```text
RUN_CONTAINER_TESTS=1 CONTAINER_ENGINE=docker \
  npx vitest run src/container-resource-capsule.integration.test.ts \
  --root apps/server --reporter=verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

The generated mount manifest contains exactly one Resource bind:

```text
type=bind,src=<canonical orders-incident path>,dst=/resources/orders-incident,readonly
```

Inside the real container the test proves:

- `/resources/orders-incident/incident-report.md` is readable;
- `/resources/payments-incident` is absent from the namespace;
- creating `.capsule-write-probe` on the delegated mount fails; and
- the Runner returns the expected structured Codex events.

### Host integrity before and after

The following `SHA-256 | mtime epoch seconds | bytes` values were identical
before and after the real-container run:

```text
ed5013e40e57e5b4bb22c039b6bc41ef3bf0f285c97077c41bc082555f393383 | 1787881001 | 758 | orders-incident/incident-report.md
fb29cc9a0914a3abf7ddb5f76e33b51eb78a86e8e24579bf6269e41aab3b8db0 | 1787881001 | 794 | orders-incident/orders-service.log
cbadc58aa24eb1bb49025bdbc144665602607f65b346df45275842c647614dbd | 1787881001 | 396 | orders-incident/timeline.md
4e42fcfe2a40204f68f054d71ea4d4b7dfd93879829d45b952ee7b9ee917b7b5 | 1787881001 | 264 | payments-incident/chargebacks.csv
436fa8a3e97771bb9ab038a23d34f70d8909105e5467e57143eb44f18d404126 | 1787881001 | 814 | payments-incident/incident-report.md
a00019a6332d6c7531de97cc8651b6c08ab6f9bfffa8a20dd8d081dc0ccb04dc | 1787881001 | 641 | payments-incident/payments-gateway.log
```

## Redaction and safe evidence

The deterministic gate and regression suite verify that public Resource and
Receipt responses omit canonical/source paths, prompts, tokens, demo-session
values, secrets, and Resource bodies. Runtime errors containing host paths or
credential-shaped fields are withheld or sanitized before persistence and
HTTP responses. Path-free operational failures remain diagnosable.

Sanitized Receipt shapes used by the demo are:

```json
{"decision":"allow","reason":"allowed","resourceId":"orders-incident","grantGeneration":1,"runnerStarted":true}
{"decision":"deny","reason":"entitlement_missing","resourceId":"payments-incident","grantGeneration":null,"runnerStarted":false}
{"decision":"deny","reason":"entitlement_revoked","resourceId":"orders-incident","grantGeneration":1,"runnerStarted":false}
{"decision":"deny","reason":"runtime_profile_unsupported","resourceId":"orders-incident","grantGeneration":1,"runnerStarted":false}
```

Run, Receipt, Agent, and principal IDs are correlated in the real response but
are represented generically in demo material. No host path or credential is
needed to explain the decision.

## Accepted security boundary and limitations

- `X-Demo-Session` is reproducible mock identity; `APP_AUTH_TOKEN` is only an
  outer demo guard. Neither is production authentication.
- ScopedRun controls server-owned filesystem namespace exposure. It is not
  general RBAC, DLP, network policy, generic MCP/HTTP tool interception,
  prompt-injection protection, or hardened multi-tenant isolation.
- The MVP supports zero or one directory Resource and read-only access only.
- Entitlement is an upper bound; explicit per-Run Delegation is the mounted
  scope. Suggestions are advisory only.
- Revoke blocks future Runner starts. It does not hot-unmount an active
  container or erase content already retained by a model, thread, Message,
  output, or Agent workspace.
- A full model answer still depends on valid Ark credentials, endpoint quota,
  and the prebuilt demo Runtime image. The namespace guarantee does not depend
  on model wording or quota.

## Integration note: Colima bind mounts

The first Day 2 run failed before container startup because Node placed the
test workspace under macOS `/var/folders`, which Docker Desktop shares but
Colima does not expose inside its VM. Re-running with a `/Users` temp root made
the same test pass, proving an environment-path issue rather than a Runner or
mount-plan defect.

The test now defaults to a user-home temporary directory on macOS and accepts
`CONTAINER_TEST_TEMP_ROOT` for engines with a different shared path. The
original command passes without an override on Colima. Production Runtime
behavior and frozen interfaces are unchanged.

## Feature-freeze checklist

- [x] No open Spec blocker remains.
- [x] Formal real-container evidence passes on the demo profile.
- [x] The four scenarios are reproducible from clean state.
- [x] Security claims match the evidence and accepted limitations.
- [x] Feature scope is frozen for final delivery.
