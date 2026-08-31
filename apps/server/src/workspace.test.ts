import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Agent } from "./types.js";
import { WorkspaceManager } from "./workspace.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function makeAgent(id: string, workspacePath: string): Agent {
  return {
    id,
    name: "Workspace Tester",
    description: "",
    instructions: "Keep this inside the workspace.",
    status: "ready",
    workspacePath,
    codexThreadId: null,
    lastError: null,
    ownerPrincipalId: "user-a",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
}

describe("WorkspaceManager", () => {
  it("replaces a malicious AGENTS.md symlink without changing its target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-workspace-"));
    temporaryDirectories.push(root);
    const workspaceRoot = path.join(root, "workspaces");
    const manager = new WorkspaceManager(workspaceRoot);
    await manager.initialize();

    const workspacePath = manager.workspacePath("agent-a");
    const agent = makeAgent("agent-a", workspacePath);
    await manager.create(agent);

    const outsideFile = path.join(root, "outside.txt");
    await writeFile(outsideFile, "must stay unchanged", "utf8");
    const instructionsPath = path.join(workspacePath, "AGENTS.md");
    await unlink(instructionsPath);
    await symlink(outsideFile, instructionsPath);

    await manager.writeInstructions({
      ...agent,
      instructions: "Updated safe instructions.",
    });

    expect(await readFile(outsideFile, "utf8")).toBe("must stay unchanged");
    expect((await lstat(instructionsPath)).isSymbolicLink()).toBe(false);
    expect(await readFile(instructionsPath, "utf8")).toContain(
      "Updated safe instructions.",
    );
  });

  it("rejects a stored workspace path that is not server-derived", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-workspace-"));
    temporaryDirectories.push(root);
    const manager = new WorkspaceManager(path.join(root, "workspaces"));
    await manager.initialize();

    const agent = makeAgent("agent-a", path.join(root, "outside"));
    await expect(manager.create(agent)).rejects.toThrow(
      "workspace path does not match",
    );
  });

  it("rejects a workspace directory symlink that escapes the root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-workspace-"));
    temporaryDirectories.push(root);
    const workspaceRoot = path.join(root, "workspaces");
    const manager = new WorkspaceManager(workspaceRoot);
    await manager.initialize();

    const outsideDirectory = path.join(root, "outside");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(outsideDirectory);
    const workspacePath = manager.workspacePath("agent-a");
    await symlink(outsideDirectory, workspacePath);

    await expect(
      manager.writeInstructions(makeAgent("agent-a", workspacePath)),
    ).rejects.toThrow("server-created directory");
  });

  it("rejects a workspace symlink aimed at another Agent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-workspace-"));
    temporaryDirectories.push(root);
    const manager = new WorkspaceManager(path.join(root, "workspaces"));
    await manager.initialize();
    const first = makeAgent("agent-a", manager.workspacePath("agent-a"));
    const second = makeAgent("agent-b", manager.workspacePath("agent-b"));
    await manager.create(first);
    await manager.create(second);
    const secondInstructions = path.join(second.workspacePath, "AGENTS.md");
    const original = await readFile(secondInstructions, "utf8");

    await rm(first.workspacePath, { recursive: true });
    await symlink(second.workspacePath, first.workspacePath);

    await expect(manager.writeInstructions(first)).rejects.toThrow(
      "server-created directory",
    );
    await expect(manager.archive(first)).rejects.toThrow(
      "server-created directory",
    );
    await expect(manager.runtimeWorkspacePath(first)).rejects.toThrow(
      "server-created directory",
    );
    await expect(manager.remove(first)).rejects.toThrow(
      "server-created directory",
    );
    expect(await readFile(secondInstructions, "utf8")).toBe(original);
  });
});
