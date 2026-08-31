# SLB-ScopedRun demo video — teammate handoff

This folder is a nearly assembled **2:44, 1920×1080 HyperFrames demo video**
for SLB-ScopedRun. Its point is simple: a human delegates one Resource to one
Agent Run; the server re-checks that choice; only the approved directory enters
the container as a read-only mount.

The project is ready for the final production phase: **record real product
evidence, insert it, review, and export the final submission video.** Do not
redesign the video or replace actual proof with mockups.

## Start here — required reading order

1. `README.md` — this handoff and continuation checklist.
2. `BRIEF.md` — approved video intent and visual direction.
3. `SCRIPT.md` — locked English narration and actual timing.
4. `STORYBOARD.md` — the eight-frame visual story.
5. `RECORDING_PLAN.md` — exact human Screen Studio capture instructions.
6. `TEAMMATE_RECORDING_HANDOFF.md` — detailed recording operations and a
   copy-ready Codex prompt.
7. `../../docs/SCOPEDRUN_DEMO.md` — authoritative application runbook and
   safe demo commands.

If any instruction conflicts, `docs/SCOPEDRUN_DEMO.md` is authoritative for
the live product; this folder is authoritative for the video edit.

## Current project state

### Done

- Eight designed HyperFrames scenes are assembled in `compositions/frames/`.
- The main composition is `index.html`; each scene is timed to the recorded
  narration, with no intentional silence after a line ends.
- All eight English voice lines are cleaned, normalized, and wired under
  `assets/voice/`. Lines 5 and 6 use the additional `*-clean.wav` fan-noise
  reduction versions.
- English captions exist for every narration line, including Frames 3–8.
- The HyperFrames validation gate passed after the latest timing/audio edit.
- A high-quality provisional render exists at:
  `renders/slb-scopedrun-demo-final-2026-08-31.mp4`
  (H.264 + AAC, 1920×1080, 30 fps, 2:43.77).
- The project includes `TEAMMATE_RECORDING_HANDOFF.md`, which is the detailed
  handoff for the person recording product footage.

### Still required before submission

The current MP4 is **not the final competition submission** because it still
uses a placeholder capture. Record and integrate genuine product evidence:

| Required raw file | What it captures |
| --- | --- |
| `01-delegate-inventory.mp4` | Browser: Advisor suggestion, then explicit Inventory delegation. |
| `02-allow-run.mp4` | Browser: real allowed Run and Decision Proof Chain. |
| `03a-advisor-no-match.mp4` | Browser: Policy Agent receives no Payments suggestion. |
| `03b-deny-payments.mp4` | Terminal: direct unentitled request denied with `entitlement_missing`. |
| `04-revoke-retry.mp4` | Terminal/browser: revoke, next admission denied, earlier receipt remains. |
| `05-container-gate.mp4` | Terminal: real Docker/Colima namespace assertions. |
| `06-unsupported-runtime.mp4` | Terminal: Capsule denied under `local-process`. |

Put untrimmed exports in `assets/recordings/` with those exact names. The
existing `01-delegate-inventory.mp4` is only a placeholder; replace it with the
real Screen Studio export. Do not delete sources or audio files.

## Fast setup — HyperFrames video project

Requirements:

- Node.js **22+**;
- `npx` (comes with Node/npm);
- Chrome is fetched/cached automatically by HyperFrames on first validation or
  render;
- FFmpeg is needed by HyperFrames for final MP4 output.

No global HyperFrames installation is necessary. This project pins its CLI
version in `package.json`, so use the project scripts or the exact `npx`
command below rather than an arbitrary globally installed version.

```bash
git switch codex/scopedrun-demo-video
cd videos/scopedrun-demo

# Confirm the composition, runtime, layout, captions, and motion all load.
npx --yes hyperframes@0.8.20 check

# Start the editable Studio timeline (choose another free port if needed).
npx --yes hyperframes@0.8.20 preview --background --port 3021 --no-open
```

Then open:

```text
http://localhost:3021/#project/scopedrun-demo
```

For a final export only after real recordings are integrated and reviewed:

```bash
npx --yes hyperframes@0.8.20 render \
  --quality high \
  --fps 30 \
  --output renders/slb-scopedrun-demo-final.mp4
```

Never render merely because `check` passes. Review the assembled timeline and
get the owner's approval first.

## Live product setup for recording

The browser footage is from the real local ScopedRun application, not the
HyperFrames preview. From repository root, read `docs/SCOPEDRUN_DEMO.md` and
then follow its preflight. In short, the recorder needs:

- Node 22+, `jq`, and Docker/Colima;
- privately configured valid `ARK_API_KEY` and `ARK_MODEL` values;
- the formal container profile started with `npm run poc` (browser at
  `http://localhost:3000`);
- a separate `local-process` server on port 3101 for the deliberately denied
  unsupported-runtime clip.

Do not put credentials in a command transcript, shell history, screenshots,
or this repository. If credentials or container runtime are missing, stop and
ask the project owner; do not fabricate the allowed model Run.

## How to continue once recordings arrive

1. Verify every raw recording exists, opens, is 16:9, and shows no secrets,
   absolute paths, raw JSON, resource bodies, or unrelated desktop content.
2. Keep each raw source untrimmed. Make derived edit files only when needed.
3. Wire the recordings into the relevant frame composition(s) or the main
   timeline. Do not alter the locked narration timing unless the owner asks.
4. Run `npx --yes hyperframes@0.8.20 check --snapshots` and visually inspect
   the generated overview images, especially every frame containing real video.
5. Start Studio, review with the owner, then render high quality.
6. Verify the final file with `ffprobe`: H.264 video, AAC audio, 1920×1080,
   30 fps, plausible duration, and non-zero file size.
7. Do not overwrite the existing provisional render; write a newly named final
   export.

## Non-negotiable evidence and safety rules

- Show only genuine built-app behavior and real-container evidence.
- A successful live path requires both a completed Agent answer and a Proof
  Chain; do not claim success if Ark/quota failed.
- A deny must visibly happen before the Runner. A `local-process` Capsule
  denial is intentional and correct.
- Never show `.env`, API keys, tokens, absolute host paths, workspace paths,
  raw Agent JSON, server logs, shell history, the Agent Settings panel, or
  resource contents.
- The container gate proves mount/host-integrity behavior; it does **not** prove
  a model answer. Keep those claims separate.
- Preserve the video’s honest limitations: mock identity, hackathon-grade
  isolation, and revocation only blocks future Runs.

## First prompt for a teammate's Codex

Copy this exact message into their Codex after they open the branch:

```text
Open and read videos/scopedrun-demo/README.md completely. Then read the files
listed in its “Start here” section, in order. We are in the final production
phase of an existing HyperFrames video: do not redesign it, do not fabricate
product evidence, and do not change narration timing without asking. First
report the current state, prerequisites that are present/missing, and the next
safe action. Then prepare the real local ScopedRun app and guide a human through
the seven Screen Studio recordings exactly as specified in
videos/scopedrun-demo/TEAMMATE_RECORDING_HANDOFF.md. Never display or write
secrets, absolute paths, raw Agent JSON, resource bodies, or server logs.
```

## Repository hygiene

- Cache directories (`.thumbnails/`, `.waveform-cache/`, `.media/`, and
  `renders/work-*`) are intentionally ignored.
- Source composition, voice assets, recording plan, handoff docs, and final
  named renders are meant to be committed.
- Do not delete or reset unrelated user work. Do not commit a new render unless
  the owner asks for it.
