import path from "node:path";
import {
  RESOURCE_ID_PATTERN,
  type AdvisorResource,
  type AdvisorResourceReader,
  type RegisteredResource,
  type ResourceRegistryReader,
} from "./types.js";

export interface ResourceDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly relativeDirectory: string;
  /** Safe, bounded metadata used only by the metadata-only Advisor. */
  readonly advisorDescription?: string;
  /** Tags are normalized and frozen at Registry construction. */
  readonly advisorTags?: ReadonlyArray<string>;
}

const DEFAULT_RESOURCE_DEFINITIONS: ReadonlyArray<ResourceDefinition> = [
  {
    id: "orders-incident",
    displayName: "Orders Incident",
    relativeDirectory: "orders-incident",
    advisorDescription:
      "Investigate order checkout failures and the affected service timeline.",
    advisorTags: ["orders", "checkout", "order", "incident"],
  },
  {
    id: "inventory-incident",
    displayName: "Inventory Incident",
    relativeDirectory: "inventory-incident",
    advisorDescription:
      "Investigate stock availability and warehouse synchronization failures.",
    advisorTags: ["inventory", "stock", "warehouse", "incident"],
  },
  {
    id: "payments-incident",
    displayName: "Payments Incident",
    relativeDirectory: "payments-incident",
    advisorDescription:
      "Investigate duplicate payment captures, gateway errors, and chargebacks.",
    advisorTags: ["payments", "billing", "gateway", "chargebacks", "incident"],
  },
];

function cloneResource(resource: RegisteredResource): RegisteredResource {
  return { ...resource };
}

function cloneAdvisorResource(resource: AdvisorResource): AdvisorResource {
  return { ...resource, tags: [...resource.tags] };
}

function normalizeAdvisorTag(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class StaticResourceRegistry
  implements ResourceRegistryReader, AdvisorResourceReader
{
  private readonly resources: RegisteredResource[];
  private readonly advisorResources = new Map<string, AdvisorResource>();

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
      if (
        definition.displayName.trim().length === 0 ||
        definition.displayName.length > 200
      ) {
        throw new Error("Invalid Resource display name: " + definition.id);
      }
      if (ids.has(definition.id)) {
        throw new Error("Duplicate Resource ID: " + definition.id);
      }
      ids.add(definition.id);

      // Custom Registry definitions used by lower-seam tests may omit advisor
      // metadata. Keep the advisor DTO total with safe deterministic defaults;
      // production defaults above provide curated descriptions and tags.
      const advisorDescription =
        definition.advisorDescription?.trim() || definition.displayName.trim();
      const advisorTags = [
        ...(definition.advisorTags ?? definition.displayName.split(/\s+/)),
      ].map(normalizeAdvisorTag);
      if (advisorDescription.length > 500) {
        throw new Error("Invalid Advisor Resource description: " + definition.id);
      }
      if (
        advisorTags.length === 0 ||
        advisorTags.length > 12 ||
        advisorTags.some((tag) => tag.length === 0 || tag.length > 48)
      ) {
        throw new Error("Invalid Advisor Resource tags: " + definition.id);
      }
      const uniqueTags = [...new Set(advisorTags)];
      if (uniqueTags.length !== advisorTags.length) {
        throw new Error("Duplicate Advisor Resource tag: " + definition.id);
      }

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

      const resource = {
        id: definition.id,
        displayName: definition.displayName,
        kind: "directory" as const,
        // P3 re-resolves this server-owned path with realpath and verifies
        // canonical containment before it may enter a mount plan.
        canonicalSourcePath: sourcePath,
      };
      this.advisorResources.set(definition.id, {
        id: definition.id,
        displayName: definition.displayName,
        kind: "directory",
        description: advisorDescription,
        tags: uniqueTags,
      });
      return resource;
    });
  }

  getResource(resourceId: string): RegisteredResource | undefined {
    const resource = this.resources.find((item) => item.id === resourceId);
    return resource ? cloneResource(resource) : undefined;
  }

  listResources(): RegisteredResource[] {
    return this.resources.map(cloneResource);
  }

  getAdvisorResource(resourceId: string): AdvisorResource | undefined {
    const resource = this.advisorResources.get(resourceId);
    return resource ? cloneAdvisorResource(resource) : undefined;
  }
}
