import path from "node:path";
import { ResourcePathValidator } from "./resource-path-validator.js";
import {
  RESERVED_MOUNT_TARGETS,
  RESOURCE_TARGET_PREFIX,
  type AllowedAuthorizationDecision,
  type EntitlementReader,
  type MountPlanCompiler,
  type MountPlanResult,
  type RegisteredResource,
  type ResourceRegistryReader,
} from "./types.js";

export interface MountPlanCompilerDependencies {
  registry: ResourceRegistryReader;
  entitlements: EntitlementReader;
  pathValidator: ResourcePathValidator;
}

function sameTrustedResource(
  decisionResource: RegisteredResource,
  currentResource: RegisteredResource,
): boolean {
  return (
    decisionResource.id === currentResource.id &&
    decisionResource.kind === currentResource.kind &&
    decisionResource.canonicalSourcePath ===
      currentResource.canonicalSourcePath
  );
}

function containerTargetsOverlap(left: string, right: string): boolean {
  const relative = path.posix.relative(left, right);
  const rightWithinLeft =
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith("../") &&
      !path.posix.isAbsolute(relative));
  const reverse = path.posix.relative(right, left);
  const leftWithinRight =
    reverse === "" ||
    (reverse !== ".." &&
      !reverse.startsWith("../") &&
      !path.posix.isAbsolute(reverse));
  return rightWithinLeft || leftWithinRight;
}

function invalidPath(): MountPlanResult {
  return Object.freeze({ ok: false, reason: "invalid_resource_path" });
}

function staleGeneration(): MountPlanResult {
  return Object.freeze({
    ok: false,
    reason: "stale_entitlement_generation",
  });
}

/**
 * Compiles the only value that may cross the Capsule Runtime seam. A fresh
 * Registry entry, fresh Entitlement generation, canonical path, and generated
 * non-colliding target are all required before the plan exists.
 */
export function createMountPlanCompiler(
  dependencies: MountPlanCompilerDependencies,
): MountPlanCompiler {
  return {
    async compileMountPlan(
      runId: string,
      decision: AllowedAuthorizationDecision,
    ): Promise<MountPlanResult> {
      if (
        decision.decision !== "allow" ||
        runId.length === 0 ||
        decision.agentId.length === 0 ||
        !Number.isSafeInteger(decision.grantGeneration) ||
        decision.grantGeneration <= 0
      ) {
        return invalidPath();
      }

      const resourceId = decision.resource.id;
      const currentResource = dependencies.registry.getResource(resourceId);
      if (
        !currentResource ||
        !sameTrustedResource(decision.resource, currentResource)
      ) {
        return invalidPath();
      }

      const currentEntitlement =
        dependencies.entitlements.getCurrentEntitlement(
          decision.principalId,
          resourceId,
        );
      if (
        !currentEntitlement ||
        currentEntitlement.principalId !== decision.principalId ||
        currentEntitlement.resourceId !== resourceId ||
        currentEntitlement.status !== "active" ||
        currentEntitlement.permission !== "read" ||
        currentEntitlement.generation !== decision.grantGeneration
      ) {
        return staleGeneration();
      }

      const pathResult = await dependencies.pathValidator.validateResource(
        currentResource,
        dependencies.registry.listResources(),
      );
      if (!pathResult.ok) return invalidPath();

      // Re-check the Entitlement after the awaited path validation: a revoke
      // completing during that filesystem I/O would otherwise still yield a
      // plan, and the Runner would mount a Resource whose authorization was
      // withdrawn. The spec requires the current generation to hold at the
      // moment the plan is produced.
      const entitlementAfterValidation =
        dependencies.entitlements.getCurrentEntitlement(
          decision.principalId,
          resourceId,
        );
      if (
        !entitlementAfterValidation ||
        entitlementAfterValidation.principalId !== decision.principalId ||
        entitlementAfterValidation.resourceId !== resourceId ||
        entitlementAfterValidation.status !== "active" ||
        entitlementAfterValidation.permission !== "read" ||
        entitlementAfterValidation.generation !== decision.grantGeneration
      ) {
        return staleGeneration();
      }

      const targetPath = RESOURCE_TARGET_PREFIX + resourceId;
      if (
        RESERVED_MOUNT_TARGETS.some((reservedTarget) =>
          containerTargetsOverlap(targetPath, reservedTarget),
        )
      ) {
        return invalidPath();
      }

      const plan = Object.freeze({
        runId,
        agentId: decision.agentId,
        resourceId,
        sourcePath: pathResult.canonicalSourcePath,
        targetPath,
        readOnly: true as const,
        grantGeneration: decision.grantGeneration,
      });
      return Object.freeze({ ok: true, plan });
    },
  };
}
