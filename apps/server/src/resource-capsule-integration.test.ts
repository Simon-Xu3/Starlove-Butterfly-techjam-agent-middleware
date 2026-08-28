import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReadonlyResourceMount } from "./container-codex-runner.js";
import { createStoreOwnershipReader } from "./demo-principal.js";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { createMountPlanCompiler } from "./mount-plan-compiler.js";
import { createResourceAuthorizer } from "./resource-authorizer.js";
import { ResourcePathValidator } from "./resource-path-validator.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { JsonStore } from "./store.js";
import type { HumanPrincipal } from "./types.js";

const principal: HumanPrincipal = {
  id: "user-a",
  displayName: "Demo User A",
};

describe("P2/P3/P4 Resource Capsule integration", () => {
  let scratch: string;
  let resourceRoot: string;
  let store: JsonStore;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "scopedrun-integration-"));
    resourceRoot = path.join(scratch, "resources");
    await mkdir(path.join(resourceRoot, "orders-incident"), {
      recursive: true,
    });
    await mkdir(path.join(resourceRoot, "payments-incident"));

    store = new JsonStore(path.join(scratch, "launchpad.json"), () =>
      "2026-08-28T00:00:00.000Z"
    );
    await store.initialize();
    await store.mutate((database) => {
      database.agents.push({
        id: "agent-a",
        name: "Agent A",
        description: "",
        instructions: "",
        status: "ready",
        workspacePath: path.join(scratch, "workspace"),
        codexThreadId: null,
        lastError: null,
        ownerPrincipalId: "user-a",
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      });
    });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("authorizes, compiles, hands off readonly, and detects revoke", async () => {
    const registry = new StaticResourceRegistry(resourceRoot);
    const entitlements = new PrincipalEntitlementService(store, registry);
    const authorizer = createResourceAuthorizer({
      ownership: createStoreOwnershipReader(store),
      registry,
      entitlements,
    });
    const compiler = createMountPlanCompiler({
      registry,
      entitlements,
      pathValidator: new ResourcePathValidator(resourceRoot),
    });

    const decision = await authorizer.authorizeResources(
      principal,
      "agent-a",
      ["orders-incident"],
    );
    expect(decision).toMatchObject({
      decision: "allow",
      grantGeneration: 1,
    });
    if (decision.decision !== "allow") {
      throw new Error("Expected the seeded orders Entitlement to allow");
    }

    const compiled = await compiler.compileMountPlan("run-1", decision);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error("Expected a validated mount plan");
    expect(compiled.plan).toMatchObject({
      sourcePath: await realpath(
        path.join(resourceRoot, "orders-incident"),
      ),
      targetPath: "/resources/orders-incident",
      readOnly: true,
      grantGeneration: 1,
    });
    expect(buildReadonlyResourceMount(compiled.plan)).toBe(
      "type=bind,src=" +
        compiled.plan.sourcePath +
        ",dst=/resources/orders-incident,readonly",
    );

    await entitlements.revoke("user-a", "orders-incident");
    await expect(
      compiler.compileMountPlan("run-2", decision),
    ).resolves.toEqual({
      ok: false,
      reason: "stale_entitlement_generation",
    });
    await expect(
      authorizer.authorizeResources(principal, "agent-a", [
        "orders-incident",
      ]),
    ).resolves.toMatchObject({
      decision: "deny",
      reason: "entitlement_revoked",
      grantGeneration: 1,
    });
  });

  it("does not turn a different registered Resource into an Entitlement", async () => {
    const registry = new StaticResourceRegistry(resourceRoot);
    const entitlements = new PrincipalEntitlementService(store, registry);
    const authorizer = createResourceAuthorizer({
      ownership: createStoreOwnershipReader(store),
      registry,
      entitlements,
    });

    await expect(
      authorizer.authorizeResources(principal, "agent-a", [
        "payments-incident",
      ]),
    ).resolves.toMatchObject({
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
    });
  });
});
