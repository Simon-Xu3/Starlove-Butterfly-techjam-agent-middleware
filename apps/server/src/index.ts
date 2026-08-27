import path from "node:path";
import { AgentService } from "./agent-service.js";
import { createApp } from "./app.js";
import { loadConfig, writeCodexConfig } from "./config.js";
import { InMemoryReceiptStore } from "./receipt-store.js";
import { createRunner } from "./runner-factory.js";
import { JsonStore } from "./store.js";
import type { MountPlanCompiler, ResourceAuthorizer } from "./types.js";
import { WorkspaceManager } from "./workspace.js";

const config = loadConfig();
await writeCodexConfig(config);

// Integration stubs until the Day 1 gate. The stub authorizer denies every
// Capsule request fail-closed (no Registry or Entitlements exist yet); the
// stub compiler is unreachable while the authorizer denies. P3 (Issue #5)
// replaces both; P5/P2 replace the in-memory Receipt store.
const stubAuthorizer: ResourceAuthorizer = {
  async authorizeResources(principal, agentId, resourceIds) {
    return {
      decision: "deny",
      principalId: principal.id,
      agentId,
      resourceId: resourceIds[0] ?? "unknown",
      reason: "entitlement_missing",
      grantGeneration: null,
    };
  },
};
const stubCompiler: MountPlanCompiler = {
  async compileMountPlan() {
    return { ok: false, reason: "invalid_resource_path" };
  },
};

const store = new JsonStore(path.join(config.dataDirectory, "launchpad.json"));
const workspaces = new WorkspaceManager(config.workspaceRoot);
const runner = createRunner(config);
const service = new AgentService(config, store, workspaces, runner, {
  authorizer: stubAuthorizer,
  mountPlanCompiler: stubCompiler,
  receipts: new InMemoryReceiptStore(),
});
await service.initialize();

const app = await createApp(config, service);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.host, port: config.port });
