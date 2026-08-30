# P3 Resource Capsule Live End-to-End Test Report

**Test ID:** P3-RC-E2E-20260830-01  
**Result:** PASS  
**Test date:** 2026-08-30 (Asia/Shanghai)  
**Receipt time:** 2026-08-30T07:22:47.250Z (15:22:47 Asia/Shanghai)  
**Prepared for:** Starlove Butterfly / TechJam Agent Middleware team  

## 1. Executive summary

This report records a successful live, model-backed execution of the P3
Resource Capsule allow path. The test was performed through the production Web
and API build, a local Docker-backed Container Runtime, a real ModelArk model
configuration, and the real server-owned `orders-incident` fixture. It was not
an HTTP test double or a mocked model response.

The operator, acting as `user-a`, explicitly delegated the eligible
`orders-incident` Protected Resource to one Run of `P3 Incident Analyst`. The
Agent received a task that required incident identification, root-cause
analysis, an exact timeline, source-file citations, and recommendations. The
Agent returned the expected facts from all three delegated files. The
correlated Decision Receipt recorded `allow`, grant generation `1`, and
`Runner started: yes`.

The three protected fixture files were hashed after the Run. Their SHA-256
values matched the frozen baseline manifest exactly, providing byte-level
evidence that the completed Run did not modify the delegated Resource.

**Overall conclusion:** the complete authorized path worked: explicit human
selection -> server-side authorization and path validation -> read-only mount
plan -> Container Runner start -> model inspection of delegated files ->
evidence-backed response -> auditable Receipt.

## 2. Scope and claims

### 2.1 Primary claim under test

An entitled Human Principal can explicitly delegate one eligible Protected
Resource to one Agent Run, and the system can safely convert that authorization
decision into a read-only container mount that the Agent can inspect.

### 2.2 Security and functional properties evaluated

1. The Resource was not automatically exposed merely because an Entitlement
   existed; the operator selected `Orders Incident` for this Run.
2. The server produced an ALLOW decision for the correct principal, Agent,
   Resource, and Entitlement generation.
3. The Runner started only after authorization.
4. The model accessed facts that exist only in the delegated Resource files.
5. The answer cited the exact filenames used.
6. The Resource remained unchanged at the byte level after the Run.
7. The Receipt preserved a correlated audit record for the decision and Runner
   start.

### 2.3 Out of scope for this single live Run

This test did not, by itself, execute the following negative scenarios:

- unentitled access to `payments-incident`;
- retry after Entitlement revocation;
- unsupported `local-process` Runtime rejection;
- an intentional write attempt against the read-only mount;
- symlink or `..` path-escape probes;
- revoke/re-grant races or concurrent compilation races;
- network isolation, generic tool restrictions, or production authentication.

Those scenarios should be retained as separate deterministic and live negative
tests. The PASS result in this report must not be interpreted as proof of every
negative control.

## 3. Test environment

| Item | Recorded value |
| --- | --- |
| Repository | `Starlove-Butterfly-techjam-agent-middleware` |
| Branch | `main` |
| Commit | `9540a5abef797aefdbccb98577854f663fa1514c` |
| Commit summary | `Merge pull request #27 from Simon-Xu3/codex/final-submission-audit` |
| Pre-report worktree | Clean |
| Node.js | `v24.19.0` |
| npm | `11.17.0` |
| Web/API profile | Production build started by `scripts/start-local-poc.sh` |
| Runtime provider | Docker-backed `container` profile |
| Runtime image | `volc-agent-runtime:local` |
| Application URL | `http://localhost:3100/` |
| Why port 3100 | Port 3000 was already used by an unrelated CS1010 WebTop container |
| Model service | BytePlus ModelArk, Asia Pacific (Johor) |
| Operator-selected model | Dola-Seed-2.1-turbo, version 260628 |
| API base URL | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| Secret handling | API Key supplied only as a process environment variable; not recorded here |

