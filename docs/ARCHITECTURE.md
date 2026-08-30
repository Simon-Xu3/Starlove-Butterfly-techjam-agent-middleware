# ScopedRun architecture

ScopedRun is a single product context delivered by the React Web UI and the
Fastify control plane. Its security promise is deliberately narrow:

> A server-owned Protected Resource that is not explicitly authorized for the
> current Run does not enter that Run's container namespace.

## Trusted sequence

```mermaid
flowchart LR
    subgraph Client["Browser · untrusted request input"]
        Task["Task text"]
        Picker["Eligible metadata + explicit<br/>zero-or-one Resource choice"]
        Advisor["Optional Resource Advisor<br/>safe metadata only"]
    end

    subgraph Control["Fastify control plane · trusted policy boundary"]
        Request["Outer bearer guard<br/>+ request validation"]
        Principal["Resolve mock principal<br/>from X-Demo-Session"]
        Ownership["Ownership-scoped<br/>Agent lookup"]
        Authorize{"Current Entitlement<br/>∩ explicit Run Delegation"}
        Profile{"Container profile +<br/>plan-aware Runner?"}
        Registry["Server-owned Registry"]
        Path["realpath + root containment<br/>+ overlap/collision checks"]
        Plan["Immutable readonly<br/>ValidatedRunMountPlan"]
        Admission["Atomic admission commit<br/>allow Receipt starts with<br/>runnerStarted: false"]
        FinalCheck{"Final Entitlement generation<br/>+ cancellation check"}
        Store[("Atomic JSON store<br/>Run · Message · Receipt")]
    end

    subgraph Runtime["Disposable local container · hackathon-grade boundary"]
        Runner["ContainerCodexRunner"]
        Namespace["/workspace · read/write<br/>/codex-home · read/write<br/>/resources/&lt;id&gt; · read-only"]
        Codex["Codex CLI"]
    end

    Ark["Ark Responses API<br/>network is outside this control"]

    Task --> Request
    Picker --> Request
    Advisor -. "suggests; never authorizes" .-> Picker
    Request --> Principal --> Ownership --> Authorize
    Registry --> Authorize
    Authorize -->|"deny: no Runner call"| Store
    Authorize -->|allow| Profile
    Profile -->|"unsupported: no Runner call"| Store
    Profile -->|supported| Path
    Registry --> Path
    Path -->|invalid: no Runner call| Store
    Path -->|valid| Plan --> Admission
    Admission --> Store
    Admission --> FinalCheck
    FinalCheck -->|"stale or cancelled:<br/>no Runner call"| Store
    FinalCheck -->|allow| Runner --> Namespace --> Codex --> Ark
    Runner -->|"set runnerStarted: true<br/>when invocation is attempted"| Store
```

The browser sends a Resource ID, never a source path, target path, principal
ID, or mount mode. The optional Advisor is outside the authorization chain: it
may suggest only an already eligible Resource from task text and safe metadata,
and the user must still approve the Run Delegation.

The control plane resolves every trusted value again for every Capsule Run.
Only the Registry owns host source paths. The container-profile gate runs
before plan compilation. `realpath` containment and target checks then produce
one immutable plan whose target is generated as `/resources/<resourceId>` and
whose mode is always read-only.

## Allow and deny behavior

| Decision point | Observable result |
| --- | --- |
| Missing or non-owned Agent | Uniform `404`; no Run, Message, Receipt, or Runner call. |
| Malformed delegation | `400`; no Run or Receipt. |
| Unknown Resource, or missing/revoked Entitlement | Terminal denied Run and safe deny Receipt; zero Runner calls. |
| `local-process` Capsule request | `runtime_profile_unsupported`; zero Runner calls. Baseline Runs remain supported. |
| Concurrent revoke before invocation | Receipt and Run converge to `stale_entitlement_generation`; zero Runner calls. |
| Allowed current delegation | Exactly one read-only Resource mount; Receipt records the generation and whether invocation was attempted. |

Run admission persists the initial Capsule Run, user Message, Agent transition,
and allow Receipt with `runnerStarted: false` atomically. Immediately before
invocation, the service rechecks the Entitlement generation and any pending
cancellation. `runnerStarted` is execution evidence, not a second authorization
decision: the Receipt is updated to true when the authorized Runner invocation
is attempted.

## Data and lifecycle

```text
data/launchpad.json       owner-scoped Agents, Runs, Messages, Entitlements, Receipts
workspaces/<agent-id>/    persistent Agent-created files
codex-home/               persistent Codex configuration and thread state
fixtures/resources/       server-owned demo Resources; never exposed as host paths
```

Revocation is prospective. It blocks a future admission or Runner start, but
does not hot-unmount an active container and does not delete historical Runs,
Receipts, workspaces, or Codex threads. Deleting an Agent uses the existing
destructive lifecycle and removes its correlated records together.

## Trust boundary and non-goals

`X-Demo-Session` is mock identity; `APP_AUTH_TOKEN` is only an outer remote-demo
guard. Neither is production authentication. The disposable container and
readonly bind mount are hackathon-grade controls, not hardened multi-tenant
isolation.

ScopedRun controls server-owned filesystem namespace exposure. It does not
provide general RBAC, network policy, generic MCP/HTTP interception, DLP,
prompt-injection protection, hot revocation, or model-memory erasure. The MVP
supports at most one directory Resource per Capsule Run, read-only, using the
local container profile.

See the [three-minute demo](SCOPEDRUN_DEMO.md), the
[approved user flow](planning/scopedrun-user-flow.md), and
[ADR-002](adr/002-separate-entitlement-from-run-delegation.md).
