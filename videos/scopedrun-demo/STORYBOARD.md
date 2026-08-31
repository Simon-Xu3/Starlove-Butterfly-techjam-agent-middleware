---
format: 1920x1080
duration: 175s
message: "Prompts ask. Mounts enforce: one resource, one Run, read-only, and nothing else."
arc: "Outcome hook → boundary model → explicit delegation → allow proof → deny proof → revoke proof → namespace evidence → honest close"
audience: "Hackathon judges and technical product evaluators"
mode: collaborative
music: "confident minimal security-tech underscore; sparse pulse, no vocals, restrained low end"
captions: true
---

## Video direction

- **Concept angle:** the access boundary is a physical aperture: one selected Resource crosses, every unrelated route disappears.
- **Palette:** `frame.md` is authoritative. Teal means allowed, red means denied, amber means admission/pending; these colors never decorate unrelated elements.
- **Type:** Oswald display statements; IBM Plex Mono evidence, receipts, captions, paths, hashes, and status labels.
- **Motion grammar:** mechanical draws, routes, locks, rejects, and clears. Long-tail `power3` settles; reveals land on spoken cues across the shot rather than front-loading.
- **Rhythm:** `HOOK → orient → BUILD → prove → DENY → turn → PROVE → hold/close`. Frames 5 and 8 contain deliberate held reads.
- **Footage treatment:** real UI and terminal captures stay recognizable, but editorial punch-ins isolate one claim at a time. Browser chrome and unrelated content are cropped away.
- **Transitions:** hard cuts inside evidence runs; 0.35–0.45s blur-crossfades between conceptual and real-footage worlds; one zoom-through at the turn from architecture into the live app.
- **Audio identity:** user-recorded English narration, sparse electronic bed, soft lock/click marks on admission decisions, silence under the final limitation sentence.
- **Negative list:** no generic cyber HUD, purple-blue AI gradient, glassmorphism, random particles, bounce, lazy breathing, front-loaded slideshow motion, or screensaver drift.

## Frame 1 — The boundary that prompts cannot provide

- scene: Hidden-picker and prompt-language fragments collapse; one hard boundary line remains with “PROMPTS ASK. MOUNTS ENFORCE.”
- voiceover: "Give an Agent one sensitive directory, and it must not see the others. A hidden picker or a prompt cannot enforce that against shell access. Prompts ask. Mounts enforce."
- duration: 14s
- poster: 10s
- transition_in: cut
- status: built
- src: compositions/frames/01-boundary.html
- type: hook
- persuasion: Pain validation followed immediately by the value claim
- beat: tension → certainty
- blueprint: kinetic-type-beats (Adapt)
- rules: discrete-text-sequence, kinetic-beat-slam
- asset_candidates:

narrativeRole: Make the viewer care before naming implementation details: model behavior cannot prove isolation.

keyMessage: A prompt is a request; a mount boundary is enforcement.

## Frame 2 — Standing permission is not Run scope

- scene: A wide control-plane route separates Human → Entitlement → Delegation → Admission re-check → read-only mount → Receipt.
- voiceover: "SLB-ScopedRun separates standing permission from this Run's scope. An Entitlement defines the ceiling; a Delegation records the one Resource chosen. Before execution, the server revalidates the principal, Agent ownership, permission generation, canonical path, and Runtime. Only then does it create one read-only mount."
- duration: 20s
- poster: 15s
- transition_in: blur-crossfade 0.4s
- status: built
- src: compositions/frames/02-control-plane.html
- type: product_intro
- persuasion: Mechanism clarity
- beat: curiosity → control
- blueprint: spatial-pan-stations (Adapt)
- rules: viewport-change, svg-path-draw, asr-keyword-glow
- asset_candidates:

narrativeRole: Explain the minimum architecture needed to understand every later proof beat.

keyMessage: Authorization is rechecked at admission, immediately before the Runner.

## Frame 3 — Explicitly delegate Inventory for this Run

- scene: Real Agent Launchpad capture: User A, Resource Advisor suggestion, then deliberate selection of Inventory Incident for the next Run.
- voiceover: "User A owns this Agent and may delegate Inventory or Orders. The Advisor uses only safe metadata to suggest Inventory from the task, but it cannot authorize anything. I make the choice explicitly, for this Run only. The Resource is never copied into the Agent workspace."
- duration: 22s
- poster: 16s
- transition_in: zoom-through 0.45s
- status: built
- src: compositions/frames/03-delegate.html
- type: feature_showcase
- persuasion: Friction reduction without silent authorization
- beat: clarity → agency
- blueprint: device-surface-showcase (Adapt)
- rules: coordinate-target-zoom, asr-keyword-glow
- asset_candidates: assets/recordings/01-delegate-inventory.mp4 — User A enters the fixed fulfillment task, requests a suggestion, and explicitly delegates Inventory Incident

narrativeRole: Prove that Advisor suggestion and human Delegation are different acts.

keyMessage: The person, not the Advisor, chooses the Resource for this Run.

## Frame 4 — Allow: one mount and a correlated proof chain

