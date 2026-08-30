import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSendMessageBody,
  DecisionReceiptCard,
  ResourceAdvisor,
  ResourcePicker,
} from "./resource-capsule";
import type { DecisionReceipt, ResourceSuggestion } from "./types";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

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