The launcher reported that Codex Landlock was unavailable in the Linux
Runtime and therefore selected `danger-full-access` inside the disposable
outer container boundary. This is an expected POC fallback, not a claim of
production-grade sandboxing. No unrelated host directory was mounted into the
Agent Runtime.

## 4. Actors and identifiers

| Field | Value |
| --- | --- |
| Principal | `user-a` / Demo User A |
| Agent name | `P3 Incident Analyst` |
| Agent ID | `3f878e87-717a-4f5f-b343-a2961fdbb9e8` |
| Resource | `orders-incident` / Orders Incident |
| Run ID | `1a5fdb9f-1a57-4069-9f9e-b30de20b0b49` |
| Receipt ID | `e52320b5-a38f-442a-bad7-3fd4d1902271` |
| Grant generation | `1` |

## 5. Agent configuration

### Name

`P3 Incident Analyst`

### Description

> Analyzes delegated incident resources and produces evidence-backed reports.

### Instructions

> When a Run includes a Resource Capsule, inspect the single read-only
> directory available under /resources. Never modify its contents. Base
> conclusions only on the delegated files, cite exact filenames for every
> important claim, distinguish facts from inference, and explicitly state when
> evidence is insufficient.

These instructions test more than generic question answering. They require the
Agent to discover the mounted Resource, synthesize multiple sources, preserve
the read-only contract, and expose its evidence trail.

## 6. Submitted task and delegation

### Human-selected Protected Resource

`Orders Incident` (`orders-incident`)

### Task text

> Investigate the delegated checkout incident using only the Resource Capsule.
>
> Return:
> 1. The incident ID, impact, and UTC incident window.
> 2. The exact configuration mistake and affected service version.
> 3. A timeline from deployment to full recovery, including exact times.
> 4. An evidence table with columns: Claim, Evidence, Source filename.
> 5. Two concrete preventive actions.
>
> Do not guess or modify any resource. End with a "Files consulted" list.

## 7. Expected ground truth

The frozen fixture defines the following expected facts:

| Expected fact | Ground-truth source |
| --- | --- |
| Incident ID `INC-2026-0826-ORDERS` | `incident-report.md` |
| Incident window 21:40-22:15 UTC | `incident-report.md` |
| 18% of checkout requests returned HTTP 500 | `incident-report.md` |
| orders-service v2.14.0 deployed/started around 21:38 | `timeline.md`, `orders-service.log` |
| Database pool initialized with size 5 | `orders-service.log` |
| Correct pool size was 50 | `incident-report.md`, recovery log entry |
| First pool wait warning at 21:40:11 | `orders-service.log` |
| First recorded checkout timeout at 21:40:19 | `orders-service.log` |
| Alert fired at 21:44 | `timeline.md` |
| Root cause identified at 22:05 | `timeline.md` |
| Rollback began at 22:11/22:11:30 | `timeline.md`, `orders-service.log` |
| v2.13.2 started with pool size 50 at 22:12:04 | `orders-service.log` |
| Error rate recovered below 0.1% at 22:15 | `orders-service.log` |

## 8. Actual model response

The Agent returned all requested sections:

1. **Identification and impact:** `INC-2026-0826-ORDERS`; 18% HTTP 500;
   21:40-22:15 UTC, correctly calculated as a 35-minute window.
2. **Root cause:** `DB_POOL_SIZE` was set to `5` instead of `50`, reducing the
   available database connection pool by 90%; affected version v2.14.0.
3. **Timeline:** included 21:38:02 service start, 21:40:11 pool wait warning,
   21:40:19 first checkout timeout, 21:44 alert, 21:52 page, 22:05 root-cause
   identification, 22:11:30 rollback, 22:12:04 healthy version start, and
   22:15:00 recovery below 0.1%.
4. **Evidence table:** linked claims to `incident-report.md`,
   `orders-service.log`, and `timeline.md`.
5. **Recommendations:** deployment-time validation of critical configuration
   bounds, plus canary/progressive rollout with automated rollback on elevated
   5xx rates.
