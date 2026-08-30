# ScopedRun three-minute demo

This runbook tells one short, evidence-backed story: a person chooses the
Resource for one Run, the server rechecks that choice, and only the approved
read-only directory enters the Runtime namespace.

The formal demo uses the built application and real local container profile.
It does not use the HTTP test double. The automated suites listed at the end
are supporting evidence, not substitutes for the live path.

## What the audience should learn

1. An Entitlement is only the upper bound of what a Human Principal may
   delegate. It is not automatic Agent visibility.
2. The user explicitly chooses zero or one eligible Resource for each Run.
3. An optional Advisor can suggest from task text and entitled safe metadata,
   but it cannot authorize, auto-submit, or inspect protected contents.
4. The server rechecks identity, Agent ownership, Entitlement generation,
   Registry data, canonical path, and Runtime profile.
5. Allow creates one read-only mount and a correlated Receipt. Deny, revoke,
   and unsupported Runtime stop before the Runner.

## Presenter preflight — not part of the three minutes

Use a clean checkout, Node.js 22 or newer, and `jq` for safe terminal filtering.
Start Docker, Colima, or Podman; Colima uses the Docker CLI. Choose a new
rehearsal ID each time so a previous revoke cannot affect the next run. Do not
reuse an existing state directory, and run the real-container gate only once at
a time.

Run the deterministic and namespace gates:

```bash
npm ci
npm run check

RUN_CONTAINER_TESTS=1 CONTAINER_ENGINE=docker \
  npx vitest run src/container-resource-capsule.integration.test.ts \
  --root apps/server --reporter=verbose
```

The opt-in gate uses the real `ContainerCodexRunner` and a real container, but
a purpose-built local Codex executable; it proves namespace contents,
read-only enforcement, and host integrity without calling Ark. Do not present
it as evidence of a model answer.

Privately export a valid `ARK_API_KEY` and `ARK_MODEL`. Keep their values out of
shell history, recordings, screenshots, and logs. Then start the formal local
profile:

```bash
export SCOPEDRUN_REHEARSAL_ID=demo-01  # Change this for every rehearsal.
export LOCAL_POC_DATA_ROOT="$PWD/.local/scopedrun-$SCOPEDRUN_REHEARSAL_ID"
npm run poc
```

`npm run poc` builds the Web/API and Runtime image, validates bind mounts, and
sets `RUNTIME_PROVIDER=container`. Docker Compose and ordinary local
development default to `local-process`; they cannot run a Capsule and will
correctly return `runtime_profile_unsupported`.

Open <http://localhost:3000>. Keep the default **Demo User A** and create two
Agents before the audience arrives:

- **Live Agent** is reserved for the browser allow path; and
- **Policy Agent** stays ready for terminal deny and revoke requests, avoiding
  the one-active-Run-per-Agent `409` guard.

Complete one backup allow Run with Live Agent before the audience arrives:

- task: analyze the delegated incident bundle;
- explicit Resource choice: **Orders Incident**; and
- expected evidence: completed model answer plus an allow Receipt with
  `orders-incident`, a positive generation, and `Runner started: yes`.

Do not claim a successful end-to-end live path unless both the answer and
Receipt were observed with valid Ark credentials and quota. During the timed
demo, submit a new short allow Run with Live Agent and wait for
`Runner started: yes`; return to its output near the end. If Ark is slow, label
the preflight Receipt as backup evidence instead of claiming the timed Run
completed. The filesystem boundary remains independently reproducible with the
real-container gate.

For terminal steps, filter the principal-scoped Agent response before it reaches
the screen. Raw Agent JSON includes `workspacePath` and is not demo-safe. Copy
Policy Agent's UUID from the filtered result into a non-secret shell variable:

```bash
export SCOPEDRUN_URL=http://127.0.0.1:3000
curl --silent --show-error \
  -H 'X-Demo-Session: demo-session-a' \
  "$SCOPEDRUN_URL/api/agents" \
  | jq '{agents: [.agents[] | {id, name, status}]}'
export POLICY_AGENT_ID=<policy-agent-id-from-the-filtered-response>
```

If the demo is remote and `APP_AUTH_TOKEN` is enabled, add
`Authorization: Bearer $APP_AUTH_TOKEN` to API requests without displaying the
value. The bearer token is an outer demo guard; `X-Demo-Session` remains mock
identity and is not authentication.

Pre-stage a second built server for the unsupported-runtime case in another
terminal. It may inherit the already exported Ark variables; it must use fresh
state and the `local-process` profile:

```bash
NODE_ENV=production \
HOST=127.0.0.1 \
PORT=3101 \
APP_DATA_DIR="$PWD/.local/scopedrun-local-$SCOPEDRUN_REHEARSAL_ID/data" \
AGENT_WORKSPACE_ROOT="$PWD/.local/scopedrun-local-$SCOPEDRUN_REHEARSAL_ID/workspaces" \
CODEX_HOME="$PWD/.local/scopedrun-local-$SCOPEDRUN_REHEARSAL_ID/codex-home" \
RUNTIME_PROVIDER=local-process \
npm start
```

Create its Agent while suppressing the path-bearing raw response:

