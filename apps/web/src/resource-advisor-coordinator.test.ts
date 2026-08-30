import { describe, expect, it } from "vitest";
import {
  guidedDelegationReducer,
  initialGuidedDelegationState,
  ResourceAdvisorCoordinator,
  type GuidedDelegationState,
} from "./resource-advisor-coordinator";
import { buildSendMessageBody } from "./resource-capsule";
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

describe("Resource Advisor state coordinator", () => {
  it("suppresses an in-flight result after a prompt edit", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("inventory stock issue");
    const pending = deferred<{ suggestion: ResourceSuggestion | null }>();
    let ui: GuidedDelegationState = {
      advisor: { status: "loading" },
      selectedResourceId: "orders-incident",
    };

    const request = coordinator.suggest(
      "inventory stock issue",
      () => pending.promise,
    );
    coordinator.setPrompt("orders checkout issue");
    ui = guidedDelegationReducer(ui, { type: "prompt_changed" });
    pending.resolve({ suggestion });

    const state = await request;
    if (state) {
      ui = guidedDelegationReducer(ui, {
        type: "suggestion_resolved",
        state,
      });
    }
    expect(state).toBeNull();
    expect(ui.selectedResourceId).toBe("orders-incident");
    expect(ui.advisor).toEqual({ status: "idle" });
  });

  it("suppresses an in-flight error after a principal change", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("payments gateway issue");
    const pending = deferred<{ suggestion: ResourceSuggestion | null }>();
    let ui: GuidedDelegationState = {
      advisor: { status: "loading" },
      selectedResourceId: "payments-incident",
    };

    const request = coordinator.suggest(
      "payments gateway issue",
      () => pending.promise,
    );
    coordinator.changePrincipal();
    ui = guidedDelegationReducer(ui, { type: "principal_changed" });
    pending.reject(new Error("advisor request failed"));

    const state = await request;
    if (state) {
      ui = guidedDelegationReducer(ui, {
        type: "suggestion_resolved",
        state,
      });
    }
    expect(state).toBeNull();
    expect(ui).toEqual(initialGuidedDelegationState);
  });

  it("keeps a recoverable error advisory-only", async () => {
    const coordinator = new ResourceAdvisorCoordinator();
    coordinator.setPrompt("inventory issue");
    let ui: GuidedDelegationState = {
      advisor: { status: "loading" },
      selectedResourceId: "orders-incident",
    };

    const state = await coordinator.suggest("inventory issue", async () => {
      throw new Error("advisor request failed");
    });
    if (state) {
      ui = guidedDelegationReducer(ui, {
        type: "suggestion_resolved",
        state,
      });
    }
    expect(state).toEqual({
      status: "error",
      message: "Resource suggestions are temporarily unavailable.",
    });
    expect(ui.selectedResourceId).toBe("orders-incident");
  });
});

describe("Guided delegation state", () => {
  it("keeps a suggestion unselected until a separate confirmation", () => {
    const suggested = guidedDelegationReducer(
      initialGuidedDelegationState,
      {
        type: "suggestion_resolved",
        state: { status: "suggested", suggestion },
      },
    );
    expect(suggested.selectedResourceId).toBeNull();
    expect(
      buildSendMessageBody("inventory task", suggested.selectedResourceId),
    ).toEqual({ content: "inventory task" });

    const confirmed = guidedDelegationReducer(suggested, {
      type: "resource_selected",
      resourceId: "inventory-incident",
    });
    expect(confirmed.advisor).toEqual(suggested.advisor);
    expect(confirmed.selectedResourceId).toBe("inventory-incident");
    expect(
      buildSendMessageBody("inventory task", confirmed.selectedResourceId),
    ).toEqual({
      content: "inventory task",
      resourceIds: ["inventory-incident"],
    });
  });

  it("invalidates advice on a prompt edit but preserves an explicit choice", () => {
    const suggested = {
      advisor: { status: "suggested" as const, suggestion },
      selectedResourceId: null,
    };
    expect(
      guidedDelegationReducer(suggested, { type: "prompt_changed" }),
    ).toEqual(initialGuidedDelegationState);

    const confirmed = { ...suggested, selectedResourceId: "inventory-incident" };
    expect(
      guidedDelegationReducer(confirmed, { type: "prompt_changed" }),
    ).toEqual({
      advisor: { status: "idle" },
      selectedResourceId: "inventory-incident",
    });
  });

  it("supports ignore, manual replacement, removal, and baseline submission", () => {
    let state = guidedDelegationReducer(initialGuidedDelegationState, {
      type: "suggestion_resolved",
      state: { status: "suggested", suggestion },
    });
    expect(
      buildSendMessageBody("ignore advice", state.selectedResourceId),
    ).toEqual({ content: "ignore advice" });

    state = guidedDelegationReducer(state, {
      type: "resource_selected",
      resourceId: "orders-incident",
    });
    expect(state.selectedResourceId).toBe("orders-incident");
    state = guidedDelegationReducer(state, {
      type: "resource_selected",
      resourceId: null,
    });
    expect(buildSendMessageBody("baseline", state.selectedResourceId)).toEqual(
      { content: "baseline" },
    );
  });

  it("clears principal/Agent/submission context and ineligible selections", () => {
    const selected = {
      advisor: { status: "suggested" as const, suggestion },
      selectedResourceId: "inventory-incident",
    };
    expect(
      guidedDelegationReducer(selected, {
        type: "eligible_resources_refreshed",
        resourceIds: ["orders-incident"],
      }),
    ).toEqual({ ...selected, selectedResourceId: null });
    for (const type of [
      "agent_changed",
      "principal_changed",
      "run_submitted",
    ] as const) {
      expect(guidedDelegationReducer(selected, { type })).toEqual(
        initialGuidedDelegationState,
      );
    }
  });
});
