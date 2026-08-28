import type { FastifyPluginAsync } from "fastify";
import { requireDemoPrincipal } from "./demo-principal.js";
import type { PrincipalEntitlementService } from "./entitlement-service.js";
import {
  toProtectedResource,
  type ListResourcesResponse,
  type ResourceRegistryReader,
} from "./types.js";

interface ResourceRouteDependencies {
  registry: ResourceRegistryReader;
  entitlements: Pick<PrincipalEntitlementService, "listEntitlements">;
}

export function createResourceRoutes({
  registry,
  entitlements,
}: ResourceRouteDependencies): FastifyPluginAsync {
  return async function resourceRoutes(app) {
    app.get("/api/resources", async (request): Promise<ListResourcesResponse> => {
      const principal = requireDemoPrincipal(request);
      const resources = entitlements
        .listEntitlements(principal.id)
        .filter((entitlement) => entitlement.status === "active")
        .flatMap((entitlement) => {
          const resource = registry.getResource(entitlement.resourceId);
          return resource ? [toProtectedResource(resource)] : [];
        });
      return { resources };
    });
  };
}
