// Shared test support for the Run-scoped Resource Capsule workstreams
// (Issue #2). Factories default to the approved happy case — user-a
// delegating orders-incident to Agent agent-a with generation 1 — so a test
// only overrides the fields that make its scenario different. Factories and
// fakes contain no real authorization or path-validation logic.
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentRun,
  AllowedAuthorizationDecision,
  AuthorizationDecision,
  DecisionReceipt,
  DeniedAuthorizationDecision,
  HumanPrincipal,
  MountPlanCompiler,
  MountPlanResult,
  PrincipalResourceEntitlement,
  ProtectedResource,
  RegisteredResource,
  ResourceAuthorizer,
  RunnerRequest,
  RunnerResult,
  ValidatedRunMountPlan,
  CapsuleCapableRunner,
} from "./types.js";

export const FIXTURES_ROOT = fileURLToPath(
  new URL("../../../fixtures/resources/", import.meta.url),
);

export function makeHumanPrincipal(
  overrides: Partial<HumanPrincipal> = {},
): HumanPrincipal {
  return { id: "user-a", displayName: "Demo User A", ...overrides };
}

export function makeProtectedResource(
  overrides: Partial<ProtectedResource> = {},
): ProtectedResource {
  return {
    id: "orders-incident",
    displayName: "Orders checkout incident (2026-08-26)",
    kind: "directory",
    ...overrides,
  };
}

export function makeRegisteredResource(
  overrides: Partial<RegisteredResource> = {},
): RegisteredResource {
  return {
    ...makeProtectedResource(),
    canonicalSourcePath: path.join(FIXTURES_ROOT, "orders-incident"),
    ...overrides,
  };
}

export function makeEntitlement(
  overrides: Partial<PrincipalResourceEntitlement> = {},
): PrincipalResourceEntitlement {
  return {
    principalId: "user-a",
    resourceId: "orders-incident",
    permission: "read",
    status: "active",
    generation: 1,
    createdAt: "2026-08-27T00:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

export function makeAllowDecision(
  overrides: Partial<AllowedAuthorizationDecision> = {},
): AllowedAuthorizationDecision {
  return {
    decision: "allow",
    principalId: "user-a",
    agentId: "agent-a",
    resource: makeRegisteredResource(),
    grantGeneration: 1,
    ...overrides,
  };
}

export function makeDenyDecision(
  overrides: Partial<DeniedAuthorizationDecision> = {},
): DeniedAuthorizationDecision {
  return {
    decision: "deny",
    principalId: "user-a",
    agentId: "agent-a",
    resourceId: "payments-incident",
    reason: "entitlement_missing",
    grantGeneration: null,
    ...overrides,
  };
}

export function makeMountPlan(
  overrides: Partial<ValidatedRunMountPlan> = {},
): ValidatedRunMountPlan {
  return {
    runId: "run-1",
    agentId: "agent-a",
    resourceId: "orders-incident",
    sourcePath: path.join(FIXTURES_ROOT, "orders-incident"),
    targetPath: "/resources/orders-incident",
    readOnly: true,
    grantGeneration: 1,
    ...overrides,
  };
}

export function makeDecisionReceipt(
  overrides: Partial<DecisionReceipt> = {},
): DecisionReceipt {
  return {
    receiptId: "receipt-1",
    runId: "run-1",
    humanPrincipalId: "user-a",
    agentId: "agent-a",
    resourceId: "orders-incident",
    decision: "allow",
    reason: "allowed",
    grantGeneration: 1,
    runnerStarted: true,
    createdAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

export function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    agentId: "agent-a",
    status: "queued",
    prompt: "Analyse why orders-service failed last night.",
    output: null,
    error: null,
    usage: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

// Fake seam implementations. Each records its calls so tests can assert the
// evidence the spec demands, most importantly "Runner call count = 0 on
// denial".

export interface FakeResourceAuthorizer extends ResourceAuthorizer {
  calls: Array<{
    principal: HumanPrincipal;
    agentId: string;
    resourceIds: string[];
  }>;
}

export function makeFakeAuthorizer(
  decision: AuthorizationDecision = makeAllowDecision(),
): FakeResourceAuthorizer {
  const authorizer: FakeResourceAuthorizer = {
    calls: [],
    async authorizeResources(principal, agentId, resourceIds) {
      authorizer.calls.push({ principal, agentId, resourceIds });
      return decision;
    },
  };
  return authorizer;
}

export interface FakeMountPlanCompiler extends MountPlanCompiler {
  calls: Array<{ runId: string; decision: AllowedAuthorizationDecision }>;
}

export function makeFakeMountPlanCompiler(
  result: MountPlanResult = { ok: true, plan: makeMountPlan() },
): FakeMountPlanCompiler {
  const compiler: FakeMountPlanCompiler = {
    calls: [],
    async compileMountPlan(runId, decision) {
      compiler.calls.push({ runId, decision });
      return result;
    },
  };
  return compiler;
}

export interface FakeCapsuleRunner extends CapsuleCapableRunner {
  calls: Array<{
    request: RunnerRequest;
    validatedMountPlan: ValidatedRunMountPlan | undefined;
  }>;
  cancelledAgentIds: string[];
}

export function makeFakeCapsuleRunner(
  result: RunnerResult = { output: "demo output", threadId: null, usage: null },
): FakeCapsuleRunner {
  const runner: FakeCapsuleRunner = {
    calls: [],
    cancelledAgentIds: [],
    async run(request, validatedMountPlan) {
      runner.calls.push({ request, validatedMountPlan });
      return result;
    },
    async cancel(agentId) {
      runner.cancelledAgentIds.push(agentId);
      return false;
    },
    async isAvailable() {
      return true;
    },
  };
  return runner;
}

// Fixture evidence baseline. Hashes must match the committed
// fixtures/resources/baseline-manifest.json; mtimes are captured at call
// time because git does not preserve them. Kill Test evidence (Issue #6)
// compares a before capture against an after capture from the same session.

export interface FixtureFileBaseline {
  path: string;
  bytes: number;
  sha256: string;
  mtimeMs: number;
}

export async function captureFixtureBaseline(
  resourceDirectory: string,
): Promise<FixtureFileBaseline[]> {
  const names = (await readdir(resourceDirectory)).sort();
  return Promise.all(
    names.map(async (name) => {
      const filePath = path.join(resourceDirectory, name);
      const [body, stats] = await Promise.all([
        readFile(filePath),
        stat(filePath),
      ]);
      return {
        path: name,
        bytes: stats.size,
        sha256: createHash("sha256").update(body).digest("hex"),
        mtimeMs: stats.mtimeMs,
      };
    }),
  );
}
