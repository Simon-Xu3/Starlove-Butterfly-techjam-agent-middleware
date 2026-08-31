# Security policy

Volc Agent Launchpad is a hackathon proof of concept. Only the latest revision
on the default branch is supported.

## Report a vulnerability

Send the repository owner or event organizer the affected revision,
reproduction steps, impact, and suggested mitigation. Do not publish
credentials, personal data, or exploit details in an issue.

## Known limitations

- Caller-selectable mock principals and one narrow server-side Resource
  authorization policy, but no production authentication, general RBAC, or
  tenant isolation
- No CSRF protection
- The Docker Compose/ECS `local-process` profile has no per-Run container
  boundary; only the opt-in local `container` profile supplies one
- Ordinary local containers, not hardened multi-tenant sandboxes
- Broad outbound network access
- Prompt-triggered command and file execution
- Ark key available to the server and active Runtime container
- Ark key stored in Terraform POC state

## Safe use

- Use a dedicated development machine or disposable ECS instance.
- Use a scoped, revocable Ark key and a unique `APP_AUTH_TOKEN`.
- Keep local use on loopback and restrict ECS Web and SSH CIDRs.
- Add HTTPS before sending the shared token over an untrusted network.
- Never mount production data or provide Volcengine account AK/SK to Agents.
- Stop the POC, destroy test resources, and revoke keys after the event.

Codex uses `workspace-write` when Landlock is available. On unsupported kernels,
startup warns and relies on the outer Docker or rootless Podman boundary. This
fallback is not tenant isolation.

The opt-in container profile mounts only the current Agent's persistent Codex
state directory. Demo identities, host-process Runs, outbound network access,
and the ordinary container Runtime remain outside any production tenant
isolation claim.

At startup, the data, workspace, Codex-state, and Protected Resource roots are
canonicalized and must be pairwise disjoint. Before every Runner handoff, the
workspace is re-derived from the configured root and Agent ID; a stale,
missing, external, or symlinked persisted path fails closed.
