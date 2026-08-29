// The ReceiptSink write seam, plus an in-memory implementation kept for
// tests. Production wires DecisionReceiptService over StoreReceiptRepository
// (see index.ts), so Receipts are persisted and survive a restart; this
// class is no longer part of the running app.
import type {
  DatabaseV2,
  DecisionReceipt,
  ReceiptReader,
} from "./types.js";

export interface ReceiptSink {
  add(receipt: DecisionReceipt, transaction?: DatabaseV2): Promise<void>;
  replace(receipt: DecisionReceipt, transaction?: DatabaseV2): Promise<void>;
}

export class InMemoryReceiptStore implements ReceiptReader, ReceiptSink {
  private readonly receipts: DecisionReceipt[] = [];

  async add(receipt: DecisionReceipt, transaction?: DatabaseV2): Promise<void> {
    if (transaction) transaction.receipts.push(structuredClone(receipt));
    this.receipts.push(structuredClone(receipt));
  }

  async replace(
    receipt: DecisionReceipt,
    transaction?: DatabaseV2,
  ): Promise<void> {
    if (transaction) {
      const transactionIndex = transaction.receipts.findIndex(
        (candidate) => candidate.receiptId === receipt.receiptId,
      );
      if (transactionIndex < 0) {
        throw new Error("Decision Receipt not found");
      }
      transaction.receipts[transactionIndex] = structuredClone(receipt);
    }
    const index = this.receipts.findIndex(
      (candidate) => candidate.receiptId === receipt.receiptId,
    );
    if (index < 0) {
      throw new Error("Decision Receipt not found");
    }
    this.receipts[index] = structuredClone(receipt);
  }

  getReceiptsForRun(runId: string): DecisionReceipt[] {
    return this.receipts
      .filter((receipt) => receipt.runId === runId)
      .map((receipt) => structuredClone(receipt));
  }
}
