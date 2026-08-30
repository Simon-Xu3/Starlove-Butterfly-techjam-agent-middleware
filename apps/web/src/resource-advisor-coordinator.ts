import type { ResourceSuggestion, SuggestResourceResponse } from "./types";

export type ResourceAdvisorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "suggested"; suggestion: ResourceSuggestion }
  | { status: "no-match" }
  | { status: "error"; message: string };

export type GuidedDelegationState = {
  advisor: ResourceAdvisorState;
  selectedResourceId: string | null;
};

export type GuidedDelegationAction =
  | { type: "prompt_changed" }
  | { type: "suggestion_requested" }
  | { type: "suggestion_resolved"; state: ResourceAdvisorState }
  | { type: "resource_selected"; resourceId: string | null }
  | { type: "eligible_resources_refreshed"; resourceIds: string[] }
  | { type: "agent_changed" }
  | { type: "principal_changed" }
  | { type: "run_submitted" };

export const initialGuidedDelegationState: GuidedDelegationState = {
  advisor: { status: "idle" },
  selectedResourceId: null,
};

/**
 * Keeps an Advisor candidate separate from the Human Principal's explicit
 * Picker choice. Prompt edits invalidate advice but preserve that choice;
 * changing Agent/principal or submitting the Run clears both.
 */
export function guidedDelegationReducer(
  state: GuidedDelegationState,
  action: GuidedDelegationAction,
): GuidedDelegationState {
  switch (action.type) {
    case "prompt_changed":
      return { ...state, advisor: { status: "idle" } };
    case "suggestion_requested":
      return { ...state, advisor: { status: "loading" } };
    case "suggestion_resolved":
      return { ...state, advisor: action.state };
    case "resource_selected":
      return { ...state, selectedResourceId: action.resourceId };
    case "eligible_resources_refreshed":
      return state.selectedResourceId &&
        !action.resourceIds.includes(state.selectedResourceId)
        ? { ...state, selectedResourceId: null }
        : state;
    case "agent_changed":
    case "principal_changed":
    case "run_submitted":
      return { advisor: { status: "idle" }, selectedResourceId: null };
  }
}

type SuggestResourceRequest = (
  content: string,
) => Promise<SuggestResourceResponse>;

type RequestSnapshot = {
  revision: number;
  principalRevision: number;
  prompt: string;
};

/**
 * Keeps transient Advisor requests tied to the prompt and demo principal that
 * started them. A stale result is ignored instead of being handed to App
 * state, leaving the manual picker and baseline submission untouched.
 */
export class ResourceAdvisorCoordinator {
  private revision = 0;
  private principalRevision = 0;
  private prompt = "";

  setPrompt(prompt: string): void {
    this.prompt = prompt;
    this.revision += 1;
  }

  invalidate(): void {
    this.revision += 1;
  }

  changePrincipal(): void {
    this.principalRevision += 1;
    this.revision += 1;
  }

  async suggest(
    content: string,
    request: SuggestResourceRequest,
  ): Promise<ResourceAdvisorState | null> {
    const snapshot: RequestSnapshot = {
      revision: this.revision,
      principalRevision: this.principalRevision,
      prompt: this.prompt.trim(),
    };
    const normalizedContent = content.trim();
    if (!normalizedContent || normalizedContent !== snapshot.prompt) return null;

    try {
      const response = await request(normalizedContent);
      if (!this.isCurrent(snapshot)) return null;
      return response.suggestion
        ? { status: "suggested", suggestion: response.suggestion }
        : { status: "no-match" };
    } catch {
      if (!this.isCurrent(snapshot)) return null;
      return {
        status: "error",
        message: "Resource suggestions are temporarily unavailable.",
      };
    }
  }

  private isCurrent(snapshot: RequestSnapshot): boolean {
    return (
      snapshot.revision === this.revision &&
      snapshot.principalRevision === this.principalRevision &&
      snapshot.prompt === this.prompt.trim()
    );
  }
}
