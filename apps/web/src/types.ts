export type AgentStatus = "ready" | "busy" | "stopped" | "error";
export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "denied";

export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  status: AgentStatus;
  workspacePath: string;
  codexThreadId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  agentId: string;
  runId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  status: RunStatus;
  prompt: string;
  output: string | null;
  error: string | null;
  usage: {
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
  } | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Run-scoped Resource Capsule — frozen client-safe contracts (Issue #2).
// Mirrors apps/server/src/types.ts. Nothing here may carry a host path,
// token, demo session value, or Resource body.
// ---------------------------------------------------------------------------

// Mock demo identity header value is chosen by the demo UI; the server maps
// demo-session-a -> user-a and demo-session-b -> user-b. The values are
// mock identity, not secrets.
export const DEMO_SESSION_HEADER = "x-demo-session";

export const DEMO_SESSION_VALUES = ["demo-session-a", "demo-session-b"] as const;

export type DemoSessionValue = (typeof DEMO_SESSION_VALUES)[number];

export type HumanPrincipalId = "user-a" | "user-b";

// Safe Resource metadata shown by the Resource Picker.
export interface ProtectedResource {
  id: string;
  displayName: string;
  kind: "directory";
}

export type CapsuleDenialReason =
  | "ownership_denied"
  | "unknown_resource"
  | "entitlement_missing"
  | "entitlement_revoked"
  | "stale_entitlement_generation"
  | "runtime_profile_unsupported"
  | "invalid_resource_path";

export type CapsuleDecision = "allow" | "deny";

export type CapsuleDecisionReason = "allowed" | CapsuleDenialReason;

// Discriminated on decision, mirroring the server contract: an allow
// Receipt always carries a generation, a deny Receipt never started the
// Runner.
interface DecisionReceiptBase {
  receiptId: string;
  runId: string;
  humanPrincipalId: HumanPrincipalId;
  agentId: string;
  resourceId: string;
  createdAt: string;
}

export interface AllowDecisionReceipt extends DecisionReceiptBase {
  decision: "allow";
  reason: "allowed";
  grantGeneration: number;
  runnerStarted: boolean;
}

export interface DenyDecisionReceipt extends DecisionReceiptBase {
  decision: "deny";
  reason: CapsuleDenialReason;
  grantGeneration: number | null;
  runnerStarted: false;
}

export type DecisionReceipt = AllowDecisionReceipt | DenyDecisionReceipt;

// POST /api/agents/:agentId/messages body. Omitted or empty resourceIds is a
// baseline Run; exactly one ID is a Capsule Run.
export interface SendMessageBody {
  content: string;
  resourceIds?: string[] | undefined;
}

// The 202 body when admission succeeds (baseline and allowed Capsule Runs).
export interface AcceptedRunResponse {
  run: AgentRun;
  message: Message;
}

// The 403 body when a Capsule Run is denied. Rendered as a terminal denied
// Run with its Receipt, never discarded as a generic error.
export interface DeniedRunResponse {
  runId: string;
  receiptId: string;
  status: "denied";
  reason: CapsuleDenialReason;
}

export interface RunReceiptsResponse {
  receipts: DecisionReceipt[];
}

// Safe eligible Resources for the Resource Picker.
export interface ListResourcesResponse {
  resources: ProtectedResource[];
}

// Entitlement record mirrored from the server contract. Contains no host
// path and is safe to render.
export interface PrincipalResourceEntitlement {
  principalId: HumanPrincipalId;
  resourceId: string;
  permission: "read";
  status: "active" | "revoked";
  generation: number;
  createdAt: string;
  revokedAt: string | null;
}

export interface ListEntitlementsResponse {
  entitlements: PrincipalResourceEntitlement[];
}

// Grant, re-grant, and revoke all send only the Resource ID; identity comes
// from the demo session header.
export interface EntitlementMutationBody {
  resourceId: string;
}

export interface EntitlementMutationResponse {
  entitlement: PrincipalResourceEntitlement;
}

export interface SystemInfo {
  arkConfigured: boolean;
  arkBaseUrl: string;
  arkModel: string | null;
  codexAvailable: boolean;
  codexSandboxMode: string;
  runtimeProvider: "local-process" | "container";
  containerEngine: string | null;
  runtime: string;
}
