# 08: Day 2 Feature Freeze

Status: ready-for-agent
Owner: All team members; P4 is evidence lead
Blocked by: 07: Day 1 Integration Gate
Estimated effort: 3 hours shared

## Scope

- Freeze product scope and accept only fixes required by the approved Spec.
- Close Day 1 blockers through the original file Owners.
- Run the complete deterministic HTTP, authorization, path, persistence,
  Receipt, Web, and regression suites.
- Run the supported real-container evidence suite.
- Rehearse allow, deny, revoke, and unsupported-runtime from a clean state.
- Verify redaction, zero Runner calls on denial, readonly failure, unauthorized
  namespace absence, and stable host hash/mtime.
- Produce the evidence bundle consumed by final docs and the three-minute Demo.

## Out of Scope

- New features, UI polish unrelated to acceptance, alternative Runtime profiles,
  ECS, or expanded security claims.
- Changing ownership or merging unrelated refactors.

## Files owned

- Original Ticket Owners retain their file boundaries for blocker fixes.
- P4 coordinates Runtime evidence; P5 coordinates HTTP/UI evidence.
- No shared file is edited by multiple Owners.

## Frozen interfaces

- Ticket 01 contracts and all Spec acceptance behavior are frozen.
- No seam changes are accepted unless the current design cannot satisfy a
  stated invariant and all Owners approve the minimal correction.

## Mock/Stub strategy

- Production paths use real integrated services.
- Test-only failure injection remains permitted at confirmed seams.
- Formal Runtime evidence must use a real local container, not a mock.

## Tests

- All server tests, Web typecheck/build, and root `npm run check` preflight.
- Full path-attack matrix and migration coverage.
- Real-container read/absence/readonly/hash/mtime suite.
- Four-scenario clean-state rehearsal.

## Demo evidence

- Final sanitized allow, deny, revoke, and unsupported-runtime evidence.
- Container engine/version, mount manifest, Runner call counts, Receipt samples,
  and before/after host integrity values.

## Evidence

- Evidence lead records the canonical evidence bundle location and contents.

## Tests Run

- Record all freeze commands and their final results.

## Known Limitations

- Record every accepted limitation that must appear in README and Demo narration.

## Integration Notes

- Record final component revisions and any residual operational prerequisites.

## Definition of Done

- [ ] No open Spec blocker remains.
- [ ] Formal real-container evidence passes on the demo profile.
- [ ] Four scenarios are reproducible from a clean state.
- [ ] Security claims match evidence and known limitations.
- [ ] Feature scope is frozen for final delivery.
