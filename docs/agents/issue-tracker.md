# Issue Tracker: Local Markdown

Issues and specs for this repository live as Markdown files under `.scratch/`.
Do not use GitHub Issues or another external issue tracker.

## Current effort

The fixed feature slug for the current product effort is:

`run-scoped-resource-capsule`

Use these exact locations:

- Spec:
  `.scratch/run-scoped-resource-capsule/spec.md`
- Tickets:
  `.scratch/run-scoped-resource-capsule/issues/<NN>-<slug>.md`

Do not introduce another feature slug for the current product mainline unless
the user explicitly changes it.

## Conventions

- Store the specification at:
  `.scratch/run-scoped-resource-capsule/spec.md`.
- Store implementation tickets as separate files:
  `.scratch/run-scoped-resource-capsule/issues/<NN>-<slug>.md`.
- Number ticket files from `01`.
- Never combine all implementation tickets into one tickets file.
- When a workflow needs explicit state, record it as a `Status:` line near the
  top of the relevant issue file.
- Append discussion or history under a `## Comments` heading at the bottom of
  the file.

## When a Skill says “publish to the issue tracker”

Create the appropriate Markdown file under
`.scratch/run-scoped-resource-capsule/`, creating the feature directory and its
`issues/` subdirectory only when needed.

Do not publish the issue to GitHub Issues.

## When a Skill says “fetch the relevant ticket”

Read the referenced Markdown file under
`.scratch/run-scoped-resource-capsule/`. The user will normally provide its
path or ticket number.
