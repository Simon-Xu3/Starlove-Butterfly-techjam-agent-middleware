import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import {
  IDENTITY_EXEMPT_ROUTES,
  requireDemoPrincipal,
} from "./demo-principal.js";
import { HttpError } from "./errors.js";
import type { AgentService } from "./agent-service.js";

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
// Resource IDs are opaque safe slugs; path separators, dots, absolute or
// encoded path shapes all fail the pattern and 400 before any Run or
// Receipt exists. More than one ID is a validation failure, not a denial.
const resourceIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const messageBody = z
  .object({
    content: z.string().trim().min(1).max(50_000),
    resourceIds: z
      .array(z.string().regex(resourceIdPattern, "Invalid Resource ID"))
      .max(1, "A Capsule Run selects exactly one Resource")
      .optional(),
  })
  .strict();

export async function createApp(
  config: AppConfig,
  service: AgentService,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    bodyLimit: 1_048_576,
  });

  await app.register(cors, {
    origin:
      config.nodeEnv === "development"
        ? ["http://localhost:5173", "http://127.0.0.1:5173"]
        : false,
  });

  app.addHook("onRequest", async (request, reply) => {
    if (
      !config.authToken ||
      !request.url.startsWith("/api/") ||
      request.url === "/api/health" ||
      request.url === "/api/auth"
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
    const pathname = request.url.split("?")[0] ?? request.url;
    if (!pathname.startsWith("/api/") || IDENTITY_EXEMPT_ROUTES.has(pathname)) {
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
    return service.deleteAgent(id, principal.id);
  });

  app.post("/api/agents/:id/start", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
    return { agent: await service.startAgent(id, principal.id) };
  });

  app.post("/api/agents/:id/stop", async (request) => {
    const principal = requireDemoPrincipal(request);
    const { id } = agentIdParams.parse(request.params);
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
    if (statusCode >= 500) {
      request.log.error(appError);
    }
    return reply.code(statusCode).send({
      error: appError.message,
      ...(validationError ? { details: error.issues } : {}),
    });
  });

  return app;
}
