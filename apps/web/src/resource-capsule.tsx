import type {
  AgentRun,
  CapsuleDenialReason,
  DecisionReceipt,
  DeniedRunResponse,
  ProtectedResource,
  ResourceSuggestion,
  SendMessageBody,
} from "./types";
import type { ResourceAdvisorState } from "./resource-advisor-coordinator";

export type { ResourceAdvisorState } from "./resource-advisor-coordinator";

export interface CapsuleProofContext {
  runId: string;
  agentId: string;
  resourceId: string;
}

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
 * suggestion remains advisory until the user confirms the read-only,
 * this-Run-only delegation. Confirmation only copies the existing Resource ID
 * into the picker; it never submits a Run or changes Entitlements.
 */
export function ResourceAdvisor({
  state,
  onSuggest,
  onUseSuggestion,
  selectedResourceId = null,
  disabled = false,
}: {
  state: ResourceAdvisorState;
  onSuggest: () => void;
  onUseSuggestion: (resourceId: string) => void;
  selectedResourceId?: string | null;
  disabled?: boolean;
}) {
  const suggestion = state.status === "suggested" ? state.suggestion : null;
  const selectedInPicker = suggestion?.resource.id === selectedResourceId;
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
          aria-busy={state.status === "loading"}
        >
          {state.status === "loading" ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <span>Checking…</span>
            </>
          ) : (
            "Suggest Resource"
          )}
        </button>
      </div>
      <div className="resource-advisor-result" role="status" aria-live="polite">
        {state.status === "idle" ? (
          <p>Suggestions use safe catalog metadata only. Manual selection remains unchanged.</p>
        ) : null}
        {state.status === "loading" ? <p>Checking eligible Resource metadata…</p> : null}
        {state.status === "no-match" ? (
          <p>No matching eligible Resource was found. You can still use the picker.</p>
        ) : null}
        {state.status === "error" ? (
          <p>
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
            <p
              className="resource-advisor-status"
              id="resource-advisor-selection-status"
            >
              {selectedInPicker
                ? "Selected in picker. Review or remove it in Resource Capsule before sending."
                : selectedResourceId
                  ? "A different Resource is selected. Confirmation will replace it."
                : "Suggestion only — nothing is delegated yet."}
            </p>
            <div
              className="resource-advisor-confirmation"
              aria-label="Confirm Resource delegation"
            >
              <div className="resource-advisor-confirmation-copy">
                <strong>Confirm delegation</strong>
                <span>read-only · this Run only</span>
              </div>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => onUseSuggestion(suggestion.resource.id)}
                disabled={disabled}
                aria-describedby="resource-advisor-selection-status"
              >
                Delegate for this Run
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function executionMessage(
  receipt: DecisionReceipt | null,
  run: AgentRun | null,
): string {
  if (!receipt) {
    return "Receipt evidence is pending; no Runner fact is inferred.";
  }
  if (receipt.runnerStarted) {
    return "The authorized Runner invocation was attempted.";
  }
  if (receipt.decision === "deny") {
    return "Expected security result — execution stopped before the Runner.";
  }
  if (run?.status === "cancelled") {
    return "The allowed Run was cancelled before Runner invocation.";
  }
  if (run?.status === "queued" || run?.status === "running") {
    return "Authorization is recorded; the Runner has not started yet.";
  }
  return "The allowed Run ended before Runner invocation.";
}

/**
 * Projects the existing Run and Decision Receipt facts into the three stages
 * defined by Issue #21. It does not invent timestamps, namespace checks, or
 * container health facts that are absent from those persisted contracts.
 */
export function DecisionProofChain({
  run,
  receipt,
  denied,
  submittedContext = null,
}: {
  run: AgentRun | null;
  receipt: DecisionReceipt | null;
  denied?: DeniedRunResponse | null;
  submittedContext?: CapsuleProofContext | null;
}) {
  const hasCapsuleContext = Boolean(receipt || denied || submittedContext);
  if (!hasCapsuleContext) return null;

  const correlationMismatch = Boolean(
    (run && receipt &&
      (run.id !== receipt.runId ||
        run.agentId !== receipt.agentId ||
        ((run.status === "denied") !== (receipt.decision === "deny")))) ||
      (run && denied &&
        (run.id !== denied.runId || run.status !== denied.status)) ||
      (receipt && denied &&
        (receipt.decision !== "deny" ||
          receipt.runId !== denied.runId ||
          receipt.receiptId !== denied.receiptId ||
          receipt.reason !== denied.reason)) ||
      (submittedContext && run &&
        (submittedContext.runId !== run.id ||
          submittedContext.agentId !== run.agentId)) ||
      (submittedContext && receipt &&
        (submittedContext.runId !== receipt.runId ||
          submittedContext.agentId !== receipt.agentId ||
          submittedContext.resourceId !== receipt.resourceId)) ||
      (submittedContext && denied && submittedContext.runId !== denied.runId),
  );
  if (correlationMismatch) {
    return (
      <article
        className="proof-chain proof-chain-pending"
        aria-label="Decision Proof Chain"
      >
        <div className="proof-heading">
          <div>
            <span className="eyebrow">Decision Proof Chain</span>
            <strong>Evidence correlation pending</strong>
          </div>
          <span className="proof-decision">Evidence unavailable</span>
        </div>
        <p className="proof-boundary">
          Run and Receipt facts did not correlate, so no proof stages were
          combined.
        </p>
      </article>
    );
  }

  const runId =
    receipt?.runId ??
    run?.id ??
    denied?.runId ??
    submittedContext?.runId ??
    "Awaiting Run";
  const agentId =
    receipt?.agentId ??
    run?.agentId ??
    submittedContext?.agentId ??
    "Awaiting Receipt";
  const resourceId =
    receipt?.resourceId ?? submittedContext?.resourceId ?? "Awaiting Receipt";
  const decisionTone = receipt?.decision ?? "pending";
  const decisionLabel = receipt
    ? receipt.decision === "allow"
      ? "Allowed"
      : "Denied"
    : "Decision pending";
  const decisionReason = receipt
    ? receipt.reason === "allowed"
      ? "The explicit delegation passed the current authorization checks."
      : denialLabels[receipt.reason]
    : "Awaiting Decision Receipt.";
  const runnerLabel = receipt
    ? receipt.runnerStarted
      ? "Runner started"
      : "Runner not started"
    : "Execution evidence pending";
  const runStatus = run?.status ?? denied?.status ?? "pending";

  return (
    <article
      className={"proof-chain proof-chain-" + decisionTone}
      aria-label="Decision Proof Chain"
    >
      <div className="proof-heading">
        <div>
          <span className="eyebrow">Decision Proof Chain</span>
          <strong>Delegation, authorization, and execution facts</strong>
        </div>
        <span className="proof-decision">{decisionLabel}</span>
      </div>
      <ol className="proof-stages">
        <li className="proof-stage">
          <div className="proof-stage-heading">
            <span>1</span>
            <div>
              <strong>Delegated</strong>
              <small>Explicit Resource scope for this Run</small>
            </div>
          </div>
          <dl>
            <div><dt>Principal</dt><dd>{receipt?.humanPrincipalId ?? "Awaiting Receipt"}</dd></div>
            <div><dt>Agent</dt><dd>{agentId}</dd></div>
            <div><dt>Resource</dt><dd>{resourceId}</dd></div>
            <div><dt>Mode</dt><dd>read-only</dd></div>
            <div><dt>Lifetime</dt><dd>this Run only</dd></div>
            <div><dt>Run</dt><dd>{runId}</dd></div>
          </dl>
        </li>
        <li className="proof-stage">
          <div className="proof-stage-heading">
            <span>2</span>
            <div>
              <strong>Decided</strong>
              <small>{decisionLabel}</small>
            </div>
          </div>
          <p>{decisionReason}</p>
          <dl>
            <div>
              <dt>Entitlement generation</dt>
              <dd>
                {receipt
                  ? receipt.grantGeneration ?? "not available"
                  : "Awaiting Receipt"}
              </dd>
            </div>
            <div>
              <dt>Receipt</dt>
              <dd>{receipt?.receiptId ?? denied?.receiptId ?? "Awaiting Receipt"}</dd>
            </div>
          </dl>
        </li>
        <li className="proof-stage">
          <div className="proof-stage-heading">
            <span>3</span>
            <div>
              <strong>Executed</strong>
              <small>{runnerLabel}</small>
            </div>
          </div>
          <p>{executionMessage(receipt, run)}</p>
          <dl>
            <div><dt>Runner</dt><dd>{runnerLabel}</dd></div>
            <div><dt>Run status</dt><dd>{runStatus}</dd></div>
          </dl>
        </li>
      </ol>
      <p className="proof-boundary">
        This chain reports stored Run and Receipt facts. It does not claim a
        per-Run namespace inspection or host-integrity attestation.
      </p>
    </article>
  );
}
