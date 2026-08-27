# 09: Final Integration, Documentation, and Demo

Status: ready-for-agent
Owner: All team members; P5 is delivery lead
Blocked by: 08: Day 2 Feature Freeze
Estimated effort: 3 hours shared

## Scope

- Run final integration and `npm run check` from the feature-freeze revision.
- Update README with setup, demo Principal caveat, local container requirements,
  Resource Capsule flow, revoke limitations, and reproducible tests.
- Produce a one-page architecture diagram showing the trusted sequence from
  Fastify through authorization, mount-plan compilation, and container namespace.
- Produce and rehearse a three-minute Demo covering allow, deny, revoke, and
  unsupported runtime.
- Link the final evidence bundle and document known limitations without
  overstating the security boundary.
- Confirm the repository can be reproduced from a clean checkout.

## Out of Scope

- New product behavior or refactoring after feature freeze.
- Production OAuth, general RBAC, ECS, hardened multi-tenant claims, or any
  other item excluded by the Spec.

## Files owned

- `README.md` — P5 only.
- `docs/ARCHITECTURE.md` — P5 only.
- A concise Demo guide/evidence index under `docs/` — P5 only.
- Product-code fixes remain with their original Ticket Owners and require a
  demonstrated final-check blocker.

## Frozen interfaces

- All product contracts and seams are frozen at Ticket 08.
- Documentation must use the glossary and describe only behavior proven by the
  final evidence.

## Mock/Stub strategy

- No mocks are used for the formal Demo evidence.
- Test doubles remain only in automated deterministic suites.

## Tests

- Final `npm run check`.
- Clean-checkout configuration and smoke test.
- Formal real-container evidence command.
- Three-minute Demo dry run with timing.
- Review for accidental secrets, host paths, tokens, prompts, or Resource bodies
  in docs and evidence.

## Demo evidence

- Three-minute script and successful timed rehearsal.
- One-page trust-boundary architecture diagram.
- Reproducible allow, deny, revoke, and unsupported-runtime evidence.
- Passing final check output and clean repository status.

## Evidence

- Delivery lead records final commit, check result, evidence index, and Demo
  rehearsal time.

## Tests Run

- Record exact final commands and results.

## Known Limitations

- Demo Principal is mock identity, not production authentication.
- Container isolation is hackathon-grade, not hardened multi-tenant isolation.
- Network and generic MCP/HTTP tool access are outside the boundary.
- Revoke is prospective and does not erase prior thread/output knowledge.
- One readonly directory Resource per Capsule Run; local container profile only.

## Integration Notes

- Record the final revisions for Ticket 02–08 and any environment prerequisites
  needed by reviewers.

## Definition of Done

- [ ] `npm run check` passes from the final revision.
- [ ] README and architecture diagram are accurate and reproducible.
- [ ] The three-minute Demo covers all four required scenarios.
- [ ] Evidence contains no prohibited sensitive data.
- [ ] Known limitations are explicit in README and Demo narration.
- [ ] The clean checkout can reproduce the documented result.
