# SCRIPT — SLB-ScopedRun demo

**Voice:** User-recorded English narration
**Voice settings:** Natural pace around 130–140 words per minute; clean, dry recording with no room reverb
**Voice direction:** Calm technical confidence. Never sound like an advertisement. Let the proof carry the energy; pause briefly before denial reasons and the final line.

---

## Line 1 — The boundary (Frame 1)

**Time:** 0:00 – 0:10
**Delivery:** Begin plainly; land the last four words as a thesis.

    Give an Agent one sensitive directory, and it must not see the others. A hidden picker or a prompt cannot enforce that against shell access. Prompts ask. Mounts enforce.

## Line 2 — The control plane (Frame 2)

**Time:** 0:10 – 0:30
**Delivery:** Precise and measured; give “Entitlement” and “Delegation” equal weight.

    SLB-ScopedRun separates standing permission from this Run's scope. An Entitlement defines the ceiling; a Delegation records the one Resource chosen. Before execution, the server revalidates the principal, Agent ownership, permission generation, canonical path, and Runtime. Only then does it create one read-only mount.

## Line 3 — Explicit delegation (Frame 3)

**Time:** 0:30 – 0:52
**Delivery:** Conversational, synchronized to the visible Advisor and selection actions.

    User A owns this Agent and may delegate Inventory or Orders. The Advisor uses only safe metadata to suggest Inventory from the task, but it cannot authorize anything. I make the choice explicitly, for this Run only. The Resource is never copied into the Agent workspace.

## Line 4 — Allow proof (Frame 4)

**Time:** 0:52 – 1:15
**Delivery:** Let the live result breathe; slow down on the three proof stages.

    Now the Agent investigates Inventory. Admission succeeds, the container starts, and the delegated files appear read-only under a generated Resource path. The Agent summarizes those files. Then the Proof Chain separates three facts: what I delegated, what the server decided, and whether the Runner started.

## Line 5 — Deny proof (Frame 5)

**Time:** 1:15 – 1:37
**Delivery:** Slightly firmer; pause before “HTTP 403” and “entitlement missing.”

    Payments is outside User A's Entitlement, so the Advisor neither suggests nor describes it. But UI filtering is not enforcement. Sending its valid ID directly still returns HTTP 403: entitlement missing. Admission stops before the Runner, and the supporting HTTP gate verifies a zero Runner call count.

## Line 6 — Revoke (Frame 6)

**Time:** 1:37 – 1:57
**Delivery:** Emphasize the timing boundary; keep the limitation sentence matter-of-fact.

    Permissions may change after selection. I revoke Inventory, then retry. The final admission check returns entitlement revoked before the Runner starts, while the earlier allow Receipt remains auditable. Revocation is prospective: it blocks the next Run; it does not terminate one already running.

## Line 7 — Namespace evidence (Frame 7)

**Time:** 1:57 – 2:21
**Delivery:** Evidence-led; separate the four test outcomes with small pauses.

    Our strongest evidence is a real Docker and Colima namespace test, separate from the model path. The delegated directory is readable, writes are rejected, every unrelated fixture and sibling Agent state is absent, and before-and-after hashes match. It proves the mount boundary—not model semantics.

## Line 8 — Honest close (Frame 8)

**Time:** 2:21 – 2:44
**Delivery:** Pull the music down. State limitations without apology; leave space between the final three fragments.

    A Capsule never falls back to local-process. That profile cannot provide a namespace boundary, so the server returns runtime profile unsupported before the Runner. This POC still uses mock identity, and revocation does not kill an active Run. But its boundary is concrete and testable. One Resource. One Run. Nothing else.
