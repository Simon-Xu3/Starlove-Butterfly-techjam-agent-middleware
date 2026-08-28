import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "./store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("JsonStore", () => {
  it.each([
    [
      "an Agent without an owner",
      {
        version: 2,
        agents: [{ id: "agent-1" }],
        messages: [],
        runs: [],
        entitlements: [],
        receipts: [],
      },
    ],
    [
      "multiple active generations for one Entitlement",
      {
        version: 2,
        agents: [],
        messages: [],
        runs: [],
        entitlements: [
          {
            principalId: "user-a",
            resourceId: "orders-incident",
            permission: "read",
            status: "active",
            generation: 1,
            createdAt: "2026-08-28T00:00:00.000Z",
            revokedAt: null,
          },
          {
            principalId: "user-a",
            resourceId: "orders-incident",
            permission: "read",
            status: "active",
            generation: 2,
            createdAt: "2026-08-28T01:00:00.000Z",
            revokedAt: null,
          },
        ],
        receipts: [],
      },
    ],
    [
      "an invalid Entitlement",
      {
        version: 2,
        agents: [],
        messages: [],
        runs: [],
        entitlements: [
          {
            principalId: "user-a",
            resourceId: "orders-incident",
            permission: "write",
            status: "active",
            generation: 1,
            createdAt: "2026-08-28T00:00:00.000Z",
            revokedAt: null,
          },
        ],
        receipts: [],
      },
    ],
    [
      "an Entitlement outside the server-owned policy",
      {
        version: 2,
        agents: [],
        messages: [],
        runs: [],
        entitlements: [
          {
            principalId: "user-a",
            resourceId: "payments-incident",
            permission: "read",
            status: "active",
            generation: 1,
            createdAt: "2026-08-28T00:00:00.000Z",
            revokedAt: null,
          },
        ],
        receipts: [],
      },
    ],
    [
      "a Receipt carrying an extra sensitive field",
      {
        version: 2,
        agents: [],
        messages: [],
        runs: [],
        entitlements: [],
        receipts: [
          {
            receiptId: "receipt-1",
            runId: "run-1",
            humanPrincipalId: "user-a",
            agentId: "agent-1",
            resourceId: "orders-incident",
            decision: "allow",
            reason: "allowed",
            grantGeneration: 1,
            runnerStarted: true,
            createdAt: "2026-08-28T00:00:00.000Z",
            prompt: "must never be persisted in a Receipt",
          },
        ],
      },
    ],
    [
      "multiple Receipts for one Run",
      {
        version: 2,
        agents: [],
        messages: [],
        runs: [],
        entitlements: [],
        receipts: [
          {
            receiptId: "receipt-1",
            runId: "run-1",
            humanPrincipalId: "user-a",
            agentId: "agent-1",
            resourceId: "orders-incident",
            decision: "allow",
            reason: "allowed",
            grantGeneration: 1,
            runnerStarted: true,
            createdAt: "2026-08-28T00:00:00.000Z",
          },
          {
            receiptId: "receipt-2",
            runId: "run-1",
            humanPrincipalId: "user-a",
            agentId: "agent-1",
            resourceId: "orders-incident",
            decision: "deny",
            reason: "entitlement_revoked",
            grantGeneration: 1,
            runnerStarted: false,
            createdAt: "2026-08-28T01:00:00.000Z",
          },
        ],
      },
    ],
  ])("rejects a version 2 database containing %s", async (_case, database) => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-store-test-"));
    temporaryDirectories.push(root);
    const filePath = path.join(root, "db.json");
    await writeFile(filePath, JSON.stringify(database), "utf8");

    await expect(new JsonStore(filePath).initialize()).rejects.toThrow(
      "Unsupported database format",
    );
  });

  it("migrates version 1 data to a complete version 2 database", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-store-test-"));
    temporaryDirectories.push(root);
    const filePath = path.join(root, "db.json");
    const original = {
      version: 1 as const,
      agents: [
        {
          id: "agent-1",
          name: "Existing Agent",
          description: "preserved",
          instructions: "keep these",
          status: "ready" as const,
          workspacePath: "/workspaces/agent-1",
          codexThreadId: "thread-1",
          lastError: null,
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: "2026-08-27T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-1",
          agentId: "agent-1",
          runId: "run-1",
          role: "user" as const,
          content: "preserve me",
          createdAt: "2026-08-27T00:00:00.000Z",
        },
      ],
      runs: [
        {
          id: "run-1",
          agentId: "agent-1",
          status: "completed" as const,
          prompt: "preserve me",
          output: "preserved",
          error: null,
          usage: null,
          startedAt: "2026-08-27T00:00:00.000Z",
          completedAt: "2026-08-27T00:00:01.000Z",
          createdAt: "2026-08-27T00:00:00.000Z",
        },
      ],
    };
    await writeFile(filePath, JSON.stringify(original), "utf8");

    const store = new JsonStore(
      filePath,
      () => "2026-08-28T00:00:00.000Z",
    );
    await store.initialize();

    expect(store.snapshot()).toEqual({
      version: 2,
      agents: [{ ...original.agents[0], ownerPrincipalId: "user-a" }],
      messages: original.messages,
      runs: original.runs,
      entitlements: [
        {
          principalId: "user-a",
          resourceId: "orders-incident",
          permission: "read",
          status: "active",
          generation: 1,
          createdAt: "2026-08-28T00:00:00.000Z",
          revokedAt: null,
        },
        {
          principalId: "user-b",
          resourceId: "payments-incident",
          permission: "read",
          status: "active",
          generation: 1,
          createdAt: "2026-08-28T00:00:00.000Z",
          revokedAt: null,
        },
      ],
      receipts: [],
    });
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(
      store.snapshot(),
    );
  });

  it("does not publish a migration when the version 2 write fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-store-test-"));
    temporaryDirectories.push(root);
    const filePath = path.join(root, "db.json");
    const version1 = {
      version: 1,
      agents: [
        {
          id: "agent-1",
          name: "Existing Agent",
          description: "",
          instructions: "",
          status: "ready",
          workspacePath: "/workspaces/agent-1",
          codexThreadId: null,
          lastError: null,
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: "2026-08-27T00:00:00.000Z",
        },
      ],
      messages: [],
      runs: [],
    };
    await writeFile(filePath, JSON.stringify(version1), "utf8");
    await mkdir(filePath + ".tmp");
    const store = new JsonStore(filePath);

    await expect(store.initialize()).rejects.toThrow();

    expect(store.snapshot().agents).toEqual([]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(version1);
  });

  it("does not publish a mutation in memory when persistence fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-store-test-"));
    temporaryDirectories.push(root);
    const originalPath = path.join(root, "db.json");
    const store = new JsonStore(originalPath);
    await store.initialize();

    const mutableStore = store as unknown as { filePath: string };
    mutableStore.filePath = path.join(root, "missing-directory", "db.json");
    await expect(
      store.mutate((database) => {
        database.messages.push({
          id: "message-1",
          agentId: "agent-1",
          runId: "run-1",
          role: "user",
          content: "must not become visible",
          createdAt: new Date().toISOString(),
        });
      }),
    ).rejects.toThrow();
    expect(store.snapshot().messages).toEqual([]);

    mutableStore.filePath = originalPath;
    await store.mutate((database) => {
      database.messages.push({
        id: "message-2",
        agentId: "agent-1",
        runId: "run-2",
        role: "user",
        content: "queue recovered",
        createdAt: new Date().toISOString(),
      });
    });
    expect(store.snapshot().messages.map((message) => message.content)).toEqual([
      "queue recovered",
    ]);
  });

  it("preserves valid allow and deny Receipts across a restart", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-store-test-"));
    temporaryDirectories.push(root);
    const filePath = path.join(root, "db.json");
    const store = new JsonStore(
      filePath,
      () => "2026-08-28T00:00:00.000Z",
    );
    await store.initialize();
    await store.mutate((database) => {
      database.receipts.push(
        {
          receiptId: "receipt-allow",
          runId: "run-allow",
          humanPrincipalId: "user-a",
          agentId: "agent-a",
          resourceId: "orders-incident",
          decision: "allow",
          reason: "allowed",
          grantGeneration: 1,
          runnerStarted: true,
          createdAt: "2026-08-28T01:00:00.000Z",
        },
        {
          receiptId: "receipt-deny",
          runId: "run-deny",
          humanPrincipalId: "user-b",
          agentId: "agent-b",
          resourceId: "orders-incident",
          decision: "deny",
          reason: "entitlement_missing",
          grantGeneration: null,
          runnerStarted: false,
          createdAt: "2026-08-28T02:00:00.000Z",
        },
      );
    });

    const restarted = new JsonStore(filePath);
    await restarted.initialize();

    expect(restarted.snapshot().receipts).toEqual(store.snapshot().receipts);
  });

  it("rejects an invalid version 2 mutation before publishing it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-store-test-"));
    temporaryDirectories.push(root);
    const filePath = path.join(root, "db.json");
    const store = new JsonStore(
      filePath,
      () => "2026-08-28T00:00:00.000Z",
    );
    await store.initialize();
    const before = store.snapshot();

    await expect(
      store.mutate((database) => {
        Object.assign(database.entitlements[0]!, { permission: "write" });
      }),
    ).rejects.toThrow("Invalid version 2 database mutation");
    await expect(
      store.mutate((database) => {
        database.agents.push(
          { id: "ownerless" } as (typeof database.agents)[number],
        );
      }),
    ).rejects.toThrow("Invalid version 2 database mutation");

    expect(store.snapshot()).toEqual(before);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(before);
  });
});
