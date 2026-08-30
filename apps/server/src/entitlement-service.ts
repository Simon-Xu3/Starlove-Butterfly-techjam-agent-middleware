import { HttpError } from "./errors.js";
import type { JsonStore } from "./store.js";
import {
  DEMO_ENTITLEMENT_MATRIX,
  type EligibleResourceReader,
  type EntitlementReader,
  type HumanPrincipalId,
  type PrincipalResourceEntitlement,
  type ResourceRegistryReader,
} from "./types.js";

function cloneEntitlement(
  entitlement: PrincipalResourceEntitlement,
): PrincipalResourceEntitlement {
  return {
    principalId: entitlement.principalId,
    resourceId: entitlement.resourceId,
    permission: entitlement.permission,
    status: entitlement.status,
    generation: entitlement.generation,
    createdAt: entitlement.createdAt,
    revokedAt: entitlement.revokedAt,
  };
}

function currentEntitlements(
  entitlements: PrincipalResourceEntitlement[],
): PrincipalResourceEntitlement[] {
  const current = new Map<string, PrincipalResourceEntitlement>();
  for (const entitlement of entitlements) {
    const previous = current.get(entitlement.resourceId);
    if (!previous || entitlement.generation > previous.generation) {
      current.set(entitlement.resourceId, entitlement);
    }
  }
  return [...current.values()].sort((left, right) =>
    left.resourceId.localeCompare(right.resourceId),
  );
}

function findCurrentEntitlement(
  entitlements: PrincipalResourceEntitlement[],
  principalId: HumanPrincipalId,
  resourceId: string,
): PrincipalResourceEntitlement | undefined {
  return currentEntitlements(
    entitlements.filter(
      (entitlement) =>
        entitlement.principalId === principalId &&
        entitlement.resourceId === resourceId,
    ),
  )[0];
}

type Clock = () => string;

const systemClock: Clock = () => new Date().toISOString();

export class PrincipalEntitlementService
  implements EntitlementReader, EligibleResourceReader
{
  constructor(
    private readonly store: JsonStore,
    private readonly registry: ResourceRegistryReader,
    private readonly clock: Clock = systemClock,
  ) {}

  listEntitlements(
    principalId: HumanPrincipalId,
  ): PrincipalResourceEntitlement[] {
    return currentEntitlements(
      this.store
        .snapshot()
        .entitlements.filter(
          (entitlement) => entitlement.principalId === principalId,
        ),
    ).map(cloneEntitlement);
  }

  getCurrentEntitlement(
    principalId: HumanPrincipalId,
    resourceId: string,
  ): PrincipalResourceEntitlement | undefined {
    const entitlement = findCurrentEntitlement(
      this.store.snapshot().entitlements,
      principalId,
      resourceId,
    );
    return entitlement ? cloneEntitlement(entitlement) : undefined;
  }

  /**
   * Return only Resource IDs that the current principal may delegate now.
   * Keeping this filter in the Entitlement service gives the catalog and the
   * metadata-only Advisor one principal-scoped eligibility seam.
   */
  listEligibleResourceIds(principalId: HumanPrincipalId): string[] {
    return this.listEntitlements(principalId)
      .filter(
        (entitlement) =>
          entitlement.status === "active" && entitlement.permission === "read",
      )
      .map((entitlement) => entitlement.resourceId);
  }

  async grant(
    principalId: HumanPrincipalId,
    resourceId: string,
  ): Promise<PrincipalResourceEntitlement> {
    if (!this.registry.getResource(resourceId)) {
      throw new HttpError(404, "Resource not found");
    }
    const allowedByDemoPolicy = DEMO_ENTITLEMENT_MATRIX.some(
      (entry) =>
        entry.principalId === principalId && entry.resourceId === resourceId,
    );
    if (!allowedByDemoPolicy) {
      throw new HttpError(404, "Entitlement not available");
    }

    return this.store.mutate((database) => {
      const current = findCurrentEntitlement(
        database.entitlements,
        principalId,
        resourceId,
      );
      // Re-grant is the ticket's revoked -> active transition. Repeating an
      // already-active grant is idempotent so an HTTP retry cannot invalidate
      // an in-flight authorization decision by rotating its generation.
      if (current?.status === "active") {
        return cloneEntitlement(current);
      }
      const entitlement: PrincipalResourceEntitlement = {
        principalId,
        resourceId,
        permission: "read",
        status: "active",
        generation: (current?.generation ?? 0) + 1,
        createdAt: this.clock(),
        revokedAt: null,
      };
      database.entitlements.push(entitlement);
      return cloneEntitlement(entitlement);
    });
  }

  async revoke(
    principalId: HumanPrincipalId,
    resourceId: string,
  ): Promise<PrincipalResourceEntitlement> {
    if (!this.registry.getResource(resourceId)) {
      throw new HttpError(404, "Resource not found");
    }
    return this.store.mutate((database) => {
      const entitlement = findCurrentEntitlement(
        database.entitlements,
        principalId,
        resourceId,
      );
      if (!entitlement) {
        throw new HttpError(404, "Entitlement not found");
      }
      if (entitlement.status === "active") {
        entitlement.status = "revoked";
        entitlement.revokedAt = this.clock();
      }
      return cloneEntitlement(entitlement);
    });
  }
}
