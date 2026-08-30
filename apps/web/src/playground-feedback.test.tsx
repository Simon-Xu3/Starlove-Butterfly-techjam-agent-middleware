import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  describeRunProgress,
  isNearMessageEnd,
  RunProgressBanner,
  scrollMessagePaneToEnd,
} from "./playground-feedback";
import type { AgentRun, DecisionReceipt } from "./types";

const run = (status: AgentRun["status"]): AgentRun => ({
  id: "11111111-1111-4111-8111-111111111111",
  agentId: "22222222-2222-4222-8222-222222222222",
  status,
  prompt: "inspect orders",
  output: null,
  error: null,
  usage: null,
  createdAt: "2026-08-30T00:00:00.000Z",
});

const receipt: DecisionReceipt = {
  receiptId: "33333333-3333-4333-8333-333333333333",
  runId: "11111111-1111-4111-8111-111111111111",
  humanPrincipalId: "user-a",
  agentId: "22222222-2222-4222-8222-222222222222",
  resourceId: "orders-incident",
  decision: "allow",
  reason: "allowed",
  grantGeneration: 1,
  runnerStarted: true,
  createdAt: "2026-08-30T00:00:00.000Z",
};

describe("Playground message following", () => {
  it("detects when the reader has left the latest-message threshold", () => {
    expect(
      isNearMessageEnd({
        clientHeight: 320,
        scrollHeight: 900,
        scrollTop: 530,
        scrollTo: vi.fn(),
      }),
    ).toBe(false);
    expect(
      isNearMessageEnd({
        clientHeight: 320,
        scrollHeight: 900,
        scrollTop: 570,
        scrollTo: vi.fn(),
      }),
    ).toBe(true);
  });

  it("scrolls the message pane itself instead of the outer document", () => {
    const scrollTo = vi.fn();
    scrollMessagePaneToEnd({
      clientHeight: 320,
      scrollHeight: 900,
      scrollTop: 0,
      scrollTo,
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });
  });
});

describe("Run progress feedback", () => {
  it("uses a clear lifecycle label for terminal and active Runs", () => {
    expect(describeRunProgress(run("queued"), null).label).toBe("Run submitted");
    expect(describeRunProgress(run("running"), receipt).label).toBe("Runner started");
    expect(describeRunProgress(run("completed"), receipt).label).toBe("Run completed");
    expect(describeRunProgress(run("denied"), receipt).label).toBe("Run denied");
  });

  it("keeps the completed Run Resource visible outside the reset picker", () => {
    const markup = renderToStaticMarkup(
      <RunProgressBanner
        run={run("completed")}
        receipt={receipt}
        resourceLabel="Orders Incident"
      />,
    );
    expect(markup).toContain("Run completed");
    expect(markup).toContain("Resource · Orders Incident");
  });
});

