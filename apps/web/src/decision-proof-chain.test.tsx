import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DecisionReceiptCard,
  projectDecisionProof,
} from "./resource-capsule";
import type { AgentRun, DecisionReceipt } from "./types";

const makeRun = (status: AgentRun["status"]): AgentRun => ({
  id: "11111111-1111-4111-8111-111111111111",
  agentId: "22222222-2222-4222-8222-222222222222",
  status,
  prompt: "sensitive task text",
  output: null,
  error: null,
  usage: null,
  createdAt: "2026-08-30T00:00:00.000Z",
});

const allowReceipt: DecisionReceipt = {
  receiptId: "33333333-3333-4333-8333-333333333333",
  runId: "11111111-1111-4111-8111-111111111111",
  humanPrincipalId: "user-a",
  agentId: "22222222-2222-4222-8222-222222222222",
  resourceId: "orders-incident",
  decision: "allow",
  reason: "allowed",
  grantGeneration: 4,
  runnerStarted: true,
  createdAt: "2026-08-30T00:00:00.000Z",
};

describe("Decision Proof Chain projection", () => {
  it("renders a neutral pending chain before a Receipt is available", () => {
    const run = makeRun("queued");
    const proof = projectDecisionProof({
      receipt: null,
      run,
      principalId: "user-a",
      agentId: run.agentId,
      resourceId: "orders-incident",
    });

    expect(proof.outcome).toBe("pending");
    expect(proof.stages.map((stage) => stage.label)).toEqual([
      "Resource selected",
      "Pending",
      "Pending",
    ]);
    expect(proof.runStatus).toBe("queued");

    const markup = renderToStaticMarkup(
      <DecisionReceiptCard
        receipt={null}
        run={run}
        principalId="user-a"
        agentId={run.agentId}
        resourceId="orders-incident"
      />,
    );
    expect(markup).toContain("Decision pending");
    expect(markup).toContain("read-only");
    expect(markup).toContain("this Run only");
    expect(markup).toContain("awaiting the query seam");
  });

  it("keeps allowed-and-started distinct from the final Run result", () => {
    const completed = projectDecisionProof({
      receipt: allowReceipt,
      run: makeRun("completed"),
    });
    expect(completed.stages[1].label).toBe("Allowed");
    expect(completed.stages[2].label).toBe("Runner started");
    expect(completed.runStatus).toBe("completed");

    const failed = projectDecisionProof({
      receipt: allowReceipt,
      run: makeRun("failed"),
    });
    expect(failed.stages[2].label).toBe("Runner started");
    expect(failed.runStatus).toBe("failed");
    expect(failed.stages[2].description).not.toContain("successful");
  });

  it("keeps allowed-and-not-started separate from pre-Runner cancellation", () => {
    const notStartedReceipt: DecisionReceipt = {
      ...allowReceipt,
      runnerStarted: false,
    };
    const awaitingExecution = projectDecisionProof({
      receipt: notStartedReceipt,
      run: makeRun("running"),
    });
    expect(awaitingExecution.stages[1].label).toBe("Allowed");
    expect(awaitingExecution.stages[2].label).toBe("Not started");

    const cancelled = projectDecisionProof({
      receipt: notStartedReceipt,
      run: makeRun("cancelled"),
    });
    expect(cancelled.outcome).toBe("allow");
    expect(cancelled.stages[1].label).toBe("Allowed");
    expect(cancelled.stages[2].label).toBe("Cancelled before Runner");
    expect(cancelled.stages[2].description).toContain("allow decision is unchanged");
  });

  it("renders denial-before-Runner as an expected security outcome", () => {
    const denyReceipt: DecisionReceipt = {
      ...allowReceipt,
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
      runnerStarted: false,
    };
    const proof = projectDecisionProof({
      receipt: denyReceipt,
      run: makeRun("denied"),
    });

    expect(proof.outcome).toBe("deny");
    expect(proof.stages[1].label).toBe("Denied");
    expect(proof.stages[2].label).toBe("Blocked before Runner");
    expect(proof.stages[2].description).toContain("expected security outcome");
    expect(proof.grantGeneration).toBeNull();

    const markup = renderToStaticMarkup(
      <DecisionReceiptCard receipt={denyReceipt} run={makeRun("denied")} />,
    );
    expect(markup).toContain("not available");
    expect(markup).not.toContain("Runner failure");
  });

  it("uses safe request and denial facts while the deny Receipt query catches up", () => {
    const proof = projectDecisionProof({
      receipt: null,
      denied: {
        runId: "11111111-1111-4111-8111-111111111111",
        receiptId: "33333333-3333-4333-8333-333333333333",
        status: "denied",
        reason: "unknown_resource",
      },
      run: makeRun("denied"),
      principalId: "user-a",
      agentId: "22222222-2222-4222-8222-222222222222",
      resourceId: "unknown-incident",
    });

    expect(proof.principalId).toBe("user-a");
    expect(proof.resourceId).toBe("unknown-incident");
    expect(proof.stages[1].label).toBe("Denied");
    expect(proof.stages[2].label).toBe("Blocked before Runner");
  });

  it("renders only the allowlisted projection and drops extra sensitive fields", () => {
    const tamperedReceipt = {
      ...allowReceipt,
      sourcePath: "C:/private/protected/orders",
      prompt: "do not expose this prompt",
      token: "Bearer secret-value",
      session: "demo-session-a",
      resourceBody: "protected resource body",
    } as DecisionReceipt;
    const markup = renderToStaticMarkup(
      <DecisionReceiptCard receipt={tamperedReceipt} run={makeRun("completed")} />,
    );

    for (const forbidden of [
      "C:/private/protected/orders",
      "do not expose this prompt",
      "Bearer secret-value",
      "demo-session-a",
      "protected resource body",
    ]) {
      expect(markup).not.toContain(forbidden);
    }
  });
});
