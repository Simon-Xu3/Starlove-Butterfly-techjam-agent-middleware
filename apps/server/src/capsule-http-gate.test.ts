// Issue #8 Day 1 gate suite: the four formal Capsule scenarios exercised
// over HTTP against the REAL composition exactly as index.ts wires it —
// real Registry, Entitlements, authorizer, mount-plan compiler (real path
// validation against the repo fixtures), and the persisted Receipt service.
// Only the Runtime seam uses the deterministic fake capsule runner, which
// the gate ticket explicitly retains for denial and Runner-zero evidence.
// Also covers the approved product-model comment on #8: the full user
// journey (safe metadata -> explicit delegation -> server recheck -> only
// that Resource mounted) with a negative assertion that nothing beyond the
// delegated Resource reaches the Runtime seam.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service.js";
import { createApp } from "./app.js";
import { makeFakeCapsuleRunner } from "./capsule-test-support.js";
import { loadConfig } from "./config.js";
import { createStoreOwnershipReader } from "./demo-principal.js";
import { createEntitlementRoutes } from "./entitlement-routes.js";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { createMountPlanCompiler } from "./mount-plan-compiler.js";
import {
  StoreReceiptRepository,
  createStoreRunReader,
} from "./receipt-repository.js";
import { createReceiptRoutes } from "./receipt-routes.js";
import { DecisionReceiptService } from "./receipt-service.js";
import { createResourceAuthorizer } from "./resource-authorizer.js";
import { ResourcePathValidator } from "./resource-path-validator.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { createResourceRoutes } from "./resource-routes.js";
import { JsonStore } from "./store.js";
import { WorkspaceManager } from "./workspace.js";
import type { DatabaseV2 } from "./types.js";

const sessionA = { "x-demo-session": "demo-session-a" };
const json = { "content-type": "application/json" };

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeGateApp(
  runtimeProvider: "container" | "local-process",
  storeFactory?: (filePath: string) => JsonStore,
) {
  const root = await mkdtemp(path.join(tmpdir(), "gate-"));
  temporaryDirectories.push(root);
  const config = loadConfig({
    NODE_ENV: "test",
    APP_DATA_DIR: path.join(root, "data"),
    AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"),
    CODEX_HOME: path.join(root, "codex"),
    ARK_API_KEY: "test-key",
    ARK_MODEL: "ep-test",
    RUNTIME_PROVIDER: runtimeProvider,
    // RESOURCE_ROOT deliberately unset: the real default (the committed
    // fixtures/resources directory) is what production validates against.
  });
  const storePath = path.join(root, "data", "db.json");
  const store = storeFactory?.(storePath) ?? new JsonStore(storePath);
  const registry = new StaticResourceRegistry(config.resourceRoot);
  const entitlements = new PrincipalEntitlementService(store, registry);
  const receipts = new DecisionReceiptService(
    new StoreReceiptRepository(store),
    createStoreRunReader(store),
    createStoreOwnershipReader(store),
  );
  const runner = makeFakeCapsuleRunner();
  const service = new AgentService(
    config,
    store,
    new WorkspaceManager(path.join(root, "workspaces")),
    runner,
    {
      authorizer: createResourceAuthorizer({
        ownership: createStoreOwnershipReader(store),
        registry,
        entitlements,
      }),
      mountPlanCompiler: createMountPlanCompiler({
        registry,
        entitlements,
        pathValidator: new ResourcePathValidator(config.resourceRoot),
      }),
      entitlements,
      receipts,
    },
  );
  await service.initialize();
  const app = await createApp(config, service);
  await app.register(createResourceRoutes({ registry, entitlements }));
  await app.register(createEntitlementRoutes({ entitlements }));
  await app.register(createReceiptRoutes(receipts));
  const drain = () => store.mutate(() => {});
  return { app, service, runner, drain };
}

type GateApp = Awaited<ReturnType<typeof makeGateApp>>;

async function createAgent(gate: GateApp): Promise<string> {
  const response = await gate.app.inject({
    method: "POST",
    url: "/api/agents",
    headers: { ...json, ...sessionA },
    payload: JSON.stringify({ name: "Gate Agent" }),
  });
  expect(response.statusCode).toBe(201);
  return response.json().agent.id;
}

