import type {
  AgentRun,
  CapsuleDenialReason,
  DecisionReceipt,
  DeniedRunResponse,
  HumanPrincipalId,
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

type ProofStageTone = "pending" | "success" | "danger" | "muted";

interface ProofStage {
  name: "Delegated" | "Decided" | "Executed";
  label: string;
  description: string;
  tone: ProofStageTone;
}

export interface DecisionProofProjection {
  outcome: "pending" | "allow" | "deny";
  title: string;
  stages: [ProofStage, ProofStage, ProofStage];
  principalId: HumanPrincipalId | null;
  agentId: string | null;
  resourceId: string | null;
  grantGeneration: number | null;
  runnerStarted: boolean | null;
  runStatus: AgentRun["status"] | "pending";
  runId: string | null;
  receiptId: string | null;
}

export function projectDecisionProof({
  receipt,
  denied,
  run,
  principalId = null,
  agentId = null,
  resourceId = null,
}: {
  receipt: DecisionReceipt | null;
  denied?: DeniedRunResponse | null;
  run?: AgentRun | null;
  principalId?: HumanPrincipalId | null;
  agentId?: string | null;
  resourceId?: string | null;
}): DecisionProofProjection {
  const delegatedResourceId = receipt?.resourceId ?? resourceId;
  const decision = receipt?.decision ?? (denied ? "deny" : null);
  const reason = receipt?.reason ?? denied?.reason;
  const runStatus = run?.status ?? (denied ? "denied" : "pending");
  const runnerStarted = receipt?.runnerStarted ?? (denied ? false : null);

  const delegated: ProofStage = delegatedResourceId
    ? {
        name: "Delegated",
        label: "Resource selected",
        description: `${delegatedResourceId} · read-only · this Run only`,
        tone: "success",
      }
    : {
        name: "Delegated",
        label: "Awaiting evidence",
        description: "Waiting for the correlated Resource delegation.",
        tone: "pending",
      };

  const decided: ProofStage = decision
    ? decision === "allow"
      ? {
          name: "Decided",
          label: "Allowed",
          description: "The server recorded an allow decision.",
          tone: "success",
        }
      : {
          name: "Decided",
          label: "Denied",
          description:
            reason && reason !== "allowed"
              ? denialLabels[reason]
              : "Run denied by server policy.",
          tone: "danger",
        }
    : {
        name: "Decided",
        label: "Pending",
        description: "Waiting for the Decision Receipt.",
        tone: "pending",
      };

  let executed: ProofStage;
  if (runnerStarted === true) {
    executed = {
      name: "Executed",
      label: "Runner started",
      description: "Runner invocation was attempted; the final Run status is shown below.",
      tone: "success",
    };
  } else if (decision === "deny") {
    executed = {
      name: "Executed",
      label: "Blocked before Runner",
      description: "Runner was not started. This is the expected security outcome.",
      tone: "danger",
    };
  } else if (decision === "allow") {
    executed = runStatus === "cancelled"
      ? {
          name: "Executed",
          label: "Cancelled before Runner",
          description: "Execution did not start; the recorded allow decision is unchanged.",
          tone: "muted",
        }
      : {
          name: "Executed",
          label: "Not started",
          description: "Authorization is recorded; the Runner has not started.",
          tone: "pending",
        };
  } else {
    executed = {
      name: "Executed",
      label: "Pending",
      description: "Waiting for Runner-start evidence.",
      tone: "pending",
    };
  }

  return {
    outcome: decision ?? "pending",
    title:
      decision === "allow"
        ? "Resource authorized"
        : decision === "deny"
          ? "Run denied"
          : "Decision pending",
    stages: [delegated, decided, executed],
    principalId: receipt?.humanPrincipalId ?? principalId,
    agentId: receipt?.agentId ?? agentId,
    resourceId: delegatedResourceId,
    grantGeneration: receipt?.grantGeneration ?? null,
    runnerStarted,
    runStatus,
    runId: receipt?.runId ?? denied?.runId ?? run?.id ?? null,
    receiptId: receipt?.receiptId ?? denied?.receiptId ?? null,
  };
}

export function DecisionReceiptCard({
  receipt,
  denied,
  run,
  principalId,
  agentId,
  resourceId,
}: {
  receipt: DecisionReceipt | null;
  denied?: DeniedRunResponse | null;
  run?: AgentRun | null;
  principalId?: HumanPrincipalId | null;
  agentId?: string | null;
  resourceId?: string | null;
}) {
  const proof = projectDecisionProof({
    receipt,
    denied,
    run,
    principalId,
    agentId,
    resourceId,
  });
  if (!proof.resourceId && !receipt && !denied) return null;

  return (
    <article
      className={`receipt-card receipt-outcome-${proof.outcome}`}
      aria-label="Decision Proof Chain"
    >
      <div className="receipt-heading">
        <div>
          <span className="eyebrow">Decision Proof Chain</span>
          <strong>{proof.title}</strong>
        </div>
        <span className="receipt-decision">{proof.outcome}</span>
      </div>

      <ol className="proof-chain" aria-label="Delegated, decided, executed">
        {proof.stages.map((stage, index) => (
          <li className={`proof-stage proof-stage-${stage.tone}`} key={stage.name}>
            <span className="proof-stage-number" aria-hidden="true">{index + 1}</span>
            <div>
              <span className="proof-stage-name">{stage.name}</span>
              <strong>{stage.label}</strong>
              <p>{stage.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <dl className="proof-facts">
        <div><dt>Principal</dt><dd>{proof.principalId ?? "awaiting Receipt"}</dd></div>
        <div><dt>Agent</dt><dd>{proof.agentId ?? "awaiting Receipt"}</dd></div>
        <div><dt>Resource</dt><dd>{proof.resourceId ?? "awaiting Receipt"}</dd></div>
        <div><dt>Access</dt><dd>read-only</dd></div>
        <div><dt>Lifetime</dt><dd>this Run only</dd></div>
        <div>
          <dt>Grant generation</dt>
          <dd>{proof.grantGeneration ?? "not available"}</dd>
        </div>
        <div>
          <dt>Runner started</dt>
          <dd>{proof.runnerStarted === null ? "pending" : proof.runnerStarted ? "yes" : "no"}</dd>
        </div>
        <div><dt>Run status</dt><dd>{proof.runStatus}</dd></div>
        <div><dt>Run</dt><dd>{proof.runId ?? "pending"}</dd></div>
        <div><dt>Receipt</dt><dd>{proof.receiptId ?? "pending"}</dd></div>
      </dl>
      {!receipt && proof.outcome === "pending" ? (
        <span className="receipt-pending">Receipt details are awaiting the query seam.</span>
      ) : null}
    </article>
  );
}
