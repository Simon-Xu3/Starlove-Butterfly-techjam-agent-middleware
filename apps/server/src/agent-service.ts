import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config.js";
import { isArkConfigured } from "./config.js";
import { HttpError, RunCancelledError } from "./errors.js";
import type { ReceiptSink } from "./receipt-store.js";
import { JsonStore } from "./store.js";
import { isCapsuleCapableRunner } from "./types.js";
import type {
  AcceptedRunResponse,
  Agent,
  AgentRun,
  AgentRunner,
  AllowedAuthorizationDecision,
  CapsuleCapableRunner,
  CapsuleDenialReason,
  CreateAgentInput,
  DeniedRunResponse,
  HumanPrincipal,
  HumanPrincipalId,
  Message,
  MountPlanCompiler,
  ResourceAuthorizer,
  SendMessageBody,
  UpdateAgentInput,
  ValidatedRunMountPlan,
} from "./types.js";
import { WorkspaceManager } from "./workspace.js";

const now = () => new Date().toISOString();

// The frozen seams Capsule admission orchestrates. index.ts wires
// integration stubs until P3 (authorizer, compiler) and P5/P2 (receipts)
// integrate their real implementations at the Day 1 gate.
export interface CapsuleSeams {
  authorizer: ResourceAuthorizer;
  mountPlanCompiler: MountPlanCompiler;
  receipts: ReceiptSink;
}

// Admission outcome for POST /api/agents/:id/messages: 202 when admitted,
// 403 with the safe denied body otherwise.
export type AdmissionResult =
  | { admitted: true; response: AcceptedRunResponse }
  | { admitted: false; response: DeniedRunResponse };

interface CapsuleExecution {
  plan: ValidatedRunMountPlan;
  runner: CapsuleCapableRunner;
}

