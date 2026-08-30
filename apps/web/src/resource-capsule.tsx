import type {
  CapsuleDenialReason,
  DecisionReceipt,
  DeniedRunResponse,
  ProtectedResource,
  ResourceSuggestion,
  SendMessageBody,
} from "./types";
import type { ResourceAdvisorState } from "./resource-advisor-coordinator";

export type { ResourceAdvisorState } from "./resource-advisor-coordinator";

const denialLabels: Record<CapsuleDenialReason, string> = {
  ownership_denied:
    "A legacy Receipt recorded an ownership denial before Agent lookup was hidden.",
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
      <p className="resource-picker-note">
        Revocation blocks future Runner starts only; it does not hot-unmount an
        active Run or erase content already retained in model or thread memory.
      </p>
    </section>
  );
}

/**
 * The Advisor is deliberately a separate panel from ResourcePicker. A
 * suggestion can be explicitly copied into the picker, but never mutates the
 * selected delegation or submits a Run on its own.
 */
export function ResourceAdvisor({
  state,
  onSuggest,
  onUseSuggestion,
  disabled = false,
}: {
  state: ResourceAdvisorState;
  onSuggest: () => void;
  onUseSuggestion: (resourceId: string) => void;
  disabled?: boolean;
}) {
  const suggestion = state.status === "suggested" ? state.suggestion : null;
  return (
    <section className="resource-advisor" aria-label="Resource Advisor">
      <div className="resource-advisor-heading">
        <div>
          <strong>Resource Advisor</strong>
          <span>Suggest an eligible Resource from this task text.</span>
        </div>
        <button
          type="button"
          className="button button-ghost advisor-action"
          onClick={onSuggest}
          disabled={disabled || state.status === "loading"}
        >
          {state.status === "loading" ? (
            <span className="spinner" aria-label="Loading" />
          ) : (
            "Suggest Resource"
          )}
        </button>
      </div>
      <div className="resource-advisor-result" aria-live="polite">
        {state.status === "idle" ? (
          <p>Suggestions use safe catalog metadata only. Manual selection remains unchanged.</p>
        ) : null}
        {state.status === "loading" ? <p>Checking eligible Resource metadata…</p> : null}
        {state.status === "no-match" ? (
          <p>No matching eligible Resource was found. You can still use the picker.</p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert">
            {state.message} You can retry or use the picker without a suggestion.
          </p>
        ) : null}
        {suggestion ? (
          <div className="resource-advisor-suggestion">
            <div>
              <strong>{suggestion.resource.displayName}</strong>
              <span>{suggestion.resource.description}</span>
            </div>
            <div className="resource-advisor-tags">
              {suggestion.resource.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <small>
              Matched {suggestion.reason.replaceAll("_", " ")}: {suggestion.matchedTerms.join(", ")}
            </small>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => onUseSuggestion(suggestion.resource.id)}
              disabled={disabled}
            >
              Choose in picker
            </button>
          </div>
        ) : null}
      </div>
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
          ? receipt?.runnerStarted
            ? "The approved read-only mount crossed the Runtime seam."
            : "Authorization is recorded; the Runner has not started."
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
