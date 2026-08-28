import type {
  AcceptedRunResponse,
  Agent,
  AgentRun,
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

let authToken = "";
let demoSession: DemoSessionValue = "demo-session-a";

export function setAuthToken(token: string): void {
  authToken = token.trim();
}

export function setDemoSession(value: DemoSessionValue): void {
  demoSession = value;
}

function isDeniedRunResponse(value: unknown): value is DeniedRunResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DeniedRunResponse>;
  return (
    candidate.status === "denied" &&
    typeof candidate.runId === "string" &&
    typeof candidate.receiptId === "string" &&
    typeof candidate.reason === "string"
  );
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = {
    ...(options?.body ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
    "X-Demo-Session": demoSession,
    ...options?.headers,
  };
  const response = await fetch(url, {
    ...options,
    headers,
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403 && isDeniedRunResponse(data)) {
      throw new DeniedRunApiError(data);
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
  resources: () => request<ListResourcesResponse>("/api/resources"),
  entitlements: () => request<ListEntitlementsResponse>("/api/entitlements"),
  receipts: (runId: string) =>
    request<RunReceiptsResponse>("/api/runs/" + runId + "/receipts"),
};
