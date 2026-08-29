import type { AgentRun } from "./types";

interface ActiveRunPollOptions {
  runId: string;
  wait: () => Promise<void>;
  shouldContinue: () => boolean;
  getRun: (runId: string) => Promise<{ run: AgentRun }>;
  onRun: (run: AgentRun) => void;
  refreshReceipt: (runId: string) => Promise<void>;
  onTerminal: (run: AgentRun) => Promise<void>;
}

const ACTIVE_STATUSES = new Set<AgentRun["status"]>(["queued", "running"]);

// Refreshing the Receipt for every active snapshot lets the UI observe the
// pre-Runtime false -> true transition without waiting for the Run to finish.
// Baseline Runs safely return an empty Receipt collection from the same seam.
export async function pollActiveRun({
  runId,
  wait,
  shouldContinue,
  getRun,
  onRun,
  refreshReceipt,
  onTerminal,
}: ActiveRunPollOptions): Promise<void> {
  while (shouldContinue()) {
    await wait();
    if (!shouldContinue()) return;

    const { run } = await getRun(runId);
    if (!shouldContinue()) return;
    onRun(run);

    if (ACTIVE_STATUSES.has(run.status)) {
      await refreshReceipt(runId);
      continue;
    }

    await onTerminal(run);
    return;
  }
}
