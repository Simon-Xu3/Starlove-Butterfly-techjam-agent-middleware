import type { PrincipalEntitlementService } from "./entitlement-service.js";
import type {
  AdvisorResource,
  AdvisorResourceReader,
  HumanPrincipalId,
  ResourceSuggestion,
  ResourceSuggestionReason,
} from "./types.js";

const MAX_MATCHED_TERMS = 8;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "inspect",
  "investigate",
  "of",
  "on",
  "please",
  "the",
  "this",
  "to",
  "with",
]);

type Match = {
  category: 1 | 2 | 3;
  terms: string[];
  reason: ResourceSuggestionReason;
};

function normalizedTerms(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
    ?? [];
}

function meaningfulTerms(value: string): string[] {
  return normalizedTerms(value).filter((term) => !STOP_WORDS.has(term));
}

function uniqueSortedTerms(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function boundedMetadataTerms(value: string, taskTerms: Set<string>): string[] {
  return normalizedTerms(value).filter(
    (term) => term.length <= 48 && taskTerms.has(term),
  );
}

function matchResource(
  taskTerms: Set<string>,
  resource: AdvisorResource,
  meaningfulTaskTerms: Set<string>,
): Match | null {
  const tags = uniqueSortedTerms(
    resource.tags.filter((tag) => taskTerms.has(tag)),
  );
  if (tags.length > 0) {
    return { category: 3, terms: tags, reason: "tag_match" };
  }

  const displayNameTerms = uniqueSortedTerms(
    boundedMetadataTerms(resource.displayName, meaningfulTaskTerms),
  );
  if (displayNameTerms.length > 0) {
    return {
      category: 2,
      terms: displayNameTerms,
      reason: "display_name_match",
    };
  }

  const descriptionTerms = uniqueSortedTerms(
    boundedMetadataTerms(resource.description, meaningfulTaskTerms),
  );
  if (descriptionTerms.length > 0) {
    return {
      category: 1,
      terms: descriptionTerms,
      reason: "description_match",
    };
  }
  return null;
}

/**
 * Deterministic, metadata-only Resource Advisor. Eligibility is resolved
 * before metadata lookup, so an unavailable Resource can never be suggested.
 */
export class ResourceAdvisor {
  constructor(
    private readonly entitlements: Pick<
      PrincipalEntitlementService,
      "listEligibleResourceIds"
    >,
    private readonly resources: AdvisorResourceReader,
  ) {}

  suggest(
    principalId: HumanPrincipalId,
    taskText: string,
  ): ResourceSuggestion | null {
    const taskTerms = new Set(normalizedTerms(taskText));
    if (taskTerms.size === 0) return null;
    const meaningfulTaskTerms = new Set(meaningfulTerms(taskText));

    const candidates: Array<{
      resource: AdvisorResource;
      match: Match;
    }> = [];
    for (const resourceId of this.entitlements.listEligibleResourceIds(principalId)) {
      const resource = this.resources.getAdvisorResource(resourceId);
      if (!resource) continue;
      const match = matchResource(taskTerms, resource, meaningfulTaskTerms);
      if (match) candidates.push({ resource, match });
    }

    if (candidates.length === 0) return null;
    candidates.sort((left, right) => {
      const category = right.match.category - left.match.category;
      if (category !== 0) return category;
      return right.match.terms.length - left.match.terms.length;
    });

    const best = candidates[0]!;
    const tied = candidates.some(
      (candidate, index) =>
        index > 0 &&
        candidate.match.category === best.match.category &&
        candidate.match.terms.length === best.match.terms.length,
    );
    if (tied) return null;

    return {
      resource: {
        id: best.resource.id,
        displayName: best.resource.displayName,
        kind: best.resource.kind,
        description: best.resource.description,
        tags: [...best.resource.tags],
      },
      matchedTerms: best.match.terms.slice(0, MAX_MATCHED_TERMS),
      reason: best.match.reason,
    };
  }
}
