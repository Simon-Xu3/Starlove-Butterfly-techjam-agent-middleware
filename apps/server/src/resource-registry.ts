import path from "node:path";
import {
  RESOURCE_ID_PATTERN,
  type RegisteredResource,
  type ResourceRegistryReader,
} from "./types.js";

export interface ResourceDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly relativeDirectory: string;
}

const DEFAULT_RESOURCE_DEFINITIONS: ReadonlyArray<ResourceDefinition> = [
  {
    id: "orders-incident",
    displayName: "Orders Incident",
    relativeDirectory: "orders-incident",
  },
  {
    id: "payments-incident",
    displayName: "Payments Incident",
    relativeDirectory: "payments-incident",
  },
];

function cloneResource(resource: RegisteredResource): RegisteredResource {
  return { ...resource };
}

export class StaticResourceRegistry implements ResourceRegistryReader {
  private readonly resources: RegisteredResource[];

  constructor(
    resourceRoot: string,
    definitions: ReadonlyArray<ResourceDefinition> = DEFAULT_RESOURCE_DEFINITIONS,
  ) {
    const root = path.resolve(resourceRoot);
    const ids = new Set<string>();
    this.resources = definitions.map((definition) => {
      if (!RESOURCE_ID_PATTERN.test(definition.id)) {
        throw new Error("Invalid Resource ID: " + definition.id);
      }
      if (definition.displayName.trim().length === 0) {
        throw new Error("Invalid Resource display name: " + definition.id);
      }
      if (ids.has(definition.id)) {
        throw new Error("Duplicate Resource ID: " + definition.id);
      }
      ids.add(definition.id);

      const sourcePath = path.resolve(root, definition.relativeDirectory);
      const relativeSource = path.relative(root, sourcePath);
      if (
        relativeSource === "" ||
        relativeSource === ".." ||
        relativeSource.startsWith(".." + path.sep) ||
        path.isAbsolute(relativeSource)
      ) {
        throw new Error(
          "Resource directory must stay within the Resource root: " +
            definition.id,
        );
      }

      return {
        id: definition.id,
        displayName: definition.displayName,
        kind: "directory" as const,
        // P3 re-resolves this server-owned path with realpath and verifies
        // canonical containment before it may enter a mount plan.
        canonicalSourcePath: sourcePath,
      };
    });
  }

  getResource(resourceId: string): RegisteredResource | undefined {
    const resource = this.resources.find((item) => item.id === resourceId);
    return resource ? cloneResource(resource) : undefined;
  }

  listResources(): RegisteredResource[] {
    return this.resources.map(cloneResource);
  }
}
