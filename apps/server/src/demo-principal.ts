// Demo Principal resolution (Issue #3). X-Demo-Session is mock identity for
// the demo, not authentication; APP_AUTH_TOKEN stays the outer access guard.
// Every identity-sensitive route handler calls requireDemoPrincipal itself —
// route plugins added by other workstreams must do the same.
import type { FastifyRequest } from "fastify";
import { HttpError } from "./errors.js";
import type { JsonStore } from "./store.js";
import {
  DEMO_SESSION_HEADER,
  resolveDemoPrincipalId,
  type AgentOwnershipReader,
  type HumanPrincipal,
  type HumanPrincipalId,
} from "./types.js";

const DISPLAY_NAMES: Record<HumanPrincipalId, string> = {
  "user-a": "Demo User A",
  "user-b": "Demo User B",
};

// Routes that stay independent of mock identity: health, outer-auth
// discovery, and system info.
export const IDENTITY_EXEMPT_ROUTES: ReadonlySet<string> = new Set([
  "/api/health",
  "/api/auth",
  "/api/system",
]);

export function requireDemoPrincipal(request: FastifyRequest): HumanPrincipal {
  const id = resolveDemoPrincipalId(request.headers[DEMO_SESSION_HEADER]);
  if (!id) {
    throw new HttpError(401, "Missing or unknown demo session");
  }
  return { id, displayName: DISPLAY_NAMES[id] };
}

// Store-backed implementation of the frozen ownership seam. Undefined
// (unknown Agent, or v1 data the Issue #4 migration has not touched yet)
// means the caller must fail closed.
export function createStoreOwnershipReader(
  store: JsonStore,
): AgentOwnershipReader {
  return {
    getOwnerPrincipalId(agentId) {
      return store
        .snapshot()
        .agents.find((agent) => agent.id === agentId)?.ownerPrincipalId;
    },
  };
}
