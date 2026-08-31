# ADR-005: Isolate persistent Codex state per Agent

- **Status:** Accepted
- **Date:** 2026-08-31
- **Decision owners:** Starlove Butterfly TechJam team

## Context

The container Runtime currently mounts the complete shared `CODEX_HOME`
directory read/write for every Agent. That directory contains configuration and
persistent thread state. A Runtime therefore receives filesystem access to
other Agents' session files even though Agent and Run APIs are scoped to the
current Human Principal.

The project does not claim hardened tenant isolation, but sharing all thread
state is unnecessary for the Starter Kit's per-Agent conversation continuity
and weakens the two-principal demo boundary.

## Decision

Store Runtime session state in one server-derived directory per Agent:

1. derive the directory from a hash of the server-owned Agent ID under
   `codex-home/agents/`;
2. generate the current Codex configuration inside that Agent directory before
   a Run starts;
3. pass the derived directory through the internal `RunnerRequest`; and
4. mount only that directory at `/codex-home` for a container Run.

The control plane validates the derived path before use. The Runtime never
receives the shared parent directory. Thread IDs created after this change
resume inside the same per-Agent directory. During the one-time upgrade, an
Agent with a legacy thread ID but no isolated state directory starts a new
thread; the server clears that stale ID instead of trying to resume shared
legacy state in an empty directory.

## Consequences

- Container Runs cannot list or modify another Agent's Codex session files
  through `/codex-home`.
- Agent session continuity remains persistent across Runs and server restarts.
- A pre-ADR Agent starts one new conversation after upgrade when its old thread
  lived only in the shared directory. This avoids guessing which shared files
  belong to that Agent.
- The shared root may still hold legacy Codex state from earlier revisions;
  that state is not mounted into new container Runs.
- The `local-process` profile still does not provide a per-Agent process or
  hardened tenant boundary. This ADR narrows persistent state passed to Codex;
  it does not change the limitations in `SECURITY.md`.
- Deleting an Agent continues to archive its workspace and correlated database
  records. Removing archived Codex session state is outside the existing
  destructive lifecycle contract and remains a follow-up decision.

## Validation

- Unit tests assert that two Agent IDs derive different directories.
- Container argument tests assert that only the request's Agent-specific
  directory is mounted.
- A boundary test proves one Agent Runtime cannot observe a sibling Agent's
  session marker through `/codex-home`.
