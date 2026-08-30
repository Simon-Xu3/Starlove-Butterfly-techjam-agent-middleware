import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { createEntitlementRoutes } from "./entitlement-routes.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { JsonStore } from "./store.js";

const temporaryDirectories: string[] = [];
const sessionA = { "x-demo-session": "demo-session-a" };
const json = { "content-type": "application/json" };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Entitlement routes", () => {
  it("lists, revokes, and re-grants the current principal's Entitlement", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-entitlements-http-"));
    temporaryDirectories.push(root);
    let now = "2026-08-28T01:00:00.000Z";
    const store = new JsonStore(
      path.join(root, "db.json"),
      () => "2026-08-28T00:00:00.000Z",
    );
    await store.initialize();
    const registry = new StaticResourceRegistry(path.join(root, "resources"));
    const entitlements = new PrincipalEntitlementService(
      store,
      registry,
      () => now,
    );
    const app = Fastify();
    await app.register(createEntitlementRoutes({ entitlements }));

    const listed = await app.inject({
      method: "GET",
      url: "/api/entitlements",
      headers: sessionA,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().entitlements).toEqual([
      expect.objectContaining({
        principalId: "user-a",
        resourceId: "inventory-incident",
        status: "active",
        generation: 1,
      }),
      expect.objectContaining({
        principalId: "user-a",
        resourceId: "orders-incident",
        status: "active",
        generation: 1,
      }),
    ]);

    const revoked = await app.inject({
      method: "POST",
      url: "/api/entitlements/revoke",
      headers: { ...json, ...sessionA },
      payload: { resourceId: "orders-incident" },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().entitlement).toMatchObject({
      status: "revoked",
      generation: 1,
      revokedAt: "2026-08-28T01:00:00.000Z",
    });

    now = "2026-08-28T02:00:00.000Z";
    const regranted = await app.inject({
      method: "POST",
      url: "/api/entitlements/grant",
      headers: { ...json, ...sessionA },
      payload: { resourceId: "orders-incident" },
    });
    expect(regranted.statusCode).toBe(200);
    expect(regranted.json().entitlement).toMatchObject({
      status: "active",
      generation: 2,
      createdAt: "2026-08-28T02:00:00.000Z",
      revokedAt: null,
    });

    const current = await app.inject({
      method: "GET",
      url: "/api/entitlements",
      headers: sessionA,
    });
    expect(current.json().entitlements).toEqual([
      expect.objectContaining({
        resourceId: "inventory-incident",
        status: "active",
        generation: 1,
      }),
      expect.objectContaining({ status: "active", generation: 2 }),
    ]);
    const otherPrincipal = await app.inject({
      method: "GET",
      url: "/api/entitlements",
      headers: { "x-demo-session": "demo-session-b" },
    });
    expect(otherPrincipal.json().entitlements).toEqual([
      expect.objectContaining({
        principalId: "user-b",
        resourceId: "payments-incident",
        status: "active",
        generation: 1,
      }),
    ]);
    expect(store.snapshot().entitlements).toHaveLength(4);
    await app.close();
  });

  it("rejects body-supplied identity and policy expansion", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-entitlements-http-"));
    temporaryDirectories.push(root);
    const store = new JsonStore(path.join(root, "db.json"));
    await store.initialize();
    const registry = new StaticResourceRegistry(path.join(root, "resources"));
    const entitlements = new PrincipalEntitlementService(store, registry);
    const app = Fastify();
    await app.register(createEntitlementRoutes({ entitlements }));
    const before = store.snapshot().entitlements;

    const missingSession = await app.inject({
      method: "POST",
      url: "/api/entitlements/grant",
      headers: json,
      payload: { resourceId: "orders-incident" },
    });
    expect(missingSession.statusCode).toBe(401);

    const unknownSession = await app.inject({
      method: "POST",
      url: "/api/entitlements/grant",
      headers: { ...json, "x-demo-session": "not-a-demo-session" },
      payload: { resourceId: "orders-incident" },
    });
    expect(unknownSession.statusCode).toBe(401);

    const selfAsserted = await app.inject({
      method: "POST",
      url: "/api/entitlements/grant",
      headers: { ...json, ...sessionA },
      payload: { resourceId: "orders-incident", principalId: "user-b" },
    });
    expect(selfAsserted.statusCode).toBe(400);

    const expanded = await app.inject({
      method: "POST",
      url: "/api/entitlements/grant",
      headers: { ...json, ...sessionA },
      payload: { resourceId: "payments-incident" },
    });
    expect(expanded.statusCode).toBe(404);
    expect(
      entitlements.getCurrentEntitlement("user-a", "payments-incident"),
    ).toBeUndefined();
    expect(store.snapshot().entitlements).toEqual(before);
    await app.close();
  });
});
