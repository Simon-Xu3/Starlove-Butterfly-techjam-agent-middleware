import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { requireDemoPrincipal } from "./demo-principal.js";
import { HttpError } from "./errors.js";
import { createReceiptRoutes } from "./receipt-routes.js";
import { DecisionReceiptService } from "./receipt-service.js";
import { InMemoryReceiptStore } from "./receipt-store.js";
import type {
  AgentOwnershipReader,
  AllowDecisionReceipt,
  DenyDecisionReceipt,
  HumanPrincipalId,
} from "./types.js";

const runId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";

function makeReceiptService(owner: HumanPrincipalId = "user-a") {
  const repository = new InMemoryReceiptStore();
  const ownership: AgentOwnershipReader = {
    getOwnerPrincipalId(candidate) {
      return candidate === agentId ? owner : undefined;
    },
  };
  const service = new DecisionReceiptService(
    repository,
    {
      getAgentIdForRun(candidate) {
        return candidate === runId ? agentId : undefined;
      },
    },
    ownership,
  );
  return { repository, service };
}

function allowReceipt(): AllowDecisionReceipt {
  return {
    receiptId: "33333333-3333-4333-8333-333333333333",
    runId,
    humanPrincipalId: "user-a",
    agentId,
    resourceId: "orders-incident",
    decision: "allow",
    reason: "allowed",
    grantGeneration: 4,
    runnerStarted: true,
    createdAt: "2026-08-28T00:00:00.000Z",
  };
}

async function makeApp(service: DecisionReceiptService) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    const appError = error instanceof Error ? error : new Error(String(error));
    const status = error instanceof HttpError ? error.statusCode : 500;
    return reply.code(status).send({ error: appError.message });
  });
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/")) requireDemoPrincipal(request);
  });
  await app.register(createReceiptRoutes(service));
  return app;
}

describe("Decision Receipt service and route", () => {
  it("records an explicitly redacted Receipt and rejects duplicates", () => {
    const { repository, service } = makeReceiptService();
    const unsafe = {
      ...allowReceipt(),
      prompt: "secret prompt",
      sourcePath: "/private/protected/orders",
      token: "Bearer secret",
      session: "demo-session-a",
      resourceBody: "protected contents",
    } as AllowDecisionReceipt;

    service.add(unsafe);
    const serialized = JSON.stringify(repository.getReceiptsForRun(runId));
    for (const forbidden of [
      "secret prompt",
      "sourcePath",
      "/private/protected",
      "Bearer secret",
      "demo-session-a",
      "protected contents",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(() => service.add(allowReceipt())).toThrow("only one");
  });

  it("returns the correlated safe Receipt to the owning principal", async () => {
    const { service } = makeReceiptService();
    service.add(allowReceipt());
    const app = await makeApp(service);

    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/receipts`,
      headers: { "x-demo-session": "demo-session-a" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ receipts: [allowReceipt()] });
    await app.close();
  });

  it("keeps denied Receipt evidence queryable with nullable generation", async () => {
    const { service } = makeReceiptService();
    const denied: DenyDecisionReceipt = {
      receiptId: "44444444-4444-4444-8444-444444444444",
      runId,
      humanPrincipalId: "user-a",
      agentId,
      resourceId: "payments-incident",
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
      runnerStarted: false,
      createdAt: "2026-08-28T00:00:00.000Z",
    };
    service.add(denied);
    const app = await makeApp(service);
    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/receipts`,
      headers: { "x-demo-session": "demo-session-a" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ receipts: [denied] });
    await app.close();
  });

  it("hides a Run from another principal and rejects missing identity", async () => {
    const { service } = makeReceiptService();
    service.add(allowReceipt());
    const app = await makeApp(service);

    const crossPrincipal = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/receipts`,
      headers: { "x-demo-session": "demo-session-b" },
    });
    expect(crossPrincipal.statusCode).toBe(404);
    expect(crossPrincipal.json()).toEqual({ error: "Run not found" });

    const missingIdentity = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/receipts`,
    });
    expect(missingIdentity.statusCode).toBe(401);
    await app.close();
  });

  it("returns no Receipt for an owned baseline Run", async () => {
    const { service } = makeReceiptService();
    const app = await makeApp(service);
    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/receipts`,
      headers: { "x-demo-session": "demo-session-a" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ receipts: [] });
    await app.close();
  });
});