6. **Files consulted:** explicitly listed the three paths under
   `/resources/orders-incident/`.

### Accuracy assessment

| Requirement | Assessment | Notes |
| --- | --- | --- |
| Incident identity | PASS | Exact incident ID returned |
| Impact | PASS | Exact 18% HTTP 500 figure returned |
| Root cause | PASS | Correct wrong and expected pool sizes |
| Affected version | PASS | Correctly identified v2.14.0 |
| Timeline | PASS | All material milestones and precise log timestamps included |
| Multi-file synthesis | PASS | Information combined across all three files |
| Filename citations | PASS | All three exact filenames cited |
| Recommendations | PASS | Reasonable and clearly inferential, not presented as fixture facts |
| Unsupported claims | PASS | No material fabricated incident fact observed |

One minor wording precision is worth noting: the answer described 21:38:02 as
the deployment time. The log proves that v2.14.0 started at 21:38:02, while the
timeline records deployment at minute precision (21:38). This does not change
the incident conclusion or PASS result.

## 9. Decision Receipt evidence

The UI rendered the following correlated Receipt:

| Receipt field | Observed value | Interpretation |
| --- | --- | --- |
| Decision | `allow` | Authorization succeeded |
| UI status | `Resource authorized` | Approved mount crossed the Runtime seam |
| Run | `1a5fdb9f-1a57-4069-9f9e-b30de20b0b49` | Stable Run correlation ID |
| Receipt | `e52320b5-a38f-442a-bad7-3fd4d1902271` | Stable audit record ID |
| Principal | `user-a` | Correct demo identity |
| Agent | `3f878e87-717a-4f5f-b343-a2961fdbb9e8` | Correct Agent ownership target |
| Resource | `orders-incident` | Correct explicit delegation |
| Grant generation | `1` | Positive, current Entitlement generation |
| Runner started | `yes` | Runner invocation passed the authorization boundary |
| Created | `2026-08-30T07:22:47.250Z` | Receipt creation time |

`Runner started: yes` is particularly important. A correct model answer alone
could be faked or obtained outside the intended path. Combined with the
Receipt, exact fixture-only facts, and correct filenames, it provides evidence
that the authorized Runtime path was actually exercised.

## 10. Resource integrity verification

After the Run, the three files were hashed locally and compared with the frozen
`baseline-manifest.json` values.

| File | Frozen SHA-256 | Post-Run SHA-256 | Result |
| --- | --- | --- | --- |
| `incident-report.md` | `ed5013e40e57e5b4bb22c039b6bc41ef3bf0f285c97077c41bc082555f393383` | Same | PASS |
| `orders-service.log` | `fb29cc9a0914a3abf7ddb5f76e33b51eb78a86e8e24579bf6269e41aab3b8db0` | Same | PASS |
| `timeline.md` | `cbadc58aa24eb1bb49025bdbc144665602607f65b346df45275842c647614dbd` | Same | PASS |

This verifies that the completed Run left the protected fixture bytes
unchanged. It complements, but does not replace, a deliberate write-attempt
test that proves the mount rejects writes at the filesystem boundary.

## 11. End-to-end success criteria

| Gate | Required evidence | Observed | Result |
| --- | --- | --- | --- |
| Application readiness | Built server listening on selected port | Server listened on 127.0.0.1:3100 | PASS |
| Browser/API connectivity | Session connected and no browser console warnings/errors | Connected; no warnings/errors observed | PASS |
| Explicit delegation | Orders Incident selected for this Run | `orders-incident` in Receipt | PASS |
| Authorization | Stable ALLOW decision | `allow` | PASS |
| Current Entitlement | Positive generation | Generation `1` | PASS |
| Runtime boundary | Runner begins only after ALLOW | `Runner started: yes` | PASS |
| Protected-data access | Fixture-only facts appear in response | Exact ID, percentages, config and timestamps | PASS |
| Evidence discipline | Exact filenames cited | Three filenames listed | PASS |
| Read-only outcome | Resource bytes unchanged | Three hashes match baseline | PASS |
| Auditability | Correlated Run and Receipt IDs | Both IDs present | PASS |

