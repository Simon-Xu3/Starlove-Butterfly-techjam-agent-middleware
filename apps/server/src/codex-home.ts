import { createHash } from "node:crypto";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  buildCodexConfigToml,
  type AppConfig,
} from "./config.js";
import { replaceManagedFile } from "./managed-file.js";

export function agentCodexHomePath(root: string, agentId: string): string {
  const directoryName = createHash("sha256").update(agentId).digest("hex");
  return path.join(path.resolve(root), "agents", directoryName);
}

async function canonicalManagedDirectory(
  canonicalRoot: string,
  name: string,
): Promise<string> {
  const directory = path.join(canonicalRoot, name);
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error("Codex state roots must be server-created directories");
  }
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== directory) {
    throw new Error("Codex state root must match its server-derived path");
  }
  return canonicalDirectory;
}

export async function hasAgentCodexHome(
  root: string,
  agentId: string,
): Promise<boolean> {
  try {
    const canonicalRoot = await realpath(root);
    const expected = agentCodexHomePath(canonicalRoot, agentId);
    const agentHomeInfo = await lstat(expected);
    return (
      agentHomeInfo.isDirectory() &&
      !agentHomeInfo.isSymbolicLink() &&
      (await realpath(expected)) === expected
    );
  } catch {
    return false;
  }
}

export async function prepareAgentCodexHome(
  config: AppConfig,
  agentId: string,
): Promise<string> {
  await mkdir(config.codexHome, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(config.codexHome);
  const agentsRoot = path.join(canonicalRoot, "agents");
  const temporaryDirectory = path.join(canonicalRoot, ".platform-tmp");
  await mkdir(agentsRoot, { recursive: true, mode: 0o700 });
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  const canonicalAgentsRoot = await canonicalManagedDirectory(
    canonicalRoot,
    "agents",
  );
  const canonicalTemporaryDirectory = await canonicalManagedDirectory(
    canonicalRoot,
    ".platform-tmp",
  );

  const agentHome = path.join(
    canonicalAgentsRoot,
    path.basename(agentCodexHomePath(canonicalRoot, agentId)),
  );
  await mkdir(agentHome, { recursive: true, mode: 0o700 });
  const agentHomeInfo = await lstat(agentHome);
  if (!agentHomeInfo.isDirectory() || agentHomeInfo.isSymbolicLink()) {
    throw new Error("Agent Codex home must be a server-created directory");
  }
  const canonicalAgentHome = await realpath(agentHome);
  if (canonicalAgentHome !== agentHome) {
    throw new Error("Agent Codex home must match its server-derived path");
  }

  await replaceManagedFile(
    path.join(canonicalAgentHome, "config.toml"),
    canonicalTemporaryDirectory,
    buildCodexConfigToml(config),
  );
  return canonicalAgentHome;
}
