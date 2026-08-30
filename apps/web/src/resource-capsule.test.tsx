import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSendMessageBody,
  DecisionReceiptCard,
  ResourceAdvisor,
  ResourcePicker,
} from "./resource-capsule";
import type { DecisionReceipt, ResourceSuggestion } from "./types";

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
    expect(markup).toContain("future Runner starts only");
    expect(markup).toContain("does not hot-unmount");
    expect(markup).toContain("model or thread memory");
    expect(markup).not.toContain("sourcePath");
  });

  it("renders every explicit Advisor state separately from the picker", () => {
    const suggestion: ResourceSuggestion = {
      resource: {
        id: "inventory-incident",
        displayName: "Inventory Incident",
        kind: "directory",
        description: "Investigate stock availability failures.",
        tags: ["inventory", "stock"],
      },
      matchedTerms: ["inventory", "stock"],
      reason: "tag_match",
    };
    const states = [
      [{ status: "idle" as const }, "Manual selection remains unchanged."],
      [{ status: "loading" as const }, "Checking eligible Resource metadata"],
      [{ status: "suggested" as const, suggestion }, "Choose in picker"],
      [{ status: "no-match" as const }, "No matching eligible Resource"],
      [{ status: "error" as const, message: "Temporary advisor failure." }, "Temporary advisor failure."],
    ] as const;

    for (const [state, expected] of states) {
      const markup = renderToStaticMarkup(
        <ResourceAdvisor
          state={state}
          onSuggest={() => undefined}
          onUseSuggestion={() => undefined}
        />,
      );
      expect(markup).toContain('aria-label="Resource Advisor"');
      if (state.status !== "loading") expect(markup).toContain("Suggest Resource");
      expect(markup).toContain(expected);
    }
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

    const preRuntimeMarkup = renderToStaticMarkup(
      <DecisionReceiptCard
        receipt={{ ...receipt, runnerStarted: false }}
      />,
    );
    expect(preRuntimeMarkup).toContain("Runner has not started");
    expect(preRuntimeMarkup).not.toContain("crossed the Runtime seam");

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
