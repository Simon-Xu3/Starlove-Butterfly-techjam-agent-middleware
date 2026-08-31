import { describe, expect, it, vi } from "vitest";
import { pollActiveRun } from "./run-polling";
import type { AgentRun, RunStatus } from "./types";

const runId = "11111111-1111-4111-8111-111111111111";

function makeRun(status: RunStatus): AgentRun {
  return {
    id: runId,
    agentId: "33333333-3333-4333-8333-333333333333",
    status,
    prompt: "inspect payments",
    output: null,
    error: null,
    usage: null,
    createdAt: "2026-08-28T00:00:00.000Z",
  };
}

describe("active Run polling", () => {
  it("refreshes the Receipt for every active snapshot before terminal handling", async () => {
    const snapshots = [
      makeRun("queued"),
      makeRun("running"),
      makeRun("completed"),
    ];
    const getRun = vi.fn(async () => ({ run: snapshots.shift()! }));
    const onRun = vi.fn();
    const refreshReceipt = vi.fn(async () => undefined);
    const onTerminal = vi.fn(async () => undefined);

    await pollActiveRun({
      runId,
      wait: async () => undefined,
      shouldContinue: () => true,
      getRun,
      onRun,
      refreshReceipt,
      onTerminal,
    });

    expect(getRun).toHaveBeenCalledTimes(3);
    expect(onRun.mock.calls.map(([run]) => run.status)).toEqual([
      "queued",
      "running",
      "completed",
    ]);
    expect(refreshReceipt).toHaveBeenCalledTimes(2);
    expect(refreshReceipt).toHaveBeenNthCalledWith(1, runId);
    expect(refreshReceipt).toHaveBeenNthCalledWith(2, runId);
    expect(onTerminal).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("retries a temporary read failure without losing the accepted Run", async () => {
    const getRun = vi
      .fn<() => Promise<{ run: AgentRun }>>()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ run: makeRun("running") })
      .mockResolvedValueOnce({ run: makeRun("completed") });
    const onRun = vi.fn();
    const refreshReceipt = vi.fn(async () => undefined);
    const onTerminal = vi.fn(async () => undefined);

    await pollActiveRun({
      runId,
      wait: async () => undefined,
      shouldContinue: () => true,
      getRun,
      onRun,
      refreshReceipt,
      onTerminal,
    });

    expect(getRun).toHaveBeenCalledTimes(3);
    expect(onRun.mock.calls.map(([run]) => run.status)).toEqual([
      "running",
      "completed",
    ]);
    expect(onTerminal).toHaveBeenCalledOnce();
  });

  it("stops after three consecutive polling failures", async () => {
    const getRun = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(
      pollActiveRun({
        runId,
        wait: async () => undefined,
        shouldContinue: () => true,
        getRun,
        onRun: vi.fn(),
        refreshReceipt: vi.fn(async () => undefined),
        onTerminal: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("offline");
    expect(getRun).toHaveBeenCalledTimes(3);
  });

  it("retries a temporary Receipt refresh failure", async () => {
    const snapshots = [
      makeRun("running"),
      makeRun("running"),
      makeRun("completed"),
    ];
    const refreshReceipt = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary receipt failure"))
      .mockResolvedValue(undefined);
    const onTerminal = vi.fn(async () => undefined);

    await pollActiveRun({
      runId,
      wait: async () => undefined,
      shouldContinue: () => true,
      getRun: vi.fn(async () => ({ run: snapshots.shift()! })),
      onRun: vi.fn(),
      refreshReceipt,
      onTerminal,
    });

    expect(refreshReceipt).toHaveBeenCalledTimes(2);
    expect(onTerminal).toHaveBeenCalledOnce();
  });

  it("retries a temporary terminal refresh failure without dropping the Run", async () => {
    const getRun = vi.fn(async () => ({ run: makeRun("completed") }));
    const onRun = vi.fn();
    const onTerminal = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary message refresh failure"))
      .mockResolvedValue(undefined);

    await pollActiveRun({
      runId,
      wait: async () => undefined,
      shouldContinue: () => true,
      getRun,
      onRun,
      refreshReceipt: vi.fn(async () => undefined),
      onTerminal,
    });

    expect(getRun).toHaveBeenCalledTimes(2);
    expect(onRun.mock.calls.map(([run]) => run.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(onTerminal).toHaveBeenCalledTimes(2);
  });

  it("stops quietly when the selected Agent changes during a failed request", async () => {
    let selectedAgentMatches = true;
    const getRun = vi.fn(async () => {
      selectedAgentMatches = false;
      throw new Error("old Agent request failed after selection changed");
    });

    await pollActiveRun({
      runId,
      wait: async () => undefined,
      shouldContinue: () => selectedAgentMatches,
      getRun,
      onRun: vi.fn(),
      refreshReceipt: vi.fn(async () => undefined),
      onTerminal: vi.fn(async () => undefined),
    });

    expect(getRun).toHaveBeenCalledOnce();
  });
});
