import { appendFile, cp, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURES_ROOT,
  captureFixtureBaseline,
  makeAgentRun,
  makeAllowDecision,
  makeDeniedDecisionReceipt,
  makeDenyDecision,
  makeFakeAuthorizer,
  makeFakeCapsuleRunner,
  makeFakeMountPlanCompiler,
  makeHumanPrincipal,
  makeMountPlan,
  makeRegisteredResource,
} from "./capsule-test-support.js";
import {
  DEMO_ENTITLEMENT_MATRIX,
  DEMO_SESSION_PRINCIPALS,
  isCapsuleCapableRunner,
  RESOURCE_TARGET_PREFIX,
  resolveDemoPrincipalId,
  toProtectedResource,
  type AgentRunner,
  type DeniedRunResponse,
  type ProtectedResource,
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
    expect(resolveDemoPrincipalId("demo-session-a")).toBe("user-a");
    expect(resolveDemoPrincipalId("demo-session-b")).toBe("user-b");
    expect(resolveDemoPrincipalId("demo-session-c")).toBeUndefined();
    expect(resolveDemoPrincipalId(undefined)).toBeUndefined();
    for (const prototypeKey of ["constructor", "__proto__", "toString"]) {
      expect(resolveDemoPrincipalId(prototypeKey)).toBeUndefined();
      expect(DEMO_SESSION_PRINCIPALS[prototypeKey]).toBeUndefined();
    }
    expect(DEMO_ENTITLEMENT_MATRIX).toEqual([
      { principalId: "user-a", resourceId: "orders-incident" },
      { principalId: "user-b", resourceId: "payments-incident" },
    ]);
  });

  // Pins the frozen shape only: it catches a leaky field added to the type
  // or factory. The admission tests (Issue #3) must reuse this forbidden
  // list against real /api responses, where actual leaks would show up.
  it("pins denied response and Receipt shapes to safe fields only", () => {
    const receipt = makeDeniedDecisionReceipt();
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

  it("strips the host path when converting a Registry entry for clients", () => {
    const safe = toProtectedResource(makeRegisteredResource());
    expect(JSON.stringify(safe)).not.toContain("canonicalSourcePath");
    expect(Object.keys(safe).sort()).toEqual(["displayName", "id", "kind"]);

    // @ts-expect-error — the never-brand must keep a Registry entry from
    // being assignable to client metadata (tsc fails if this ever compiles).
    const leak: ProtectedResource = makeRegisteredResource();
    void leak;
  });

  it("keeps the mount plan readonly with a generated /resources target", () => {
    const plan = makeMountPlan();
    expect(plan.readOnly).toBe(true);
    expect(plan.targetPath).toBe(RESOURCE_TARGET_PREFIX + plan.resourceId);

    // Identity overrides keep source and target consistent with the new id.
    const other = makeMountPlan({ resourceId: "payments-incident" });
    expect(other.targetPath).toBe(RESOURCE_TARGET_PREFIX + "payments-incident");
    expect(other.sourcePath.endsWith("payments-incident")).toBe(true);
    const resource = makeRegisteredResource({ id: "payments-incident" });
    expect(resource.canonicalSourcePath.endsWith("payments-incident")).toBe(true);
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

    // The frozen precondition: exactly one id, everything else throws.
    await expect(
      authorizer.authorizeResources(makeHumanPrincipal(), "agent-a", []),
    ).rejects.toThrow("exactly one resourceId");
    await expect(
      authorizer.authorizeResources(makeHumanPrincipal(), "agent-a", [
        "orders-incident",
        "payments-incident",
      ]),
    ).rejects.toThrow("exactly one resourceId");

    const compiler = makeFakeMountPlanCompiler({
      ok: false,
      reason: "invalid_resource_path",
    });
    const result = await compiler.compileMountPlan("run-1", makeAllowDecision());
    expect(result.ok).toBe(false);
    expect(compiler.calls).toHaveLength(1);
  });

  // Verifies the fake's recorder works; the real "call count = 0 on denial"
  // evidence lives in the admission and Runner tests (Issues #3 and #6).
  it("fake runner records calls and mount plans", async () => {
    const runner = makeFakeCapsuleRunner();
    expect(runner.calls).toHaveLength(0);
    expect(isCapsuleCapableRunner(runner)).toBe(true);

    const planIgnoringRunner: AgentRunner = {
      run: async () => ({ output: "x", threadId: null, usage: null }),
      cancel: async () => false,
      isAvailable: async () => true,
    };
    expect(isCapsuleCapableRunner(planIgnoringRunner)).toBe(false);

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

  it("detects content and modification-time changes independently", async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), "capsule-baseline-"));
    try {
      await cp(path.join(FIXTURES_ROOT, "orders-incident"), scratch, {
        recursive: true,
      });
      const before = await captureFixtureBaseline(scratch);
      expect(before.length).toBeGreaterThan(0);

      const target = before[0]!;
      await appendFile(path.join(scratch, target.path), "tampered\n");
      // Push mtime clearly forward so coarse filesystem timestamps cannot
      // hide the write.
      const future = new Date(Date.now() + 5_000);
      await utimes(path.join(scratch, target.path), future, future);

      const after = await captureFixtureBaseline(scratch);
      const tampered = after.find((file) => file.path === target.path);
      expect(tampered).toBeDefined();
      expect(tampered?.sha256).not.toBe(target.sha256);
      expect(tampered?.mtimeMs).not.toBe(target.mtimeMs);
      expect(tampered?.bytes).toBeGreaterThan(target.bytes);

      const untouched = after.filter((file) => file.path !== target.path);
      for (const file of untouched) {
        const original = before.find((entry) => entry.path === file.path);
        expect(file.sha256).toBe(original?.sha256);
      }

      // A new file smuggled into a subdirectory must show up too.
      await mkdir(path.join(scratch, "notes"));
      await writeFile(path.join(scratch, "notes", "leak.txt"), "smuggled\n");
      const withNested = await captureFixtureBaseline(scratch);
      expect(withNested.map((file) => file.path)).toContain(
        path.join("notes", "leak.txt"),
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
