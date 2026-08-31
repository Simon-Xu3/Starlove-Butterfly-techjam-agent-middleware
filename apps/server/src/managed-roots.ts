import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";

type ManagedRoot = {
  name: string;
  configuredPath: string;
  createAtStartup: boolean;
};

function containsPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
}

export async function validateManagedRoots(config: AppConfig): Promise<void> {
  const roots: ManagedRoot[] = [
    {
      name: "APP_DATA_DIR",
      configuredPath: config.dataDirectory,
      createAtStartup: true,
    },
    {
      name: "AGENT_WORKSPACE_ROOT",
      configuredPath: config.workspaceRoot,
      createAtStartup: true,
    },
    {
      name: "CODEX_HOME",
      configuredPath: config.codexHome,
      createAtStartup: true,
    },
    {
      name: "RESOURCE_ROOT",
      configuredPath: config.resourceRoot,
      createAtStartup: false,
    },
  ];

  const canonicalRoots: Array<{ name: string; path: string }> = [];
  for (const root of roots) {
    if (root.createAtStartup) {
      await mkdir(root.configuredPath, { recursive: true, mode: 0o700 });
    }
    const rootInfo = await stat(root.configuredPath);
    if (!rootInfo.isDirectory()) {
      throw new Error(root.name + " must be a directory");
    }
    canonicalRoots.push({
      name: root.name,
      path: await realpath(root.configuredPath),
    });
  }

  for (let leftIndex = 0; leftIndex < canonicalRoots.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < canonicalRoots.length;
      rightIndex += 1
    ) {
      const left = canonicalRoots[leftIndex]!;
      const right = canonicalRoots[rightIndex]!;
      if (containsPath(left.path, right.path) || containsPath(right.path, left.path)) {
        throw new Error(left.name + " must not overlap " + right.name);
      }
    }
  }
}
