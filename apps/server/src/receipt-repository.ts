import type {
  ReceiptRepository,
  ReceiptRunReader,
} from "./receipt-service.js";
import type { JsonStore } from "./store.js";
import type { DatabaseV2, DecisionReceipt } from "./types.js";

/**
 * Store-backed Receipt repository (#8 wiring). JsonStore is the durable source
 * of truth for the async ReceiptSink seam. Both insertion and pre-Runtime
 * evidence updates await persistence before resolving; readers use the
 * committed store snapshot, so process and disk state cannot diverge through
 * a fire-and-forget mirror.
 */
export class StoreReceiptRepository implements ReceiptRepository {
  constructor(private readonly store: JsonStore) {}

  async add(receipt: DecisionReceipt, transaction?: DatabaseV2): Promise<void> {
    if (transaction) {
      transaction.receipts.push(structuredClone(receipt));
      return;
    }
    await this.store.mutate((database) => {
      database.receipts.push(structuredClone(receipt));
    });
  }

  async replace(
    receipt: DecisionReceipt,
    transaction?: DatabaseV2,
  ): Promise<void> {
    if (transaction) {
      this.replaceIn(transaction, receipt);
      return;
    }
    await this.store.mutate((database) => {
      this.replaceIn(database, receipt);
    });
  }

  private replaceIn(database: DatabaseV2, receipt: DecisionReceipt): void {
    const index = database.receipts.findIndex(
      (candidate) => candidate.receiptId === receipt.receiptId,
    );
    if (index < 0) {
      throw new Error("Decision Receipt not found");
    }
    database.receipts[index] = structuredClone(receipt);
  }

  getReceiptsForRun(runId: string): DecisionReceipt[] {
    return this.store
      .snapshot()
      .receipts
      .filter((receipt) => receipt.runId === runId)
      .map((receipt) => structuredClone(receipt));
  }
}

export function createStoreRunReader(store: JsonStore): ReceiptRunReader {
  return {
    getAgentIdForRun(runId) {
      return store.snapshot().runs.find((run) => run.id === runId)?.agentId;
    },
  };
}
