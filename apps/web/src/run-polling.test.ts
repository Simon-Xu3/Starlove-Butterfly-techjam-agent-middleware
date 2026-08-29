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
});
