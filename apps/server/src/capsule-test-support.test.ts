import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURES_ROOT,
  captureFixtureBaseline,
  makeAgentRun,
  makeAllowDecision,
  makeDecisionReceipt,
  makeDenyDecision,
  makeFakeAuthorizer,
  makeFakeCapsuleRunner,
  makeFakeMountPlanCompiler,
  makeHumanPrincipal,
  makeMountPlan,
} from "./capsule-test-support.js";
import {
  DEMO_ENTITLEMENT_MATRIX,
  DEMO_SESSION_PRINCIPALS,
  type DeniedRunResponse,
  type RunStatus,
  type SendMessageBody,
} from "./types.js";

interface BaselineManifest {
  resources: Record<
    string,
    { files: Array<{ path: string; bytes: number; sha256: string }> }
  >;
}

const loadManifest = async (): Promise<BaselineManifest> =>
  JSON.parse(
    await readFile(path.join(FIXTURES_ROOT, "baseline-manifest.json"), "utf8"),
  ) as BaselineManifest;

describe("frozen Capsule contracts", () => {
  it("keeps the baseline message request valid without resourceIds", () => {
    const baseline: SendMessageBody = { content: "hello" };
    const capsule: SendMessageBody = {
      content: "hello",
      resourceIds: ["orders-incident"],
    };
    expect(baseline.resourceIds).toBeUndefined();
    expect(capsule.resourceIds).toHaveLength(1);

    const denied: RunStatus = "denied";
    expect(denied).toBe("denied");
  });

  it("maps the two demo sessions and freezes the Entitlement matrix", () => {
    expect(DEMO_SESSION_PRINCIPALS["demo-session-a"]).toBe("user-a");
    expect(DEMO_SESSION_PRINCIPALS["demo-session-b"]).toBe("user-b");
    expect(DEMO_ENTITLEMENT_MATRIX).toEqual([
      { principalId: "user-a", resourceId: "orders-incident" },
      { principalId: "user-b", resourceId: "payments-incident" },
    ]);
  });

  it("serializes denied responses and Receipts without secrets or host paths", () => {
    const receipt = makeDecisionReceipt({
      decision: "deny",
      reason: "entitlement_missing",
      resourceId: "payments-incident",
      grantGeneration: null,
      runnerStarted: false,
    });
    const denied: DeniedRunResponse = {
      runId: receipt.runId,
      receiptId: receipt.receiptId,
      status: "denied",
      reason: "entitlement_missing",
    };
    const serialized = JSON.stringify({ receipt, denied });
    for (const forbidden of [
      "sourcePath",
      "canonicalSourcePath",
      "fixtures/resources",
      path.sep + "Users" + path.sep,
      "demo-session",
      "Bearer",
      "prompt",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(receipt.runnerStarted).toBe(false);
    expect(receipt.grantGeneration).toBeNull();
  });

  it("keeps the mount plan readonly with a generated /resources target", () => {
    const plan = makeMountPlan();
    expect(plan.readOnly).toBe(true);
    expect(plan.targetPath).toBe("/resources/" + plan.resourceId);
  });
});

describe("fake seam factories", () => {
  it("records authorizer and compiler calls with their inputs", async () => {
    const authorizer = makeFakeAuthorizer(makeDenyDecision());
    const decision = await authorizer.authorizeResources(
      makeHumanPrincipal(),
      "agent-a",
      ["payments-incident"],
    );
    expect(decision.decision).toBe("deny");
    expect(authorizer.calls).toHaveLength(1);
    expect(authorizer.calls[0]?.resourceIds).toEqual(["payments-incident"]);

    const compiler = makeFakeMountPlanCompiler({
      ok: false,
      reason: "invalid_resource_path",
    });
    const result = await compiler.compileMountPlan("run-1", makeAllowDecision());
    expect(result.ok).toBe(false);
    expect(compiler.calls).toHaveLength(1);
  });

  it("proves Runner call count stays zero when the Runner is never invoked", async () => {
    const runner = makeFakeCapsuleRunner();
    expect(runner.calls).toHaveLength(0);

    const run = makeAgentRun();
    await runner.run(
      {
        agentId: run.agentId,
        workspacePath: "/tmp/demo-workspace",
        prompt: run.prompt,
        threadId: null,
      },
      makeMountPlan({ runId: run.id }),
    );
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.validatedMountPlan?.readOnly).toBe(true);
  });
});

describe("fixture baselines", () => {
  it("matches the committed manifest hashes exactly", async () => {
    const manifest = await loadManifest();
    const resourceIds = Object.keys(manifest.resources).sort();
    expect(resourceIds).toEqual(["orders-incident", "payments-incident"]);

    for (const resourceId of resourceIds) {
      const captured = await captureFixtureBaseline(
        path.join(FIXTURES_ROOT, resourceId),
      );
      const recorded = manifest.resources[resourceId]?.files ?? [];
      expect(captured.map((file) => file.path)).toEqual(
        recorded.map((file) => file.path),
      );
      for (const [index, file] of captured.entries()) {
        expect(file.sha256).toBe(recorded[index]?.sha256);
        expect(file.bytes).toBe(recorded[index]?.bytes);
      }
    }
  });

  it("records hash and modification-time baselines independently", async () => {
    const first = await captureFixtureBaseline(
      path.join(FIXTURES_ROOT, "orders-incident"),
    );
    const second = await captureFixtureBaseline(
      path.join(FIXTURES_ROOT, "orders-incident"),
    );
    expect(first.length).toBeGreaterThan(0);
    for (const [index, file] of first.entries()) {
      expect(typeof file.mtimeMs).toBe("number");
      expect(file.sha256).toBe(second[index]?.sha256);
      expect(file.mtimeMs).toBe(second[index]?.mtimeMs);
    }
  });
});
