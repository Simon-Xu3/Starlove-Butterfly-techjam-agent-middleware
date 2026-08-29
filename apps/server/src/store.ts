import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  DEMO_ENTITLEMENT_MATRIX,
  RESOURCE_ID_PATTERN,
  type DatabaseV1,
  type DatabaseV2,
  type PrincipalResourceEntitlement,
} from "./types.js";

type Clock = () => string;

const principalIdSchema = z.enum(["user-a", "user-b"]);
const resourceIdSchema = z.string().regex(RESOURCE_ID_PATTERN);
const generationSchema = z.number().int().positive();
const timestampSchema = z.iso.datetime();

const entitlementSchema = z
  .object({
    principalId: principalIdSchema,
    resourceId: resourceIdSchema,
    permission: z.literal("read"),
    status: z.enum(["active", "revoked"]),
    generation: generationSchema,
    createdAt: timestampSchema,
    revokedAt: timestampSchema.nullable(),
  })
  .strict()
  .refine(
    (entitlement) =>
      DEMO_ENTITLEMENT_MATRIX.some(
        (entry) =>
          entry.principalId === entitlement.principalId &&
          entry.resourceId === entitlement.resourceId,
      ),
    "Entitlement is outside the server-owned demo policy",
  )
  .refine(
    (entitlement) =>
      entitlement.status === "active"
        ? entitlement.revokedAt === null
        : entitlement.revokedAt !== null,
    "Entitlement status and revokedAt do not agree",
  );

const denialReasonSchema = z.enum([
  "ownership_denied",
  "unknown_resource",
  "entitlement_missing",
  "entitlement_revoked",
  "stale_entitlement_generation",
  "runtime_profile_unsupported",
  "invalid_resource_path",
]);

const receiptBaseSchema = {
  receiptId: z.string().min(1),
  runId: z.string().min(1),
  humanPrincipalId: principalIdSchema,
  agentId: z.string().min(1),
  resourceId: resourceIdSchema,
  createdAt: timestampSchema,
};

const decisionReceiptSchema = z.discriminatedUnion("decision", [
  z
    .object({
      ...receiptBaseSchema,
      decision: z.literal("allow"),
      reason: z.literal("allowed"),
      grantGeneration: generationSchema,
      runnerStarted: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...receiptBaseSchema,
      decision: z.literal("deny"),
      reason: denialReasonSchema,
      grantGeneration: generationSchema.nullable(),
      runnerStarted: z.literal(false),
    })
    .strict(),
]);

const entitlementHistorySchema = z
  .array(entitlementSchema)
  .superRefine((entitlements, context) => {
    const generations = new Set<string>();
    const histories = new Map<
      string,
      Array<{ generation: number; index: number; status: "active" | "revoked" }>
    >();
    entitlements.forEach((entitlement, index) => {
      const historyKey = [
        entitlement.principalId,
        entitlement.resourceId,
      ].join("\0");
      const generationKey = [historyKey, entitlement.generation].join("\0");
      if (generations.has(generationKey)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate Entitlement generation",
          path: [index, "generation"],
        });
      }
      generations.add(generationKey);
      const history = histories.get(historyKey) ?? [];
      history.push({
        generation: entitlement.generation,
        index,
        status: entitlement.status,
      });
      histories.set(historyKey, history);
    });

    for (const history of histories.values()) {
      const active = history.filter((entry) => entry.status === "active");
      const latestGeneration = Math.max(
        ...history.map((entry) => entry.generation),
      );
      if (
        active.length > 1 ||
        (active.length === 1 && active[0]!.generation !== latestGeneration)
      ) {
        context.addIssue({
          code: "custom",
          message: "Entitlement history has an ambiguous active generation",
          path: [active[0]?.index ?? 0, "status"],
        });
      }
    }
  });

const receiptHistorySchema = z
  .array(decisionReceiptSchema)
  .superRefine((receipts, context) => {
    const receiptIds = new Set<string>();
    const runIds = new Set<string>();
    receipts.forEach((receipt, index) => {
      if (receiptIds.has(receipt.receiptId) || runIds.has(receipt.runId)) {
        context.addIssue({
          code: "custom",
          message: "Decision Receipts must be unique by Receipt and Run",
          path: [index],
        });
      }
      receiptIds.add(receipt.receiptId);
      runIds.add(receipt.runId);
    });
  });

const databaseV2Schema = z
  .object({
    version: z.literal(2),
    agents: z.array(
      z.object({ ownerPrincipalId: principalIdSchema }).passthrough(),
    ),
    // These baseline collections retain their existing runtime checks. Issue
    // #4 validates the new v2 trust boundary without rewriting v1 storage.
    messages: z.array(z.unknown()),
    runs: z.array(z.unknown()),
    entitlements: entitlementHistorySchema,
    receipts: receiptHistorySchema,
  })
  .strict();

function seedEntitlements(createdAt: string): PrincipalResourceEntitlement[] {
  return DEMO_ENTITLEMENT_MATRIX.map(({ principalId, resourceId }) => ({
    principalId,
    resourceId,
    permission: "read",
    status: "active",
    generation: 1,
    createdAt,
    revokedAt: null,
  }));
}

function emptyDatabase(createdAt: string): DatabaseV2 {
  return {
    version: 2,
    agents: [],
    messages: [],
    runs: [],
    entitlements: seedEntitlements(createdAt),
    receipts: [],
  };
}

function migrateVersion1(database: DatabaseV1, migratedAt: string): DatabaseV2 {
  return {
    version: 2,
    agents: database.agents.map((agent) => ({
      ...agent,
      ownerPrincipalId: "user-a",
    })),
    messages: database.messages,
    runs: database.runs,
    entitlements: seedEntitlements(migratedAt),
    receipts: [],
  };
}

function isDatabaseShape(value: unknown): value is DatabaseV1 | DatabaseV2 {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.version !== 1 && candidate.version !== 2) ||
    !Array.isArray(candidate.agents) ||
    !Array.isArray(candidate.messages) ||
    !Array.isArray(candidate.runs)
  ) {
    return false;
  }
  return candidate.version === 1 || databaseV2Schema.safeParse(value).success;
}

const systemClock: Clock = () => new Date().toISOString();

export class JsonStore {
  private data: DatabaseV2;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly clock: Clock = systemClock,
  ) {
    this.data = emptyDatabase(this.clock());
  }

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isDatabaseShape(parsed)) {
        throw new Error("Unsupported database format");
      }
      if (parsed.version === 1) {
        const migrated = migrateVersion1(parsed, this.clock());
        await this.persist(migrated);
        this.data = migrated;
      } else {
        this.data = parsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.data = emptyDatabase(this.clock());
      await this.persist();
    }
  }

  snapshot(): DatabaseV2 {
    return structuredClone(this.data);
  }

  async mutate<T>(
    mutation: (database: DatabaseV2) => T | Promise<T>,
  ): Promise<T> {
    let result!: T;
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.data);
      result = await mutation(next);
      if (!databaseV2Schema.safeParse(next).success) {
        throw new Error("Invalid version 2 database mutation");
      }
      await this.persist(next);
      this.data = next;
    });
    this.queue = operation.catch(() => undefined);
    await operation;
    return result;
  }

  protected async persist(data: DatabaseV2 = this.data): Promise<void> {
    const temporaryPath = this.filePath + ".tmp";
    await writeFile(temporaryPath, JSON.stringify(data, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}
