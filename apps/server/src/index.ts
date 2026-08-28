import path from "node:path";
import { AgentService } from "./agent-service.js";
import { createApp } from "./app.js";
import { loadConfig, writeCodexConfig } from "./config.js";
import { createStoreOwnershipReader } from "./demo-principal.js";
import { createEntitlementRoutes } from "./entitlement-routes.js";
import { PrincipalEntitlementService } from "./entitlement-service.js";
import { createMountPlanCompiler } from "./mount-plan-compiler.js";
import {
  StoreReceiptRepository,
  createStoreRunReader,
} from "./receipt-repository.js";
import { createReceiptRoutes } from "./receipt-routes.js";
import { DecisionReceiptService } from "./receipt-service.js";
import { createResourceAuthorizer } from "./resource-authorizer.js";
import { ResourcePathValidator } from "./resource-path-validator.js";
import { StaticResourceRegistry } from "./resource-registry.js";
import { createResourceRoutes } from "./resource-routes.js";
import { createRunner } from "./runner-factory.js";
import { JsonStore } from "./store.js";
import { WorkspaceManager } from "./workspace.js";

const config = loadConfig();
await writeCodexConfig(config);

const store = new JsonStore(path.join(config.dataDirectory, "launchpad.json"));
const registry = new StaticResourceRegistry(config.resourceRoot);
const entitlements = new PrincipalEntitlementService(store, registry);
const authorizer = createResourceAuthorizer({
  ownership: createStoreOwnershipReader(store),
  registry,
  entitlements,
});
const mountPlanCompiler = createMountPlanCompiler({
  registry,
  entitlements,
  pathValidator: new ResourcePathValidator(config.resourceRoot),
});
const workspaces = new WorkspaceManager(config.workspaceRoot);
const runner = createRunner(config);
// P5's persisted Receipt service, backed by the store: admission records
// through its ReceiptSink; the receipts route queries through its
// principal-scoped reader.
const receipts = new DecisionReceiptService(
  new StoreReceiptRepository(store),
  createStoreRunReader(store),
  createStoreOwnershipReader(store),
);
const service = new AgentService(config, store, workspaces, runner, {
  authorizer,
  mountPlanCompiler,
  receipts,
});
await service.initialize();

const app = await createApp(config, service);
await app.register(createResourceRoutes({ registry, entitlements }));
await app.register(createEntitlementRoutes({ entitlements }));
await app.register(createReceiptRoutes(receipts));

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.host, port: config.port });
