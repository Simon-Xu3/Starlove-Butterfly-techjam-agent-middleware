import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("./start-local-poc.sh", import.meta.url),
);

function locatedExecutables(command) {
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return [];
  return result.stdout
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function windowsBashCandidates() {
  const candidates = [];
  const explicit = process.env.LOCAL_POC_BASH?.trim();
  if (explicit) candidates.push(explicit);

  for (const gitPath of locatedExecutables("git.exe")) {
    const gitDirectory = path.dirname(gitPath);
    const directoryName = path.basename(gitDirectory).toLowerCase();
    const gitRoot = ["bin", "cmd"].includes(directoryName)
      ? path.dirname(gitDirectory)
      : gitDirectory;
    candidates.push(
      path.join(gitRoot, "bin", "bash.exe"),
      path.join(gitRoot, "usr", "bin", "bash.exe"),
    );
  }

  for (const root of [
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ]) {
    if (root) candidates.push(path.join(root, "Git", "bin", "bash.exe"));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Git",
        "bin",
        "bash.exe",
      ),
    );
  }

  // Do not fall back to C:\Windows\System32\bash.exe: that is the WSL
  // launcher, which cannot reliably execute this Windows checkout path.
  const windowsRoot = path.resolve(process.env.WINDIR ?? "C:\\Windows");
  const wslLauncher = path.join(windowsRoot, "System32", "bash.exe").toLowerCase();
  for (const bashPath of locatedExecutables("bash.exe")) {
    if (path.resolve(bashPath).toLowerCase() !== wslLauncher) {
      candidates.push(bashPath);
    }
  }

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

const bashCommand =
  process.platform === "win32"
    ? windowsBashCandidates().find((candidate) => existsSync(candidate))
    : process.env.LOCAL_POC_BASH?.trim() || "bash";

if (!bashCommand) {
  console.error(
    "[local-poc] Git Bash is required on Windows. Install Git for Windows " +
      "or set LOCAL_POC_BASH to bash.exe.",
  );
  process.exitCode = 2;
} else {
  const scriptArgument =
    process.platform === "win32"
      ? scriptPath.replaceAll("\\", "/")
      : scriptPath;
  const result = spawnSync(bashCommand, [scriptArgument], {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    console.error("[local-poc] Failed to start Bash: " + result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
