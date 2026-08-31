import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
} from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import {
  IDENTITY_EXEMPT_ROUTES,
  requireDemoPrincipal,
} from "./demo-principal.js";
import { HttpError } from "./errors.js";
import type { AgentService } from "./agent-service.js";
import { RESOURCE_ID_PATTERN } from "./types.js";

const agentIdParams = z.object({ id: z.string().uuid() });
const runIdParams = z.object({ id: z.string().uuid() });
// All bodies are strict so identity fields (principalId, ownerId, userId)
// and other unknown keys are rejected — identity comes only from the demo
// session header.
const createAgentBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500).optional(),
    instructions: z.string().max(10_000).optional(),
  })
  .strict();
const updateAgentBody = createAgentBody.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);
const emptyBody = z.object({}).strict().optional();
// Resource IDs are opaque safe slugs; path separators, dots, absolute or
// encoded path shapes all fail the pattern and 400 before any Run or
// Receipt exists. More than one ID is a validation failure, not a denial.
const messageBody = z
  .object({
    content: z.string().trim().min(1).max(50_000),
    resourceIds: z
      .array(z.string().regex(RESOURCE_ID_PATTERN, "Invalid Resource ID"))
      .max(1, "A Capsule Run selects exactly one Resource")
      .optional(),
  })
  .strict();

const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AggregateError",
]);

function logUnexpectedError(
  logger: FastifyBaseLogger,
  error: Error,
): void {
  const source = [error.name, error.message, error.stack ?? ""].join("\n");
  logger.error(
    {
      failure: {
        type: SAFE_ERROR_NAMES.has(error.name) ? error.name : "Error",
        fingerprint: createHash("sha256").update(source).digest("hex"),
      },
    },
    "Unhandled request failure",
  );
}

export async function createApp(
  config: AppConfig,
  service: AgentService,
  loggerInstance: FastifyBaseLogger = createAppLogger(config),
): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance,
    bodyLimit: 1_048_576,
  });

  await app.register(cors, {
    origin:
      config.nodeEnv === "development"
        ? ["http://localhost:5173", "http://127.0.0.1:5173"]
        : false,
  });

  app.addHook("onRequest", async (request, reply) => {
    // Match the routed pattern, not the raw URL: find-my-way decodes and
    // normalizes the target before routing, so a raw target like
    // /%61pi/system would dodge a request.url check yet still reach
    // /api/system. routeOptions.url is the matched route pattern (undefined
    // for an unmatched 404, which is safe to leave to the not-found path).
    const routePath = request.routeOptions?.url;
    if (
      !config.authToken ||
      !routePath?.startsWith("/api/") ||
      routePath === "/api/health" ||
      routePath === "/api/auth"
    ) {
      return;
    }
    const header = request.headers.authorization ?? "";
    const candidate = header.startsWith("Bearer ") ? header.slice(7) : "";
    const expectedBuffer = Buffer.from(config.authToken);
    const candidateBuffer = Buffer.from(candidate);
    const valid =
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer);
    if (!valid) {
      return reply.code(401).send({ error: "Authentication required" });
    }
  });

  // Fail-closed identity backstop: every /api route outside the exempt set
  // requires a valid demo session, including route plugins other
  // workstreams register later. Handlers still call requireDemoPrincipal
  // themselves for the resolved principal value.
  app.addHook("onRequest", async (request) => {
    // Same routed-pattern match as the token guard, for the same reason.
    const routePath = request.routeOptions?.url;
    if (!routePath?.startsWith("/api/") || IDENTITY_EXEMPT_ROUTES.has(routePath)) {
      return;
    }
    requireDemoPrincipal(request);
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "volc-agent-launchpad",
  }));

  app.get("/api/auth", async () => ({ required: config.authToken.length > 0 }));

  app.get("/api/system", async () => service.systemInfo());

  // Every identity-sensitive route resolves the demo Principal first.
  // /api/health, /api/auth, and /api/system stay independent of mock
  // identity by not calling requireDemoPrincipal.
  app.get("/api/agents", async (request) => {
    const principal = requireDemoPrincipal(request);
    return { agents: service.listAgents(principal.id) };
  });

  app.post("/api/agents", async (request, reply) => {
    const principal = requireDemoPrincipal(request);
    const body = createAgentBody.parse(request.body);
    const agent = await service.createAgent(body, principal.id);
    return reply.code(201).send({ agent });
  });

  app.get("/api/agents/:id", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    return { agent: service.getAgent(id, principal.id) };
  });

  app.patch("/api/agents/:id", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    const body = updateAgentBody.parse(request.body);
    return { agent: await service.updateAgent(id, principal.id, body) };
  });

  app.delete("/api/agents/:id", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    emptyBody.parse(request.body);
    return service.deleteAgent(id, principal.id);
  });

  app.post("/api/agents/:id/start", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    emptyBody.parse(request.body);
    return { agent: await service.startAgent(id, principal.id) };
  });

  app.post("/api/agents/:id/stop", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    emptyBody.parse(request.body);
    return { agent: await service.stopAgent(id, principal.id) };
  });

  app.get("/api/agents/:id/messages", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    return { messages: service.getMessages(id, principal.id) };
  });

  app.get("/api/agents/:id/runs", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    return { runs: service.getRuns(id, principal.id) };
  });

  app.post("/api/agents/:id/messages", async (request, reply) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    const body = messageBody.parse(request.body);
    const result = await service.sendMessage(id, principal, body);
    return reply.code(result.admitted ? 202 : 403).send(result.response);
  });

  app.get("/api/runs/:id", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = runIdParams.parse(request.params);
    return { run: service.getRun(id, principal.id) };
  });

  // Registered before any `await app.register(...)` below: awaiting a
  // register finalizes the route contexts declared so far, and an error
  // handler attached afterwards never applies to them. With the static
  // plugin registered first, every /api validation failure fell through to
  // Fastify's default 500 in production while tests (NODE_ENV=test, no
  // static plugin) still saw the correct 400.
  app.setErrorHandler((error, request, reply) => {
    const appError = error instanceof Error ? error : new Error(String(error));
    const validationError = error instanceof z.ZodError;
    const frameworkStatus =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;
    const statusCode =
      error instanceof HttpError
        ? error.statusCode
        : validationError
          ? 400
          : frameworkStatus && frameworkStatus >= 400 && frameworkStatus <= 599
            ? frameworkStatus
            : 500;
    if (error instanceof HttpError) {
      if (statusCode >= 500) logUnexpectedError(request.log, appError);
      return reply.code(statusCode).send({ error: appError.message });
    }
    if (validationError) {
      return reply.code(400).send({
        error: "Invalid request",
        details: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    if (statusCode >= 500) {
      logUnexpectedError(request.log, appError);
      // Never echo an internal failure message: it can carry host paths
      // from the filesystem, store, or container engine.
      return reply.code(statusCode).send({ error: "Internal server error" });
    }
    return reply.code(statusCode).send({
      error: appError.message,
    });
  });

  if (config.nodeEnv === "production") {
    const webRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: "/",
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "API route not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

export function createAppLogger(config: AppConfig): FastifyBaseLogger {
  return pino({
    level: config.logLevel,
    redact: ["req.headers.authorization", "req.headers.cookie"],
  });
}
