import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSendMessageBody,
  DecisionProofChain,
  ResourceAdvisor,
  ResourcePicker,
} from "./resource-capsule";
import type { AgentRun, DecisionReceipt, ResourceSuggestion } from "./types";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function makeRun(status: AgentRun["status"]): AgentRun {
  return {
    id: "run-1",
    agentId: "agent-1",
    status,
    prompt: "secret prompt that must not be rendered",
    output: "protected Resource body that must not be rendered",
    error: "/private/protected/path that must not be rendered",
    usage: null,
    createdAt: "2026-08-28T00:00:00.000Z",
  };
}

function elementChildren(node: ReactElement): ReactNode[] {
  return Children.toArray(
    (node.props as { children?: ReactNode }).children,
  );
}

function findElement(
  node: ReactNode,
  type: string,
  text?: string,
): ReactElement | null {
  if (!isValidElement(node)) return null;
  if (node.type === type) {
    if (text === undefined || elementChildren(node).includes(text)) {
      return node;
    }
  }
  for (const child of elementChildren(node)) {
    const match = findElement(child, type, text);
    if (match) return match;
  }
  return null;
}

describe("Resource Capsule UI", () => {
  it("keeps run-context cards responsive before the narrow mobile breakpoint", () => {
    expect(styles).toMatch(
      /\.run-context-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*28rem\),\s*1fr\)\s*\)/,
    );
    expect(styles).toMatch(
      /\.resource-advisor-heading\s*\{[^}]*flex-wrap:\s*wrap;/,
    );
    expect(styles).toMatch(
      /\.advisor-action\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*width:\s*10rem;/,
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*\.advisor-action,[\s\S]*width:\s*100%;[\s\S]*min-height:\s*44px;/,
    );
    expect(styles).not.toMatch(/body\s*\{[^}]*overflow-x\s*:\s*hidden/);
  });

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

  it("keeps Advisor suggestions unselected until confirmation and never submits", () => {
    const suggestion: ResourceSuggestion = {
      resource: {
        id: "inventory-incident",
        displayName: "Inventory Incident",
        kind: "directory",
        description: "Investigate stock availability failures.",
        tags: ["inventory", "stock"],
      },
      matchedTerms: ["inventory"],
      reason: "tag_match",
    };
    let selectedResourceId: string | null = null;
    let submitted = 0;
    const advisor = ResourceAdvisor({
      state: { status: "suggested", suggestion },
      onSuggest: () => {
        submitted += 1;
      },
      onUseSuggestion: (resourceId) => {
        selectedResourceId = resourceId;
      },
    });

    expect(selectedResourceId).toBeNull();
    const confirm = findElement(advisor, "button", "Delegate for this Run");
    expect(confirm).not.toBeNull();
    const confirmProps = confirm?.props as {
      type?: string;
      onClick?: () => void;
    };
    expect(confirmProps.type).toBe("button");
    confirmProps.onClick?.();
    expect(selectedResourceId).toBe("inventory-incident");
    const picker = ResourcePicker({
      resources: [
        {
          id: "inventory-incident",
          displayName: "Inventory Incident",
          kind: "directory",
        },
      ],
      selectedResourceId,
      onSelect: (resourceId) => {
        selectedResourceId = resourceId;
      },
    });
    const pickerSelect = findElement(picker, "select");
    expect((pickerSelect?.props as { value?: string }).value).toBe(
      "inventory-incident",
    );
    expect(submitted).toBe(0);
  });

  it("can manually replace or remove a confirmed Resource without changing baseline submission", () => {
    let selectedResourceId: string | null = "orders-incident";
    const picker = ResourcePicker({
      resources: [
        {
          id: "orders-incident",
          displayName: "Orders incident",
          kind: "directory",
        },
        {
          id: "inventory-incident",
          displayName: "Inventory incident",
          kind: "directory",
        },
      ],
      selectedResourceId,
      onSelect: (resourceId) => {
        selectedResourceId = resourceId;
      },
    });
    const select = findElement(picker, "select");
    const selectProps = select?.props as {
      onChange?: (event: { target: { value: string } }) => void;
    };
    selectProps.onChange?.({ target: { value: "inventory-incident" } });
    expect(selectedResourceId).toBe("inventory-incident");

    const remove = findElement(picker, "button", "Remove");
    const removeProps = remove?.props as { onClick?: () => void };
    removeProps.onClick?.();
    expect(selectedResourceId).toBeNull();
    expect(buildSendMessageBody("baseline", selectedResourceId)).toEqual({
      content: "baseline",
    });
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
      [{ status: "suggested" as const, suggestion }, "Delegate for this Run"],
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
      expect(markup).toContain('role="status" aria-live="polite"');
      expect((markup.match(/aria-live/g) ?? []).length).toBe(1);
      expect(markup).not.toContain('role="alert"');
      if (state.status !== "loading") expect(markup).toContain("Suggest Resource");
      expect(markup).toContain(expected);
      if (state.status === "loading") {
        expect(markup).toContain("Checking…");
        expect(markup).toContain('aria-busy="true"');
      }
      if (state.status === "suggested") {
        expect(markup).toContain("read-only");
        expect(markup).toContain("this Run only");
        expect(markup).toContain("Suggestion only — nothing is delegated yet.");
        expect(markup).toContain('type="button"');
        expect(markup).not.toContain("aria-pressed");
      }
    }

    const selectedMarkup = renderToStaticMarkup(
      <ResourceAdvisor
        state={{ status: "suggested", suggestion }}
        selectedResourceId="inventory-incident"
        onSuggest={() => undefined}
        onUseSuggestion={() => undefined}
      />,
    );
    expect(selectedMarkup).toContain("Selected in picker");
    expect(selectedMarkup).toContain("Review or remove it in Resource Capsule");
    expect(selectedMarkup).toContain("Delegate for this Run");
    expect(selectedMarkup).not.toContain("Suggestion only — nothing is delegated yet.");
    expect(selectedMarkup).not.toContain("aria-pressed");
    expect((selectedMarkup.match(/aria-live/g) ?? []).length).toBe(1);

    const replacedMarkup = renderToStaticMarkup(
      <ResourceAdvisor
        state={{ status: "suggested", suggestion }}
        selectedResourceId="orders-incident"
        onSuggest={() => undefined}
        onUseSuggestion={() => undefined}
      />,
    );
    expect(replacedMarkup).toContain("A different Resource is selected.");
    expect(replacedMarkup).toContain("will replace it");
    expect(replacedMarkup).not.toContain("nothing is delegated yet");
  });

  it("renders the three-stage Proof Chain for an allowed started Run", () => {
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
      <DecisionProofChain
        run={makeRun("completed")}
        receipt={receipt}
        submittedContext={{
          runId: "run-1",
          agentId: "agent-1",
          resourceId: "orders-incident",
        }}
      />,
    );
    expect(allowMarkup).toContain('aria-label="Decision Proof Chain"');
    expect(allowMarkup).toContain("Delegated");
    expect(allowMarkup).toContain("Decided");
    expect(allowMarkup).toContain("Executed");
    expect(allowMarkup).toContain("user-a");
    expect(allowMarkup).toContain("agent-1");
    expect(allowMarkup).toContain("orders-incident");
    expect(allowMarkup).toContain("read-only");
    expect(allowMarkup).toContain("this Run only");
    expect(allowMarkup).toContain("Allowed");
    expect(allowMarkup).toContain("Entitlement generation");
    expect(allowMarkup).toContain(">3<");
    expect(allowMarkup).toContain("Runner started");
    expect(allowMarkup).toContain("completed");
    expect(allowMarkup).toContain("does not claim a per-Run namespace inspection");
  });

  it("keeps allow plus runnerStarted false truthful after cancellation", () => {
    const receipt: DecisionReceipt = {
      receiptId: "receipt-1",
      runId: "run-1",
      humanPrincipalId: "user-a",
      agentId: "agent-1",
      resourceId: "orders-incident",
      decision: "allow",
      reason: "allowed",
      grantGeneration: 3,
      runnerStarted: false,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const preRuntimeMarkup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("cancelled")}
        receipt={receipt}
        submittedContext={{
          runId: "run-1",
          agentId: "agent-1",
          resourceId: "orders-incident",
        }}
      />,
    );
    expect(preRuntimeMarkup).toContain("Allowed");
    expect(preRuntimeMarkup).toContain("Runner not started");
    expect(preRuntimeMarkup).toContain("cancelled before Runner invocation");
    expect(preRuntimeMarkup).toContain("cancelled");
    expect(preRuntimeMarkup).not.toContain("Expected security result");
  });

  it("shows denial as an expected pre-Runner security result", () => {
    const deniedReceipt: DecisionReceipt = {
      receiptId: "receipt-2",
      runId: "run-2",
      humanPrincipalId: "user-a",
      agentId: "agent-1",
      resourceId: "payments-incident",
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
      runnerStarted: false,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const denyMarkup = renderToStaticMarkup(
      <DecisionProofChain
        run={{ ...makeRun("denied"), id: "run-2" }}
        receipt={deniedReceipt}
        denied={{
          runId: "run-2",
          receiptId: "receipt-2",
          status: "denied",
          reason: "entitlement_missing",
        }}
        submittedContext={{
          runId: "run-2",
          agentId: "agent-1",
          resourceId: "payments-incident",
        }}
      />,
    );
    expect(denyMarkup).toContain("Denied");
    expect(denyMarkup).toContain("not entitled");
    expect(denyMarkup).toContain("not available");
    expect(denyMarkup).toContain("Runner not started");
    expect(denyMarkup).toContain("Expected security result");
    expect(denyMarkup).toContain("denied");
    for (const forbidden of [
      "sourcePath",
      "secret prompt",
      "protected Resource body",
      "/private/protected/path",
      "token",
      "demo-session",
    ])
      expect(denyMarkup).not.toContain(forbidden);
  });

  it("keeps every Receipt-derived stage neutral while evidence is pending", () => {
    for (const status of [
      "queued",
      "running",
      "completed",
      "failed",
      "cancelled",
      "denied",
    ] as const) {
      const pendingMarkup = renderToStaticMarkup(
        <DecisionProofChain
          run={makeRun(status)}
          receipt={null}
          submittedContext={{
            runId: "run-1",
            agentId: "agent-1",
            resourceId: "inventory-incident",
          }}
        />,
      );
      expect(pendingMarkup).toContain("inventory-incident");
      expect(pendingMarkup).toContain("Decision pending");
      expect(pendingMarkup).toContain("Awaiting Decision Receipt");
      expect(pendingMarkup).toContain("Execution evidence pending");
      expect(pendingMarkup).toContain("no Runner fact is inferred");
      expect(pendingMarkup).toContain(status);
      expect(pendingMarkup).not.toContain("Runner started");
      expect(pendingMarkup).not.toContain("Runner not started");
    }
  });

  it("does not render a Proof Chain from an old Run without admitted Capsule context", () => {
    const markup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("completed")}
        receipt={null}
        submittedContext={null}
      />,
    );
    expect(markup).toBe("");
  });

  it("refuses to combine mismatched Run and Receipt facts", () => {
    const receipt: DecisionReceipt = {
      receiptId: "receipt-other",
      runId: "run-other",
      humanPrincipalId: "user-a",
      agentId: "agent-other",
      resourceId: "payments-incident",
      decision: "allow",
      reason: "allowed",
      grantGeneration: 9,
      runnerStarted: true,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("completed")}
        receipt={receipt}
        submittedContext={{
          runId: "run-1",
          agentId: "agent-1",
          resourceId: "orders-incident",
        }}
      />,
    );
    expect(markup).toContain("Evidence unavailable");
    expect(markup).toContain("did not correlate");
    expect(markup).not.toContain("payments-incident");
    expect(markup).not.toContain("orders-incident");
    expect(markup).not.toContain("Runner started");
    expect(markup).not.toContain("receipt-other");
  });

  it("refuses a Receipt Resource that differs from the admitted request", () => {
    const receipt: DecisionReceipt = {
      receiptId: "receipt-wrong-resource",
      runId: "run-1",
      humanPrincipalId: "user-a",
      agentId: "agent-1",
      resourceId: "payments-incident",
      decision: "allow",
      reason: "allowed",
      grantGeneration: 9,
      runnerStarted: true,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const markup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("completed")}
        receipt={receipt}
        submittedContext={{
          runId: "run-1",
          agentId: "agent-1",
          resourceId: "orders-incident",
        }}
      />,
    );
    expect(markup).toContain("Evidence unavailable");
    expect(markup).not.toContain("payments-incident");
    expect(markup).not.toContain("orders-incident");
    expect(markup).not.toContain("receipt-wrong-resource");
    expect(markup).not.toContain("Runner started");
  });

  it("refuses to combine a Decision with an incompatible Run status", () => {
    const allowReceipt: DecisionReceipt = {
      receiptId: "receipt-allow",
      runId: "run-1",
      humanPrincipalId: "user-a",
      agentId: "agent-1",
      resourceId: "orders-incident",
      decision: "allow",
      reason: "allowed",
      grantGeneration: 3,
      runnerStarted: false,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    const denyReceipt: DecisionReceipt = {
      receiptId: "receipt-deny",
      runId: "run-1",
      humanPrincipalId: "user-a",
      agentId: "agent-1",
      resourceId: "orders-incident",
      decision: "deny",
      reason: "entitlement_revoked",
      grantGeneration: 3,
      runnerStarted: false,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    for (const [run, receipt] of [
      [makeRun("denied"), allowReceipt],
      [makeRun("queued"), denyReceipt],
    ] as const) {
      const markup = renderToStaticMarkup(
        <DecisionProofChain
          run={run}
          receipt={receipt}
          submittedContext={{
            runId: "run-1",
            agentId: "agent-1",
            resourceId: "orders-incident",
          }}
        />,
      );
      expect(markup).toContain("Evidence unavailable");
      expect(markup).not.toContain("orders-incident");
      expect(markup).not.toContain(receipt.receiptId);
      expect(markup).not.toContain("Runner not started");
    }
  });

  it("refuses a denial response paired with a non-denied Run", () => {
    const markup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("completed")}
        receipt={null}
        denied={{
          runId: "run-1",
          receiptId: "receipt-denied",
          status: "denied",
          reason: "entitlement_revoked",
        }}
        submittedContext={{
          runId: "run-1",
          agentId: "agent-1",
          resourceId: "orders-incident",
        }}
      />,
    );
    expect(markup).toContain("Evidence unavailable");
    expect(markup).not.toContain("orders-incident");
    expect(markup).not.toContain("receipt-denied");
    expect(markup).not.toContain("completed");
  });

  it("shows the submitted principal while Receipt evidence is pending", () => {
    const markup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("queued")}
        receipt={null}
        submittedContext={{
          runId: "run-1",
          principalId: "user-a",
          agentId: "agent-1",
          resourceId: "orders-incident",
        }}
      />,
    );

    expect(markup).toContain("user-a");
    expect(markup).toContain("orders-incident");
    expect(markup).toContain("Decision pending");
    expect(markup).toContain("Execution evidence pending");
  });

  it("shows a safe denial proof before the Receipt query catches up", () => {
    const markup = renderToStaticMarkup(
      <DecisionProofChain
        run={makeRun("denied")}
        receipt={null}
        denied={{
          runId: "run-1",
          receiptId: "receipt-denied",
          status: "denied",
          reason: "entitlement_missing",
        }}
        submittedContext={{
          runId: "run-1",
          principalId: "user-a",
          agentId: "agent-1",
          resourceId: "payments-incident",
        }}
      />,
    );

    expect(markup).toContain("Denied");
    expect(markup).toContain("not entitled");
    expect(markup).toContain("Runner not started");
    expect(markup).toContain("Expected security result");
    expect(markup).toContain("not available");
    expect(markup).toContain("user-a");
    expect(markup).not.toContain("Runner failure");
  });
});
