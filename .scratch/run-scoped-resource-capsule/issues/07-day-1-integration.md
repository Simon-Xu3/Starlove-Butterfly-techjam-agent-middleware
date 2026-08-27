# 07: Day 1 Integration Gate

Status: ready-for-agent
Owner: All team members; P1 is integration lead
Blocked by: 02: Run Admission, 03: Registry and Grants, 04: Path Security and Mount Plan, 05: Container Runtime, 06: Receipt and UI
Estimated effort: 2 hours shared

## Scope

- Integrate the five main workstreams against the frozen Ticket 01 contracts.
- Register P2 and P5 route plugins through P1-owned composition points.
- Replace happy-path cross-workstream stubs with the real Registry, Grant,
  authorizer, mount-plan, Runner, Receipt, and Web integrations.
- Exercise baseline, allow, deny, revoke, and unsupported-runtime paths.
- Record every remaining integration defect with a single file Owner.
- Produce a bounded Day 2 correction list without adding features.

## Out of Scope

- Redesigning frozen interfaces without unanimous Owner review.
- Adding new Resources, permissions, policies, Runtime profiles, or product
  tracks.
- Final documentation polish or feature-freeze certification.

## Files owned

- No new permanent ownership is created.
- P1 alone edits central application composition and Run orchestration.
- P2–P5 fix defects only in their previously owned files.

## Frozen interfaces

- All Ticket 01 seams and DTOs remain frozen.
- A contract correction requires P1 to make the shared edit and all affected
  Owners to acknowledge it in Integration Notes.

## Mock/Stub strategy

- Remove happy-path mocks once the corresponding real service is connected.
- Retain deterministic failure-injection fakes for denial and Runner-zero tests.
- Do not mask a broken real integration with an end-to-end mock.

## Tests

- Focused HTTP baseline, allow, deny, revoke, and unsupported-runtime suite.
- Database migration and Grant generation suite.
- Path-security and mount-plan suite.
- Deterministic Runner manifest suite.
- Receipt redaction and Web build/typecheck.
- One real-container smoke case when the engine is available.

## Demo evidence

- First complete informal rehearsal of the four formal Capsule scenarios.
- A Day 2 defect list showing Owner, failing seam, and reproduction command.

## Evidence

- Integration lead records the integrated commit IDs and four-scenario result.

## Tests Run

- Integration lead records the exact gate commands and failures/successes.

## Known Limitations

- Record all remaining blockers; do not hide them as future polish.

## Integration Notes

- Consolidate the notes from Ticket 02–06, including stub replacements and any
  contract adjustments.

## Definition of Done

- [ ] All five real workstreams are connected at their frozen seams.
- [ ] Four scenarios reach their expected decision and Runtime boundary.
- [ ] Baseline Agent and Playground behavior still works.
- [ ] Every remaining defect has one Owner and bounded Day 2 action.
- [ ] No unapproved scope entered the integration branch.
