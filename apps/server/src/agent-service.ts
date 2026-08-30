import { createHash, randomUUID } from "node:crypto";
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
  AllowDecisionReceipt,
  AllowedAuthorizationDecision,
  CapsuleCapableRunner,
  CreateAgentInput,
  DatabaseV2,
  DeniedRunResponse,
  EntitlementReader,
  HumanPrincipal,
  HumanPrincipalId,
  Message,
  MountPlanCompiler,
  PublicCapsuleDenialReason,
  ResourceAuthorizer,
  RunnerResult,
  SendMessageBody,
  UpdateAgentInput,
  ValidatedRunMountPlan,
} from "./types.js";
import { WorkspaceManager } from "./workspace.js";

const now = () => new Date().toISOString();

// The frozen seams Capsule admission orchestrates. index.ts wires the real
// implementations: P3's authorizer and mount-plan compiler, and P5's
// persisted Receipt service. Tests substitute the frozen fakes.
export interface CapsuleSeams {
  authorizer: ResourceAuthorizer;
  mountPlanCompiler: MountPlanCompiler;
  entitlements: EntitlementReader;
  receipts: ReceiptSink;
}

export interface AgentServiceLogger {
  error(bindings: Record<string, unknown>, message: string): void;
}

const silentLogger: AgentServiceLogger = { error: () => undefined };
const SAFE_RUNTIME_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AggregateError",
]);

// Admission outcome for POST /api/agents/:id/messages: 202 when admitted,
// 403 with the safe denied body otherwise.
export type AdmissionResult =
  | { admitted: true; response: AcceptedRunResponse }
  | { admitted: false; response: DeniedRunResponse };

interface CapsuleExecution {
  plan: ValidatedRunMountPlan;
  runner: CapsuleCapableRunner;
  receipt: AllowDecisionReceipt;
}

