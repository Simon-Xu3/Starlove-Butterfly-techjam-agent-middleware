import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makeAllowDecision,
  makeEntitlement,
  makeFakeEntitlementReader,
  makeFakeRegistryReader,
  makeRegisteredResource,
} from "./capsule-test-support.js";
import { createMountPlanCompiler } from "./mount-plan-compiler.js";
import { ResourcePathValidator } from "./resource-path-validator.js";
import type {
  PrincipalResourceEntitlement,
  RegisteredResource,
} from "./types.js";

describe("mount-plan compiler", () => {
  let scratch: string;
  let allowedRoot: string;
  let orders: string;
  let ordersResource: RegisteredResource;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "scopedrun-plan-"));
    allowedRoot = path.join(scratch, "resources");
    orders = path.join(allowedRoot, "orders-incident");
    await mkdir(orders, { recursive: true });
    ordersResource = makeRegisteredResource({
      canonicalSourcePath: orders,
    });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  function compiler(options?: {
    resources?: RegisteredResource[];
    entitlements?: PrincipalResourceEntitlement[];
    reservedMountTargets?: readonly string[];
  }) {
    return createMountPlanCompiler({
      registry: makeFakeRegistryReader(
        options?.resources ?? [ordersResource],
      ),
      entitlements: makeFakeEntitlementReader(
        options?.entitlements ?? [makeEntitlement()],
      ),
      pathValidator: new ResourcePathValidator(allowedRoot),
      ...(options?.reservedMountTargets
        ? { reservedMountTargets: options.reservedMountTargets }
        : {}),
    });
  }

  it("produces the frozen readonly plan with a server-generated target", async () => {
    const result = await compiler().compileMountPlan(
      "run-1",
      makeAllowDecision({ resource: ordersResource }),
    );

    expect(result).toEqual({
      ok: true,
      plan: {
        runId: "run-1",
        agentId: "agent-a",
        resourceId: "orders-incident",
        sourcePath: await realpath(orders),
        targetPath: "/resources/orders-incident",
        readOnly: true,
        grantGeneration: 1,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.plan)).toBe(true);
      expect(Reflect.set(result.plan, "targetPath", "/workspace")).toBe(false);
    }
  });

  it("rejects revoked, missing, changed, and invalid Entitlement generations", async () => {
    const staleEntitlements: PrincipalResourceEntitlement[][] = [
      [],
      [makeEntitlement({ status: "revoked" })],
      [makeEntitlement({ generation: 2 })],
      [makeEntitlement({ generation: 0 })],
    ];
    for (const entitlements of staleEntitlements) {
      await expect(
        compiler({ entitlements }).compileMountPlan(
          "run-1",
          makeAllowDecision({ resource: ordersResource }),
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "stale_entitlement_generation",
      });
    }
  });

  it("rejects a Registry entry changed after authorization", async () => {
    const moved = path.join(allowedRoot, "moved-orders");
    await mkdir(moved);
    const current = makeRegisteredResource({ canonicalSourcePath: moved });

    await expect(
      compiler({ resources: [current] }).compileMountPlan(
        "run-1",
        makeAllowDecision({ resource: ordersResource }),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_resource_path" });
  });

  it("rejects overlap and symlink/path failures without leaking details", async () => {
    const nested = path.join(orders, "nested");
    await mkdir(nested);
    const overlapping = makeRegisteredResource({
      id: "nested-orders",
      canonicalSourcePath: nested,
    });
    const result = await compiler({
      resources: [ordersResource, overlapping],
    }).compileMountPlan(
      "run-1",
      makeAllowDecision({ resource: ordersResource }),
    );

    expect(result).toEqual({ ok: false, reason: "invalid_resource_path" });
    expect(JSON.stringify(result)).not.toContain(scratch);
  });

  it("rejects collisions with every configured Runtime mount target", async () => {
    await expect(
      compiler({
        reservedMountTargets: [
          "/workspace",
          "/codex-home",
          "/resources/orders-incident",
        ],
      }).compileMountPlan(
        "run-1",
        makeAllowDecision({ resource: ordersResource }),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_resource_path" });
  });

  it("fails closed for malformed decisions and never accepts a decision path", async () => {
    const outside = path.join(scratch, "client-controlled");
    await mkdir(outside);
    const clientResource = makeRegisteredResource({
      canonicalSourcePath: outside,
    });

    await expect(
      compiler().compileMountPlan(
        "run-1",
        makeAllowDecision({ resource: clientResource }),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_resource_path" });

    await expect(
      compiler().compileMountPlan(
        "",
        makeAllowDecision({ resource: ordersResource }),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_resource_path" });
  });
});
