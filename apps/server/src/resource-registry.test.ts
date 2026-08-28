import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  StaticResourceRegistry,
  type ResourceDefinition,
} from "./resource-registry.js";

describe("StaticResourceRegistry", () => {
  it("resolves the frozen Resource Registry only from the server-owned root", () => {
    const resourceRoot = path.resolve("/server-owned/resources");
    const registry = new StaticResourceRegistry(resourceRoot);

    expect(registry.listResources()).toEqual([
      {
        id: "orders-incident",
        displayName: "Orders Incident",
        kind: "directory",
        canonicalSourcePath: path.join(resourceRoot, "orders-incident"),
      },
      {
        id: "payments-incident",
        displayName: "Payments Incident",
        kind: "directory",
        canonicalSourcePath: path.join(resourceRoot, "payments-incident"),
      },
    ]);
    expect(registry.getResource("orders-incident")).toEqual(
      registry.listResources()[0],
    );
    expect(registry.getResource("unknown-resource")).toBeUndefined();
  });

  it("rejects invalid or ambiguous static Registry definitions", () => {
    const valid: ResourceDefinition = {
      id: "orders-incident",
      displayName: "Orders Incident",
      relativeDirectory: "orders-incident",
    };

    expect(
      () =>
        new StaticResourceRegistry("/resources", [
          valid,
          { ...valid, displayName: "Duplicate" },
        ]),
    ).toThrow("Duplicate Resource ID");
    expect(
      () =>
        new StaticResourceRegistry("/resources", [
          { ...valid, id: "../orders" },
        ]),
    ).toThrow("Invalid Resource ID");
    expect(
      () =>
        new StaticResourceRegistry("/resources", [
          { ...valid, relativeDirectory: "../outside" },
        ]),
    ).toThrow("Resource directory must stay within the Resource root");
    expect(
      () =>
        new StaticResourceRegistry("/resources", [
          { ...valid, displayName: "   " },
        ]),
    ).toThrow("Invalid Resource display name");
  });
});
