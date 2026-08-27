export type AgentStatus = "ready" | "busy" | "stopped" | "error";
export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "denied";
export type MessageRole = "user" | "assistant";

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
  // Required once the version 2 migration (Issue #4) has run; v1 data lacks it.
  ownerPrincipalId?: HumanPrincipalId;
}

export interface Message {
  id: string;
  agentId: string;
  runId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface RunUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
}

export interface AgentRun {
  id: string;
  agentId: string;
  status: RunStatus;
  prompt: string;
  output: string | null;
  error: string | null;
  usage: RunUsage | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Database {
  version: 1 | 2;
  agents: Agent[];
  messages: Message[];
  runs: AgentRun[];
  // Present from version 2 on; the migration (Issue #4) initializes them.
  entitlements?: PrincipalResourceEntitlement[];
  receipts?: DecisionReceipt[];
}

export interface CreateAgentInput {
  name: string;
  description?: string | undefined;
  instructions?: string | undefined;
}

export interface UpdateAgentInput {
  name?: string | undefined;
  description?: string | undefined;
  instructions?: string | undefined;
}

export interface RunnerResult {
  output: string;
  threadId: string | null;
  usage: RunUsage | null;
}

export interface RunnerRequest {
  agentId: string;
  workspacePath: string;
  prompt: string;
  threadId: string | null;
}

export interface AgentRunner {
  run(request: RunnerRequest): Promise<RunnerResult>;
  cancel(agentId: string): Promise<boolean>;
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Run-scoped Resource Capsule — frozen shared contracts (Issue #2).
// Sources of truth: .scratch/run-scoped-resource-capsule/spec.md and ADR-002.
// P1 is the only editor after the freeze; changes require review from the
// affected owners.
// ---------------------------------------------------------------------------

// Demo identity. X-Demo-Session is mock identity for the demo, not
// authentication; APP_AUTH_TOKEN stays the outer access guard.
export const DEMO_SESSION_HEADER = "x-demo-session";

export type HumanPrincipalId = "user-a" | "user-b";

export const DEMO_SESSION_PRINCIPALS: Record<string, HumanPrincipalId> = {
  "demo-session-a": "user-a",
  "demo-session-b": "user-b",
};

export interface HumanPrincipal {
  id: HumanPrincipalId;
  displayName: string;
}

// Safe client-facing Resource metadata. Never carries a host path.
export interface ProtectedResource {
  id: string;
  displayName: string;
  kind: "directory";
}

// Server-internal Registry entry. canonicalSourcePath must never be
// serialized into an HTTP response or a Receipt.
export interface RegisteredResource extends ProtectedResource {
  canonicalSourcePath: string;
}

// ADR-002: Entitlements are the per-principal policy ceiling, stored by
// principalId (not agentId). The request's resourceIds value is the per-Run
// delegation and can never create or expand an Entitlement.
export interface PrincipalResourceEntitlement {
  principalId: HumanPrincipalId;
  resourceId: string;
  permission: "read";
  status: "active" | "revoked";
  generation: number;
  createdAt: string;
  revokedAt: string | null;
}

// The static demo Entitlement matrix seeded by the version 2 migration.
export const DEMO_ENTITLEMENT_MATRIX: ReadonlyArray<{
  principalId: HumanPrincipalId;
  resourceId: string;
}> = [
  { principalId: "user-a", resourceId: "orders-incident" },
  { principalId: "user-b", resourceId: "payments-incident" },
];

// Stable safe denial vocabulary. UI and tests depend on these exact strings;
// internal filesystem details must never replace them.
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

export interface AllowedAuthorizationDecision {
  decision: "allow";
  principalId: HumanPrincipalId;
  agentId: string;
  resource: RegisteredResource;
  // The Entitlement generation this decision is based on (spec name:
  // grantGeneration). Rechecked on every new Run; never reused.
  grantGeneration: number;
}

export interface DeniedAuthorizationDecision {
  decision: "deny";
  principalId: HumanPrincipalId;
  agentId: string;
  resourceId: string;
  reason: CapsuleDenialReason;
  // Null when denial happens before any matching Entitlement generation
  // exists (for example unknown_resource or entitlement_missing).
  grantGeneration: number | null;
}

export type AuthorizationDecision =
  | AllowedAuthorizationDecision
  | DeniedAuthorizationDecision;

// Reserved container mount targets; generated Resource targets must never
// collide with these.
export const RESERVED_MOUNT_TARGETS = ["/workspace", "/codex-home"] as const;

// Generated target prefix: /resources/<resourceId>.
export const RESOURCE_TARGET_PREFIX = "/resources/";

// The immutable output of compileMountPlan. Only P3's compiler produces it;
// no API or UI ever accepts source, target, or mode values. readOnly is the
// spec's "readonly flag" (deliberately camelCased to avoid colliding with the
// TypeScript readonly modifier).
export interface ValidatedRunMountPlan {
  readonly runId: string;
  readonly agentId: string;
  readonly resourceId: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly readOnly: true;
  readonly grantGeneration: number;
}

// One Receipt per syntactically valid Capsule Run after principal
// resolution, allow or deny. Never contains a token, demo session value,
// secret, full prompt, Resource body, or host source path.
export interface DecisionReceipt {
  receiptId: string;
  runId: string;
  humanPrincipalId: HumanPrincipalId;
  agentId: string;
  resourceId: string;
  decision: CapsuleDecision;
  reason: CapsuleDecisionReason;
  grantGeneration: number | null;
  // True only when the authorized Runner invocation was attempted; always
  // false for pre-Runtime denial.
  runnerStarted: boolean;
  createdAt: string;
}

// HTTP contracts for POST /api/agents/:agentId/messages.
// Omitted or empty resourceIds = baseline Run (existing behavior).
// Exactly one ID = Capsule Run. More than one, or a path-shaped ID, is a 400
// with no Run or Receipt.
export interface SendMessageBody {
  content: string;
  resourceIds?: string[];
}

// The 403 body for an admission denial. The Run is persisted as a terminal
// denied Run; the Runner is never called.
export interface DeniedRunResponse {
  runId: string;
  receiptId: string;
  status: "denied";
  reason: CapsuleDenialReason;
}

// GET /api/runs/:runId/receipts — a Capsule Run has one Receipt, a baseline
// Run has none.
export interface RunReceiptsResponse {
  receipts: DecisionReceipt[];
}

// Seam: P2 exposes Registry and Entitlement lookups; P3 consumes them.
export interface ResourceRegistryReader {
  getResource(resourceId: string): RegisteredResource | undefined;
  listResources(): RegisteredResource[];
}

export interface EntitlementReader {
  getCurrentEntitlement(
    principalId: HumanPrincipalId,
    resourceId: string,
  ): PrincipalResourceEntitlement | undefined;
}

// Seam: P1's admission flow calls this before any Runtime invocation.
export interface ResourceAuthorizer {
  authorizeResources(
    principal: HumanPrincipal,
    agentId: string,
    resourceIds: string[],
  ): Promise<AuthorizationDecision>;
}

// Seam: only this compiler produces a ValidatedRunMountPlan, and only from a
// current allow decision. Path validation failures (root escape, symlink
// escape, missing path, overlap, stale generation, target collision) return
// a deny result that becomes a terminal denied Run.
export type MountPlanResult =
  | { ok: true; plan: ValidatedRunMountPlan }
  | { ok: false; reason: CapsuleDenialReason };

export interface MountPlanCompiler {
  compileMountPlan(
    runId: string,
    decision: AllowedAuthorizationDecision,
  ): Promise<MountPlanResult>;
}

// Seam: a Capsule Run passes the validated plan to the container Runner.
// Baseline Runs omit the plan and keep existing behavior; the host-process
// Runner never receives a plan (runtime_profile_unsupported is denied before
// the Runtime). supportsMountPlans is a required discriminant so a runner
// that would silently ignore the plan cannot satisfy this interface by
// structural accident; admission can also guard at runtime with
// "supportsMountPlans" in runner.
export interface CapsuleCapableRunner extends AgentRunner {
  readonly supportsMountPlans: true;
  run(
    request: RunnerRequest,
    validatedMountPlan?: ValidatedRunMountPlan,
  ): Promise<RunnerResult>;
}
