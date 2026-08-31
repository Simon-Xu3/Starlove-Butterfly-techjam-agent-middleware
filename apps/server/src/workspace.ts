import {
  lstat,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { replaceManagedFile } from "./managed-file.js";
import type { Agent } from "./types.js";

export class WorkspaceManager {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  workspacePath(agentId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(agentId)) {
      throw new Error("Invalid Agent ID for workspace path");
    }
    return path.join(this.root, agentId);
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.root, ".deleted"), {
      recursive: true,
      mode: 0o700,
    });
    await mkdir(path.join(this.root, ".platform-tmp"), {
      recursive: true,
      mode: 0o700,
    });
    await this.canonicalManagedDirectory(".deleted");
    await this.canonicalManagedDirectory(".platform-tmp");
  }

  async create(agent: Agent): Promise<void> {
    const workspace = this.expectedWorkspace(agent);
    await mkdir(workspace, { recursive: false, mode: 0o700 });
    try {
      await this.writeInstructions(agent);
      await writeFile(
        path.join(workspace, ".gitignore"),
        [".codex/", "node_modules/", "dist/", ".env", "*.log", ""].join("\n"),
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      await writeFile(
        path.join(workspace, "README.md"),
        [
          "# " + agent.name + " workspace",
          "",
          "Files created or edited by the Agent live here.",
          "The platform-generated AGENTS.md contains the current Agent instructions.",
          "",
        ].join("\n"),
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
    } catch (error) {
      await rm(workspace, { recursive: true, force: true });
      throw error;
    }
  }

  async writeInstructions(agent: Agent): Promise<void> {
    const content = [
      "# Platform-managed Agent instructions",
      "",
      "You are the coding Agent named " + agent.name + ".",
      agent.description ? "Purpose: " + agent.description : "",
      "",
      "## Instructions",
      "",
      agent.instructions ||
        "Help the user complete coding tasks in this workspace. Explain material results concisely.",
      "",
      "## Workspace rules",
      "",
      "- Work only inside this workspace unless the user explicitly requests otherwise.",
      "- Preserve existing user files and avoid destructive operations.",
      "- Build and test changes when practical.",
      "- Never print environment variables or credentials.",
      "",
      "This file is regenerated when the Agent configuration is updated.",
      "",
    ]
      .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
      .join("\n");
    const { canonicalRoot, canonicalWorkspace } =
      await this.canonicalWorkspace(agent);
    const temporaryDirectory = await this.canonicalManagedDirectory(
      ".platform-tmp",
    );
    await replaceManagedFile(
      path.join(canonicalWorkspace, "AGENTS.md"),
      temporaryDirectory,
      content,
    );
  }

  async runtimeWorkspacePath(agent: Agent): Promise<string> {
    const { canonicalWorkspace } = await this.canonicalWorkspace(agent);
    return canonicalWorkspace;
  }

  async archive(agent: Agent): Promise<string> {
    const { canonicalRoot, canonicalWorkspace } =
      await this.canonicalWorkspace(agent);
    const deletedRoot = await this.canonicalManagedDirectory(".deleted");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destination = path.join(
      deletedRoot,
      agent.id + "-" + timestamp,
    );
    await rename(canonicalWorkspace, destination);
    return destination;
  }

  async restore(agent: Agent, archivedWorkspace: string): Promise<void> {
    const deletedRoot = await this.canonicalManagedDirectory(".deleted");
    const archiveInfo = await lstat(archivedWorkspace);
    if (!archiveInfo.isDirectory() || archiveInfo.isSymbolicLink()) {
      throw new Error("Archived workspace must be a regular directory");
    }
    const canonicalArchive = await realpath(archivedWorkspace);
    if (
      path.dirname(canonicalArchive) !== deletedRoot ||
      !path.basename(canonicalArchive).startsWith(agent.id + "-")
    ) {
      throw new Error("Archived workspace must stay within the deleted directory");
    }
    await rename(canonicalArchive, this.expectedWorkspace(agent));
  }

  async remove(agent: Agent): Promise<void> {
    const { canonicalWorkspace } = await this.canonicalWorkspace(agent);
    await rm(canonicalWorkspace, { recursive: true, force: true });
  }

  private expectedWorkspace(agent: Agent): string {
    const expected = this.workspacePath(agent.id);
    if (path.resolve(agent.workspacePath) !== expected) {
      throw new Error("Agent workspace path does not match its server-derived path");
    }
    return expected;
  }

  private async canonicalWorkspace(
    agent: Agent,
  ): Promise<{ canonicalRoot: string; canonicalWorkspace: string }> {
    const expected = this.expectedWorkspace(agent);
    const canonicalRoot = await realpath(this.root);
    const workspaceInfo = await lstat(expected);
    if (!workspaceInfo.isDirectory() || workspaceInfo.isSymbolicLink()) {
      throw new Error("Agent workspace must be a server-created directory");
    }
    const canonicalWorkspace = await realpath(expected);
    const canonicalExpected = path.join(canonicalRoot, agent.id);
    if (canonicalWorkspace !== canonicalExpected) {
      throw new Error("Agent workspace must match its canonical server-derived path");
    }
    return { canonicalRoot, canonicalWorkspace };
  }

  private async canonicalManagedDirectory(name: string): Promise<string> {
    const canonicalRoot = await realpath(this.root);
    const configuredDirectory = path.join(this.root, name);
    const directoryInfo = await lstat(configuredDirectory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error("Workspace platform paths must be regular directories");
    }
    const canonicalDirectory = await realpath(configuredDirectory);
    if (canonicalDirectory !== path.join(canonicalRoot, name)) {
      throw new Error("Workspace platform path is outside its expected location");
    }
    return canonicalDirectory;
  }
}
