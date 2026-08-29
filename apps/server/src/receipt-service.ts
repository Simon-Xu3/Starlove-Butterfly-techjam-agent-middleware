import { HttpError } from "./errors.js";
import { z } from "zod";
import type { ReceiptSink } from "./receipt-store.js";
import type {
  AgentOwnershipReader,
  DatabaseV2,
  DecisionReceipt,
  HumanPrincipalId,
  ReceiptReader,
  RunReceiptsResponse,
} from "./types.js";

export interface ReceiptRepository extends ReceiptReader, ReceiptSink {}

export interface ReceiptRunReader {
  getAgentIdForRun(runId: string): string | undefined;
}

const publicDenialReasons = [
  "unknown_resource",
  "entitlement_missing",
  "entitlement_revoked",
  "stale_entitlement_generation",
  "runtime_profile_unsupported",
  "invalid_resource_path",
] as const;

const persistedDenialReasons = [
  "ownership_denied",
  ...publicDenialReasons,
] as const;

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
    grantGeneration: z.number().int().positive(),
    runnerStarted: z.boolean(),
  }),
  z.object({
    ...receiptBase,
    decision: z.literal("deny"),
    reason: z.enum(persistedDenialReasons),
    grantGeneration: z.number().int().positive().nullable(),
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

function safeWritableReceipt(receipt: unknown): DecisionReceipt {
  const sanitized = safeReceipt(receipt);
  if (sanitized.decision === "deny" && sanitized.reason === "ownership_denied") {
    throw new Error("ownership_denied is a read-only legacy Receipt reason");
  }
  return sanitized;
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

  async add(receipt: DecisionReceipt, transaction?: DatabaseV2): Promise<void> {
    const sanitized = safeWritableReceipt(receipt);
    const runAgentId = transaction
      ? transaction.runs.find((run) => run.id === sanitized.runId)?.agentId
      : this.runs.getAgentIdForRun(sanitized.runId);
    if (runAgentId !== sanitized.agentId) {
      throw new Error("Decision Receipt does not match its Run");
    }
    const existing = transaction
      ? transaction.receipts.filter((item) => item.runId === sanitized.runId)
      : this.repository.getReceiptsForRun(sanitized.runId);
    if (existing.length > 0) {
      throw new Error("A Capsule Run may have only one Decision Receipt");
    }
    await this.repository.add(sanitized, transaction);
  }

  async replace(
    receipt: DecisionReceipt,
    transaction?: DatabaseV2,
  ): Promise<void> {
    const sanitized = safeWritableReceipt(receipt);
    const existing = transaction
      ? transaction.receipts.filter((item) => item.runId === sanitized.runId)
      : this.repository.getReceiptsForRun(sanitized.runId);
    if (existing.length !== 1) {
      throw new Error("A Capsule Run must have one Decision Receipt to update");
    }
    const current = existing[0];
    if (
      !current ||
      current.receiptId !== sanitized.receiptId ||
      current.runId !== sanitized.runId ||
      current.humanPrincipalId !== sanitized.humanPrincipalId ||
      current.agentId !== sanitized.agentId ||
      current.resourceId !== sanitized.resourceId ||
      current.createdAt !== sanitized.createdAt ||
      current.grantGeneration !== sanitized.grantGeneration ||
      (transaction
        ? transaction.runs.find((run) => run.id === sanitized.runId)?.agentId
        : this.runs.getAgentIdForRun(sanitized.runId)) !== sanitized.agentId
    ) {
      throw new Error("Decision Receipt update correlation mismatch");
    }
    await this.repository.replace(sanitized, transaction);
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
    // A pre-ADR-003 ownership denial names the probing non-owner as the Human
    // Principal. Only the Agent owner may reach this point; retain that one
    // historical exception without weakening Run/Agent correlation or
    // granting the probing principal read access.
    if (
      receipts.some(
        (receipt) =>
          receipt.runId !== runId ||
          receipt.agentId !== agentId ||
          (receipt.humanPrincipalId !== principalId &&
            !(
              receipt.decision === "deny" &&
              receipt.reason === "ownership_denied"
            )),
      )
    ) {
      throw new Error("Decision Receipt correlation mismatch");
    }
    return { receipts };
  }
}
