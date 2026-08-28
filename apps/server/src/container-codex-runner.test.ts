import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { makeMountPlan } from "./capsule-test-support.js";
import { loadConfig } from "./config.js";
import {
  buildContainerRunArgs,
  ContainerCodexRunner,
  containerName,
  type ContainerProcessLauncher,
} from "./container-codex-runner.js";

function makeSuccessfulLauncher(calls: string[][]): ContainerProcessLauncher {
  return (_command, args) => {
    calls.push([...args]);
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      kill: () => true,
    }) as unknown as ChildProcess;
    queueMicrotask(() => {
      stdout.end(
        [
          '{"type":"thread.started","thread_id":"runner-thread"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"Runner completed"}}',
          '{"type":"turn.completed","usage":{"input_tokens":2,"output_tokens":1}}',
        ].join("\n") + "\n",
      );
      stderr.end();
      child.emit("close", 0);
    });
    return child;
  };
}

function makePendingLauncher(): {
  launcher: ContainerProcessLauncher;
  getChild: () => ChildProcess;
} {
  let child: ChildProcess | undefined;
  const launcher: ContainerProcessLauncher = () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let closed = false;
    child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      kill: () => {
        if (!closed) {
          closed = true;
          queueMicrotask(() => child?.emit("close", 1));
        }
        return true;
      },
    }) as unknown as ChildProcess;
    return child;
  };
  return {
    launcher,
    getChild: () => {
      if (!child) throw new Error("Expected the Container Runner to start a process");
      return child;
    },
  };
}

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

  it("executes a baseline Run without a Resource mount", async () => {
    const calls: string[][] = [];
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      RUNTIME_PROVIDER: "container",
    });
    const runner = new ContainerCodexRunner(config, makeSuccessfulLauncher(calls));

    await expect(
      runner.run({
        agentId: "agent-a",
        workspacePath: "/tmp/workspace",
        prompt: "complete the baseline task",
        threadId: null,
      }),
    ).resolves.toEqual({
      output: "Runner completed",
      threadId: "runner-thread",
      usage: { inputTokens: 2, outputTokens: 1 },
    });
    expect(calls[0]).not.toContain("/resources/orders-incident");
  });

  it("executes a Capsule Run with the validated readonly mount", async () => {
    const calls: string[][] = [];
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      RUNTIME_PROVIDER: "container",
    });
    const runner = new ContainerCodexRunner(config, makeSuccessfulLauncher(calls));
    const plan = makeMountPlan({ sourcePath: "/fixtures/orders-incident" });

    await expect(
      runner.run(
        {
          agentId: "agent-a",
          workspacePath: "/tmp/workspace",
          prompt: "analyze the delegated incident",
          threadId: null,
        },
        plan,
      ),
    ).resolves.toMatchObject({ output: "Runner completed" });
    expect(calls[0]).toContain(
      "type=bind,src=/fixtures/orders-incident,dst=/resources/orders-incident,readonly",
    );

    if (false) {
      const request = {
        agentId: "agent-a",
        workspacePath: "/tmp/workspace",
        prompt: "compile-time contract probe",
        threadId: null,
      };
      // @ts-expect-error Capsule calls require a non-null ValidatedRunMountPlan.
      void runner.run(request, undefined);
      // @ts-expect-error Raw source, target, and mode values cannot replace a plan.
      void runner.run(request, {
        sourcePath: "/fixtures/orders-incident",
        targetPath: "/resources/orders-incident",
        readOnly: true,
      });
    }
  });

  it("cancels an active Container Run through its existing termination path", async () => {
    const pending = makePendingLauncher();
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      RUNTIME_PROVIDER: "container",
    });
    const runner = new ContainerCodexRunner(config, pending.launcher);
    const run = runner.run({
      agentId: "agent-a",
      workspacePath: "/tmp/workspace",
      prompt: "wait for cancellation",
      threadId: null,
    });

    pending.getChild();
    await expect(runner.cancel("agent-a")).resolves.toBe(true);
    await expect(run).rejects.toThrow("Run cancelled");
  });

  it("enforces the configured Runtime timeout", async () => {
    const pending = makePendingLauncher();
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      CODEX_TIMEOUT_MS: "1000",
      RUNTIME_PROVIDER: "container",
    });
    const runner = new ContainerCodexRunner(config, pending.launcher);

    await expect(
      runner.run({
        agentId: "agent-a",
        workspacePath: "/tmp/workspace",
        prompt: "wait for timeout",
        threadId: null,
      }),
    ).rejects.toThrow("Runtime timed out after 1000 ms");
  });

  it("stops a Container Run when output exceeds the configured limit", async () => {
    const pending = makePendingLauncher();
    const config = loadConfig({
      NODE_ENV: "test",
      CODEX_HOME: "/tmp/codex-home",
      CODEX_MAX_OUTPUT_BYTES: "65536",
      RUNTIME_PROVIDER: "container",
    });
    const runner = new ContainerCodexRunner(config, pending.launcher);
    const run = runner.run({
      agentId: "agent-a",
      workspacePath: "/tmp/workspace",
      prompt: "emit too much output",
      threadId: null,
    });

    pending.getChild().stdout?.emit("data", Buffer.alloc(65_537));
    await expect(run).rejects.toThrow("Codex output exceeded CODEX_MAX_OUTPUT_BYTES");
  });
});
