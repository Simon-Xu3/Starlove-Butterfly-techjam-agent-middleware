# Issue tracker: GitHub

Implementation tickets for this repository live in GitHub Issues. Use the
`gh` CLI from this clone for all ticket operations. The current board is
[ScopedRun — Resource Capsule](https://github.com/users/MarcusMa06-code/projects/4).

## Current effort

The active product mainline is `run-scoped-resource-capsule`.

- Specification: `.scratch/run-scoped-resource-capsule/spec.md`
- Tickets: GitHub Issues carrying the `scopedrun` label
- Board: GitHub Project 4, `ScopedRun — Resource Capsule`

The Project Status field is the shared workflow: `Todo`, `In Progress`, or
`Done`. Keep ticket discussion, evidence, test commands, and ownership in the
corresponding Issue rather than duplicating them locally.

## Conventions

- Create an issue with `gh issue create --title "..." --body "..."` and apply
  the `scopedrun` label when it belongs to this effort.
- Read its complete context with `gh issue view <number> --comments`.
- Add evidence and handoff notes using `gh issue comment <number> --body "..."`.
- Update labels or close the Issue with `gh issue edit` and `gh issue close`.
- Keep the Issue in the Project board and update its Status as the work moves.

## When a Skill says “publish to the issue tracker”

Create a GitHub Issue in `Simon-Xu3/Starlove-Butterfly-techjam-agent-middleware`.

## When a Skill says “fetch the relevant ticket”

Run `gh issue view <number> --comments`.
