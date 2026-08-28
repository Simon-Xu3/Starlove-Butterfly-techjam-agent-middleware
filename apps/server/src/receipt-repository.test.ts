import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeDecisionReceipt } from "./capsule-test-support.js";
import {
  StoreReceiptRepository,
  createStoreRunReader,
} from "./receipt-repository.js";
import { JsonStore } from "./store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeStore(): Promise<{ store: JsonStore; filePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "receipt-repo-"));
  temporaryDirectories.push(root);
  const filePath = path.join(root, "db.json");
  const store = new JsonStore(filePath);
  await store.initialize();
  return { store, filePath };
}

// A valid persisted receipt needs UUIDs and an agent that owns the run.
const RUN = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";
const RECEIPT = "33333333-3333-4333-8333-333333333333";

async function seedAgentAndRun(store: JsonStore): Promise<void> {
  await store.mutate((database) => {
    database.agents.push({
      id: AGENT,
      name: "A",
      description: "",
      instructions: "",
      status: "ready",
      workspacePath: "/tmp/w",
      codexThreadId: null,
      lastError: null,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
      ownerPrincipalId: "user-a",
    });
    database.runs.push({
      id: RUN,
      agentId: AGENT,
      status: "completed",
      prompt: "go",
      output: null,
      error: null,
      usage: null,
      startedAt: null,
      completedAt: "2026-08-28T00:00:00.000Z",
      createdAt: "2026-08-28T00:00:00.000Z",
    });
  });
}

describe("StoreReceiptRepository", () => {
  it("round-trips a receipt in memory and persists it to the store", async () => {
    const { store } = await makeStore();
    const repo = new StoreReceiptRepository(store);
    const receipt = makeDecisionReceipt({
      receiptId: RECEIPT,
      runId: RUN,
      agentId: AGENT,
    });

    repo.add(receipt);
    // Synchronous read from the mirror is immediately consistent.
    expect(repo.getReceiptsForRun(RUN)).toHaveLength(1);
    expect(repo.getReceiptsForRun("44444444-4444-4444-8444-444444444444")).toHaveLength(0);

    // Drain the store queue so the fire-and-forget persist has committed.
    await store.mutate(() => {});
    expect(store.snapshot().receipts.map((r) => r.receiptId)).toContain(RECEIPT);
  });

  it("rehydrates persisted receipts in a fresh repository (survives restart)", async () => {
    const { store, filePath } = await makeStore();
    new StoreReceiptRepository(store).add(
      makeDecisionReceipt({ receiptId: RECEIPT, runId: RUN, agentId: AGENT }),
    );
    await store.mutate(() => {});

    // A new store instance loading the same file, then a fresh repository.
    const reloaded = new JsonStore(filePath);
    await reloaded.initialize();
    const repo = new StoreReceiptRepository(reloaded);
    expect(repo.getReceiptsForRun(RUN)).toHaveLength(1);
    expect(repo.getReceiptsForRun(RUN)[0]?.receiptId).toBe(RECEIPT);
  });

  it("keeps receipts for different runs separate", async () => {
    const { store } = await makeStore();
    const repo = new StoreReceiptRepository(store);
    const otherRun = "55555555-5555-4555-8555-555555555555";
    repo.add(makeDecisionReceipt({ receiptId: RECEIPT, runId: RUN, agentId: AGENT }));
    repo.add(
      makeDecisionReceipt({
        receiptId: "66666666-6666-4666-8666-666666666666",
        runId: otherRun,
        agentId: AGENT,
      }),
    );
    expect(repo.getReceiptsForRun(RUN)).toHaveLength(1);
    expect(repo.getReceiptsForRun(otherRun)).toHaveLength(1);
    // Drain the fire-and-forget persists before teardown removes the dir.
    await store.mutate(() => {});
  });
});

describe("createStoreRunReader", () => {
  it("resolves the owning agent for a stored run and undefined otherwise", async () => {
    const { store } = await makeStore();
    await seedAgentAndRun(store);
    const reader = createStoreRunReader(store);
    expect(reader.getAgentIdForRun(RUN)).toBe(AGENT);
    expect(
      reader.getAgentIdForRun("77777777-7777-4777-8777-777777777777"),
    ).toBeUndefined();
  });
});
