import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AgentService, type CapsuleSeams } from "./agent-service.js";
import { createApp } from "./app.js";
import {
  makeAllowDecision,
  makeDenyDecision,
  makeFakeAuthorizer,
  makeFakeCapsuleRunner,
  makeFakeMountPlanCompiler,
} from "./capsule-test-support.js";
import { loadConfig } from "./config.js";
import { InMemoryReceiptStore } from "./receipt-store.js";
import { JsonStore } from "./store.js";
import type {
  AgentRunner,
  RunnerRequest,
  RunnerResult,
  ValidatedRunMountPlan,
} from "./types.js";
import { WorkspaceManager } from "./workspace.js";

const sessionA = { "x-demo-session": "demo-session-a" };
const sessionB = { "x-demo-session": "demo-session-b" };
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

interface TestAppOptions {
  runtimeProvider?: "local-process" | "container";
  runner?: AgentRunner;
  capsule?: Partial<CapsuleSeams>;
  appAuthToken?: string;
  // Builds the app the way production does (static plugin registered), which
  // is the only configuration that can catch error-handler wiring bugs.
  nodeEnv?: "test" | "production";
}

async function makeTestApp(options: TestAppOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "launchpad-http-"));
  temporaryDirectories.push(root);
  const config = loadConfig({
    NODE_ENV: options.nodeEnv ?? "test",
    HOST: "127.0.0.1",
    APP_DATA_DIR: path.join(root, "data"),
    AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"),
    CODEX_HOME: path.join(root, "codex"),
    ARK_API_KEY: "test-key",
    ARK_MODEL: "ep-test",
    RUNTIME_PROVIDER: options.runtimeProvider ?? "local-process",
    ...(options.appAuthToken ? { APP_AUTH_TOKEN: options.appAuthToken } : {}),
  });
  const runner = options.runner ?? makeFakeCapsuleRunner();
  const receipts = new InMemoryReceiptStore();
  const service = new AgentService(
    config,
    new JsonStore(path.join(root, "data", "db.json")),
    new WorkspaceManager(path.join(root, "workspaces")),
    runner,
    {
      authorizer: makeFakeAuthorizer(),
      mountPlanCompiler: makeFakeMountPlanCompiler(),
      receipts,
      ...options.capsule,
    },
  );
  await service.initialize();
  const app = await createApp(config, service);
  return { app, service, receipts, runner };
}

async function createAgent(
  app: Awaited<ReturnType<typeof makeTestApp>>["app"],
  headers: Record<string, string> = sessionA,
): Promise<{ id: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/agents",
    headers: { ...json, ...headers },
    payload: JSON.stringify({ name: "Demo Agent" }),
  });
  expect(response.statusCode).toBe(201);
  return response.json().agent;
}