- scene: Real allow Run completes; the edit punches into the Agent answer and then the Delegated → Decided → Executed proof stages.
- voiceover: "Now the Agent investigates Inventory. Admission succeeds, the container starts, and the delegated files appear read-only under a generated Resource path. The Agent summarizes those files. Then the Proof Chain separates three facts: what I delegated, what the server decided, and whether the Runner started."
- duration: 28s
- poster: 23s
- transition_in: push-slide LEFT 0.35s
- status: built
- src: compositions/frames/04-allow-proof.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: anticipation → confidence
- blueprint: agent-progress-theater (Adapt)
- rules: dynamic-content-sequencing, stat-bars-and-fills, coordinate-target-zoom
- asset_candidates: assets/recordings/02-allow-run.mp4 — submitted Inventory Run, completed Agent answer, and Decision Proof Chain with Runner started

narrativeRole: Deliver the central product proof using the live model path and persisted receipt facts.

keyMessage: Allow creates exactly one read-only Resource mount and records what happened.

## Frame 5 — Deny: the Runner never starts

- scene: Split proof: Advisor returns no Payments match on the left; a filtered terminal request returns HTTP 403 `entitlement_missing` on the right; a supporting HTTP gate records zero Runner calls.
- voiceover: "Payments is outside User A's Entitlement, so the Advisor neither suggests nor describes it. But UI filtering is not enforcement. Sending its valid ID directly still returns HTTP 403: entitlement missing. Admission stops before the Runner, and the supporting HTTP gate verifies a zero Runner call count."
- duration: 23s
- poster: 17s
- transition_in: squeeze 0.35s
- status: built
- src: compositions/frames/05-deny-proof.html
- type: feature_showcase
- persuasion: Negative-path proof
- beat: skepticism → trust
- blueprint: comparison-split (Adapt)
- rules: split-tilt-cards, hacker-flip-3d, asr-keyword-glow
- asset_candidates: assets/recordings/03-deny-payments.mp4 — Policy Agent Advisor no-match followed by filtered terminal HTTP 403 entitlement_missing

narrativeRole: Prove that bypassing the picker cannot bypass admission.

keyMessage: A denied Capsule Run terminates before Runner invocation.

## Frame 6 — Revoke: stale permission fails closed

- scene: Inventory Entitlement changes from active to revoked; its next Run route snaps shut while the earlier allow Receipt remains visible behind it.
- voiceover: "Permissions may change after selection. I revoke Inventory, then retry. The final admission check returns entitlement revoked before the Runner starts, while the earlier allow Receipt remains auditable. Revocation is prospective: it blocks the next Run; it does not terminate one already running."
- duration: 20s
- poster: 15s
- transition_in: blur-crossfade 0.4s
- status: built
- src: compositions/frames/06-revoke.html
- type: benefit_highlight
- persuasion: Fail-closed timing guarantee
- beat: risk → controlled limitation
- blueprint: compose
- rules: discrete-text-sequence, card-morph-anchor, svg-path-draw
- asset_candidates: assets/recordings/04-revoke-retry.mp4 — filtered revoke response followed by denied retry and retained earlier allow Receipt

narrativeRole: Show a permission change closes future execution without rewriting history.

keyMessage: Revalidation turns revoked or stale permission into a pre-Runner denial.

## Frame 7 — The strongest evidence is absence

- scene: Real container test output becomes a three-column evidence board: delegated readable, writes rejected, undelegated and sibling state absent; before/after hashes remain equal.
- voiceover: "Our strongest evidence is a real Docker and Colima namespace test, separate from the model path. The delegated directory is readable, writes are rejected, every unrelated fixture and sibling Agent state is absent, and before-and-after hashes match. It proves the mount boundary—not model semantics."
- duration: 25s
- poster: 20s
- transition_in: push-slide UP 0.35s
- status: built
- src: compositions/frames/07-namespace-proof.html
- type: social_proof
- persuasion: Reproducible technical evidence
- beat: verification → conviction
- blueprint: transcript-scroll-artifact-reveal (Adapt)
- rules: viewport-change, grid-card-assemble, stat-bars-and-fills
- asset_candidates: assets/recordings/05-container-gate.mp4 — verbose real-container integration test with safe output only

narrativeRole: Ground the product claim in filesystem and namespace evidence independent of model behavior.

keyMessage: The delegated Resource is immutable; everything else is not present.

## Frame 8 — Honest edges, concrete boundary

- scene: A filtered terminal proof shows that a Capsule cannot silently fall back to `local-process`; the frame then states the remaining limitations and clears to the closing lockup.
- voiceover: "A Capsule never falls back to local-process. That profile cannot provide a namespace boundary, so the server returns runtime profile unsupported before the Runner. This POC still uses mock identity, and revocation does not kill an active Run. But its boundary is concrete and testable. One Resource. One Run. Nothing else."
- duration: 23s
- poster: 18s
- transition_in: blur-crossfade 0.45s
- status: built
- src: compositions/frames/08-honest-close.html
- type: branding
- persuasion: Credibility through explicit limitations
- beat: candor → confidence
- blueprint: fixed-anchor-cycle (Adapt)
- rules: discrete-text-sequence, dynamic-content-sequencing, ambient-glow-bloom
- asset_candidates: assets/recordings/06-unsupported-runtime.mp4 — filtered local-process Capsule request showing HTTP 403 runtime_profile_unsupported before Runner invocation

narrativeRole: Prevent overclaiming, then leave the viewer with the precise product promise.

keyMessage: The MVP is narrow, but its boundary is enforceable and testable.
