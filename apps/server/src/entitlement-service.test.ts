import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { JsonStore } from "./store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeService(clock: () => string = () => "2026-08-28T01:00:00.000Z") {
  const root = await mkdtemp(path.join(tmpdir(), "launchpad-entitlements-"));
  temporaryDirectories.push(root);
  const filePath = path.join(root, "db.json");
  const store = new JsonStore(
    filePath,
    () => "2026-08-28T00:00:00.000Z",
  );
  await store.initialize();
  const registry = new StaticResourceRegistry(path.join(root, "resources"));
  const service = new PrincipalEntitlementService(store, registry, clock);
  return { service, store, registry, filePath };
}

describe("PrincipalEntitlementService", () => {
  it("returns only the current Entitlements for the requested principal", async () => {
    const { service } = await makeService();

    expect(service.listEntitlements("user-a")).toEqual([
      {
        principalId: "user-a",
        resourceId: "orders-incident",
        permission: "read",
        status: "active",
        generation: 1,
        createdAt: "2026-08-28T00:00:00.000Z",
        revokedAt: null,
      },
    ]);
    expect(
      service.getCurrentEntitlement("user-b", "payments-incident"),
    ).toMatchObject({ status: "active", generation: 1 });
    expect(
      service.getCurrentEntitlement("user-a", "payments-incident"),
    ).toBeUndefined();
  });

  it("projects only the safe Entitlement fields", async () => {
    const { store, registry } = await makeService();
    const unsafeSnapshot = store.snapshot();
    Object.assign(unsafeSnapshot.entitlements[0]!, {
      canonicalSourcePath: "/server-owned/resources/orders-incident",
      internalNote: "must not leave the service boundary",
    });
    const unsafeReader = {
      snapshot: () => structuredClone(unsafeSnapshot),
    } as JsonStore;
    const service = new PrincipalEntitlementService(unsafeReader, registry);

    const [entitlement] = service.listEntitlements("user-a");

    expect(entitlement).toEqual({
      principalId: "user-a",
      resourceId: "orders-incident",
      permission: "read",
      status: "active",
      generation: 1,
      createdAt: "2026-08-28T00:00:00.000Z",
      revokedAt: null,
    });
    expect(entitlement).not.toHaveProperty("canonicalSourcePath");
    expect(entitlement).not.toHaveProperty("internalNote");
  });

  it("revokes the current Entitlement without changing its generation", async () => {
    const { service, store } = await makeService();

    const revoked = await service.revoke("user-a", "orders-incident");

    expect(revoked).toMatchObject({
      principalId: "user-a",
      resourceId: "orders-incident",
      status: "revoked",
      generation: 1,
      revokedAt: "2026-08-28T01:00:00.000Z",
    });
    expect(store.snapshot().entitlements).toContainEqual(revoked);
    expect(
      service.getCurrentEntitlement("user-b", "payments-incident"),
    ).toMatchObject({ status: "active", generation: 1 });
  });

  it("re-grants with a newer generation and preserves the revoked history", async () => {
    let now = "2026-08-28T01:00:00.000Z";
    const { service, store } = await makeService(() => now);
    await service.revoke("user-a", "orders-incident");
    now = "2026-08-28T02:00:00.000Z";

    const regranted = await service.grant("user-a", "orders-incident");

    expect(regranted).toEqual({
      principalId: "user-a",
      resourceId: "orders-incident",
      permission: "read",
      status: "active",
      generation: 2,
      createdAt: "2026-08-28T02:00:00.000Z",
      revokedAt: null,
    });
    expect(
      store.snapshot().entitlements.filter(
        (entitlement) =>
          entitlement.principalId === "user-a" &&
          entitlement.resourceId === "orders-incident",
      ),
    ).toEqual([
      expect.objectContaining({
        status: "revoked",
        generation: 1,
        revokedAt: "2026-08-28T01:00:00.000Z",
      }),
      regranted,
    ]);
    expect(
      service.getCurrentEntitlement("user-a", "orders-incident"),
    ).toEqual(regranted);
  });

  it("preserves revoke and re-grant history across a restart", async () => {
    let now = "2026-08-28T01:00:00.000Z";
    const { service, store, filePath } = await makeService(() => now);
    await service.revoke("user-a", "orders-incident");
    now = "2026-08-28T02:00:00.000Z";
    await service.grant("user-a", "orders-incident");
    const beforeRestart = store.snapshot();

    const restarted = new JsonStore(
      filePath,
      () => "2026-08-28T03:00:00.000Z",
    );
    await restarted.initialize();

    expect(restarted.snapshot()).toEqual(beforeRestart);
    expect(
      restarted.snapshot().entitlements.filter(
        (entitlement) =>
          entitlement.principalId === "user-a" &&
          entitlement.resourceId === "orders-incident",
      ),
    ).toEqual([
      expect.objectContaining({ status: "revoked", generation: 1 }),
      expect.objectContaining({ status: "active", generation: 2 }),
    ]);
  });

  it("serializes concurrent re-grant attempts to one newer generation", async () => {
    const { service, store } = await makeService();
    await service.revoke("user-a", "orders-incident");

    const [first, second] = await Promise.all([
      service.grant("user-a", "orders-incident"),
      service.grant("user-a", "orders-incident"),
    ]);

    expect(first).toMatchObject({ status: "active", generation: 2 });
    expect(second).toEqual(first);
    expect(
      store.snapshot().entitlements.filter(
        (entitlement) =>
          entitlement.principalId === "user-a" &&
          entitlement.resourceId === "orders-incident",
      ),
    ).toHaveLength(2);
  });
});
