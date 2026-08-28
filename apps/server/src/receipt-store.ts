// In-memory Decision Receipt store (Issue #3 integration stub). P5's real
// Receipt service backed by P2's version 2 persistence replaces this at the
// Day 1 gate; until then Receipts do not survive a server restart.
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
