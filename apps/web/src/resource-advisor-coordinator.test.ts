import { describe, expect, it } from "vitest";
import {
  ResourceAdvisorCoordinator,
  type ResourceAdvisorState,
} from "./resource-advisor-coordinator";
import type { ResourceSuggestion } from "./types";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type ManualUiState = {
  advisor: ResourceAdvisorState;
  selectedResourceId: string;
  baselineSubmissionDisabled: boolean;
};

describe("Resource Advisor state coordinator", () => {
  it("accepts only the latest overlapping request for the same prompt", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("inventory issue");
    const older = deferred<{ suggestion: ResourceSuggestion | null }>();
    const newer = deferred<{ suggestion: ResourceSuggestion | null }>();

    const olderResult = coordinator.suggest(
      "inventory issue",
      () => older.promise,
    );
    const newerResult = coordinator.suggest(
      "inventory issue",
      () => newer.promise,
    );

    newer.resolve({ suggestion: null });
    expect(await newerResult).toEqual({ status: "no-match" });

    older.resolve({ suggestion });
    expect(await olderResult).toBeNull();
  });

  it("suppresses an in-flight result after a prompt edit", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("inventory stock issue");
    const pending = deferred<{ suggestion: ResourceSuggestion | null }>();
    const ui: ManualUiState = {
      advisor: { status: "loading" },
      selectedResourceId: "orders-incident",
      baselineSubmissionDisabled: false,
    };

    const request = coordinator.suggest(
      "inventory stock issue",
      () => pending.promise,
    );
    coordinator.setPrompt("orders checkout issue");
    pending.resolve({ suggestion });

    const state = await request;
    if (state) ui.advisor = state;
    expect(state).toBeNull();
    expect(ui.selectedResourceId).toBe("orders-incident");
    expect(ui.baselineSubmissionDisabled).toBe(false);
    expect(ui.advisor).toEqual({ status: "loading" });
  });

  it("suppresses an in-flight error after a principal change", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("payments gateway issue");
    const pending = deferred<{ suggestion: ResourceSuggestion | null }>();
    const ui: ManualUiState = {
      advisor: { status: "loading" },
      selectedResourceId: "payments-incident",
      baselineSubmissionDisabled: false,
    };

    const request = coordinator.suggest(
      "payments gateway issue",
      () => pending.promise,
    );
    coordinator.changePrincipal();
    pending.reject(new Error("advisor request failed"));

    const state = await request;
    if (state) ui.advisor = state;
    expect(state).toBeNull();
    expect(ui.selectedResourceId).toBe("payments-incident");
    expect(ui.baselineSubmissionDisabled).toBe(false);
    expect(ui.advisor).toEqual({ status: "loading" });
  });

  it("keeps a recoverable error advisory-only", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("inventory issue");
    const ui: ManualUiState = {
      advisor: { status: "loading" },
      selectedResourceId: "orders-incident",
      baselineSubmissionDisabled: false,
    };

    const state = await coordinator.suggest("inventory issue", async () => {
      throw new Error("advisor request failed");
    });
    if (state) ui.advisor = state;
    expect(state).toEqual({
      status: "error",
      message: "Resource suggestions are temporarily unavailable.",
    });
    expect(ui.selectedResourceId).toBe("orders-incident");
    expect(ui.baselineSubmissionDisabled).toBe(false);
  });
});
