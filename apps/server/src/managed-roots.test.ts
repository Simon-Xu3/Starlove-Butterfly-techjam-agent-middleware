import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "./config.js";
import { validateManagedRoots } from "./managed-roots.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeConfig(): Promise<AppConfig> {
  const root = await mkdtemp(path.join(tmpdir(), "launchpad-managed-roots-"));
  temporaryDirectories.push(root);
  const resourceRoot = path.join(root, "resources");
  await mkdir(resourceRoot);
  return loadConfig({
    NODE_ENV: "test",
    APP_DATA_DIR: path.join(root, "data"),
    AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"),
    CODEX_HOME: path.join(root, "codex-home"),
    RESOURCE_ROOT: resourceRoot,
  });
}

describe("managed root validation", () => {
  it("accepts four separate canonical roots", async () => {
    await expect(validateManagedRoots(await makeConfig())).resolves.toBeUndefined();
  });

  it("rejects every nested managed-root pair", async () => {
    const keys = [
      "dataDirectory",
      "workspaceRoot",
      "codexHome",
      "resourceRoot",
    ] as const;

    for (let leftIndex = 0; leftIndex < keys.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < keys.length; rightIndex += 1) {
        const config = await makeConfig();
        const leftKey = keys[leftIndex]!;
        const rightKey = keys[rightIndex]!;
        const nestedPath = path.join(config[leftKey], "nested");
        await mkdir(nestedPath, { recursive: true });
        const overlappingConfig = { ...config, [rightKey]: nestedPath };

        await expect(validateManagedRoots(overlappingConfig)).rejects.toThrow(
          "must not overlap",
        );
      }
    }
  });

  it("rejects equal roots", async () => {
    const config = await makeConfig();
    await expect(
      validateManagedRoots({ ...config, codexHome: config.workspaceRoot }),
    ).rejects.toThrow("must not overlap");
  });

  it("does not create a writable root inside a rejected Resource root", async () => {
    const config = await makeConfig();
    const nestedDataRoot = path.join(config.resourceRoot, "app-data");

    await expect(
      validateManagedRoots({ ...config, dataDirectory: nestedDataRoot }),
    ).rejects.toThrow("must not overlap");

    expect(await readdir(config.resourceRoot)).toEqual([]);
  });

  it("rejects roots that overlap through a symlink", async () => {
    const config = await makeConfig();
    const linkedCodexHome = path.join(path.dirname(config.codexHome), "linked-codex");
    await mkdir(config.workspaceRoot, { recursive: true });
    await symlink(
      config.workspaceRoot,
      linkedCodexHome,
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(
      validateManagedRoots({ ...config, codexHome: linkedCodexHome }),
    ).rejects.toThrow("must not overlap");
  });
});
