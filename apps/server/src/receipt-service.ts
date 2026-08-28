import { HttpError } from "./errors.js";
import type { ReceiptSink } from "./receipt-store.js";
import type {
  AgentOwnershipReader,
  DecisionReceipt,
  HumanPrincipalId,
  ReceiptReader,
  RunReceiptsResponse,
} from "./types.js";

export interface ReceiptRepository extends ReceiptReader, ReceiptSink {}

export interface ReceiptRunReader {
  getAgentIdForRun(runId: string): string | undefined;
}

function safeReceipt(receipt: DecisionReceipt): DecisionReceipt {
  const base = {
    receiptId: receipt.receiptId,
    runId: receipt.runId,
    humanPrincipalId: receipt.humanPrincipalId,
    agentId: receipt.agentId,
    resourceId: receipt.resourceId,
    createdAt: receipt.createdAt,
  };

  if (receipt.decision === "allow") {
    return {
      ...base,
      decision: "allow",
      reason: "allowed",
      grantGeneration: receipt.grantGeneration,
      runnerStarted: true,
    };
  }

  return {
    ...base,
    decision: "deny",
    reason: receipt.reason,
    grantGeneration: receipt.grantGeneration,
    runnerStarted: false,
  };
}

// The single P5 service used at both sides of the Receipt seam. Admission
// records through ReceiptSink; the independent route queries through the
// principal-scoped method below. Explicit field picking is intentional: a
// structurally compatible object with extra prompt/path/token fields cannot
// turn Receipt persistence into a second data leak.
export class DecisionReceiptService implements ReceiptSink, ReceiptReader {
  constructor(
    private readonly repository: ReceiptRepository,
    private readonly runs: ReceiptRunReader,
    private readonly ownership: AgentOwnershipReader,
  ) {}

  add(receipt: DecisionReceipt): void {
    if (this.repository.getReceiptsForRun(receipt.runId).length > 0) {
      throw new Error("A Capsule Run may have only one Decision Receipt");
    }
    this.repository.add(safeReceipt(receipt));
  }

  getReceiptsForRun(runId: string): DecisionReceipt[] {
    return this.repository.getReceiptsForRun(runId).map(safeReceipt);
  }

  getReceiptsForPrincipal(
    runId: string,
    principalId: HumanPrincipalId,
  ): RunReceiptsResponse {
    const agentId = this.runs.getAgentIdForRun(runId);
    if (
      !agentId ||
      this.ownership.getOwnerPrincipalId(agentId) !== principalId
    ) {
      // Do not reveal whether another principal's Run exists.
      throw new HttpError(404, "Run not found");
    }
    return { receipts: this.getReceiptsForRun(runId) };
  }
}

