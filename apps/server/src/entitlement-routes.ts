import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireDemoPrincipal } from "./demo-principal.js";
import type { PrincipalEntitlementService } from "./entitlement-service.js";
import { HttpError } from "./errors.js";
import {
  RESOURCE_ID_PATTERN,
  type EntitlementMutationResponse,
  type ListEntitlementsResponse,
} from "./types.js";

const mutationBody = z
  .object({
    resourceId: z.string().regex(RESOURCE_ID_PATTERN, "Invalid Resource ID"),
  })
  .strict();

function parseMutationBody(value: unknown) {
  const parsed = mutationBody.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid Entitlement request");
  }
  return parsed.data;
}

interface EntitlementRouteDependencies {
  entitlements: Pick<
    PrincipalEntitlementService,
    "listEntitlements" | "grant" | "revoke"
  >;
}

export function createEntitlementRoutes({
  entitlements,
}: EntitlementRouteDependencies): FastifyPluginAsync {
  return async function entitlementRoutes(app) {
    app.get(
      "/api/entitlements",
      async (request): Promise<ListEntitlementsResponse> => {
        const principal = requireDemoPrincipal(request);
        return {
          entitlements: entitlements.listEntitlements(principal.id),
        };
      },
    );

    app.post(
      "/api/entitlements/grant",
      async (request): Promise<EntitlementMutationResponse> => {
        const principal = requireDemoPrincipal(request);
        const body = parseMutationBody(request.body);
        return {
          entitlement: await entitlements.grant(
            principal.id,
            body.resourceId,
          ),
        };
      },
    );

    app.post(
      "/api/entitlements/revoke",
      async (request): Promise<EntitlementMutationResponse> => {
        const principal = requireDemoPrincipal(request);
        const body = parseMutationBody(request.body);
        return {
          entitlement: await entitlements.revoke(
            principal.id,
            body.resourceId,
          ),
        };
      },
    );
  };
}
