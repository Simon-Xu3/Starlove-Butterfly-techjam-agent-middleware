import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ResourcePathValidator } from "./resource-path-validator.js";
import type { RegisteredResource } from "./types.js";

function resource(id: string, canonicalSourcePath: string): RegisteredResource {
  return {
    id,
    displayName: id,
    kind: "directory",
    canonicalSourcePath,
  };
}

describe("ResourcePathValidator", () => {
  let scratch: string;
  let allowedRoot: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "scopedrun-path-"));
    allowedRoot = path.join(scratch, "resources");
    await mkdir(allowedRoot);
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("accepts a real directory strictly below the canonical root", async () => {
    const orders = path.join(allowedRoot, "orders-incident");
    await mkdir(orders);
    const registered = resource("orders-incident", orders);

    const result = await new ResourcePathValidator(
      allowedRoot,
    ).validateResource(registered, [registered]);

    expect(result).toEqual({
      ok: true,
      canonicalSourcePath: await realpath(orders),
    });
  });

  it("fails closed when the allowed root is empty", async () => {
    const orders = path.join(allowedRoot, "orders-incident");
    await mkdir(orders);
    const registered = resource("orders-incident", orders);

    await expect(
      new ResourcePathValidator(" ").validateResource(registered, [
        registered,
      ]),
    ).resolves.toEqual({ ok: false });
  });

  it("fails closed when the allowed root is a filesystem root", async () => {
    const orders = path.join(allowedRoot, "orders-incident");
    await mkdir(orders);
    const registered = resource("orders-incident", orders);
    const filesystemRoot = path.parse(allowedRoot).root;

    await expect(
      new ResourcePathValidator(filesystemRoot).validateResource(registered, [
        registered,
      ]),
    ).resolves.toEqual({ ok: false });
  });

  it("resolves relative Registry sources under the allowed root", async () => {
    const orders = path.join(allowedRoot, "orders-incident");
    await mkdir(orders);
    const registered = resource("orders-incident", "orders-incident");

    const result = await new ResourcePathValidator(
      allowedRoot,
    ).validateResource(registered, [registered]);

    expect(result).toEqual({
      ok: true,
      canonicalSourcePath: await realpath(orders),
    });
  });

  it("rejects sibling-prefix, root, missing, and non-directory sources", async () => {
    const sibling = path.join(scratch, "resources-secret");
    const file = path.join(allowedRoot, "not-a-directory.txt");
    await mkdir(sibling);
    await writeFile(file, "not a directory");

    const attacks = [
      resource("sibling", sibling),
      resource("root", allowedRoot),
      resource("missing", path.join(allowedRoot, "missing")),
      resource("file", file),
    ];
    const validator = new ResourcePathValidator(allowedRoot);
    for (const attack of attacks) {
      await expect(
        validator.validateResource(attack, [attack]),
      ).resolves.toEqual({ ok: false });
    }
  });

  it("rejects a symlink that escapes the allowed root", async () => {
    const outside = path.join(scratch, "outside");
    const link = path.join(allowedRoot, "orders-incident");
    await mkdir(outside);
    await symlink(
      outside,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    const registered = resource("orders-incident", link);

    await expect(
      new ResourcePathValidator(allowedRoot).validateResource(registered, [
        registered,
      ]),
    ).resolves.toEqual({ ok: false });
  });

  it("rejects duplicate, nested, and overlapping Registry paths", async () => {
    const orders = path.join(allowedRoot, "orders-incident");
    const nested = path.join(orders, "nested");
    const payments = path.join(allowedRoot, "payments-incident");
    await mkdir(nested, { recursive: true });
    await mkdir(payments);
    const validator = new ResourcePathValidator(allowedRoot);

    const attackMatrices: RegisteredResource[][] = [
      [resource("orders", orders), resource("payments", orders)],
      [resource("orders", orders), resource("nested", nested)],
      [resource("duplicate", orders), resource("duplicate", payments)],
    ];
    for (const entries of attackMatrices) {
      await expect(validator.validateRegistry(entries)).resolves.toEqual({
        ok: false,
      });
    }
  });

  it("rejects path-shaped IDs and inconsistent Registry snapshots", async () => {
    const orders = path.join(allowedRoot, "orders-incident");
    const payments = path.join(allowedRoot, "payments-incident");
    await mkdir(orders);
    await mkdir(payments);
    const validator = new ResourcePathValidator(allowedRoot);

    for (const id of [
      "../orders",
      "/absolute",
      "orders/incident",
      "orders\\incident",
      ".",
    ]) {
      const attack = resource(id, orders);
      await expect(validator.validateRegistry([attack])).resolves.toEqual({
        ok: false,
      });
    }

    const current = resource("orders-incident", orders);
    const inconsistentList = [resource("orders-incident", payments)];
    await expect(
      validator.validateResource(current, inconsistentList),
    ).resolves.toEqual({ ok: false });
  });
});
