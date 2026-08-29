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
  }) {
    return createMountPlanCompiler({
      registry: makeFakeRegistryReader(
        options?.resources ?? [ordersResource],
      ),
      entitlements: makeFakeEntitlementReader(
        options?.entitlements ?? [makeEntitlement()],
      ),
      pathValidator: new ResourcePathValidator(allowedRoot),
    });
  }

  it("rejects a revoke that lands during path validation", async () => {
    // The Entitlement is active when compilation starts and revoked while the
    // awaited realpath/stat work is in flight. Without a post-validation
    // re-check the stale decision would still yield a plan and the Runner
    // would mount a Resource whose authorization was withdrawn.
    let entitlement: PrincipalResourceEntitlement = makeEntitlement();
    const revokingValidator = new ResourcePathValidator(allowedRoot);
    const originalValidateResource =
      revokingValidator.validateResource.bind(revokingValidator);
    revokingValidator.validateResource = async (resource, registry) => {
      const result = await originalValidateResource(resource, registry);
      entitlement = makeEntitlement({
        status: "revoked",
        revokedAt: "2026-08-29T00:00:00.000Z",
      });
      return result;
    };

    const racing = createMountPlanCompiler({
      registry: makeFakeRegistryReader([ordersResource]),
      entitlements: {
        getCurrentEntitlement: () => entitlement,
      },
      pathValidator: revokingValidator,
    });

    const result = await racing.compileMountPlan(
      "run-race",
      makeAllowDecision({ resource: ordersResource }),
    );
    expect(result).toEqual({
      ok: false,
      reason: "stale_entitlement_generation",
    });
  });

  it.each([
    makeEntitlement({ principalId: "user-b" }),
    makeEntitlement({ resourceId: "payments-incident" }),
  ])(
    "rejects a post-validation Entitlement whose identity changed",
    async (mismatchedEntitlement) => {
      let reads = 0;
      const identityChanging = createMountPlanCompiler({
        registry: makeFakeRegistryReader([ordersResource]),
        entitlements: {
          getCurrentEntitlement: () => {
            reads += 1;
            return reads === 1 ? makeEntitlement() : mismatchedEntitlement;
          },
        },
        pathValidator: new ResourcePathValidator(allowedRoot),
      });

      await expect(
        identityChanging.compileMountPlan(
          "run-identity-race",
          makeAllowDecision({ resource: ordersResource }),
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "stale_entitlement_generation",
      });
    },
  );

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

  it("mounts only the delegated Resource when the principal has two Entitlements", async () => {
    const payments = path.join(allowedRoot, "payments-incident");
    await mkdir(payments);
    const paymentsResource = makeRegisteredResource({
      id: "payments-incident",
      canonicalSourcePath: payments,
    });
    const result = await compiler({
      resources: [ordersResource, paymentsResource],
      entitlements: [
        makeEntitlement(),
        makeEntitlement({ resourceId: "payments-incident" }),
      ],
    }).compileMountPlan(
      "run-one-delegation",
      makeAllowDecision({ resource: ordersResource }),
    );

    expect(result).toMatchObject({
      ok: true,
      plan: {
        resourceId: "orders-incident",
        targetPath: "/resources/orders-incident",
      },
    });
    expect(JSON.stringify(result)).not.toContain("payments-incident");
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
