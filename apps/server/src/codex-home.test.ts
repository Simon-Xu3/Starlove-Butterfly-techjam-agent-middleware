import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCodexHomePath, prepareAgentCodexHome } from "./codex-home.js";
import { loadConfig } from "./config.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("per-Agent Codex state", () => {
  it("derives a different state directory for every Agent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-codex-home-"));
    temporaryDirectories.push(root);
    const codexRoot = path.join(root, "codex");

    const first = agentCodexHomePath(codexRoot, "agent-a");
    const second = agentCodexHomePath(codexRoot, "agent-b");

    expect(first).not.toBe(second);
    expect(path.relative(codexRoot, first)).not.toMatch(/^\.\./);
    expect(path.relative(codexRoot, second)).not.toMatch(/^\.\./);
  });

  it("repairs a config symlink without writing through to the target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-codex-home-"));
    temporaryDirectories.push(root);
    const config = loadConfig({
      NODE_ENV: "test",
      APP_DATA_DIR: path.join(root, "data"),
      AGENT_WORKSPACE_ROOT: path.join(root, "workspaces"),
      CODEX_HOME: path.join(root, "codex"),
      ARK_API_KEY: "never-written-to-config",
      ARK_MODEL: "ep-test",
    });
    const firstHome = await prepareAgentCodexHome(config, "agent-a");
    const secondHome = await prepareAgentCodexHome(config, "agent-b");
    expect(firstHome).not.toBe(secondHome);

    const outsideFile = path.join(root, "outside.txt");
    await writeFile(outsideFile, "must stay unchanged", "utf8");
    const configPath = path.join(firstHome, "config.toml");
    await unlink(configPath);
    await symlink(outsideFile, configPath);

    await prepareAgentCodexHome(config, "agent-a");

    expect(await readFile(outsideFile, "utf8")).toBe("must stay unchanged");
    expect((await lstat(configPath)).isSymbolicLink()).toBe(false);
    expect(await readFile(configPath, "utf8")).toContain('model = "ep-test"');
    expect(await readFile(configPath, "utf8")).not.toContain(
      "never-written-to-config",
    );
  });

  it("rejects a Codex home symlink aimed at another Agent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-codex-home-"));
    temporaryDirectories.push(root);
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: path.join(root, "codex"),
      ARK_API_KEY: "test-key",
      ARK_MODEL: "ep-test",
    });
    const secondHome = await prepareAgentCodexHome(config, "agent-b");
    const secondConfig = await readFile(path.join(secondHome, "config.toml"), "utf8");
    const firstHome = agentCodexHomePath(config.codexHome, "agent-a");
    await symlink(secondHome, firstHome);

    await expect(prepareAgentCodexHome(config, "agent-a")).rejects.toThrow(
      "server-created directory",
    );
    expect(await readFile(path.join(secondHome, "config.toml"), "utf8")).toBe(
      secondConfig,
    );
  });

  it("rejects a symlinked shared agents directory before creating state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "launchpad-codex-home-"));
    temporaryDirectories.push(root);
    const codexRoot = path.join(root, "codex");
    const outside = path.join(root, "outside");
    await mkdir(codexRoot);
    await mkdir(outside);
    await symlink(outside, path.join(codexRoot, "agents"));
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: codexRoot,
      ARK_API_KEY: "test-key",
      ARK_MODEL: "ep-test",
    });

    await expect(prepareAgentCodexHome(config, "agent-a")).rejects.toThrow(
      "server-created directories",
    );
    expect(await readdir(outside)).toEqual([]);
  });
});
