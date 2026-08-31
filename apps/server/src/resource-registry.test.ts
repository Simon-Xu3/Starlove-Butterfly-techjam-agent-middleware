import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  StaticResourceRegistry,
  type ResourceDefinition,
} from "./resource-registry.js";
import { ResourcePathValidator } from "./resource-path-validator.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

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
        id: "inventory-incident",
        displayName: "Inventory Incident",
        kind: "directory",
        canonicalSourcePath: path.join(resourceRoot, "inventory-incident"),
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

  it("validates and canonicalizes every Resource during startup", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-registry-"));
    temporaryDirectories.push(root);
    const resourceRoot = path.join(root, "resources");
    await mkdir(path.join(resourceRoot, "orders"), { recursive: true });
    const registry = new StaticResourceRegistry(resourceRoot, [
      {
        id: "orders",
        displayName: "Orders",
        relativeDirectory: "orders",
      },
    ]);

    await registry.initialize(new ResourcePathValidator(resourceRoot));

    expect(registry.getResource("orders")?.canonicalSourcePath).toBe(
      await realpath(path.join(resourceRoot, "orders")),
    );
  });

  it("fails startup when a Registry source is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-registry-"));
    temporaryDirectories.push(root);
    const resourceRoot = path.join(root, "resources");
    await mkdir(resourceRoot);
    const registry = new StaticResourceRegistry(resourceRoot, [
      {
        id: "missing",
        displayName: "Missing",
        relativeDirectory: "missing",
      },
    ]);

    await expect(
      registry.initialize(new ResourcePathValidator(resourceRoot)),
    ).rejects.toThrow("Registry validation failed");
  });

  it("fails startup when a Resource symlink escapes the Registry root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-registry-"));
    temporaryDirectories.push(root);
    const resourceRoot = path.join(root, "resources");
    const outside = path.join(root, "outside");
    await mkdir(resourceRoot);
    await mkdir(outside);
    await symlink(outside, path.join(resourceRoot, "escaped"));
    const registry = new StaticResourceRegistry(resourceRoot, [
      {
        id: "escaped",
        displayName: "Escaped",
        relativeDirectory: "escaped",
      },
    ]);

    await expect(
      registry.initialize(new ResourcePathValidator(resourceRoot)),
    ).rejects.toThrow("Registry validation failed");
  });

  it("fails startup when two Registry sources overlap", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-registry-"));
    temporaryDirectories.push(root);
    const resourceRoot = path.join(root, "resources");
    await mkdir(path.join(resourceRoot, "orders", "nested"), {
      recursive: true,
    });
    const registry = new StaticResourceRegistry(resourceRoot, [
      {
        id: "orders",
        displayName: "Orders",
        relativeDirectory: "orders",
      },
      {
        id: "nested",
        displayName: "Nested",
        relativeDirectory: path.join("orders", "nested"),
      },
    ]);

    await expect(
      registry.initialize(new ResourcePathValidator(resourceRoot)),
    ).rejects.toThrow("Registry validation failed");
  });
});
