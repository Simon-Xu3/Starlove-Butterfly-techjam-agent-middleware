import type {
  ReceiptRepository,
  ReceiptRunReader,
} from "./receipt-service.js";
import type { JsonStore } from "./store.js";
import type { DecisionReceipt } from "./types.js";

/**
 * Store-backed Receipt repository (#8 wiring). An in-memory mirror is the
 * synchronous source of truth for the sync ReceiptSink/ReceiptReader seams,
 * write-through-persisted to DatabaseV2.receipts so Receipts survive a
 * restart. The mirror is loaded lazily on first use — always after
 * store.initialize() has run, since every request is served post-init — so a
 * restart rehydrates it from disk.
 *
 * Known limit: `add` persists fire-and-forget through the async store, so a
 * crash between the in-memory push and the queued persist can lose the last
 * Receipt from disk. Acceptable for the demo — the Run itself is already
 * persisted, and reads within the process stay consistent via the mirror.
 */
export class StoreReceiptRepository implements ReceiptRepository {
  private mirror: DecisionReceipt[] | null = null;

  constructor(private readonly store: JsonStore) {}

  private ensureLoaded(): DecisionReceipt[] {
    if (this.mirror === null) {
      this.mirror = structuredClone(this.store.snapshot().receipts);
    }
    return this.mirror;
  }

  add(receipt: DecisionReceipt): void {
    this.ensureLoaded().push(structuredClone(receipt));
    void this.store.mutate((database) => {
      database.receipts.push(structuredClone(receipt));
    });
  }

  getReceiptsForRun(runId: string): DecisionReceipt[] {
    return this.ensureLoaded()
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
