import type {
  AgentOwnershipReader,
  AuthorizationDecision,
  CapsuleDenialReason,
  EntitlementReader,
  HumanPrincipal,
  PrincipalResourceEntitlement,
  RegisteredResource,
  ResourceAuthorizer,
  ResourceRegistryReader,
} from "./types.js";

const RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface ResourceAuthorizerDependencies {
  ownership: AgentOwnershipReader;
  registry: ResourceRegistryReader;
  entitlements: EntitlementReader;
}

function entitlementGeneration(
  entitlement: PrincipalResourceEntitlement,
): number | null {
  return Number.isSafeInteger(entitlement.generation) &&
    entitlement.generation > 0
    ? entitlement.generation
    : null;
}

function deny(
  principal: HumanPrincipal,
  agentId: string,
  resourceId: string,
  reason: CapsuleDenialReason,
  grantGeneration: number | null,
): AuthorizationDecision {
  return Object.freeze({
    decision: "deny",
    principalId: principal.id,
    agentId,
    resourceId,
    reason,
    grantGeneration,
  });
}

function snapshotResource(resource: RegisteredResource): RegisteredResource {
  return Object.freeze({
    id: resource.id,
    displayName: resource.displayName,
    kind: resource.kind,
    canonicalSourcePath: resource.canonicalSourcePath,
  });
}

/**
 * Builds the P3 authorization seam from server-owned readers. Request syntax
 * and cardinality are HTTP preconditions; authorization failures are returned
 * as stable, auditable decisions without exposing Registry paths.
 */
export function createResourceAuthorizer(
  dependencies: ResourceAuthorizerDependencies,
): ResourceAuthorizer {
  return {
    async authorizeResources(principal, agentId, resourceIds) {
      const [resourceId, ...rest] = resourceIds;
      if (
        resourceId === undefined ||
        rest.length > 0 ||
        !RESOURCE_ID_PATTERN.test(resourceId)
      ) {
        throw new Error(
          "authorizeResources precondition violated: expected exactly one valid resourceId",
        );
      }

      const ownerPrincipalId =
        dependencies.ownership.getOwnerPrincipalId(agentId);
      if (ownerPrincipalId !== principal.id) {
        return deny(
          principal,
          agentId,
          resourceId,
          "ownership_denied",
          null,
        );
      }

      const resource = dependencies.registry.getResource(resourceId);
      if (!resource) {
        return deny(
          principal,
          agentId,
          resourceId,
          "unknown_resource",
          null,
        );
      }
      if (
        resource.id !== resourceId ||
        resource.kind !== "directory" ||
        resource.canonicalSourcePath.length === 0
      ) {
        return deny(
          principal,
          agentId,
          resourceId,
          "invalid_resource_path",
          null,
        );
      }

      const entitlement = dependencies.entitlements.getCurrentEntitlement(
        principal.id,
        resourceId,
      );
      if (!entitlement) {
        return deny(
          principal,
          agentId,
          resourceId,
          "entitlement_missing",
          null,
        );
      }
      if (
        entitlement.principalId !== principal.id ||
        entitlement.resourceId !== resourceId
      ) {
        return deny(
          principal,
          agentId,
          resourceId,
          "entitlement_missing",
          null,
        );
      }

      const generation = entitlementGeneration(entitlement);
      if (entitlement.status !== "active") {
        return deny(
          principal,
          agentId,
          resourceId,
          "entitlement_revoked",
          generation,
        );
      }
      if (entitlement.permission !== "read") {
        return deny(
          principal,
          agentId,
          resourceId,
          "entitlement_missing",
          generation,
        );
      }
      if (generation === null) {
        return deny(
          principal,
          agentId,
          resourceId,
          "stale_entitlement_generation",
          null,
        );
      }

      return Object.freeze({
        decision: "allow",
        principalId: principal.id,
        agentId,
        resource: snapshotResource(resource),
        grantGeneration: generation,
      });
    },
  };
}