**Final result: PASS (10/10 evaluated gates).**

## 12. Why this is a meaningful success

This is stronger than a simple "the chatbot answered" test:

- The answer contained facts that were not present in the task text.
- Those facts matched the protected files exactly.
- The Agent named the files from which the facts were derived.
- The server emitted a decision record that links principal, Agent, Resource,
  Entitlement generation, Run, Receipt, and Runner start.
- Post-Run hashes matched the frozen fixture baseline.

Together, these observations validate both the **control plane** (delegation,
authorization, compilation, Receipt) and the **data plane** (container mount,
file inspection, model response) for the normal authorized case.

## 13. Front-end observation

The test initially appeared to have no reply because the Playground uses a
nested scroll region. The generated Agent message and Receipt were placed above
the Task composer while the viewport remained near the bottom. After a send,
the Resource selector also resets to `No Resource` for the next Run; that reset
does not describe the completed Run.

This is a usability issue, not a failed execution. Recommended improvements:

1. Auto-scroll the conversation to the newly created user message and then to
   the latest Agent/Receipt update.
2. Add a visible "Run submitted / Runner started / Run completed" status strip.
3. Keep the completed Run's selected Resource visible in its message card.
4. Add a "Jump to latest response" control when the composer is in view but the
   response is outside the nested viewport.
5. Offer a one-click export of the answer and Decision Receipt.

## 14. Recommended follow-up tests

### Priority 1: unentitled Resource denial

Submit `payments-incident` as `user-a`. Expect HTTP 403,
`entitlement_missing`, `Runner started: no`, and no protected-path disclosure.

### Priority 2: revoke and retry

Revoke `orders-incident`, submit a new Run, and expect
`entitlement_revoked` before the Runner. Confirm the earlier ALLOW Receipt
remains readable.

### Priority 3: deliberate read-only write attempt

Ask a purpose-built test Agent to create a marker inside the delegated
`/resources/orders-incident` directory. Expect filesystem rejection and verify
the same three baseline hashes afterward.

### Priority 4: unsupported Runtime

Start the built server with `RUNTIME_PROVIDER=local-process` and submit a
Capsule Run. Expect `runtime_profile_unsupported` and no Runner start.

### Priority 5: path and race regression gates

Run the symlink/`..` escape, tampered decision, revoke, and re-grant race suites
on every security-core change.

## 15. Reproduction summary

1. Start Docker Desktop.
2. Privately export `ARK_API_KEY`, `ARK_MODEL`, and the Johor
   `ARK_BASE_URL`; never include the Key in screenshots or logs.
3. Set a unique rehearsal state directory and an unused host port.
4. Run `bash ./scripts/start-local-poc.sh`.
5. Open the displayed localhost URL.
6. Create/configure the Agent as documented in Section 5.
7. Select Demo User A, submit the Section 6 task, and explicitly select Orders
   Incident.
8. Verify the answer against Section 7 and the Receipt against Section 9.
9. Recompute the three fixture hashes and compare them with
   `baseline-manifest.json`.

## 16. Evidence handling and limitations

- No API Key is included in this report.
- Exact absolute host paths are omitted from shareable evidence.
- Incident data is fictional demo fixture content, not customer data.
- The current identity mechanism is demo-grade and must not be described as
  production authentication.
- The outer container fallback is POC isolation and does not prove network or
  generic-tool confinement.
- A successful Run does not erase content already retained by a prior model
  session, and revocation is prospective rather than a hot unmount.

## 17. Sign-off

**P3 live allow-path status:** Approved for team demonstration, subject to the
limitations and negative-test follow-ups recorded above.

**Short team statement:** The authorized Resource Capsule path was exercised
through the real local container profile and a real ModelArk response. The
Agent accurately synthesized all delegated files, the correlated Receipt
recorded ALLOW and Runner start, and post-Run fixture hashes remained identical
to the frozen baseline.
