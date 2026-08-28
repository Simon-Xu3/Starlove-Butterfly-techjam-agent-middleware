import { describe, expect, it } from "vitest";
import { makeMountPlan } from "./capsule-test-support.js";
import { loadConfig } from "./config.js";
import {
  buildContainerRunArgs,
  containerName,
} from "./container-codex-runner.js";

describe("Container Codex runner", () => {
  it("builds an isolated Docker/Podman-compatible invocation", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ARK_API_KEY: "secret-that-must-not-appear-in-argv",
      ARK_MODEL: "ep-test",
      CODEX_HOME: "/tmp/codex-home",
      RUNTIME_PROVIDER: "container",
      CONTAINER_ENGINE: "podman",
      CONTAINER_RUNTIME_IMAGE: "runtime:test",
      CONTAINER_USER: "501:20",
      RUNTIME_INSTANCE_ID: "test-instance",
    });
    const args = buildContainerRunArgs(
      {
        agentId: "agent/unsafe",
        workspacePath: "/tmp/agent-workspace",
        prompt: "write a small program",
        threadId: null,
      },
      config,
    );

    expect(containerName("agent/unsafe", "test-instance")).toBe(
      "launchpad-test-instance-agent-unsafe",
    );
    expect(args).toContain("runtime:test");
    expect(args).toContain("type=bind,src=/tmp/agent-workspace,dst=/workspace");
    expect(args).toContain("type=bind,src=/tmp/codex-home,dst=/codex-home");
    expect(args).toContain("501:20");
    expect(args).toContain("workspace-write");
    expect(args).toContain("/workspace");
    expect(args).toContain("io.codejam.instance-id=test-instance");
    expect(args).toContain("keep-id");
    expect(args).not.toContain("secret-that-must-not-appear-in-argv");
    expect(
      args.flatMap((argument, index) =>
        args[index - 1] === "--mount" ? [argument] : [],
      ),
    ).toEqual([
      "type=bind,src=/tmp/agent-workspace,dst=/workspace",
      "type=bind,src=/tmp/codex-home,dst=/codex-home",
    ]);
  });

  it("resumes a thread inside the mounted Runtime workspace", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      RUNTIME_PROVIDER: "container",
    });
    const args = buildContainerRunArgs(
      {
        agentId: "agent",
        workspacePath: "/tmp/workspace",
        prompt: "continue",
        threadId: "thread-123",
      },
      config,
    );
    expect(args.slice(-3)).toEqual(["resume", "thread-123", "continue"]);
    expect(args).not.toContain("keep-id");
  });

  it("adds exactly one readonly Resource mount from a validated plan", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      RUNTIME_PROVIDER: "container",
    });
    const plan = makeMountPlan({
      sourcePath: "/fixtures/orders-incident",
      targetPath: "/resources/orders-incident",
    });

    const args = buildContainerRunArgs(
      {
        agentId: "agent-a",
        workspacePath: "/tmp/workspace",
        prompt: "summarize the incident",
        threadId: null,
      },
      config,
      plan,
    );
    const mounts = args.flatMap((argument, index) =>
      args[index - 1] === "--mount" ? [argument] : [],
    );

    expect(mounts).toEqual([
      "type=bind,src=/tmp/workspace,dst=/workspace",
      "type=bind,src=/tmp/codex-home,dst=/codex-home",
      "type=bind,src=/fixtures/orders-incident,dst=/resources/orders-incident,readonly",
    ]);
    expect(args).not.toContain("payments-incident");
  });
});