function sendCapsule(gate: GateApp, agentId: string, resourceId: string) {
  return gate.app.inject({
    method: "POST",
    url: "/api/agents/" + agentId + "/messages",
    headers: { ...json, ...sessionA },
    payload: JSON.stringify({ content: "analyse", resourceIds: [resourceId] }),
  });
}

describe("Day 1 gate: four formal scenarios over HTTP, real composition", () => {
  it("walks the approved user journey and mounts only the delegated Resource", async () => {
    const gate = await makeGateApp("container");
    const agentId = await createAgent(gate);

    // (1) The user sees only eligible safe metadata — no host paths.
    const listed = await gate.app.inject({
      method: "GET",
      url: "/api/resources",
      headers: sessionA,
    });
    expect(listed.statusCode).toBe(200);
    const resources = listed.json().resources;
    expect(resources.map((r: { id: string }) => r.id)).toEqual([
      "orders-incident",
    ]);
    expect(listed.body).not.toContain("canonicalSourcePath");

    // (2) Explicit delegation of exactly that Resource; (3) the server
    // rechecks and admits.
    const allowed = await sendCapsule(gate, agentId, "orders-incident");
    expect(allowed.statusCode).toBe(202);
    const runId = allowed.json().run.id;

    await expect
      .poll(() => gate.service.getRun(runId, "user-a").status)
      .toBe("completed");

    // (4) Only the delegated Resource crossed the Runtime seam — exactly
    // one call, one plan, readonly, the generated target, and (negative
    // assertion) nothing else from the Registry.
    expect(gate.runner.calls).toHaveLength(1);
    const plan = gate.runner.calls[0]?.validatedMountPlan;
    expect(plan).toMatchObject({
      resourceId: "orders-incident",
      targetPath: "/resources/orders-incident",
      readOnly: true,
      grantGeneration: 1,
      runId,
    });
    expect(JSON.stringify(plan)).not.toContain("payments-incident");

    // Evidence seam: exactly one allow receipt, safe fields only.
    const receipts = await gate.app.inject({
      method: "GET",
      url: "/api/runs/" + runId + "/receipts",
      headers: sessionA,
    });
    expect(receipts.statusCode).toBe(200);
    expect(receipts.json().receipts).toHaveLength(1);
    expect(receipts.json().receipts[0]).toMatchObject({
      decision: "allow",
      reason: "allowed",
      runnerStarted: true,
      grantGeneration: 1,
    });
    expect(receipts.body).not.toContain("sourcePath");

    await gate.drain();
    await gate.app.close();
  });

  it("denies an unentitled delegation before the Runtime with a receipt", async () => {
    const gate = await makeGateApp("container");
    const agentId = await createAgent(gate);

    const denied = await sendCapsule(gate, agentId, "payments-incident");
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({
      status: "denied",
      reason: "entitlement_missing",
    });
    expect(gate.runner.calls).toHaveLength(0);
    expect(gate.service.getRun(denied.json().runId, "user-a").status).toBe(
      "denied",
    );

    const receipts = await gate.app.inject({
      method: "GET",
      url: "/api/runs/" + denied.json().runId + "/receipts",
      headers: sessionA,
    });
    expect(receipts.json().receipts[0]).toMatchObject({
      decision: "deny",
      reason: "entitlement_missing",
      runnerStarted: false,
    });

    await gate.drain();
    await gate.app.close();
  });

  it("revoke over HTTP has prospective effect and keeps history auditable", async () => {
    const gate = await makeGateApp("container");
    const agentId = await createAgent(gate);

    const allowed = await sendCapsule(gate, agentId, "orders-incident");
    expect(allowed.statusCode).toBe(202);
    const allowedRunId = allowed.json().run.id;
    await expect
      .poll(() => gate.service.getRun(allowedRunId, "user-a").status)
      .toBe("completed");

    const revoked = await gate.app.inject({
      method: "POST",
      url: "/api/entitlements/revoke",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ resourceId: "orders-incident" }),
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().entitlement.status).toBe("revoked");

    const afterRevoke = await sendCapsule(gate, agentId, "orders-incident");
    expect(afterRevoke.statusCode).toBe(403);
    expect(afterRevoke.json().reason).toBe("entitlement_revoked");
    // Still exactly the one pre-revoke Runner call.
    expect(gate.runner.calls).toHaveLength(1);

    // Historical receipts remain after revocation.
    const history = await gate.app.inject({
      method: "GET",
      url: "/api/runs/" + allowedRunId + "/receipts",
      headers: sessionA,
    });
    expect(history.json().receipts[0]).toMatchObject({ decision: "allow" });

    await gate.drain();
    await gate.app.close();
  });

  it("does not start the Runner when revoke completes after Run persistence", async () => {
    let runningMutationReached!: () => void;
    const reachedRunningMutation = new Promise<void>((resolve) => {
      runningMutationReached = resolve;
    });
    let releaseRunningMutation!: () => void;
    const runningMutationReleased = new Promise<void>((resolve) => {
      releaseRunningMutation = resolve;
    });
    class PauseAfterRunningStore extends JsonStore {
      private paused = false;
      lateDenialFailures = 0;

      override async mutate<T>(
        mutation: (database: DatabaseV2) => T | Promise<T>,
      ): Promise<T> {
        const result = await super.mutate(mutation);
        if (
          !this.paused &&
          this.snapshot().runs.some((run) => run.status === "running")
        ) {
          this.paused = true;
          runningMutationReached();
          await runningMutationReleased;
        }
        return result;
      }

      protected override async persist(data?: DatabaseV2): Promise<void> {
        const currentReceipt = this.snapshot().receipts[0];
        const nextReceipt = data?.receipts[0];
        if (
          this.lateDenialFailures === 0 &&
          currentReceipt?.decision === "allow" &&
          nextReceipt?.decision === "deny" &&
          nextReceipt.reason === "stale_entitlement_generation"
        ) {
          this.lateDenialFailures += 1;
          throw new Error("simulated one-shot late denial fault");
        }
        await super.persist(data);
      }
    }

    let store!: PauseAfterRunningStore;
    const gate = await makeGateApp(
      "container",
      (filePath) => {
        store = new PauseAfterRunningStore(filePath);
        return store;
      },
    );
    const agentId = await createAgent(gate);

    const sending = sendCapsule(gate, agentId, "orders-incident");
    await reachedRunningMutation;
    const revoked = await gate.app.inject({
      method: "POST",
      url: "/api/entitlements/revoke",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ resourceId: "orders-incident" }),
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().entitlement.status).toBe("revoked");
    releaseRunningMutation();

    const accepted = await sending;
    expect(accepted.statusCode).toBe(202);
    const runId = accepted.json().run.id;
    await expect
      .poll(() => gate.service.getRun(runId, "user-a").status)
      .toBe("denied");
    expect(store.lateDenialFailures).toBe(1);
    expect(gate.runner.calls).toHaveLength(0);

    const evidence = await gate.app.inject({
      method: "GET",
      url: "/api/runs/" + runId + "/receipts",
      headers: sessionA,
    });
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json().receipts).toEqual([
      expect.objectContaining({
        decision: "deny",
        reason: "stale_entitlement_generation",
        runnerStarted: false,
      }),
    ]);

    await gate.drain();
    await gate.app.close();
  });

  it("denies a Capsule Run under local-process with zero Runner calls", async () => {
    const gate = await makeGateApp("local-process");
    const agentId = await createAgent(gate);

    const denied = await sendCapsule(gate, agentId, "orders-incident");
    expect(denied.statusCode).toBe(403);
    expect(denied.json().reason).toBe("runtime_profile_unsupported");
    expect(gate.runner.calls).toHaveLength(0);

    // Baseline keeps working on the same profile, with no Capsule receipt.
    const baseline = await gate.app.inject({
      method: "POST",
      url: "/api/agents/" + agentId + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ content: "hello baseline" }),
    });
    expect(baseline.statusCode).toBe(202);
    const baselineRunId = baseline.json().run.id;
    await expect
      .poll(() => gate.service.getRun(baselineRunId, "user-a").status)
      .toBe("completed");
    const receipts = await gate.app.inject({
      method: "GET",
      url: "/api/runs/" + baselineRunId + "/receipts",
      headers: sessionA,
    });
    expect(receipts.json().receipts).toHaveLength(0);

    await gate.drain();
    await gate.app.close();
  });
});
