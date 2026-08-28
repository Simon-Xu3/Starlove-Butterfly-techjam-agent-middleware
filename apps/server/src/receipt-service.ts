import { HttpError } from "./errors.js";
import { z } from "zod";
import type { ReceiptSink } from "./receipt-store.js";
import type {
  AgentOwnershipReader,
  CapsuleDenialReason,
  DecisionReceipt,
  HumanPrincipalId,
  ReceiptReader,
  RunReceiptsResponse,
} from "./types.js";

export interface ReceiptRepository extends ReceiptReader, ReceiptSink {}

export interface ReceiptRunReader {
  getAgentIdForRun(runId: string): string | undefined;
}

const denialReasons = [
  "ownership_denied",
  "unknown_resource",
  "entitlement_missing",
  "entitlement_revoked",
  "stale_entitlement_generation",
  "runtime_profile_unsupported",
  "invalid_resource_path",
] as const satisfies readonly CapsuleDenialReason[];

const receiptBase = {
  receiptId: z.string().uuid(),
  runId: z.string().uuid(),
  humanPrincipalId: z.enum(["user-a", "user-b"]),
  agentId: z.string().uuid(),
  resourceId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  createdAt: z.iso.datetime(),
};

// These schemas intentionally strip unknown keys while validating every
// value that the safe Receipt UI is allowed to render. Field picking alone
// does not protect against a prompt or host path smuggled inside a nominal
// correlation field such as reason, resourceId, or createdAt.
const decisionReceiptSchema = z.discriminatedUnion("decision", [
  z.object({
    ...receiptBase,
    decision: z.literal("allow"),
    reason: z.literal("allowed"),
    grantGeneration: z.number().int().nonnegative(),
    runnerStarted: z.literal(true),
  }),
  z.object({
    ...receiptBase,
    decision: z.literal("deny"),
    reason: z.enum(denialReasons),
    grantGeneration: z.number().int().nonnegative().nullable(),
    runnerStarted: z.literal(false),
  }),
]);

function safeReceipt(receipt: unknown): DecisionReceipt {
  const parsed = decisionReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    // Do not attach the validation error: it may contain values from a
    // corrupted persistence record and could otherwise reach logs or HTTP.
    throw new Error("Invalid Decision Receipt record");
  }
  return parsed.data;
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
    const sanitized = safeReceipt(receipt);
    if (this.runs.getAgentIdForRun(sanitized.runId) !== sanitized.agentId) {
      throw new Error("Decision Receipt does not match its Run");
    }
    if (this.repository.getReceiptsForRun(sanitized.runId).length > 0) {
      throw new Error("A Capsule Run may have only one Decision Receipt");
    }
    this.repository.add(sanitized);
  }

  getReceiptsForRun(runId: string): DecisionReceipt[] {
    const receipts = this.repository.getReceiptsForRun(runId).map(safeReceipt);
    if (receipts.length > 1) {
      throw new Error("A Capsule Run has multiple Decision Receipts");
    }
    return receipts;
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
    const receipts = this.getReceiptsForRun(runId);
    if (
      receipts.some(
        (receipt) =>
          receipt.runId !== runId ||
          receipt.agentId !== agentId ||
          receipt.humanPrincipalId !== principalId,
      )
    ) {
      throw new Error("Decision Receipt correlation mismatch");
    }
    return { receipts };
  }
}
