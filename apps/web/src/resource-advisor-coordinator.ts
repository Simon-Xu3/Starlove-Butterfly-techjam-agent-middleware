import type { ResourceSuggestion, SuggestResourceResponse } from "./types";

export type ResourceAdvisorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "suggested"; suggestion: ResourceSuggestion }
  | { status: "no-match" }
  | { status: "error"; message: string };

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