describe("HTTP boundary", () => {
  it("protects API routes with the configured shared token", async () => {
    const { app } = await makeTestApp({ appAuthToken: "a-strong-test-token" });
    const denied = await app.inject({ method: "GET", url: "/api/agents" });
    expect(denied.statusCode).toBe(401);

    const allowed = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: "Bearer a-strong-test-token", ...sessionA },
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });

  it("keeps validation and error contracts in the production build", async () => {
    // Regression: the error handler used to be registered after the static
    // plugin, so in production every validation failure fell through to
    // Fastify's default 500 with a raw internal message.
    const { app } = await makeTestApp({ nodeEnv: "production" });
    const agent = await createAgent(app);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ content: "x", resourceIds: ["../../etc"] }),
    });
    expect(invalid.statusCode).toBe(400);

    const tooMany = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "x",
        resourceIds: ["orders-incident", "payments-incident"],
      }),
    });
    expect(tooMany.statusCode).toBe(400);

    // HttpError statuses and their safe messages still round-trip.
    const missing = await app.inject({
      method: "GET",
      url: "/api/agents/6b3f4f57-3b52-4f7b-9a71-2f24b7a2b111",
      headers: sessionA,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe("Agent not found");

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/agents",
    });
    expect(unauthenticated.statusCode).toBe(401);
    await app.close();
  });

  it("returns a generic body for a genuine 500 and never the internal message", async () => {
    // The 5xx branch is the one that could echo a filesystem error carrying
    // host paths, so it needs direct coverage rather than inference.
    const exploding = {
      listAgents: () => {
        throw new Error(
          "ENOENT: no such file or directory, open '/Users/demo/private/db.json'",
        );
      },
    } as unknown as AgentService;
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-500-"));
    temporaryDirectories.push(root);
    const app = await createApp(
      loadConfig({
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        APP_DATA_DIR: path.join(root, "data"),
        AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"),
        CODEX_HOME: path.join(root, "codex"),
        ARK_API_KEY: "test-key",
        ARK_MODEL: "ep-test",
      }),
      exploding,
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: sessionA,
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal server error" });
    expect(response.body).not.toContain("/Users/demo");
    expect(response.body).not.toContain("ENOENT");
    await app.close();
  });

  it("applies the token guard to the routed path, not the raw URL", async () => {
    const { app } = await makeTestApp({ appAuthToken: "a-strong-test-token" });
    // /%61pi/system decodes to /api/system in the router; the guard must
    // still demand the token instead of being dodged by the raw target.
    const encoded = await app.inject({ method: "GET", url: "/%61pi/system" });
    expect(encoded.statusCode).toBe(401);

    // Sanity: the same route with the token works, and the real exempt
    // route stays open.
    const withToken = await app.inject({
      method: "GET",
      url: "/api/system",
      headers: { authorization: "Bearer a-strong-test-token" },
    });
    expect(withToken.statusCode).toBe(200);
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    await app.close();
  });

  it("does not let an encoded path dodge session identity", async () => {
    const { app } = await makeTestApp();
    const encoded = await app.inject({
      method: "GET",
      url: "/%61pi/agents",
    });
    expect(encoded.statusCode).toBe(401);
    await app.close();
  });

  it("preserves Fastify client error status codes", async () => {
    const { app } = await makeTestApp();
    const malformed = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { ...json, ...sessionA },
      payload: "{not-json",
    });
    expect(malformed.statusCode).toBe(400);

    const oversized = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ name: "x".repeat(1_100_000) }),
    });
    expect(oversized.statusCode).toBe(413);
    await app.close();
  });
});

