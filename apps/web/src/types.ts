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
// demo-session-a -> user-a and demo-session-b -> user-b.
export const DEMO_SESSION_HEADER = "x-demo-session";

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

export interface DecisionReceipt {
  receiptId: string;
  runId: string;
  humanPrincipalId: HumanPrincipalId;
  agentId: string;
  resourceId: string;
  decision: CapsuleDecision;
  reason: CapsuleDecisionReason;
  grantGeneration: number | null;
  runnerStarted: boolean;
  createdAt: string;
}

// POST /api/agents/:agentId/messages body. Omitted or empty resourceIds is a
// baseline Run; exactly one ID is a Capsule Run.
export interface SendMessageBody {
  content: string;
  resourceIds?: string[];
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
