// The ReceiptSink write seam, plus an in-memory implementation kept for
// tests. Production wires DecisionReceiptService over StoreReceiptRepository
// (see index.ts), so Receipts are persisted and survive a restart; this
// class is no longer part of the running app.
import type { DecisionReceipt, ReceiptReader } from "./types.js";

export interface ReceiptSink {
  add(receipt: DecisionReceipt): void;
}

export class InMemoryReceiptStore implements ReceiptReader, ReceiptSink {
  private readonly receipts: DecisionReceipt[] = [];

  add(receipt: DecisionReceipt): void {
    this.receipts.push(structuredClone(receipt));
  }

  getReceiptsForRun(runId: string): DecisionReceipt[] {
    return this.receipts
      .filter((receipt) => receipt.runId === runId)
      .map((receipt) => structuredClone(receipt));
  }
}