export class AgentService {
  private readonly activeExecutions = new Map<string, Promise<void>>();
  private readonly cancellationRequests = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly store: JsonStore,
    private readonly workspaces: WorkspaceManager,
    private readonly runner: AgentRunner,
    private readonly capsule: CapsuleSeams,
  ) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
    await this.workspaces.initialize();
    await this.store.mutate((database) => {
      for (const run of database.runs) {
        if (run.status === "queued" || run.status === "running") {
          run.status = "cancelled";
          run.error = "Server restarted while this run was active";
          run.completedAt = now();
        }
      }
      for (const agent of database.agents) {
        if (agent.status === "busy") {
          agent.status = "ready";
          agent.updatedAt = now();
        }
      }
    });
  }

  // Ownership is enforced at every Agent-scoped boundary: collection views
  // are scoped to the current principal, and an Agent another principal owns
  // (or a pre-migration Agent with no owner — fail closed) reads as 404.
  private ownedBy(agent: Agent, principalId: HumanPrincipalId): boolean {
    return agent.ownerPrincipalId === principalId;
  }

  listAgents(principalId: HumanPrincipalId): Agent[] {
    return this.store
      .snapshot()
      .agents.filter((agent) => this.ownedBy(agent, principalId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getAgent(id: string, principalId: HumanPrincipalId): Agent {
    const agent = this.store.snapshot().agents.find((item) => item.id === id);
    if (!agent || !this.ownedBy(agent, principalId)) {
      throw new HttpError(404, "Agent not found");
    }
    return agent;
  }

  async createAgent(
    input: CreateAgentInput,
    principalId: HumanPrincipalId,
  ): Promise<Agent> {
    const timestamp = now();
    const id = randomUUID();
    const agent: Agent = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      instructions: input.instructions?.trim() ?? "",
      status: "ready",
      workspacePath: this.workspaces.workspacePath(id),
      codexThreadId: null,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      ownerPrincipalId: principalId,
    };
    await this.workspaces.create(agent);
    await this.store.mutate((database) => database.agents.push(agent));
    return agent;
  }

  async updateAgent(
    id: string,
    principalId: HumanPrincipalId,
    input: UpdateAgentInput,
  ): Promise<Agent> {
    const current = this.getAgent(id, principalId);
    if (current.status === "busy") {
      throw new HttpError(409, "Stop the active run before editing this Agent");
    }
    const updated = await this.store.mutate((database) => {
      const agent = database.agents.find((item) => item.id === id);
      if (!agent) {
        throw new HttpError(404, "Agent not found");
      }
      if (agent.status === "busy") {
        throw new HttpError(409, "Stop the active run before editing this Agent");
      }
      if (input.name !== undefined) agent.name = input.name.trim();
      if (input.description !== undefined) agent.description = input.description.trim();
      if (input.instructions !== undefined) agent.instructions = input.instructions.trim();
      agent.lastError = null;
      agent.updatedAt = now();
      return structuredClone(agent);
    });
    await this.workspaces.writeInstructions(updated);
    return updated;
  }

  async deleteAgent(
    id: string,
    principalId: HumanPrincipalId,
  ): Promise<{ archivedWorkspace: string }> {
    const agent = this.getAgent(id, principalId);
    await this.cancelExecution(id);
    const archivedWorkspace = await this.workspaces.archive(agent);
    await this.store.mutate((database) => {
      database.agents = database.agents.filter((item) => item.id !== id);
      database.messages = database.messages.filter((item) => item.agentId !== id);
      database.runs = database.runs.filter((item) => item.agentId !== id);
    });
    return { archivedWorkspace };
  }

  async startAgent(id: string, principalId: HumanPrincipalId): Promise<Agent> {
    this.getAgent(id, principalId);
    return this.setStatus(id, "ready");
  }

  async stopAgent(id: string, principalId: HumanPrincipalId): Promise<Agent> {
    this.getAgent(id, principalId);
    await this.cancelExecution(id);
    return this.setStatus(id, "stopped");
  }

  getMessages(agentId: string, principalId: HumanPrincipalId): Message[] {
    this.getAgent(agentId, principalId);
    return this.store
      .snapshot()
      .messages.filter((message) => message.agentId === agentId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getRun(runId: string, principalId: HumanPrincipalId): AgentRun {
    const database = this.store.snapshot();
    const run = database.runs.find((item) => item.id === runId);
    const agent = run
      ? database.agents.find((item) => item.id === run.agentId)
      : undefined;
    if (!run || !agent || !this.ownedBy(agent, principalId)) {
      throw new HttpError(404, "Run not found");
    }
    return run;
  }

  getRuns(agentId: string, principalId: HumanPrincipalId): AgentRun[] {
    this.getAgent(agentId, principalId);
    return this.store
      .snapshot()
      .runs.filter((run) => run.agentId === agentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // Run admission. A baseline request (no resourceIds) follows the existing
  // path unchanged. A Capsule request orchestrates the frozen seams in the
  // approved order — ownership, authorization, Runtime profile, mount plan —
  // entirely before the 202/403 is decided; every denial is a terminal
  // denied Run with a correlated deny Receipt and zero Runner calls.
  async sendMessage(
    agentId: string,
    principal: HumanPrincipal,
    body: SendMessageBody,
  ): Promise<AdmissionResult> {
    if (!isArkConfigured(this.config)) {
      throw new HttpError(
        503,
        "Ark is not configured. Set ARK_API_KEY and ARK_MODEL, then restart.",
      );
    }
    const resourceIds = body.resourceIds ?? [];
    if (resourceIds.length === 0) {
      // Baseline Run — existing behavior, no Receipt.
      this.getAgent(agentId, principal.id);
      const admitted = await this.admitRun(agentId, body.content);
      this.beginExecution(admitted.agentAtStart, admitted.run);
      return {
        admitted: true,
        response: { run: admitted.run, message: admitted.message },
      };
    }
    if (resourceIds.length !== 1) {
      // HTTP validation already rejects this; keep the seam precondition.
      throw new HttpError(400, "A Capsule Run selects exactly one Resource");
    }

    const agent = this.getAgent(agentId, principal.id);
    if (agent.status === "stopped") {
      throw new HttpError(409, "Start the Agent before sending a message");
    }
    if (agent.status === "busy") {
      throw new HttpError(409, "This Agent is already running");
    }

    const runId = randomUUID();
    const decision = await this.capsule.authorizer.authorizeResources(
      principal,
      agentId,
      resourceIds,
    );
    if (decision.decision === "deny") {
      return this.denyCapsuleRun(agentId, principal, body.content, runId, {
        resourceId: decision.resourceId,
        reason: decision.reason,
        grantGeneration: decision.grantGeneration,
      });
    }
    return this.admitCapsuleRun(agentId, principal, body.content, runId, decision);
  }

  private async admitCapsuleRun(
    agentId: string,
    principal: HumanPrincipal,
    content: string,
    runId: string,
    decision: AllowedAuthorizationDecision,
  ): Promise<AdmissionResult> {
    // Recheck the Runtime immediately before invocation: a Capsule Run may
    // only execute through a plan-aware container Runner. Anything else —
    // local-process profile, or a runner that would silently ignore the
    // plan — is denied fail-closed before the Runtime seam.
    const runner = this.runner;
    if (
      this.config.runtimeProvider !== "container" ||
      !isCapsuleCapableRunner(runner)
    ) {
      return this.denyCapsuleRun(agentId, principal, content, runId, {
        resourceId: decision.resource.id,
        reason: "runtime_profile_unsupported",
        grantGeneration: decision.grantGeneration,
      });
    }
    const planResult = await this.capsule.mountPlanCompiler.compileMountPlan(
      runId,
      decision,
    );
    if (!planResult.ok) {
      return this.denyCapsuleRun(agentId, principal, content, runId, {
        resourceId: decision.resource.id,
        reason: planResult.reason,
        grantGeneration: decision.grantGeneration,
      });
    }

    const admitted = await this.admitRun(agentId, content, runId);
    // Persisting the allow Receipt marks the commitment to cross the
    // Runtime seam; runnerStarted stays true even if the Runtime later
    // fails.
    this.capsule.receipts.add({
      receiptId: randomUUID(),
      runId,
      humanPrincipalId: principal.id,
      agentId,
      resourceId: decision.resource.id,
      decision: "allow",
      reason: "allowed",
      grantGeneration: decision.grantGeneration,
      runnerStarted: true,
      createdAt: now(),
    });
    this.beginExecution(admitted.agentAtStart, admitted.run, {
      plan: planResult.plan,
      runner,
    });
    return {
      admitted: true,
      response: { run: admitted.run, message: admitted.message },
    };
  }

  // Persists the terminal denied Run, the user Message, and the deny
  // Receipt. The Agent never turns busy, no assistant Message is saved, no
  // Codex thread starts, and the Runner is never called.
  private async denyCapsuleRun(
    agentId: string,
    principal: HumanPrincipal,
    content: string,
    runId: string,
    denial: {
      resourceId: string;
      reason: CapsuleDenialReason;
      grantGeneration: number | null;
    },
  ): Promise<AdmissionResult> {
    const timestamp = now();
    const receiptId = randomUUID();
    const run: AgentRun = {
      id: runId,
      agentId,
      status: "denied",
      prompt: content,
      output: null,
      error: denial.reason,
      usage: null,
      startedAt: null,
      completedAt: timestamp,
      createdAt: timestamp,
    };
    const message: Message = {
      id: randomUUID(),
      agentId,
      runId,
      role: "user",
      content,
      createdAt: timestamp,
    };
    await this.store.mutate((database) => {
      const storedAgent = database.agents.find((item) => item.id === agentId);
      if (!storedAgent) {
        throw new HttpError(404, "Agent not found");
      }
      // Re-check inside the serialized mutate: if the Agent turned stopped
      // or busy during the async authorization, a concurrency failure (409)
      // is due — do not mint a denied Run/Receipt for an unavailable Agent.
      if (storedAgent.status === "stopped") {
        throw new HttpError(409, "Start the Agent before sending a message");
      }
      if (storedAgent.status === "busy") {
        throw new HttpError(409, "This Agent is already running");
      }
      database.runs.push(run);
      database.messages.push(message);
      storedAgent.updatedAt = timestamp;
    });
    this.capsule.receipts.add({
      receiptId,
      runId,
      humanPrincipalId: principal.id,
      agentId,
      resourceId: denial.resourceId,
      decision: "deny",
      reason: denial.reason,
      grantGeneration: denial.grantGeneration,
      runnerStarted: false,
      createdAt: timestamp,
    });
    return {
      admitted: false,
      response: {
        runId,
        receiptId,
        status: "denied",
        reason: denial.reason,
      },
    };
  }

  // The existing atomic one-active-Run-per-Agent admission mutation.
  private async admitRun(
    agentId: string,
    prompt: string,
    runId: string = randomUUID(),
  ): Promise<{ agentAtStart: Agent; run: AgentRun; message: Message }> {
    const timestamp = now();
    const run: AgentRun = {
      id: runId,
      agentId,
      status: "queued",
      prompt,
      output: null,
      error: null,
      usage: null,
      startedAt: null,
      completedAt: null,
      createdAt: timestamp,
    };
    const message: Message = {
      id: randomUUID(),
      agentId,
      runId,
      role: "user",
      content: prompt,
      createdAt: timestamp,
    };
    const agentAtStart = await this.store.mutate((database) => {
      const storedAgent = database.agents.find((item) => item.id === agentId);
      if (!storedAgent) {
        throw new HttpError(404, "Agent not found");
      }
      if (storedAgent.status === "stopped") {
        throw new HttpError(409, "Start the Agent before sending a message");
      }
      if (storedAgent.status === "busy") {
        throw new HttpError(409, "This Agent is already running");
      }
      database.runs.push(run);
      database.messages.push(message);
      const snapshot = structuredClone(storedAgent);
      storedAgent.status = "busy";
      storedAgent.lastError = null;
      storedAgent.updatedAt = timestamp;
      return snapshot;
    });
    return { agentAtStart, run, message };
  }

  private beginExecution(
    agentAtStart: Agent,
    run: AgentRun,
    capsuleExecution?: CapsuleExecution,
  ): void {
    const execution = this.executeRun(agentAtStart, run, capsuleExecution);
    this.activeExecutions.set(agentAtStart.id, execution);
    void execution
      .finally(() => {
        if (this.activeExecutions.get(agentAtStart.id) === execution) {
          this.activeExecutions.delete(agentAtStart.id);
        }
      })
      .catch(() => undefined);
  }

  async systemInfo(): Promise<Record<string, unknown>> {
    return {
      arkConfigured: isArkConfigured(this.config),
      arkBaseUrl: this.config.arkBaseUrl,
      arkModel: this.config.arkModel || null,
      codexAvailable: await this.runner.isAvailable(),
      codexSandboxMode: this.config.codexSandboxMode,
      runtimeProvider: this.config.runtimeProvider,
      containerEngine:
        this.config.runtimeProvider === "container"
          ? this.config.containerEngine
          : null,
      runtime:
        this.config.runtimeProvider === "container"
          ? "Codex CLI in " + this.config.containerEngine + " Runtime"
          : "Codex CLI in application container",
    };
  }

  // A Runner failure message can carry host paths — the container engine
  // echoes the bind-mount source on a mount error, which would put a
  // protected Resource's canonical path into run.error and then into an
  // HTTP response. Replace any absolute path before it is persisted.
  private redactHostPaths(message: string): string {
    return message
      .replace(/(?:[A-Za-z]:)?[\\/][^\s"'`,;:)\]]{2,}/g, "[path]")
      .slice(0, 2_000);
  }

  private async executeRun(
    agentAtStart: Agent,
    run: AgentRun,
    capsuleExecution?: CapsuleExecution,
  ): Promise<void> {
    await this.store.mutate((database) => {
      const storedRun = database.runs.find((item) => item.id === run.id);
      if (storedRun) {
        storedRun.status = "running";
        storedRun.startedAt = now();
      }
    });
    try {
      if (this.cancellationRequests.has(agentAtStart.id)) {
        throw new RunCancelledError();
      }
      const request = {
        agentId: agentAtStart.id,
        workspacePath: agentAtStart.workspacePath,
        prompt: run.prompt,
        threadId: agentAtStart.codexThreadId,
      };
      const result = capsuleExecution
        ? await capsuleExecution.runner.run(request, capsuleExecution.plan)
        : await this.runner.run(request);
      const completedAt = now();
      await this.store.mutate((database) => {
        const storedRun = database.runs.find((item) => item.id === run.id);
        const agent = database.agents.find((item) => item.id === agentAtStart.id);
        if (!storedRun || !agent) return;
        storedRun.status = "completed";
        storedRun.output = result.output;
        storedRun.usage = result.usage;
        storedRun.completedAt = completedAt;
        database.messages.push({
          id: randomUUID(),
          agentId: agent.id,
          runId: run.id,
          role: "assistant",
          content: result.output,
          createdAt: completedAt,
        });
        agent.status = "ready";
        agent.codexThreadId = result.threadId;
        agent.lastError = null;
        agent.updatedAt = completedAt;
      });
    } catch (error) {
      const completedAt = now();
      const cancelled = error instanceof RunCancelledError;
      const message = this.redactHostPaths(
        error instanceof Error ? error.message : String(error),
      );
      await this.store.mutate((database) => {
        const storedRun = database.runs.find((item) => item.id === run.id);
        const agent = database.agents.find((item) => item.id === agentAtStart.id);
        if (storedRun) {
          storedRun.status = cancelled ? "cancelled" : "failed";
          storedRun.error = message;
          storedRun.completedAt = completedAt;
        }
        if (agent) {
          if (agent.status !== "stopped") {
            agent.status = cancelled ? "ready" : "error";
          }
          agent.lastError = cancelled ? null : message;
          agent.updatedAt = completedAt;
        }
      });
    }
  }

  private async setStatus(id: string, status: Agent["status"]): Promise<Agent> {
    return this.store.mutate((database) => {
      const agent = database.agents.find((item) => item.id === id);
      if (!agent) {
        throw new HttpError(404, "Agent not found");
      }
      if (status === "ready" && agent.status === "busy") {
        throw new HttpError(409, "Stop the active run before starting this Agent");
      }
      agent.status = status;
      if (status === "ready") agent.lastError = null;
      agent.updatedAt = now();
      return structuredClone(agent);
    });
  }

  private async cancelExecution(agentId: string): Promise<void> {
    this.cancellationRequests.add(agentId);
    try {
      await this.runner.cancel(agentId);
      const execution = this.activeExecutions.get(agentId);
      if (execution) {
        await execution;
      }
    } finally {
      this.cancellationRequests.delete(agentId);
    }
  }
}
