# ScopedRun Day 1 validation spike

## Purpose

Before building UI or a general authorization model, prove that the Starter
Kit's real container path can enforce ScopedRun's central invariant on the
container engine used for judging.

**Time box: four hours.** If a required check cannot be proved, stop and change
direction. Do not downgrade the project to prompt instructions, a resource
picker, or a post-run warning.

## Test fixture

Create two small server-owned directories outside every Agent workspace:

```text
demo-resources/
  orders-incident/
    incident.json       # contains a synthetic known canary
  payments-incident/
    incident.json       # contains a different synthetic known canary
```

Use fake data only. Record SHA-256 and modification time for both fixture files.

## Required proof

### 1. Allowed resource is present and read-only

- Compile a mount plan for `orders-incident` using a server-owned path.
- Launch the real container Runner with the Orders bundle mounted under a fixed
  `/resources/...` path.
- Read the known canary inside the container.
- Attempt a write and rename; both must fail.
- Verify the host file hash and modification time are unchanged.

### 2. Denied resource is absent

- Request `payments-incident` using the Orders principal/Agent combination.
- Return a structured deny before calling the Runner.
- Assert Runner invocation count is zero.
- Assert the container arguments contain neither the denied host path nor its
  Runtime destination.

### 3. Path resolution fails closed

Reject each of the following before container launch:

- an absolute path submitted by the caller;
- `..` traversal;
- a symlink whose real target is outside the configured resource root;
- a missing resource;
- duplicate or shadowing Runtime destinations;
- a writable mode requested by the browser.

### 4. Revocation has honest semantics

- Record the grant generation in the Run decision.
- Revoke the grant and increment its generation.
- Confirm that a new Run using the old generation is denied.
- Do not claim an already mounted resource disappears from an active container;
  stop and remove that Runtime when immediate revocation is required.

### 5. Unsupported Runtime fails closed

Attempt a capsule-enabled Run using the local-process Runner. It must return a
clear unsupported-policy error rather than silently relying on prompt rules.

### 6. Evidence contains no secret or sensitive path

- Receipt: human ID, Agent ID, Run ID, resource ID, mode, decision, reason,
  policy hash, and generation.
- Never expose the demo token, canonical host path, or resource body.
- Search logs and persisted JSON for all token and canary fixtures.

## Go/no-go checklist

- [ ] The chosen container engine supports the required read-only bind mount.
- [ ] Authorized data is readable by the real Runtime.
- [ ] Unauthorized data is absent, not merely unreadable through one UI path.
- [ ] Deny occurs before the Runner starts.
- [ ] Host bytes remain unchanged after write and rename attempts.
- [ ] Traversal and symlink escape fail closed.
- [ ] Revocation blocks future Runs through a generation check.
- [ ] Local-process execution fails closed for capsule Runs.
- [ ] Receipts and logs contain no token, host path, or resource content.

If every item passes, proceed with the project plan. If any central enforcement
item fails, record the result and switch to the preselected fallback instead of
weakening the invariant.

## Evidence to save

- container engine and version;
- exact positive and negative test commands without secrets;
- sanitized mount arguments;
- before/after SHA-256 and modification times;
- fake-Runner assertion showing zero calls on deny;
- structured allow and deny receipts;
- `npm run check` output after the spike changes.
