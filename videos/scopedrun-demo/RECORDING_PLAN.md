# Screen Studio recording plan

Record picture only first. Narration is a separate clean audio pass after the
storyboard is approved. HyperFrames will handle crops, punch-ins, captions,
music, sound marks, and the final 1920×1080 assembly.

## Capture settings

- Record the browser or terminal window, not the entire desktop.
- Keep the browser at 100% zoom and use a wide 16:9 window.
- Disable notification banners and hide unrelated tabs, bookmarks, server logs, and Agent Settings.
- Never show `.env`, the Ark key, raw Agent JSON, absolute workspace paths, or shell history.
- Leave two seconds of stillness before the first action and after the final proof state.
- Move the cursor deliberately and pause after each click; do not narrate while recording.
- Long provider waits are acceptable. Keep recording; they will be cut down in the edit.

## Preflight before recording

Use a fresh rehearsal state. Create two Agents while off camera:

1. **Live Agent** — reserved for the browser allow path.
2. **Policy Agent** — reserved for deny and revoke terminal requests.

Live Agent instructions:

> When a Run includes a Resource Capsule, inspect the single read-only
> directory available under /resources. Never modify it; cite the filenames
> used.

Prepare a terminal with `SCOPEDRUN_URL` and a filtered `POLICY_AGENT_ID`, as
documented in `docs/SCOPEDRUN_DEMO.md`. Keep raw responses off screen.

## Clip 01 — Explicit delegation

**Target length after editing:** 10–12 seconds  
**Record continuously:** roughly 20–30 seconds

1. Start on **Live Agent**, **Demo User A**, with the task box empty.
2. Enter exactly:

   `Investigate the fulfillment backlog and warehouse stock mismatch, then summarize the root cause in three bullets.`

3. Open **Prepare this Run** if collapsed.
4. Click **Suggest Resource**.
5. Pause on the suggestion so **Inventory Incident** and the Advisor disclaimer are readable.
6. Explicitly choose **Inventory Incident / Delegate for this Run**.
7. Stop before submitting; Clip 02 begins from this prepared state.

**What this proves:** suggestion is guidance; explicit Delegation is a separate human action.

## Clip 02 — Allow and Decision Proof Chain

**Target length after editing:** 18–22 seconds  
**Record continuously:** the entire Run, even if it takes a minute

1. Begin on the prepared Inventory Run from Clip 01.
2. Click **Send message**.
3. Hold on the queued/running state until **Runner started** becomes visible.
4. When complete, pause on the Agent's three-bullet answer.
5. Scroll only enough to show the three proof stages:
   **Delegated → Decided → Executed**.
6. Hold two seconds on the Resource ID, positive generation, allow decision,
   and Runner-start evidence.

**What this proves:** the real model path completed and the receipt distinguishes requested scope, authorization, and execution.

## Clip 03A — Advisor no-match

**Target length after editing:** 5–6 seconds  
**Record continuously:** roughly 12 seconds

1. In the browser, switch to **Policy Agent**.
2. Enter a short payments-capture task and click **Suggest Resource**.
3. Hold on the Advisor's no-match result; Payments metadata must not be described.
 
## Clip 03B — Direct API denial

**Target length after editing:** 7–9 seconds  
**Record continuously:** roughly 15 seconds

1. In the prepared terminal, run the filtered command from
   `docs/SCOPEDRUN_DEMO.md` section **Deny an unentitled Resource**.
2. Hold on only these safe fields:
   `HTTP 403`, `status: denied`, `reason: entitlement_missing`, Run ID, Receipt ID.

**What this proves:** UI filtering cannot be bypassed with a direct API request, and denial occurs before the Runner.

## Clip 04 — Revoke and retry

**Target length after editing:** 10–12 seconds  
**Record continuously:** roughly 25 seconds

1. Run the filtered Inventory revoke command from the official runbook.
2. Hold on `status: revoked`.
3. Run the filtered retry against **Policy Agent**.
4. Hold on `HTTP 403` and `reason: entitlement_revoked`.
5. In a final browser or filtered terminal view, show that the earlier allow Receipt still exists.
6. After recording, restore Inventory with the runbook's grant command if the state will be reused.

**What this proves:** revocation affects future admission and does not rewrite historical evidence.

## Clip 05 — Real-container namespace gate

**Target length after editing:** 12–15 seconds  
**Record continuously:** from command start through the final assertion region

Run the official real-container gate in a clean terminal. Frame the output so
no host paths or secrets appear. Capture the command starting and the final
assertion region; the entire verbose log is not needed. The visible assertions show:

- delegated Resource readable;
- write rejected;
- undelegated Resources absent;
- sibling Agent private state absent;
- fixture hashes unchanged before and after.

**What this proves:** namespace contents and host integrity independently of the model's answer.

## Clip 06 — Unsupported Runtime

**Target length after editing:** 6–8 seconds  
**Record continuously:** roughly 15 seconds

Run the official `local-process` Capsule request from the runbook's unsupported
runtime section. Keep only these safe fields visible:

- `HTTP 403`;
- `status: denied`;
- `reason: runtime_profile_unsupported`;
- Run ID and Receipt ID.

**What this proves:** a Capsule never silently degrades to a Runner that cannot provide a namespace boundary.

## Voice recording after script approval

- Record one file per `SCRIPT.md` line, or one continuous WAV with a clear pause between frames.
- Preferred: WAV, 48 kHz, mono or stereo, no noise suppression pumping.
- Keep 20–30 cm from the microphone and record in the same position throughout.
- Say `SLB-ScopedRun` as “S-L-B Scoped Run.”
- Say denial codes naturally as “entitlement missing” and “entitlement revoked”; the exact underscore forms remain on screen.
- Do not force the timing. Clean natural delivery is more important; the final visual durations will follow the real voice.
