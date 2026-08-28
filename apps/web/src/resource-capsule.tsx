import type {
  DecisionReceipt,
  DeniedRunResponse,
  ProtectedResource,
  SendMessageBody,
} from "./types";

const denialLabels: Record<DeniedRunResponse["reason"], string> = {
  ownership_denied: "The current demo principal does not own this Agent.",
  unknown_resource: "The selected Resource is not registered.",
  entitlement_missing: "The current principal is not entitled to this Resource.",
  entitlement_revoked: "Access to this Resource has been revoked.",
  stale_entitlement_generation: "The Resource grant changed before this Run started.",
  runtime_profile_unsupported: "Capsule Runs require the container Runtime profile.",
  invalid_resource_path: "The registered Resource path failed safety validation.",
};

export function buildSendMessageBody(
  content: string,
  selectedResourceId: string | null,
): SendMessageBody {
  return selectedResourceId
    ? { content, resourceIds: [selectedResourceId] }
    : { content };
}

export function ResourcePicker({
  resources,
  selectedResourceId,
  onSelect,
  disabled = false,
  unavailableMessage,
}: {
  resources: ProtectedResource[];
  selectedResourceId: string | null;
  onSelect: (resourceId: string | null) => void;
  disabled?: boolean;
  unavailableMessage?: string | null;
}) {
  return (
    <section className="resource-picker" aria-label="Resource Capsule">
      <div className="resource-picker-heading">
        <div>
          <strong>Resource Capsule</strong>
          <span>Explicitly delegate zero or one read-only Resource to this Run.</span>
        </div>
        {selectedResourceId ? (
          <button
            type="button"
            className="resource-remove"
            onClick={() => onSelect(null)}
            disabled={disabled}
          >
            Remove
          </button>
        ) : (
          <span className="baseline-badge">Baseline Run</span>
        )}
      </div>
      <label>
        Protected Resource
        <select
          value={selectedResourceId ?? ""}
          onChange={(event) => onSelect(event.target.value || null)}
          disabled={disabled || resources.length === 0}
        >
          <option value="">No Resource</option>
          {resources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.displayName}
            </option>
          ))}
        </select>
      </label>
      {unavailableMessage ? (
        <p className="resource-picker-note">{unavailableMessage}</p>
      ) : selectedResourceId ? (
        <p className="resource-picker-note">
          You approved a read-only delegation for this Run only.
        </p>
      ) : null}
    </section>
  );
}

export function DecisionReceiptCard({
  receipt,
  denied,
}: {
  receipt: DecisionReceipt | null;
  denied?: DeniedRunResponse | null;
}) {
  const decision = receipt?.decision ?? denied?.status;
  const reason = receipt?.reason ?? denied?.reason;
  if (!decision || !reason) return null;

  const runId = receipt?.runId ?? denied?.runId ?? "";
  const receiptId = receipt?.receiptId ?? denied?.receiptId ?? "";
  return (
    <article
      className={"receipt-card receipt-" + (decision === "allow" ? "allow" : "deny")}
      aria-label="Decision Receipt"
    >
      <div className="receipt-heading">
        <div>
          <span className="eyebrow">Decision Receipt</span>
          <strong>{decision === "allow" ? "Resource authorized" : "Run denied"}</strong>
        </div>
        <span className="receipt-decision">{decision}</span>
      </div>
      <p>
        {reason === "allowed"
          ? "The approved read-only mount crossed the Runtime seam."
          : (denialLabels[reason] ?? "Run denied by server policy.")}
      </p>
      <dl>
        <div><dt>Run</dt><dd>{runId}</dd></div>
        <div><dt>Receipt</dt><dd>{receiptId}</dd></div>
        {receipt ? <div><dt>Principal</dt><dd>{receipt.humanPrincipalId}</dd></div> : null}
        {receipt ? <div><dt>Agent</dt><dd>{receipt.agentId}</dd></div> : null}
        {receipt ? <div><dt>Resource</dt><dd>{receipt.resourceId}</dd></div> : null}
        {receipt ? (
          <div>
            <dt>Grant generation</dt>
            <dd>{receipt.grantGeneration ?? "not available"}</dd>
          </div>
        ) : null}
        {receipt ? (
          <div><dt>Runner started</dt><dd>{receipt.runnerStarted ? "yes" : "no"}</dd></div>
        ) : null}
        {receipt ? <div><dt>Created</dt><dd>{receipt.createdAt}</dd></div> : null}
      </dl>
      {!receipt ? (
        <span className="receipt-pending">Receipt details are awaiting the query seam.</span>
      ) : null}
    </article>
  );
}
