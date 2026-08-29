import type {
  AcceptedRunResponse,
  Agent,
  AgentRun,
  CapsuleDenialReason,
  DemoSessionValue,
  DeniedRunResponse,
  ListEntitlementsResponse,
  ListResourcesResponse,
  Message,
  RunReceiptsResponse,
  SendMessageBody,
  SystemInfo,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class DeniedRunApiError extends ApiError {
  constructor(public readonly denied: DeniedRunResponse) {
    super("Capsule Run denied: " + denied.reason, 403);
  }
}

export class StaleDemoSessionError extends Error {
  constructor() {
    super("The demo principal changed while the request was in flight");
    this.name = "StaleDemoSessionError";
  }
}

let authToken = "";
let demoSession: DemoSessionValue = "demo-session-a";
let demoSessionGeneration = 0;

export function setAuthToken(token: string): void {
  authToken = token.trim();
}

export function setDemoSession(value: DemoSessionValue): void {
  if (demoSession !== value) demoSessionGeneration += 1;
  demoSession = value;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PUBLIC_DENIAL_REASONS = new Set<DeniedRunResponse["reason"]>([
  "unknown_resource",
  "entitlement_missing",
  "entitlement_revoked",
  "stale_entitlement_generation",
  "runtime_profile_unsupported",
  "invalid_resource_path",
]);
const RECEIPT_DENIAL_REASONS = new Set<CapsuleDenialReason>([
  "ownership_denied",
  ...PUBLIC_DENIAL_REASONS,
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function parseDeniedRunResponse(value: unknown): DeniedRunResponse | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const reason = candidate.reason;
  if (
    candidate.status !== "denied" ||
    typeof candidate.runId !== "string" ||
    !UUID_PATTERN.test(candidate.runId) ||
    typeof candidate.receiptId !== "string" ||
    !UUID_PATTERN.test(candidate.receiptId) ||
    typeof reason !== "string" ||
    !PUBLIC_DENIAL_REASONS.has(reason as DeniedRunResponse["reason"])
  ) {
    return null;
  }
  return {
    runId: candidate.runId,
    receiptId: candidate.receiptId,
    status: "denied",
    reason: reason as DeniedRunResponse["reason"],
  };
}

function parseDecisionReceipt(value: unknown) {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const principal = candidate.humanPrincipalId;
  const baseValid =
    typeof candidate.receiptId === "string" &&
    UUID_PATTERN.test(candidate.receiptId) &&
    typeof candidate.runId === "string" &&
    UUID_PATTERN.test(candidate.runId) &&
    typeof candidate.agentId === "string" &&
    UUID_PATTERN.test(candidate.agentId) &&
    (principal === "user-a" || principal === "user-b") &&
    typeof candidate.resourceId === "string" &&
    RESOURCE_ID_PATTERN.test(candidate.resourceId) &&
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt));
  const generation = candidate.grantGeneration;
  const validGeneration =
    typeof generation === "number" &&
    Number.isInteger(generation) &&
    generation > 0;
  if (!baseValid) return null;

  const base = {
    receiptId: candidate.receiptId as string,
    runId: candidate.runId as string,
    humanPrincipalId: principal,
    agentId: candidate.agentId as string,
    resourceId: candidate.resourceId as string,
    createdAt: candidate.createdAt as string,
  };
  if (
    candidate.decision === "allow" &&
    candidate.reason === "allowed" &&
    validGeneration &&
    typeof candidate.runnerStarted === "boolean"
  ) {
    return {
      ...base,
      decision: "allow" as const,
      reason: "allowed" as const,
      grantGeneration: generation,
      runnerStarted: candidate.runnerStarted,
    };
  }
  if (
    candidate.decision === "deny" &&
    typeof candidate.reason === "string" &&
    RECEIPT_DENIAL_REASONS.has(candidate.reason as CapsuleDenialReason) &&
    (generation === null || validGeneration) &&
    candidate.runnerStarted === false
  ) {
    return {
      ...base,
      decision: "deny" as const,
      reason: candidate.reason as CapsuleDenialReason,
      grantGeneration: generation as number | null,
      runnerStarted: false as const,
    };
  }
  return null;
}

function parseReceiptsResponse(
  value: unknown,
  expectedRunId: string,
): RunReceiptsResponse {
  const candidate = asRecord(value);
  if (!candidate || !Array.isArray(candidate.receipts) || candidate.receipts.length > 1) {
    throw new ApiError("Invalid Decision Receipt response", 502);
  }
  const receipts = candidate.receipts.map(parseDecisionReceipt);
  if (
    receipts.some(
      (receipt) => receipt === null || receipt.runId !== expectedRunId,
    )
  ) {
    throw new ApiError("Invalid Decision Receipt response", 502);
  }
  return { receipts: receipts as RunReceiptsResponse["receipts"] };
}

function parseResourcesResponse(value: unknown): ListResourcesResponse {
  const candidate = asRecord(value);
  if (!candidate || !Array.isArray(candidate.resources)) {
    throw new ApiError("Invalid Resource catalog response", 502);
  }
  const resources = candidate.resources.map((value) => {
    const resource = asRecord(value);
    if (
      !resource ||
      typeof resource.id !== "string" ||
      !RESOURCE_ID_PATTERN.test(resource.id) ||
      typeof resource.displayName !== "string" ||
      resource.displayName.length === 0 ||
      resource.displayName.length > 200 ||
      resource.kind !== "directory"
    ) {
      throw new ApiError("Invalid Resource catalog response", 502);
    }
    return {
      id: resource.id,
      displayName: resource.displayName,
      kind: "directory" as const,
    };
  });
  return { resources };
}

export function isStaleDemoSessionError(
  value: unknown,
): value is StaleDemoSessionError {
  return value instanceof StaleDemoSessionError;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const requestGeneration = demoSessionGeneration;
  const requestDemoSession = demoSession;
  const headers = {
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
    "X-Demo-Session": requestDemoSession,
    ...options?.headers,
  };
  const response = await fetch(url, {
    ...options,
    headers,
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (requestGeneration !== demoSessionGeneration) {
    throw new StaleDemoSessionError();
  }
  if (!response.ok) {
    const denied = response.status === 403 ? parseDeniedRunResponse(data) : null;
    if (denied) {
      throw new DeniedRunApiError(denied);
    }
    const error =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "Request failed";
    throw new ApiError(error, response.status);
  }
  return data as T;
}

export const api = {
  auth: () => request<{ required: boolean }>("/api/auth"),
  system: () => request<SystemInfo>("/api/system"),
  listAgents: () => request<{ agents: Agent[] }>("/api/agents"),
  createAgent: (body: {
    name: string;
    description: string;
    instructions: string;
  }) =>
    request<{ agent: Agent }>("/api/agents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAgent: (
    id: string,
    body: { name: string; description: string; instructions: string },
  ) =>
    request<{ agent: Agent }>("/api/agents/" + id, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAgent: (id: string) =>
    request<{ archivedWorkspace: string }>("/api/agents/" + id, {
      method: "DELETE",
    }),
  startAgent: (id: string) =>
    request<{ agent: Agent }>("/api/agents/" + id + "/start", {
      method: "POST",
    }),
  stopAgent: (id: string) =>
    request<{ agent: Agent }>("/api/agents/" + id + "/stop", {
      method: "POST",
    }),
  messages: (id: string) =>
    request<{ messages: Message[] }>("/api/agents/" + id + "/messages"),
  runs: (id: string) =>
    request<{ runs: AgentRun[] }>("/api/agents/" + id + "/runs"),
  sendMessage: (id: string, body: SendMessageBody) =>
    request<AcceptedRunResponse>("/api/agents/" + id + "/messages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  run: (id: string) => request<{ run: AgentRun }>("/api/runs/" + id),
  resources: () => request<unknown>("/api/resources").then(parseResourcesResponse),
  entitlements: () => request<ListEntitlementsResponse>("/api/entitlements"),
  receipts: (runId: string) =>
    request<unknown>("/api/runs/" + runId + "/receipts").then((response) =>
      parseReceiptsResponse(response, runId),
    ),
};
