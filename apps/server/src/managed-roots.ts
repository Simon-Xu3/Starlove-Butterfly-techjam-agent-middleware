import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";

type ManagedRoot = {
  name: string;
  configuredPath: string;
  createAtStartup: boolean;
};

type CanonicalManagedRoot = {
  name: string;
  path: string;
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

// Resolve as far as the existing filesystem permits, then append any missing
// path components. This lets startup reject a writable path nested under a
// Protected Resource before mkdir could modify that Resource tree.
async function canonicalizeCandidateRoot(root: ManagedRoot): Promise<CanonicalManagedRoot> {
  let candidate = root.configuredPath;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const canonicalExistingPath = await realpath(candidate);
      const existingInfo = await stat(canonicalExistingPath);
      if (!existingInfo.isDirectory()) {
        throw new Error(root.name + " must be a directory");
      }
      return {
        name: root.name,
        path: path.join(canonicalExistingPath, ...missingSegments),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw new Error(root.name + " must be a directory");
      }
      missingSegments.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
}

async function ensureCanonicalDirectory(
  root: ManagedRoot,
  canonicalPath: string,
): Promise<void> {
  if (root.createAtStartup) {
    await mkdir(canonicalPath, { recursive: true, mode: 0o700 });
  }
  const rootInfo = await stat(root.configuredPath);
  if (!rootInfo.isDirectory()) {
    throw new Error(root.name + " must be a directory");
  }
  if ((await realpath(root.configuredPath)) !== canonicalPath) {
    throw new Error(root.name + " changed while startup validation was running");
  }
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

  const canonicalRoots = await Promise.all(roots.map(canonicalizeCandidateRoot));

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

  await Promise.all(
    roots.map((root, index) =>
      ensureCanonicalDirectory(root, canonicalRoots[index]!.path),
    ),
  );
}
