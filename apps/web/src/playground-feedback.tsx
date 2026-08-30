import type { AgentRun, DecisionReceipt } from "./types";

type ScrollPane = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop" | "scrollTo">;

export function isNearMessageEnd(pane: ScrollPane, threshold = 48): boolean {
  return pane.scrollHeight - pane.scrollTop - pane.clientHeight <= threshold;
}

export function scrollMessagePaneToEnd(
  pane: ScrollPane,
  behavior: ScrollBehavior = "smooth",
): void {
  pane.scrollTo({ top: pane.scrollHeight, behavior });
}

export function describeRunProgress(
  run: AgentRun,
  receipt: DecisionReceipt | null,
): { label: string; tone: "active" | "success" | "danger" | "muted" } {
  switch (run.status) {
    case "queued":
      return { label: "Run submitted", tone: "active" };
    case "running":
      return receipt?.runnerStarted
        ? { label: "Runner started", tone: "active" }
        : { label: "Run in progress", tone: "active" };
    case "completed":
      return { label: "Run completed", tone: "success" };
    case "denied":
      return { label: "Run denied", tone: "danger" };
    case "failed":
      return { label: "Run failed", tone: "danger" };
    case "cancelled":
      return { label: "Run cancelled", tone: "muted" };
  }
}

export function RunProgressBanner({
  run,
  receipt,
  resourceLabel,
}: {
  run: AgentRun;
  receipt: DecisionReceipt | null;
  resourceLabel: string | null;
}) {
  const progress = describeRunProgress(run, receipt);
  return (
    <div className={"run-progress run-progress-" + progress.tone} aria-live="polite">
      <span className="run-progress-dot" />
      <span>
        <strong>{progress.label}</strong>
        <small>{resourceLabel ? "Resource · " + resourceLabel : "Baseline Run"}</small>
      </span>
    </div>
  );
}

