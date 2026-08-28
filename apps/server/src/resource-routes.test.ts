import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { createResourceRoutes } from "./resource-routes.js";
import { JsonStore } from "./store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Resource routes", () => {
  it("lists only safe active Resources for the current principal", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-resources-http-"));
    temporaryDirectories.push(root);
    const store = new JsonStore(
      path.join(root, "db.json"),
      () => "2026-08-28T00:00:00.000Z",
    );
    await store.initialize();
    const resourceRoot = path.join(root, "protected-resources");
    const registry = new StaticResourceRegistry(resourceRoot);
    const entitlements = new PrincipalEntitlementService(store, registry);
    const app = Fastify();
    await app.register(createResourceRoutes({ registry, entitlements }));

    const response = await app.inject({
      method: "GET",
      url: "/api/resources",
      headers: { "x-demo-session": "demo-session-a" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      resources: [
        {
          id: "orders-incident",
          displayName: "Orders Incident",
          kind: "directory",
        },
      ],
    });
    expect(response.body).not.toContain(resourceRoot);
    expect(response.body).not.toContain("canonicalSourcePath");

    const otherPrincipal = await app.inject({
      method: "GET",
      url: "/api/resources",
      headers: { "x-demo-session": "demo-session-b" },
    });
    expect(otherPrincipal.statusCode).toBe(200);
    expect(otherPrincipal.json()).toEqual({
      resources: [
        {
          id: "payments-incident",
          displayName: "Payments Incident",
          kind: "directory",
        },
      ],
    });
    expect(otherPrincipal.body).not.toContain("orders-incident");
    await app.close();
  });
});