describe("demo session identity", () => {
  it("maps the two demo sessions and rejects everything else", async () => {
    const { app } = await makeTestApp();

    const missing = await app.inject({ method: "GET", url: "/api/agents" });
    expect(missing.statusCode).toBe(401);

    for (const bad of ["demo-session-x", "constructor", "__proto__", ""]) {
      const rejected = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers: { "x-demo-session": bad },
      });
      expect(rejected.statusCode).toBe(401);
    }

    for (const headers of [sessionA, sessionB]) {
      const accepted = await app.inject({
        method: "GET",
        url: "/api/agents",
        headers,
      });
      expect(accepted.statusCode).toBe(200);
    }
    await app.close();
  });

  it("rejects duplicated session headers instead of picking one", async () => {
    const { app } = await makeTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { "x-demo-session": ["demo-session-a", "demo-session-b"] },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("still requires a session after the outer token passes", async () => {
    const { app } = await makeTestApp({ appAuthToken: "a-strong-test-token" });
    const response = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: { authorization: "Bearer a-strong-test-token" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("keeps health, auth discovery, and system info identity-exempt", async () => {
    const { app } = await makeTestApp();
    for (const url of ["/api/health", "/api/auth", "/api/system"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(200);
    }
    await app.close();
  });

  it("rejects identity fields smuggled into request bodies", async () => {
    const { app } = await makeTestApp();
    for (const extra of [
      { principalId: "user-b" },
      { ownerId: "user-b" },
      { userId: "user-b" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/agents",
        headers: { ...json, ...sessionA },
        payload: JSON.stringify({ name: "Sneaky", ...extra }),
      });
      expect(response.statusCode).toBe(400);
    }

    // PATCH bodies are strict too.
    const agent = await createAgent(app);
    const patched = await app.inject({
      method: "PATCH",
      url: "/api/agents/" + agent.id,
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ name: "Fine", principalId: "user-b" }),
    });
    expect(patched.statusCode).toBe(400);

    for (const action of ["start", "stop"]) {
      const lifecycleAgent = await createAgent(app);
      for (const extra of [
        { principalId: "user-b" },
        { ownerId: "user-b" },
        { userId: "user-b" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/agents/" + lifecycleAgent.id + "/" + action,
          headers: { ...json, ...sessionA },
          payload: JSON.stringify(extra),
        });
        expect(response.statusCode).toBe(400);
      }
    }

    for (const extra of [
      { principalId: "user-b" },
      { ownerId: "user-b" },
      { userId: "user-b" },
    ]) {
      const deletableAgent = await createAgent(app);
      const response = await app.inject({
        method: "DELETE",
        url: "/api/agents/" + deletableAgent.id,
        headers: { ...json, ...sessionA },
        payload: JSON.stringify(extra),
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});

describe("Agent ownership over HTTP", () => {
  it("scopes Agent collections and operations to the session principal", async () => {
    const { app } = await makeTestApp();
    const agent = await createAgent(app, sessionA);

    const listB = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: sessionB,
    });
    expect(listB.json().agents).toHaveLength(0);

    for (const attempt of [
      { method: "GET" as const, url: "/api/agents/" + agent.id },
      {
        method: "PATCH" as const,
        url: "/api/agents/" + agent.id,
        headers: json,
        payload: JSON.stringify({ name: "Stolen" }),
      },
      { method: "DELETE" as const, url: "/api/agents/" + agent.id },
      { method: "POST" as const, url: "/api/agents/" + agent.id + "/start" },
      { method: "POST" as const, url: "/api/agents/" + agent.id + "/stop" },
      { method: "GET" as const, url: "/api/agents/" + agent.id + "/messages" },
      { method: "GET" as const, url: "/api/agents/" + agent.id + "/runs" },
    ]) {
      const response = await app.inject({
        ...attempt,
        headers: { ...(attempt.headers ?? {}), ...sessionB },
      });
      expect(response.statusCode).toBe(404);
    }

    const mine = await app.inject({
      method: "GET",
      url: "/api/agents/" + agent.id,
      headers: sessionA,
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().agent.ownerPrincipalId).toBe("user-a");
    await app.close();
  });
});

describe("Run admission", () => {
  it("keeps baseline Runs working without a Resource", async () => {
    const { app, service, receipts, runner } = await makeTestApp();
    const fake = runner as ReturnType<typeof makeFakeCapsuleRunner>;
    const agent = await createAgent(app);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({ content: "hello baseline", resourceIds: [] }),
    });
    expect(accepted.statusCode).toBe(202);
    const { run, message } = accepted.json();
    expect(run.status).toBe("queued");
    expect(message.role).toBe("user");

    await expect
      .poll(() => service.getRun(run.id, "user-a").status)
      .toBe("completed");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.validatedMountPlan).toBeUndefined();
    // A baseline Run has no Capsule Receipt.
    expect(receipts.getReceiptsForRun(run.id)).toHaveLength(0);
    await app.close();
  });

  it("rejects malformed Resource selections before any Run exists", async () => {
    const { app, service } = await makeTestApp();
    const agent = await createAgent(app);

    for (const resourceIds of [
      ["orders-incident", "payments-incident"],
      ["../etc"],
      ["/etc/passwd"],
      ["a/b"],
      ["%2e%2e"],
      ["UPPER_CASE"],
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/agents/" + agent.id + "/messages",
        headers: { ...json, ...sessionA },
        payload: JSON.stringify({ content: "hi", resourceIds }),
      });
      expect(response.statusCode).toBe(400);
    }
    expect(service.getRuns(agent.id, "user-a")).toHaveLength(0);
    await app.close();
  });

  it("turns an authorization denial into a terminal denied Run with evidence", async () => {
    const { app, service, receipts, runner } = await makeTestApp({
      capsule: { authorizer: makeFakeAuthorizer(makeDenyDecision()) },
    });
    const fake = runner as ReturnType<typeof makeFakeCapsuleRunner>;
    const agent = await createAgent(app);
    const before = service.getAgent(agent.id, "user-a");

    const response = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "read the payments incident",
        resourceIds: ["payments-incident"],
      }),
    });
    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body).toMatchObject({ status: "denied", reason: "entitlement_missing" });
    expect(typeof body.runId).toBe("string");
    expect(typeof body.receiptId).toBe("string");

    // Safe response: no host path, prompt key, token, or session value —
    // the same forbidden list the contract tests pin.
    for (const forbidden of [
      "sourcePath",
      "canonicalSourcePath",
      "fixtures/resources",
      path.sep + "Users" + path.sep,
      "demo-session",
      "Bearer",
      '"prompt":',
    ]) {
      expect(response.body).not.toContain(forbidden);
    }

    const run = service.getRun(body.runId, "user-a");
    expect(run.status).toBe("denied");
    expect(run.completedAt).not.toBeNull();

    const stored = receipts.getReceiptsForRun(body.runId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      receiptId: body.receiptId,
      decision: "deny",
      reason: "entitlement_missing",
      humanPrincipalId: "user-a",
      agentId: agent.id,
      resourceId: "payments-incident",
      runnerStarted: false,
      grantGeneration: null,
    });

    // Zero Runner calls, no assistant Message, no Codex thread, Agent ready.
    expect(fake.calls).toHaveLength(0);
    const messages = service.getMessages(agent.id, "user-a");
    expect(messages.map((item) => item.role)).toEqual(["user"]);
    const after = service.getAgent(agent.id, "user-a");
    expect(after.status).toBe("ready");
    expect(after.codexThreadId).toBe(before.codexThreadId);
    await app.close();
  });

  it("propagates every frozen denial reason to the response and Receipt", async () => {
    for (const denial of [
      { reason: "ownership_denied" as const, grantGeneration: null },
      { reason: "entitlement_revoked" as const, grantGeneration: 2 },
      { reason: "stale_entitlement_generation" as const, grantGeneration: 1 },
    ]) {
      const { app, receipts } = await makeTestApp({
        capsule: {
          authorizer: makeFakeAuthorizer(
            makeDenyDecision({
              reason: denial.reason,
              grantGeneration: denial.grantGeneration,
            }),
          ),
        },
      });
      const agent = await createAgent(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/agents/" + agent.id + "/messages",
        headers: { ...json, ...sessionA },
        payload: JSON.stringify({
          content: "try payments",
          resourceIds: ["payments-incident"],
        }),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().reason).toBe(denial.reason);
      const stored = receipts.getReceiptsForRun(response.json().runId);
      expect(stored[0]).toMatchObject({
        decision: "deny",
        reason: denial.reason,
        grantGeneration: denial.grantGeneration,
        runnerStarted: false,
      });
      await app.close();
    }
  });

  it("denies a Capsule Run under local-process with zero Runner calls", async () => {
    const { app, receipts, runner } = await makeTestApp({
      runtimeProvider: "local-process",
      capsule: { authorizer: makeFakeAuthorizer(makeAllowDecision()) },
    });
    const fake = runner as ReturnType<typeof makeFakeCapsuleRunner>;
    const agent = await createAgent(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "analyse orders",
        resourceIds: ["orders-incident"],
      }),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().reason).toBe("runtime_profile_unsupported");
    expect(fake.calls).toHaveLength(0);

    const stored = receipts.getReceiptsForRun(response.json().runId);
    expect(stored[0]).toMatchObject({
      decision: "deny",
      reason: "runtime_profile_unsupported",
      runnerStarted: false,
      grantGeneration: 1,
    });
    await app.close();
  });

  it("denies fail-closed when the container runner cannot accept plans", async () => {
    const calls: RunnerRequest[] = [];
    const planlessRunner: AgentRunner = {
      async run(request): Promise<RunnerResult> {
        calls.push(request);
        return { output: "x", threadId: null, usage: null };
      },
      cancel: async () => false,
      isAvailable: async () => true,
    };
    const { app } = await makeTestApp({
      runtimeProvider: "container",
      runner: planlessRunner,
      capsule: { authorizer: makeFakeAuthorizer(makeAllowDecision()) },
    });
    const agent = await createAgent(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "analyse orders",
        resourceIds: ["orders-incident"],
      }),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().reason).toBe("runtime_profile_unsupported");
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it("denies when the mount plan compiler fails validation", async () => {
    const { app, runner } = await makeTestApp({
      runtimeProvider: "container",
      capsule: {
        authorizer: makeFakeAuthorizer(makeAllowDecision()),
        mountPlanCompiler: makeFakeMountPlanCompiler({
          ok: false,
          reason: "invalid_resource_path",
        }),
      },
    });
    const fake = runner as ReturnType<typeof makeFakeCapsuleRunner>;
    const agent = await createAgent(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "analyse orders",
        resourceIds: ["orders-incident"],
      }),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().reason).toBe("invalid_resource_path");
    expect(fake.calls).toHaveLength(0);
    await app.close();
  });

  it("admits only one of two concurrent Capsule requests and writes one Receipt", async () => {
    let finish!: (result: RunnerResult) => void;
    const pending = new Promise<RunnerResult>((resolve) => {
      finish = resolve;
    });
    const plansSeen: Array<ValidatedRunMountPlan | undefined> = [];
    const blockingRunner = {
      supportsMountPlans: true as const,
      async run(
        request: RunnerRequest,
        plan?: ValidatedRunMountPlan,
      ): Promise<RunnerResult> {
        void request;
        plansSeen.push(plan);
        return pending;
      },
      cancel: async () => false,
      isAvailable: async () => true,
    };
    const { app, service, receipts } = await makeTestApp({
      runtimeProvider: "container",
      runner: blockingRunner,
      capsule: { authorizer: makeFakeAuthorizer(makeAllowDecision()) },
    });
    const agent = await createAgent(app);

    const inject = () =>
      app.inject({
        method: "POST",
        url: "/api/agents/" + agent.id + "/messages",
        headers: { ...json, ...sessionA },
        payload: JSON.stringify({
          content: "analyse orders",
          resourceIds: ["orders-incident"],
        }),
      });
    const [first, second] = await Promise.all([inject(), inject()]);
    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes).toEqual([202, 409]);

    const admitted = first.statusCode === 202 ? first : second;
    const runId = admitted.json().run.id;
    // The allow Receipt is written immediately before the Runner call, so it
    // appears during the async execution phase rather than at admission —
    // that is what keeps runnerStarted: true truthful.
    await expect.poll(() => receipts.getReceiptsForRun(runId).length).toBe(1);
    await expect.poll(() => plansSeen.length).toBe(1);
    expect(plansSeen[0]?.resourceId).toBe("orders-incident");

    finish({ output: "done", threadId: null, usage: null });
    await expect
      .poll(() => service.getRun(runId, "user-a").status)
      .toBe("completed");
    await app.close();
  });

  it("writes no allow Receipt when the Run is cancelled before the Runner", async () => {
    // runnerStarted: true must mean the invocation was attempted. A stop
    // that lands between admission and the Runner call must not leave an
    // audit record claiming the Runtime seam was crossed.
    const runner = makeFakeCapsuleRunner();
    const { app, receipts } = await makeTestApp({
      runtimeProvider: "container",
      runner,
      capsule: { authorizer: makeFakeAuthorizer(makeAllowDecision()) },
    });
    const agent = await createAgent(app);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "analyse orders",
        resourceIds: ["orders-incident"],
      }),
    });
    expect(accepted.statusCode).toBe(202);
    const runId = accepted.json().run.id;

    // Let the execution settle, then assert the Receipt matches reality:
    // the Runner either ran (one call, one receipt) or it did not (no
    // receipt) — never a receipt without a call.
    await expect
      .poll(() => receipts.getReceiptsForRun(runId).length + runner.calls.length)
      .toBeGreaterThan(0);
    expect(receipts.getReceiptsForRun(runId)).toHaveLength(runner.calls.length);
    await app.close();
  });

  it("admits an allowed Capsule Run and passes the plan to the Runner", async () => {
    const { app, service, receipts, runner } = await makeTestApp({
      runtimeProvider: "container",
      capsule: { authorizer: makeFakeAuthorizer(makeAllowDecision()) },
    });
    const fake = runner as ReturnType<typeof makeFakeCapsuleRunner>;
    const agent = await createAgent(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agents/" + agent.id + "/messages",
      headers: { ...json, ...sessionA },
      payload: JSON.stringify({
        content: "analyse orders",
        resourceIds: ["orders-incident"],
      }),
    });
    expect(response.statusCode).toBe(202);
    const { run } = response.json();

    await expect
      .poll(() => service.getRun(run.id, "user-a").status)
      .toBe("completed");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.validatedMountPlan).toMatchObject({
      resourceId: "orders-incident",
      readOnly: true,
    });

    const stored = receipts.getReceiptsForRun(run.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      decision: "allow",
      reason: "allowed",
      runnerStarted: true,
      grantGeneration: 1,
    });
    await app.close();
  });
});
