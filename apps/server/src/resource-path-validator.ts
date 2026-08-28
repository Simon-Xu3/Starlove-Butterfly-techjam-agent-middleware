import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { RegisteredResource } from "./types.js";

export const RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface CanonicalRegistryEntry {
  readonly id: string;
  readonly canonicalSourcePath: string;
}

export type RegistryPathValidationResult =
  | {
      ok: true;
      entries: ReadonlyArray<CanonicalRegistryEntry>;
    }
  | { ok: false };

export type ResourcePathValidationResult =
  | { ok: true; canonicalSourcePath: string }
  | { ok: false };

function isSameOrDescendant(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function isStrictDescendant(parent: string, candidate: string): boolean {
  return parent !== candidate && isSameOrDescendant(parent, candidate);
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    isSameOrDescendant(left, right) || isSameOrDescendant(right, left)
  );
}

function sameRegistryEntry(
  left: RegisteredResource,
  right: RegisteredResource,
): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.canonicalSourcePath === right.canonicalSourcePath
  );
}

/**
 * Performs real-filesystem validation for Registry sources. It deliberately
 * returns no internal error detail so callers cannot accidentally promote a
 * host path into an HTTP denial reason or Receipt.
 */
export class ResourcePathValidator {
  constructor(private readonly allowedResourceRoot: string) {}

  async validateRegistry(
    resources: readonly RegisteredResource[],
  ): Promise<RegistryPathValidationResult> {
    try {
      if (this.allowedResourceRoot.trim().length === 0) return { ok: false };
      const configuredRoot = path.resolve(this.allowedResourceRoot);
      const canonicalRoot = await realpath(configuredRoot);
      const rootInfo = await stat(canonicalRoot);
      if (!rootInfo.isDirectory()) return { ok: false };

      const ids = new Set<string>();
      const entries: CanonicalRegistryEntry[] = [];
      for (const resource of resources) {
        if (
          !RESOURCE_ID_PATTERN.test(resource.id) ||
          ids.has(resource.id) ||
          resource.kind !== "directory" ||
          resource.canonicalSourcePath.length === 0
        ) {
          return { ok: false };
        }
        ids.add(resource.id);

        const configuredSource = path.isAbsolute(resource.canonicalSourcePath)
          ? resource.canonicalSourcePath
          : path.resolve(canonicalRoot, resource.canonicalSourcePath);
        const canonicalSourcePath = await realpath(configuredSource);
        const sourceInfo = await stat(canonicalSourcePath);
        if (
          !sourceInfo.isDirectory() ||
          !isStrictDescendant(canonicalRoot, canonicalSourcePath)
        ) {
          return { ok: false };
        }

        entries.push(
          Object.freeze({ id: resource.id, canonicalSourcePath }),
        );
      }

      for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < entries.length;
          rightIndex += 1
        ) {
          const left = entries[leftIndex];
          const right = entries[rightIndex];
          if (
            left &&
            right &&
            pathsOverlap(
              left.canonicalSourcePath,
              right.canonicalSourcePath,
            )
          ) {
            return { ok: false };
          }
        }
      }

      return { ok: true, entries: Object.freeze(entries) };
    } catch {
      return { ok: false };
    }
  }

  async validateResource(
    resource: RegisteredResource,
    registryResources: readonly RegisteredResource[],
  ): Promise<ResourcePathValidationResult> {
    const listed = registryResources.filter(
      (candidate) => candidate.id === resource.id,
    );
    if (
      listed.length !== 1 ||
      listed[0] === undefined ||
      !sameRegistryEntry(resource, listed[0])
    ) {
      return { ok: false };
    }

    const registryResult = await this.validateRegistry(registryResources);
    if (!registryResult.ok) return { ok: false };

    const validated = registryResult.entries.find(
      (entry) => entry.id === resource.id,
    );
    return validated
      ? { ok: true, canonicalSourcePath: validated.canonicalSourcePath }
      : { ok: false };
  }
}
