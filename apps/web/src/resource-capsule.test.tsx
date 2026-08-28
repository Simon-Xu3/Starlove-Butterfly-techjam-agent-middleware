import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSendMessageBody,
  DecisionReceiptCard,
  ResourcePicker,
} from "./resource-capsule";
import type { DecisionReceipt } from "./types";

describe("Resource Capsule UI", () => {
  it("builds baseline and exactly-one Resource requests", () => {
    expect(buildSendMessageBody("baseline", null)).toEqual({ content: "baseline" });
    expect(buildSendMessageBody("inspect", "orders-incident")).toEqual({
      content: "inspect",
      resourceIds: ["orders-incident"],
    });
  });

  it("renders an explicit manual Resource choice with a removal action", () => {
    const markup = renderToStaticMarkup(
      <ResourcePicker
        resources={[
          {
            id: "orders-incident",
            displayName: "Orders incident",
            kind: "directory",
          },
        ]}
        selectedResourceId="orders-incident"
        onSelect={() => undefined}
      />,
    );
    expect(markup).toContain("Orders incident");
    expect(markup).toContain("Remove");
    expect(markup).toContain("read-only delegation");
    expect(markup).not.toContain("sourcePath");
  });

  it("renders safe allow and deny Receipt evidence", () => {
    const receipt: DecisionReceipt = {
      receiptId: "receipt-1",
      runId: "run-1",
      humanPrincipalId: "user-a",
      agentId: "agent-1",
      resourceId: "orders-incident",
      decision: "allow",
      reason: "allowed",
      grantGeneration: 3,
      runnerStarted: true,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const allowMarkup = renderToStaticMarkup(
      <DecisionReceiptCard receipt={receipt} />,
    );
    expect(allowMarkup).toContain("Resource authorized");
    expect(allowMarkup).toContain("orders-incident");
    expect(allowMarkup).toContain("Runner started");

    const denyMarkup = renderToStaticMarkup(
      <DecisionReceiptCard
        receipt={null}
        denied={{
          runId: "run-2",
          receiptId: "receipt-2",
          status: "denied",
          reason: "entitlement_missing",
        }}
      />,
    );
    expect(denyMarkup).toContain("Run denied");
    expect(denyMarkup).toContain("not entitled");
    for (const forbidden of ["sourcePath", "prompt", "token", "demo-session"])
      expect(denyMarkup).not.toContain(forbidden);
  });
});
