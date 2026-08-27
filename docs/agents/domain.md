# Domain Docs

This file defines how engineering Skills consume this repository’s domain
documentation.

## Layout

This repository uses a **single-context** layout.

The context spans both `apps/server` and `apps/web` because Run-scoped Resource
Capsule is one cross-application product mainline. Package boundaries do not
create separate domain contexts.

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/                         # Created when the first real ADR exists
│   └── agents/
│       ├── domain.md
│       └── issue-tracker.md
└── apps/
    ├── server/
    └── web/
```

Do not create `CONTEXT-MAP.md` or per-application `CONTEXT.md` files unless the
repository later adopts multiple genuine product contexts.

## Before exploring

Before exploring or changing a domain area:

1. Read `CONTEXT.md` at the repository root.
2. Read ADRs under `docs/adr/` that affect the area being considered.
3. Read other relevant formal project documentation under `docs/`.

If one of these files or directories does not yet contain relevant material,
proceed silently. Do not propose documentation solely to fill an empty
structure; add it when an actual term or decision needs to be recorded.

## Use the glossary’s vocabulary

When output names a domain concept—in an issue title, specification, proposal,
hypothesis, test name, or implementation plan—use the term defined in
`CONTEXT.md`.

Do not substitute “Agent workspace,” “Run,” and “Resource Capsule” for one
another unless the domain documentation explicitly defines their relationship.

If a required concept is absent from the glossary, first determine whether the
new term is necessary. Record genuine domain gaps for later resolution rather
than silently inventing competing vocabulary.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, surface the conflict explicitly
instead of silently overriding the decision.

Use this form:

> Contradicts ADR-NNNN (<decision title>), but may be worth reopening because…

## Documentation placement

- Keep the root `CONTEXT.md` as the domain glossary and context entry point.
- Put formal project documentation under `docs/`.
- Create `docs/adr/` when the first real architecture decision record is added.
- Put architecture decision records under `docs/adr/`.
- Put Skill workflow configuration under `docs/agents/`.
- Put the current working Spec at
  `.scratch/run-scoped-resource-capsule/spec.md`.
- Put current working Tickets in GitHub Issues, using the `scopedrun` label and
  the GitHub Project described in `docs/agents/issue-tracker.md`.
- Treat `.scratch/` as a Git-tracked home for the working Spec, not a ticket
  tracker.
