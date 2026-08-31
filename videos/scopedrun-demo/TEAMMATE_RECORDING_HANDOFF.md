# SLB-ScopedRun — recording handoff

## Send your teammate these items

1. This repository (or access to the same checkout):
   `/Users/marcus/projects/tiktokjem`
2. The official operating runbook:
   [`docs/SCOPEDRUN_DEMO.md`](../../docs/SCOPEDRUN_DEMO.md)
3. This recording plan:
   [`RECORDING_PLAN.md`](RECORDING_PLAN.md)
4. This file, including the Codex prompt below.
5. Valid local prerequisites: Node 22+, Docker/Colima, `jq`, and valid Ark
   environment values already configured privately. Never send an API key in
   chat, a screenshot, a shell-history export, or the prompt.

## What they must deliver

They should export **raw, untrimmed, picture-only** Screen Studio recordings
to `assets/recordings/` using these exact names:

- `01-delegate-inventory.mp4`
- `02-allow-run.mp4`
- `03a-advisor-no-match.mp4`
- `03b-deny-payments.mp4`
- `04-revoke-retry.mp4`
- `05-container-gate.mp4`
- `06-unsupported-runtime.mp4`

Record each clip at 16:9, browser zoom 100%, with two seconds of stillness at
its beginning and end. Do not record narration. The finished HyperFrames video
will place these clips under the existing English voiceover and captions.

## Non-negotiable redaction rules

The recording must never show:

- `ARK_API_KEY`, `ARK_MODEL`, any bearer token, `.env`, or copied credentials;
- absolute host paths, `workspacePath`, `CODEX_HOME`, or raw Agent JSON;
- terminal history, unrelated tabs, bookmarks, notifications, server logs, or
  the Agent Settings panel;
- Resource bodies, private business data, or an invented/simulated success.

For terminal evidence, show only the command and the safe decision fields
specified in the runbook. Use `jq`/filtered output if needed.

---

## Copy this prompt to your teammate's Codex

