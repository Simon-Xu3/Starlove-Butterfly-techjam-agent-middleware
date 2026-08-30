import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireDemoPrincipal } from "./demo-principal.js";
import type { PrincipalEntitlementService } from "./entitlement-service.js";
import { ResourceAdvisor } from "./resource-advisor.js";
import {
  toProtectedResource,
  type ListResourcesResponse,
  type SuggestResourceResponse,
  type AdvisorResourceReader,
  type ResourceRegistryReader,
} from "./types.js";

const suggestBody = z
  .object({
    content: z.string().trim().min(1).max(50_000),
  })
  .strict();

interface ResourceRouteDependencies {
  registry: ResourceRegistryReader & AdvisorResourceReader;
  entitlements: Pick<PrincipalEntitlementService, "listEligibleResourceIds">;
}

export function createResourceRoutes({
  registry,
  entitlements,
}: ResourceRouteDependencies): FastifyPluginAsync {
  const advisor = new ResourceAdvisor(entitlements, registry);
  return async function resourceRoutes(app) {
    app.get("/api/resources", async (request): Promise<ListResourcesResponse> => {
      const principal = requireDemoPrincipal(request);
      const resources = entitlements
        .listEligibleResourceIds(principal.id)
        .flatMap((resourceId) => {
          const resource = registry.getResource(resourceId);
          return resource ? [toProtectedResource(resource)] : [];
        });
      return { resources };
    });

    app.post(
      "/api/resources/suggest",
      async (request): Promise<SuggestResourceResponse> => {
        const principal = requireDemoPrincipal(request);
        const { content } = suggestBody.parse(request.body);
        return { suggestion: advisor.suggest(principal.id, content) };
      },
    );
  };
}
