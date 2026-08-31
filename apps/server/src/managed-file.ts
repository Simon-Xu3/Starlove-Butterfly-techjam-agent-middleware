import { randomUUID } from "node:crypto";
import {
  mkdir,
  lstat,
  open,
  rm,
  rename,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

/**
 * Replaces a generated file without following a symlink at the final path.
 * The temporary directory must be server-owned and on the same filesystem as
 * the target so rename remains atomic.
 */
export async function replaceManagedFile(
  targetPath: string,
  temporaryDirectory: string,
  content: string,
): Promise<void> {
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  const temporaryInfo = await lstat(temporaryDirectory);
  if (!temporaryInfo.isDirectory() || temporaryInfo.isSymbolicLink()) {
    throw new Error("Managed temporary path must be a regular directory");
  }
  const temporaryPath = path.join(temporaryDirectory, randomUUID() + ".tmp");
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(content, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, targetPath);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });
  }
}
