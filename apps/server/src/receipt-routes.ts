import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireDemoPrincipal } from "./demo-principal.js";
import type { DecisionReceiptService } from "./receipt-service.js";

const runReceiptParams = z.object({ runId: z.string().uuid() });

// P1 registers this independent plugin at the integration gate. Keeping the
// route outside central Fastify composition lets P5 own Receipt behavior
// without creating a merge hotspot in app.ts.
export function createReceiptRoutes(
  receipts: DecisionReceiptService,
): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/runs/:runId/receipts", async (request) => {
      const principal = requireDemoPrincipal(request);
      const { runId } = runReceiptParams.parse(request.params);
      return receipts.getReceiptsForPrincipal(runId, principal.id);
    });
  };
}