```bash
export LOCAL_PROCESS_AGENT_ID="$(
  curl --fail --silent --show-error \
    -X POST \
    -H 'Content-Type: application/json' \
    -H 'X-Demo-Session: demo-session-a' \
    --data '{"name":"Unsupported Runtime Demo"}' \
    http://127.0.0.1:3101/api/agents \
    | jq -r '.agent.id'
)"
test -n "$LOCAL_PROCESS_AGENT_ID"
```

Arrange three windows before starting the timer: the architecture diagram, the
browser on Live Agent, and a terminal with the following commands ready. Keep
raw server logs and the UI's Agent Settings panel off-screen because they can
contain local paths.

## Timed narration

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:25 | [Trusted-sequence diagram](ARCHITECTURE.md#trusted-sequence) | “The task and Resource ID are untrusted input. A standing Entitlement only limits the choices; the user's explicit per-Run Delegation is the requested scope.” |
| 0:25–1:10 | Browser: Demo User A, eligible picker, submit Live Agent allow; wait for `Runner started: yes` | “The picker reveals safe metadata only. I explicitly chose Orders Incident. The server rechecked policy and compiled one read-only mount. The Receipt correlates the decision and shows that invocation was attempted.” |
| 1:10–1:35 | Terminal: unauthorized request | “A caller cannot bypass the picker. Payments Incident is a valid Resource ID but is outside User A's Entitlement, so the server returns a stable denial before the Runner.” |
| 1:35–2:10 | Terminal: revoke then retry | “Revocation is prospective. The next Run is denied; the earlier allow Receipt stays available for audit.” |
| 2:10–2:35 | Terminal: `local-process` request | “A Capsule never falls back to a host process. This real server rejects the request because only the container profile can supply the namespace boundary.” |
| 2:35–3:00 | Return to Live Agent output/Receipt; close with limitations | “If the answer is complete, this is the real Agent path. The control is still mock identity and hackathon-grade container isolation. It does not control network or generic tools, hot-unmount an active Run, or erase knowledge retained by a prior model thread.” |

### 1. Deny an unentitled Resource

```bash
curl --silent --show-error \
  --write-out '\nHTTP %{http_code}\n' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Session: demo-session-a' \
  --data '{"content":"Analyze the selected incident.","resourceIds":["payments-incident"]}' \
  "$SCOPEDRUN_URL/api/agents/$POLICY_AGENT_ID/messages"
```

Expected safe fields: HTTP `403`, `status: "denied"`,
`reason: "entitlement_missing"`, and stable Run and Receipt IDs. The denied
body does not repeat Receipt details; the supporting HTTP gate verifies that
the correlated Receipt records `runnerStarted: false` and the Runner call count
is zero.

### 2. Revoke and retry

```bash
curl --silent --show-error \
  --write-out '\nHTTP %{http_code}\n' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Session: demo-session-a' \
  --data '{"resourceId":"orders-incident"}' \
  "$SCOPEDRUN_URL/api/entitlements/revoke"

curl --silent --show-error \
  --write-out '\nHTTP %{http_code}\n' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Session: demo-session-a' \
  --data '{"content":"Analyze the selected incident.","resourceIds":["orders-incident"]}' \
  "$SCOPEDRUN_URL/api/agents/$POLICY_AGENT_ID/messages"
```

Expected safe fields: the Entitlement becomes `revoked`; the later request is
HTTP `403` with `reason: "entitlement_revoked"`. The earlier allow Receipt
remains readable. Restore the Entitlement after the demo if this state will be
reused; the protected fixture itself was never changed:

```bash
curl --silent --show-error \
  --write-out '\nHTTP %{http_code}\n' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Session: demo-session-a' \
  --data '{"resourceId":"orders-incident"}' \
  "$SCOPEDRUN_URL/api/entitlements/grant"
```

### 3. Reject an unsupported Runtime

```bash
curl --silent --show-error \
  --write-out '\nHTTP %{http_code}\n' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Session: demo-session-a' \
  --data '{"content":"Analyze the selected incident.","resourceIds":["orders-incident"]}' \
  "http://127.0.0.1:3101/api/agents/$LOCAL_PROCESS_AGENT_ID/messages"
```

Expected safe fields: HTTP `403`, `reason: "runtime_profile_unsupported"`, and
a stable denied Run/Receipt pair. The supporting HTTP gate verifies that the
Runner call count is zero; the live `403` itself shows the safe decision, not a
private call counter.

## Evidence index

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| [Final delivery](evidence/issue-10-final-delivery-2026-08-30.md) | Final checks, clean-checkout smoke, current real-container result, timed script budget, and redaction review. | Production-grade isolation or authentication. |
| [Day 2 feature freeze](evidence/day2-feature-freeze-2026-08-29.md) | Deterministic four-scenario gate and frozen integrated revisions. | A current live model answer. |
| [Real-container Kill Test](evidence/kill-test-2026-08-29.md) | Delegated Resource readable, undelegated Resource absent, write rejected, host fixtures unchanged. | Ark availability or model semantics. |
| [Day 1 rehearsal](evidence/day1-rehearsal-2026-08-29.md) | Real built server and container reached Ark; safe failure behavior under upstream auth/quota errors. | A completed model response. |

The exact acceptance commands are also listed in the root
[README](../README.md#validation). Evidence records summaries only; do not paste
raw logs, credentials, absolute host paths, private prompt text, or Resource
bodies into a ticket, screenshot, or demo artifact. The short task strings
above are fixed, non-sensitive demo samples; never substitute private or ad hoc
prompt content into recorded evidence.
