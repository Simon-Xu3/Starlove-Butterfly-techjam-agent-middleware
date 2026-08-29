import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AgentService, type CapsuleSeams } from "./agent-service.js";
import {
  makeFakeAuthorizer,
  makeFakeMountPlanCompiler,
} from "./capsule-test-support.js";
import { createStoreOwnershipReader } from "./demo-principal.js";
import { loadConfig } from "./config.js";
import { InMemoryReceiptStore } from "./receipt-store.js";
import { JsonStore } from "./store.js";
import type {
  AgentRunner,
  HumanPrincipal,
  RunnerRequest,
  RunnerResult,
} from "./types.js";
import { WorkspaceManager } from "./workspace.js";

const userA: HumanPrincipal = { id: "user-a", displayName: "Demo User A" };
const userB: HumanPrincipal = { id: "user-b", displayName: "Demo User B" };

class FakeRunner implements AgentRunner {
  async run(request: RunnerRequest): Promise<RunnerResult> {
    return {
      output: "Completed: " + request.prompt,
      threadId: request.threadId ?? "fake-thread",
      usage: { inputTokens: 12, outputTokens: 5 },
    };
  }
  async cancel(): Promise<boolean> {
    return false;
  }
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeService(
  runner: AgentRunner = new FakeRunner(),
  capsule: Partial<CapsuleSeams> = {},
): Promise<AgentService> {
  const root = await mkdtemp(path.join(tmpdir(), "launchpad-test-"));
  temporaryDirectories.push(root);
  const config = loadConfig({
    NODE_ENV: "test",
    APP_DATA_DIR: path.join(root, "data"),
    AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"),
    CODEX_HOME: path.join(root, "codex"),
    ARK_API_KEY: "test-key",
    ARK_MODEL: "ep-test",
  });
  const service = new AgentService(
    config,
    new JsonStore(path.join(root, "data", "db.json")),
    new WorkspaceManager(path.join(root, "workspaces")),
    runner,
    {
      authorizer: makeFakeAuthorizer(),
      mountPlanCompiler: makeFakeMountPlanCompiler(),
      receipts: new InMemoryReceiptStore(),
      ...capsule,
    },
  );
  await service.initialize();
  return service;
}

async function sendBaseline(
  service: AgentService,
  agentId: string,
  content: string,
  principal: HumanPrincipal = userA,
) {
  const result = await service.sendMessage(agentId, principal, { content });
  if (!result.admitted) {
    throw new Error("expected an admitted baseline run");
  }
  return result.response;
}

describe("store ownership reader", () => {
  it("returns the owner and fails closed on unknown or ownerless Agents", () => {
    const base = {
      name: "A",
      description: "",
      instructions: "",
      status: "ready" as const,
      workspacePath: "/tmp/w",
      codexThreadId: null,
      lastError: null,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    };
    const store = {
      snapshot: () => ({
        version: 2 as const,
        agents: [
          { ...base, id: "owned", ownerPrincipalId: "user-a" as const },
          { ...base, id: "ownerless" },
        ],
        messages: [],
        runs: [],
        entitlements: [],
        receipts: [],
      }),
    } as unknown as JsonStore;
    const reader = createStoreOwnershipReader(store);
    expect(reader.getOwnerPrincipalId("owned")).toBe("user-a");
    expect(reader.getOwnerPrincipalId("ownerless")).toBeUndefined();
    expect(reader.getOwnerPrincipalId("missing")).toBeUndefined();
  });
});

describe("Agent lifecycle", () => {
  it("creates, updates, stops, starts and deletes an Agent", async () => {
    const service = await makeService();
    const agent = await service.createAgent({ name: "Builder" }, "user-a");
    expect(agent.ownerPrincipalId).toBe("user-a");
    expect(service.listAgents("user-a")).toHaveLength(1);
    expect(
      (await service.updateAgent(agent.id, "user-a", { description: "Builds apps" }))
        .description,
    ).toBe("Builds apps");
    expect((await service.stopAgent(agent.id, "user-a")).status).toBe("stopped");
    expect((await service.startAgent(agent.id, "user-a")).status).toBe("ready");
    await service.deleteAgent(agent.id, "user-a");
    expect(service.listAgents("user-a")).toHaveLength(0);
  });

  it("scopes every Agent operation to the owning principal", async () => {
    const service = await makeService();
    const agent = await service.createAgent({ name: "Mine" }, "user-a");

    expect(service.listAgents("user-b")).toHaveLength(0);
    expect(() => service.getAgent(agent.id, "user-b")).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(() => service.getRuns(agent.id, "user-b")).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
    await expect(
      service.updateAgent(agent.id, "user-b", { name: "Stolen" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.startAgent(agent.id, "user-b")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.stopAgent(agent.id, "user-b")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.deleteAgent(agent.id, "user-b")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.sendMessage(agent.id, userB, { content: "hi" }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const { run } = await sendBaseline(service, agent.id, "mine only");
    expect(() => service.getRun(run.id, "user-b")).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(() => service.getMessages(agent.id, "user-b")).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
    // Let the background execution finish before afterEach removes the
    // temp directory, or the teardown races the store's atomic write.
    await expect
      .poll(() => service.getRun(run.id, "user-a").status)
      .toBe("completed");
  });

  it("redacts host paths from a failed Run's error before persisting", async () => {
    // The container engine echoes the bind-mount source on a mount error,
    // which would otherwise put a protected Resource's canonical path into
    // run.error and out through GET /api/runs/:id.
    const leakingRunner: AgentRunner = {
      run: async () => {
        throw new Error(
          'docker: Error response from daemon: invalid mount config for type "bind": ' +
            "bind source path does not exist: /Users/demo/repo/fixtures/resources/orders-incident",
        );
      },
      cancel: async () => false,
      isAvailable: async () => true,
    };
    const service = await makeService(leakingRunner);
    const agent = await service.createAgent({ name: "Leaky" }, "user-a");
    const { run } = await sendBaseline(service, agent.id, "trigger a failure");

    await expect
      .poll(() => service.getRun(run.id, "user-a").status)
      .toBe("failed");
    const stored = service.getRun(run.id, "user-a");
    expect(stored.error).not.toContain("/Users/demo");
    expect(stored.error).not.toContain("fixtures/resources");
    expect(stored.error).not.toContain("orders-incident");
    expect(stored.error).toContain("withheld");
    expect(service.getAgent(agent.id, "user-a").lastError).not.toContain(
      "/Users/demo",
    );
  });

  it("withholds errors whose paths contain spaces, and keeps path-free ones", async () => {
    // A whitespace-terminated pattern would leave fragments like " Data"
    // behind, so a path-bearing message is dropped whole instead of masked.
    const spacedPath: AgentRunner = {
      run: async () => {
        throw new Error(
          "bind source path does not exist: /srv/Protected Data/orders-incident",
        );
      },
      cancel: async () => false,
      isAvailable: async () => true,
    };
    const service = await makeService(spacedPath);
    const agent = await service.createAgent({ name: "Spaced" }, "user-a");
    const { run } = await sendBaseline(service, agent.id, "fail with a spaced path");
    await expect.poll(() => service.getRun(run.id, "user-a").status).toBe("failed");
    const stored = service.getRun(run.id, "user-a");
    expect(stored.error).not.toContain("Data");
    expect(stored.error).not.toContain("Protected");
    expect(stored.error).not.toContain("srv");

    // A message with no path is preserved so operators keep real detail.
    const pathFree: AgentRunner = {
      run: async () => {
        throw new Error("exceeded retry limit, last status: 429 Too Many Requests");
      },
      cancel: async () => false,
      isAvailable: async () => true,
    };
    const plain = await makeService(pathFree);
    const plainAgent = await plain.createAgent({ name: "Plain" }, "user-a");
    const plainRun = await sendBaseline(plain, plainAgent.id, "fail without a path");
    await expect
      .poll(() => plain.getRun(plainRun.run.id, "user-a").status)
      .toBe("failed");
    expect(plain.getRun(plainRun.run.id, "user-a").error).toContain(
      "429 Too Many Requests",
    );
  });

  it("persists a playground conversation", async () => {
    const service = await makeService();
    const agent = await service.createAgent({ name: "Coder" }, "user-a");
    const { run } = await sendBaseline(service, agent.id, "write hello world");
    await expect
      .poll(() => service.getRun(run.id, "user-a").status)
      .toBe("completed");
    const messages = service.getMessages(agent.id, "user-a");
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.content).toContain("write hello world");
    expect(service.getAgent(agent.id, "user-a").codexThreadId).toBe("fake-thread");
  });

  it("atomically accepts only one concurrent run per Agent", async () => {
    let finish!: (result: RunnerResult) => void;
    const pending = new Promise<RunnerResult>((resolve) => {
      finish = resolve;
    });
    const runner: AgentRunner = {
      run: () => pending,
      cancel: async () => false,
      isAvailable: async () => true,
    };
    const service = await makeService(runner);
    const agent = await service.createAgent({ name: "Concurrent" }, "user-a");
    const attempts = await Promise.allSettled([
      service.sendMessage(agent.id, userA, { content: "first" }),
      service.sendMessage(agent.id, userA, { content: "second" }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected).toMatchObject({ reason: { statusCode: 409 } });
    expect(service.getMessages(agent.id, "user-a")).toHaveLength(1);

    finish({ output: "done", threadId: "thread", usage: null });
    const accepted = attempts.find((attempt) => attempt.status === "fulfilled");
    if (accepted?.status === "fulfilled" && accepted.value.admitted) {
      const acceptedRun = accepted.value.response.run;
      await expect
        .poll(() => service.getRun(acceptedRun.id, "user-a").status)
        .toBe("completed");
    }
  });

  it("does not let start reset a busy Agent and admit a second run", async () => {
    let finish!: (result: RunnerResult) => void;
    const pending = new Promise<RunnerResult>((resolve) => {
      finish = resolve;
    });
    const service = await makeService({
      run: () => pending,
      cancel: async () => false,
      isAvailable: async () => true,
    });
    const agent = await service.createAgent({ name: "Busy" }, "user-a");
    const { run } = await sendBaseline(service, agent.id, "first");

    await expect(service.startAgent(agent.id, "user-a")).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      service.sendMessage(agent.id, userA, { content: "second" }),
    ).rejects.toMatchObject({ statusCode: 409 });

    finish({ output: "done", threadId: "thread", usage: null });
    await expect
      .poll(() => service.getRun(run.id, "user-a").status)
      .toBe("completed");
  });
});