```text
You are preparing and supervising real Screen Studio evidence captures for the
SLB-ScopedRun project. Work in this repository:

  /Users/marcus/projects/tiktokjem

Your job is NOT to change product behavior, invent proof, create a fake UI, or
render the final video. Your job is to bring up the real local demo safely,
prepare a clean rehearsal state, and guide the human recorder through seven raw
Screen Studio clips. The human will operate Screen Studio; you may run local
commands, inspect the repository, start services, and prepare sanitized terminal
views.

Read these files completely before acting:

1. docs/SCOPEDRUN_DEMO.md
2. videos/scopedrun-demo/RECORDING_PLAN.md
3. videos/scopedrun-demo/assets/recordings/README.md

The docs above are the source of truth. If this prompt conflicts with them,
follow the docs.

## Security and evidence rules

- Never print, echo, cat, log, screenshot, or paste ARK_API_KEY, ARK_MODEL,
  APP_AUTH_TOKEN, .env contents, bearer tokens, or any other secret.
- Never expose absolute paths, Agent workspace paths, CODEX_HOME, raw agent
  JSON, server logs, shell history, Agent Settings, unrelated browser tabs, or
  resource-file bodies in a recording.
- Do not downgrade a Capsule to local-process to make it work. The deliberate
  local-process case must be recorded as a denial.
- Do not substitute a unit test, mocked response, static screenshot, edited
  terminal output, or pre-written model answer for real live evidence.
- If Ark credentials, quota, Colima/Docker, or the live path are unavailable,
  stop and tell the human exactly which prerequisite is missing. Do not claim a
  successful model path.
- Use only the fixed, non-sensitive demo task strings in SCOPEDRUN_DEMO.md.
- Do not commit changes, reset git state, delete user files, or alter secrets.

## Start with a clean rehearsal

1. Inspect git status; preserve unrelated work.
2. Verify Node 22+, jq, and Docker/Colima. Start Colima/Docker only if it is
   not already running and do not alter its configuration without asking.
3. Run the project's documented checks/preflight as needed. Keep their verbose
   output off camera.
4. Privately verify that ARK_API_KEY and ARK_MODEL exist in the environment;
   only report "configured" or "missing" — never show values.
5. Use a fresh SCOPEDRUN_REHEARSAL_ID, such as recording-20260831-01, so an old
   revoke cannot poison this recording session.
6. Start the documented production POC with container runtime using `npm run
   poc`; open http://localhost:3000. Keep the terminal with startup logs off
   camera after confirming it is healthy.
7. Create two fresh agents off camera:
   - Live Agent, for the successful browser allow path;
   - Policy Agent, for direct denial and revoke requests.
   Give Live Agent exactly this instruction:
   "When a Run includes a Resource Capsule, inspect the single read-only
   directory available under /resources. Never modify it; cite the filenames
   used."
8. Privately set up the sanitized terminal variables described in the runbook:
   SCOPEDRUN_URL and POLICY_AGENT_ID. Do not leave raw agent-list output in the
   visible terminal scrollback.
9. Start the separate documented port-3101 local-process server and create its
   Unsupported Runtime Demo agent. Keep its path-bearing startup output off
   camera.
10. Prepare a new, uncluttered terminal for recording. It may contain the safe
    commands, but not their prior raw output or shell history. Browser zoom must
    be 100%, browser window must be 16:9, and notifications/bookmarks/unrelated
    tabs must be hidden.

## Recording protocol

The human records picture only in Screen Studio. In every clip:

- record the app window or terminal window, not the full desktop;
- leave two seconds of stillness before the first action and after the final
  proof state;
- move the cursor slowly, pause after clicks, and do not narrate;
- record extra time rather than rushing: the editor will trim it;
- stop immediately if a forbidden secret/path/log appears, discard that take,
  clear the visible area, and record again.

Save untrimmed exports exactly under:

  videos/scopedrun-demo/assets/recordings/

Use the filenames below exactly. Confirm each file exists and is non-empty
before moving to the next one.

### Clip 01 — explicit delegation

Filename: 01-delegate-inventory.mp4
Target edited duration: 10–12 seconds; record roughly 20–30 seconds.

In the browser, use Demo User A and Live Agent with an empty task box.
Enter exactly:

  Investigate the fulfillment backlog and warehouse stock mismatch, then
  summarize the root cause in three bullets.

Open "Prepare this Run" if collapsed. Click "Suggest Resource". Pause while
"Inventory Incident" and the Advisor disclaimer are readable. Explicitly choose
"Inventory Incident" and "Delegate for this Run". Stop before Send message.

Desired proof: the Advisor suggests; the human explicitly delegates for one
Run. Do not imply the Advisor authorized it.

### Clip 02 — allow and Decision Proof Chain

Filename: 02-allow-run.mp4
Target edited duration: 18–22 seconds; record the entire Run even if it waits.

Continue from Clip 01. Click "Send message". Capture queued/running state until
"Runner started" is visible. When complete, pause on the Agent's real
three-bullet answer. Scroll only enough to show:

  Delegated → Decided → Executed

Hold for two seconds on the Resource ID, positive generation, allow decision,
and Runner-start evidence. If the provider is slow, wait; do not fabricate the
answer. If it fails for an upstream reason, stop and explain that it cannot be
used as the successful live-path capture.

### Clip 03A — Advisor has no match

Filename: 03a-advisor-no-match.mp4
Target edited duration: 5–6 seconds; record roughly 12 seconds.

Switch to Policy Agent. Enter a short payments-capture task and click "Suggest
Resource". Hold on the no-match outcome. Payments metadata must not be
described or revealed.

### Clip 03B — direct API denial

Filename: 03b-deny-payments.mp4
Target edited duration: 7–9 seconds; record roughly 15 seconds.

In the clean terminal, run the official "Deny an unentitled Resource" request
from docs/SCOPEDRUN_DEMO.md. Before recording, ensure the visible output is
filtered to only safe fields. The final view must show:

  HTTP 403
  status: denied
  reason: entitlement_missing
  Run ID
  Receipt ID

No raw JSON, agent-workspace data, paths, request headers, secrets, or resource
bodies may appear. The point is that a valid Resource ID cannot bypass the UI
and the Runner was not admitted.

### Clip 04 — revoke and retry

Filename: 04-revoke-retry.mp4
Target edited duration: 10–12 seconds; record roughly 25 seconds.

Run the official Inventory revoke command from the runbook. Hold on
"status: revoked". Run the official retry against Policy Agent. Hold on:

  HTTP 403
  reason: entitlement_revoked

Then show, in a safe browser or filtered terminal view, that the earlier allow
Receipt still exists. After recording, restore Inventory with the documented
grant command if the rehearsal state will be used again.

### Clip 05 — real-container namespace gate

Filename: 05-container-gate.mp4
Target edited duration: 12–15 seconds.

Run the official real-container integration gate from the preflight section of
docs/SCOPEDRUN_DEMO.md. This is a real Docker/Colima namespace test, separate
from the model path. Record the start of the command and its final assertion
region, while framing out host paths and verbose logs. The visible assertions
must establish:

  - delegated Resource readable;
  - write rejected;
  - undelegated Resources absent;
  - sibling Agent private state absent;
  - fixture hashes unchanged before and after.

Do not present this test as a successful model answer. It proves the mount and
host-integrity boundary.

### Clip 06 — unsupported runtime

Filename: 06-unsupported-runtime.mp4
Target edited duration: 6–8 seconds; record roughly 15 seconds.

Run the official local-process Capsule request against port 3101 from the
runbook. Keep only these safe fields visible:

  HTTP 403
  status: denied
  reason: runtime_profile_unsupported
  Run ID
  Receipt ID

This is a correct denial: it proves a Capsule does not silently degrade to a
non-isolated host process.

## Completion checklist

Before handing back:

1. List the seven expected recordings with file size and duration only.
2. Confirm each is 16:9 and opens successfully.
3. State whether Clip 02 was a genuine completed live model Run. If not, say
   precisely why without exposing credentials.
4. Confirm no secrets, absolute paths, workspace paths, raw JSON, logs, or
   resource bodies were shown.
5. Do not modify the HyperFrames composition. Report the exact filenames and
   any required retake.
```