export class AgentService {
  private readonly activeExecutions = new Map<string, Promise<void>>();
  private readonly pendingAdmissions = new Map<string, Set<Promise<void>>>();
  private readonly cancellationRequests = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly store: JsonStore,
    private readonly workspaces: WorkspaceManager,
    private readonly runner: AgentRunner,
    private readonly capsule: CapsuleSeams,
    private readonly logger: AgentServiceLogger = silentLogger,
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
    try {
      await this.cancelExecution(id);
      const archivedWorkspace = await this.workspaces.archive(agent);
      await this.store.mutate((database) => {
        const deletedRunIds = new Set(
          database.runs
            .filter((item) => item.agentId === id)
            .map((item) => item.id),
        );
        database.agents = database.agents.filter((item) => item.id !== id);
        database.messages = database.messages.filter((item) => item.agentId !== id);
        database.runs = database.runs.filter((item) => item.agentId !== id);
        database.receipts = database.receipts.filter(
          (receipt) => !deletedRunIds.has(receipt.runId),
        );
      });
      return { archivedWorkspace };
    } finally {
      this.cancellationRequests.delete(id);
    }
  }

  async startAgent(id: string, principalId: HumanPrincipalId): Promise<Agent> {
    this.getAgent(id, principalId);
    return this.setStatus(id, "ready");
  }

  async stopAgent(id: string, principalId: HumanPrincipalId): Promise<Agent> {
    this.getAgent(id, principalId);
    try {
      await this.cancelExecution(id);
      return await this.setStatus(id, "stopped");
    } finally {
      this.cancellationRequests.delete(id);
    }
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
  // entirely before the 202/403 is decided. Ownership-scoped Agent lookup is
  // earlier still: missing/non-owned Agents are a uniform 404 with no Run,
  // Message, Receipt, or Runner call.
  async sendMessage(
    agentId: string,
    principal: HumanPrincipal,
    body: SendMessageBody,
  ): Promise<AdmissionResult> {
    // Resolve ownership before any environment/setup response. Missing and
    // non-owned IDs must remain one uniform 404 even when Ark is unavailable.
    const agent = this.getAgent(agentId, principal.id);
    if (!isArkConfigured(this.config)) {
      throw new HttpError(
        503,
        "Ark is not configured. Set ARK_API_KEY and ARK_MODEL, then restart.",
      );
    }
    const resourceIds = body.resourceIds ?? [];
    if (resourceIds.length === 0) {
      // Baseline Run — existing behavior, no Receipt.
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
      if (decision.reason === "ownership_denied") {
        // Defence-in-depth: if ownership changes between Agent resolution and
        // authorization, preserve the same 404 and create no artifacts.
        throw new HttpError(404, "Agent not found");
      }
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

    const receipt: AllowDecisionReceipt = {
      receiptId: randomUUID(),
      runId,
      humanPrincipalId: principal.id,
      agentId,
      resourceId: decision.resource.id,
      decision: "allow",
      reason: "allowed",
      grantGeneration: decision.grantGeneration,
      runnerStarted: false,
      createdAt: now(),
    };
    const releasePendingAdmission = this.registerPendingAdmission(agentId);
    try {
      // Run, Message, Agent busy state, and initial authorization evidence
      // share one JsonStore commit. A failed persist leaves no partial Run.
      const admitted = await this.admitRun(
        agentId,
        content,
        runId,
        (database) => this.capsule.receipts.add(receipt, database),
      );
      this.beginExecution(admitted.agentAtStart, admitted.run, {
        plan: planResult.plan,
        runner,
        receipt,
      });
      return {
        admitted: true,
        response: { run: admitted.run, message: admitted.message },
      };
    } finally {
      // stopAgent waits for this gate and keeps the cancellation request live
      // until beginExecution is registered or admission fails.
      releasePendingAdmission();
    }
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
      reason: PublicCapsuleDenialReason;
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
    await this.store.mutate(async (database) => {
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
      await this.capsule.receipts.add(
        {
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
        },
        database,
      );
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
    beforeCommit?: (database: DatabaseV2) => void | Promise<void>,
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
    const agentAtStart = await this.store.mutate(async (database) => {
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
      await beforeCommit?.(database);
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

  private registerPendingAdmission(agentId: string): () => void {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const admissions = this.pendingAdmissions.get(agentId) ?? new Set();
    admissions.add(pending);
    this.pendingAdmissions.set(agentId, admissions);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      admissions.delete(pending);
      if (
        admissions.size === 0 &&
        this.pendingAdmissions.get(agentId) === admissions
      ) {
        this.pendingAdmissions.delete(agentId);
      }
      release();
    };
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

  // Runner failures can carry credentials, Resource content, or host paths.
  // Configured secrets and credential-shaped errors are dropped wholesale;
  // partial masking is not reliable for attacker-controlled text. The
  // container engine can also echo a bind-mount source, and path segments may
  // contain spaces, so arbitrary path-bearing messages are likewise replaced
  // instead of being rewritten. Non-file URIs are normalized before either
  // detection or return so a scheme cannot smuggle the original path back.
  private redactHostPaths(message: string): string {
    const pathWithheld =
      "Runtime failed. Details were withheld because the message referenced a filesystem path.";
    const normalized = message.normalize("NFC");
    const configuredSecrets = [this.config.arkApiKey, this.config.authToken].filter(
      (secret) => secret.length > 0,
    );
    if (
      configuredSecrets.some((secret) => normalized.includes(secret)) ||
      /\bbearer\s+[^\p{White_Space}"'<>),;]+/iu.test(normalized) ||
      /\b(?:api[_ -]?(?:key|token)|(?:access|refresh|id|auth|session)[_ -]?token|client[_ -]?secret|private[_ -]?key|token|authorization|password|secret|credential)\b\s*(?::|=|\bis\b|\bwas\b)?\s*["']?[^\p{White_Space}"'<>),;]+/iu.test(
        normalized,
      )
    ) {
      return "Runtime failed. Details were withheld because the message referenced sensitive information.";
    }
    if (/\bfile:\/\/[^\s"'<>)]*/iu.test(normalized)) return pathWithheld;

    let publicMessage = normalized.replace(
      /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]*/giu,
      "[URI withheld]",
    );
    // A route named in a network error is useful context, but it is also
    // indistinguishable from an absolute host path. Keep the surrounding
    // error and replace the complete route, including any traversal suffix.
    publicMessage = publicMessage.replace(
      /\bendpoint\s+\/[^\p{White_Space}"'()]+/giu,
      "endpoint [API route withheld]",
    );
    // Internal frame tokens are operationally useful only as a category. Do
    // not return their path-shaped suffix: a Runtime error can forge
    // `node:internal/Users/...` just as easily as a legitimate module frame.
    publicMessage = publicMessage.replace(
      /\bnode:internal\/[^\p{White_Space}"'()]+/giu,
      "node:[internal frame]",
    );
    const detectionText = publicMessage.replace(
      /([\\/])\p{White_Space}+/gu,
      "$1",
    );
    const carriesPath =
      /%(?:2f|5c)/iu.test(detectionText) ||
      /(?:^|[\\/])\.\.(?=[\\/]|$)/u.test(detectionText) ||
      /(?:^|[^\p{L}\p{N}_])(?:~[\\/]|[A-Za-z]:[\\/]|[\\/]{1,2})[^\p{White_Space}"'\\/()]+(?:[\\/][^\p{White_Space}"'\\/()]+)*/u.test(
        detectionText,
      );
    if (carriesPath) {
      return pathWithheld;
    }
    return publicMessage.slice(0, 2_000);
  }

  private currentCapsuleEntitlement(execution: CapsuleExecution): boolean {
    const current = this.capsule.entitlements.getCurrentEntitlement(
      execution.receipt.humanPrincipalId,
      execution.plan.resourceId,
    );
    return Boolean(
      current &&
        current.principalId === execution.receipt.humanPrincipalId &&
        current.resourceId === execution.plan.resourceId &&
        current.permission === "read" &&
        current.status === "active" &&
        current.generation === execution.plan.grantGeneration,
    );
  }

  private async finalizeLateCapsuleDenial(
    agentId: string,
    runId: string,
    execution: CapsuleExecution,
  ): Promise<void> {
    const completedAt = now();
    await this.store.mutate(async (database) => {
      await this.capsule.receipts.replace(
        {
          ...execution.receipt,
          decision: "deny",
          reason: "stale_entitlement_generation",
          runnerStarted: false,
        },
        database,
      );
      const storedRun = database.runs.find((candidate) => candidate.id === runId);
      const agent = database.agents.find((candidate) => candidate.id === agentId);
      if (storedRun) {
        storedRun.status = "denied";
        storedRun.error = "stale_entitlement_generation";
        storedRun.completedAt = completedAt;
      }
      if (agent) {
        if (agent.status !== "stopped") agent.status = "ready";
        agent.lastError = null;
        agent.updatedAt = completedAt;
      }
    });
  }

  private async finalizePreRunnerFailure(
    agentId: string,
    runId: string,
    receipt: AllowDecisionReceipt,
    cancelled: boolean,
    message: string,
  ): Promise<void> {
    const completedAt = now();
    await this.store.mutate(async (database) => {
      // This transaction also repairs a transient failure that happened after
      // runnerStarted:true was persisted but before the Runner handoff.
      await this.capsule.receipts.replace(receipt, database);
      const storedRun = database.runs.find((candidate) => candidate.id === runId);
      const agent = database.agents.find((candidate) => candidate.id === agentId);
      if (storedRun) {
        storedRun.status = cancelled ? "cancelled" : "failed";
        storedRun.error = message;
        storedRun.completedAt = completedAt;
      }
      if (agent) {
        if (agent.status !== "stopped") agent.status = "ready";
        agent.lastError = cancelled ? null : message;
        agent.updatedAt = completedAt;
      }
    });
  }

  private logRuntimeFailure(error: unknown, agentId: string, runId: string): void {
    const source = error instanceof Error ? error.message : String(error);
    const candidateName = error instanceof Error ? error.name : "";
    this.logger.error(
      {
        agentId,
        runId,
        error: {
          name: SAFE_RUNTIME_ERROR_NAMES.has(candidateName)
            ? candidateName
            : "RuntimeError",
          // Runtime stderr can contain credentials, Resource contents, or
          // host paths. A fingerprint supports correlation without copying
          // unbounded attacker-controlled detail into server logs.
          fingerprint: createHash("sha256").update(source).digest("hex"),
        },
      },
      "Runtime execution failed",
    );
  }

  private async executeRun(
    agentAtStart: Agent,
    run: AgentRun,
    capsuleExecution?: CapsuleExecution,
  ): Promise<void> {
    let runnerAttempted = false;
    try {
      // Keep the initial queued -> running persistence inside the same failure
      // boundary as every later pre-Runner step. A transient write failure must
      // converge the Run/Agent/Receipt instead of leaving queued + busy state.
      await this.store.mutate((database) => {
        const storedRun = database.runs.find((item) => item.id === run.id);
        if (storedRun) {
          storedRun.status = "running";
          storedRun.startedAt = now();
        }
      });
      if (this.cancellationRequests.has(agentAtStart.id)) {
        throw new RunCancelledError();
      }
      const request = {
        agentId: agentAtStart.id,
        workspacePath: agentAtStart.workspacePath,
        prompt: run.prompt,
        threadId: agentAtStart.codexThreadId,
      };
      let result: RunnerResult;
      if (capsuleExecution) {
        if (!this.currentCapsuleEntitlement(capsuleExecution)) {
          await this.finalizeLateCapsuleDenial(
            agentAtStart.id,
            run.id,
            capsuleExecution,
          );
          return;
        }
        await this.capsule.receipts.replace({
          ...capsuleExecution.receipt,
          runnerStarted: true,
        });
        // The awaited Receipt write is itself a race window. Recheck both
        // cancellation and Entitlement after it; once these pass there is no
        // await before Runner invocation.
        if (this.cancellationRequests.has(agentAtStart.id)) {
          await this.capsule.receipts.replace(capsuleExecution.receipt);
          throw new RunCancelledError();
        }
        if (!this.currentCapsuleEntitlement(capsuleExecution)) {
          await this.finalizeLateCapsuleDenial(
            agentAtStart.id,
            run.id,
            capsuleExecution,
          );
          return;
        }
        runnerAttempted = true;
        result = await capsuleExecution.runner.run(
          request,
          capsuleExecution.plan,
        );
      } else {
        result = await this.runner.run(request);
      }
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
      const preRunnerCapsule = Boolean(capsuleExecution && !runnerAttempted);
      const cancelled =
        error instanceof RunCancelledError ||
        (preRunnerCapsule && this.cancellationRequests.has(agentAtStart.id));
      if (!cancelled) this.logRuntimeFailure(error, agentAtStart.id, run.id);
      if (capsuleExecution && !runnerAttempted && !cancelled) {
        try {
          // A one-shot failure may have interrupted the atomic stale-denial
          // transaction. If the Entitlement is still stale, retry that exact
          // terminal state before falling back to a non-authorization failure.
          if (!this.currentCapsuleEntitlement(capsuleExecution)) {
            await this.finalizeLateCapsuleDenial(
              agentAtStart.id,
              run.id,
              capsuleExecution,
            );
            return;
          }
        } catch {
          // The fallback below atomically restores runnerStarted:false while
          // publishing the failed Run, provided persistence has recovered.
        }
      }
      const message = cancelled
        ? "Run cancelled"
        : this.redactHostPaths(
            error instanceof Error ? error.message : String(error),
          );
      if (capsuleExecution && !runnerAttempted) {
        await this.finalizePreRunnerFailure(
          agentAtStart.id,
          run.id,
          capsuleExecution.receipt,
          cancelled,
          message,
        );
        return;
      }
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
            agent.status =
              cancelled || (capsuleExecution && !runnerAttempted)
                ? "ready"
                : "error";
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
    await this.runner.cancel(agentId);
    while (true) {
      const pending = [...(this.pendingAdmissions.get(agentId) ?? [])];
      if (pending.length > 0) {
        await Promise.all(pending);
      }
      const execution = this.activeExecutions.get(agentId);
      if (execution) {
        await execution;
      }
      if (
        (this.pendingAdmissions.get(agentId)?.size ?? 0) === 0 &&
        !this.activeExecutions.has(agentId)
      ) {
        return;
      }
    }
  }
}
