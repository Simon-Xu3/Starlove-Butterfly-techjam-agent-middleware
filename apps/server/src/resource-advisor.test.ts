import Fastify from "fastify";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { ResourceAdvisor } from "./resource-advisor.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { createResourceRoutes } from "./resource-routes.js";
import { JsonStore } from "./store.js";
import type { AdvisorResource } from "./types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeAdvisor() {
  const root = await mkdtemp(path.join(tmpdir(), "launchpad-resource-advisor-"));
  temporaryDirectories.push(root);
  await Promise.all(
    ["orders-incident", "inventory-incident", "payments-incident"].map(
      (resourceId) => mkdir(path.join(root, resourceId), { recursive: true }),
    ),
  );
  const store = new JsonStore(
    path.join(root, "db.json"),
    () => "2026-08-30T00:00:00.000Z",
  );
  await store.initialize();
  const registry = new StaticResourceRegistry(root);
  const entitlements = new PrincipalEntitlementService(store, registry);
  return { advisor: new ResourceAdvisor(entitlements, registry), entitlements, store, registry };
}

describe("Resource Advisor", () => {
  it("suggests only an eligible Resource and returns safe bounded metadata", async () => {
    const { advisor, store } = await makeAdvisor();
    const before = store.snapshot();

    expect(advisor.suggest("user-a", "Investigate inventory stock mismatch")).toEqual({
      resource: {
        id: "inventory-incident",
        displayName: "Inventory Incident",
        kind: "directory",
        description:
          "Investigate stock availability and warehouse synchronization failures.",
        tags: ["inventory", "stock", "warehouse", "incident"],
      },
      matchedTerms: ["inventory", "stock"],
      reason: "tag_match",
    });
    expect(advisor.suggest("user-a", "Investigate payments")).toBeNull();
    expect(store.snapshot()).toEqual(before);
  });

  it("returns no suggestion for a zero match or equal top tag score", async () => {
    const { advisor } = await makeAdvisor();

    expect(advisor.suggest("user-a", "Tell me about deployments")).toBeNull();
    expect(advisor.suggest("user-a", "incident")).toBeNull();
  });

  it("ranks exact tags above display names above descriptions", () => {
    const resources: AdvisorResource[] = [
      {
        id: "alpha-resource",
        displayName: "Display Alpha",
        kind: "directory",
        description: "Description Alpha",
        tags: ["tag-alpha"],
      },
      {
        id: "beta-resource",
        displayName: "Other Beta",
        kind: "directory",
        description: "Description Match",
        tags: ["other"],
      },
    ];
    const advisor = new ResourceAdvisor(
      { listEligibleResourceIds: () => resources.map((resource) => resource.id) },
      {
        getAdvisorResource: (resourceId) =>
          resources.find((resource) => resource.id === resourceId),
      },
    );

    expect(advisor.suggest("user-a", "tag-alpha display description match")).toMatchObject({
      resource: { id: "alpha-resource" },
      reason: "tag_match",
    });
    expect(advisor.suggest("user-a", "display description")).toMatchObject({
      resource: { id: "alpha-resource" },
      reason: "display_name_match",
    });
    expect(advisor.suggest("user-a", "match")).toMatchObject({
      resource: { id: "beta-resource" },
      reason: "description_match",
    });
  });

  it("keeps exact normalized stop-word tags eligible", () => {
    const resource: AdvisorResource = {
      id: "the-resource",
      displayName: "Unrelated Name",
      kind: "directory",
      description: "Unrelated description",
      tags: ["the"],
    };
    const advisor = new ResourceAdvisor(
      { listEligibleResourceIds: () => [resource.id] },
      { getAdvisorResource: () => resource },
    );

    expect(advisor.suggest("user-a", "the")).toEqual({
      resource,
      matchedTerms: ["the"],
      reason: "tag_match",
    });

    const pathBearingAdvisor = {
      ...resource,
      canonicalSourcePath: "/server-owned/resources/the-resource",
    };
    // @ts-expect-error — Advisor DTOs must reject path-bearing structural objects.
    const leak: AdvisorResource = pathBearingAdvisor;
    void leak;
  });

  it("excludes a revoked Resource from advice", async () => {
    const { advisor, entitlements } = await makeAdvisor();
    await entitlements.revoke("user-a", "inventory-incident");

    expect(advisor.suggest("user-a", "inventory stock mismatch")).toBeNull();
    expect(advisor.suggest("user-b", "payments gateway")).toMatchObject({
      resource: { id: "payments-incident" },
    });
    expect(advisor.suggest("user-b", "inventory stock mismatch")).toBeNull();
  });

  it("serves principal-scoped advice over HTTP without accepting extra fields", async () => {
    const { advisor, registry, entitlements } = await makeAdvisor();
    const app = Fastify();
    app.setErrorHandler((_error, _request, reply) => {
      reply.code(400).send({ error: "Invalid request" });
    });
    await app.register(createResourceRoutes({ registry, entitlements }));
    const before = advisor.suggest("user-a", "inventory stock mismatch");

    const userA = await app.inject({
      method: "POST",
      url: "/api/resources/suggest",
      headers: { "x-demo-session": "demo-session-a" },
      payload: { content: "inventory stock mismatch" },
    });
    expect(userA.statusCode).toBe(200);
    expect(userA.body).not.toContain("canonicalSourcePath");
    expect(userA.json().suggestion.resource.id).toBe("inventory-incident");
    expect(advisor.suggest("user-a", "inventory stock mismatch")).toEqual(before);

    const extraField = await app.inject({
      method: "POST",
      url: "/api/resources/suggest",
      headers: { "x-demo-session": "demo-session-a" },
      payload: { content: "inventory stock mismatch", resourceIds: ["inventory-incident"] },
    });
    expect(extraField.statusCode).toBe(400);
    await app.close();
  });
});
