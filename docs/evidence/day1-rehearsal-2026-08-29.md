# Day 1 gate — informal rehearsal of the four Capsule scenarios

Run on 2026-08-29 against a **real HTTP server** built from
`apps/server/dist` (not the test harness), Docker 29.4.0 available,
`RUNTIME_PROVIDER=container`. Requests issued with `curl`.

## Identity and catalog

```
GET /api/agents            (no session)      -> 401
GET /api/resources         as user-a         -> {"resources":[{"id":"orders-incident","displayName":"Orders Incident","kind":"directory"}]}
GET /api/resources         as user-b         -> {"resources":[{"id":"payments-incident",...}]}
```

Each principal sees only what it may delegate, and no response carries a host path.

## Scenario 1 — allow `orders-incident`

```
POST /api/agents/:id/messages {"content":"...","resourceIds":["orders-incident"]}
  -> 202 {"run":{"status":"queued",...},"message":{...}}
GET /api/runs/:runId/receipts
  -> {"receipts":[{"decision":"allow","reason":"allowed","grantGeneration":1,
       "runnerStarted":true,"resourceId":"orders-incident","humanPrincipalId":"user-a",...}]}
```

The container was launched for real. The Run then failed with
`status: failed` because this rehearsal used a placeholder `ARK_API_KEY`
(the upstream model API returned 401) — the capsule decision, mount plan,
and Receipt are unaffected by that.

**Host-path redaction verified on a real failure path:**

```
run.error = "docker Runtime exited with code 1: unexpected status 401 Unauthorized:
             The API key format is incorrect. ... url: http[path], request id: ..."
```

No `/Users`, `/private`, or `fixtures/resources` substring appears; the
redaction marker `[path]` is present.

## Scenario 2 — deny `payments-incident`

```
POST .../messages {"resourceIds":["payments-incident"]}
  -> 403 {"runId":"...","receiptId":"...","status":"denied","reason":"entitlement_missing"}
GET /api/runs/:runId/receipts
  -> {"receipts":[{"decision":"deny","reason":"entitlement_missing",
       "grantGeneration":null,"runnerStarted":false,...}]}
```

## Scenario 3 — revoke, then retry

```
POST /api/entitlements/revoke {"resourceId":"orders-incident"}
  -> {"entitlement":{"status":"revoked","generation":1,"revokedAt":"..."}}
POST .../messages {"resourceIds":["orders-incident"]}
  -> 403 {"status":"denied","reason":"entitlement_revoked"}
GET /api/resources as user-a
  -> {"resources":[]}
```

Revocation takes effect on the next Run; the earlier allow Receipt remains readable.

## Scenario 4 — Capsule Run under `local-process`

```
RUNTIME_PROVIDER=local-process
POST .../messages {"resourceIds":["orders-incident"]}
  -> 403 {"status":"denied","reason":"runtime_profile_unsupported"}
```

## Cross-principal isolation

```
as user-b: GET /api/agents/<user-a agent>            -> 404
           GET /api/agents/<user-a agent>/messages   -> 404
           GET /api/agents/<user-a agent>/runs       -> 404
           GET /api/runs/<user-a run>/receipts       -> 404
           GET /api/agents                           -> 0 agents
```

## Notes

- A second Capsule request while the first Run was still executing returned
  `409 "This Agent is already running"`, confirming the one-active-Run
  guarantee still holds on the Capsule path.
- A full allow-path Run that reaches Codex needs real `ARK_API_KEY` /
  `ARK_MODEL` and the `volc-agent-runtime:local` image; the namespace
  guarantee itself is evidenced separately in `kill-test-2026-08-29.md`.
