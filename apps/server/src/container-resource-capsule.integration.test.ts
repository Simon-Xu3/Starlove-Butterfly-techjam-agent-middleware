import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { captureFixtureBaseline, makeMountPlan } from "./capsule-test-support.js";
import { loadConfig } from "./config.js";
import { ContainerCodexRunner } from "./container-codex-runner.js";

const execFileAsync = promisify(execFile);
const runContainerTests = process.env.RUN_CONTAINER_TESTS === "1";
const runWhenContainerTestsEnabled = runContainerTests ? it : it.skip;

async function buildKillTestImage(engine: string, directory: string): Promise<string> {
  const image = "scopedrun-kill-test:" + path.basename(directory);

  await writeFile(
    path.join(directory, "Dockerfile"),
    [
      "FROM alpine:3.20",
      "RUN mkdir -p /resources",
      "COPY codex /usr/local/bin/codex",
      "RUN chmod 755 /usr/local/bin/codex",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(directory, "codex"),
    [
      "#!/bin/sh",
      "set -eu",
      "test -r /resources/orders-incident/incident-report.md",
      "test ! -e /resources/payments-incident",
      "if touch /resources/orders-incident/.capsule-write-probe; then exit 1; fi",
      "printf '%s\\n' '{\"type\":\"thread.started\",\"thread_id\":\"kill-test-thread\"}'",
      "printf '%s\\n' '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"resource-capsule-kill-test-passed\"}}'",
      "printf '%s\\n' '{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":1,\"output_tokens\":1}}'",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  await execFileAsync(engine, ["build", "--tag", image, directory]);
  return image;
}

describe("Container Resource Capsule Kill Test", () => {
  runWhenContainerTestsEnabled(
    "allows only the delegated readonly Resource without modifying its host fixture",
    async () => {
      const engine = process.env.CONTAINER_ENGINE ?? "docker";
      const directory = await mkdtemp(path.join(tmpdir(), "scopedrun-kill-test-"));
      const workspacePath = path.join(directory, "workspace");
      const codexHome = path.join(directory, "codex-home");
      const plan = makeMountPlan();
      const paymentsPlan = makeMountPlan({ resourceId: "payments-incident" });
      const ordersBefore = await captureFixtureBaseline(plan.sourcePath);
      const paymentsBefore = await captureFixtureBaseline(paymentsPlan.sourcePath);
      let image: string | undefined;

      try {
        await mkdir(workspacePath);
        await mkdir(codexHome);
        const runner = new ContainerCodexRunner(
          loadConfig({
            NODE_ENV: "test",
            ARK_API_KEY: "kill-test-key",
            ARK_MODEL: "kill-test-model",
            CODEX_HOME: codexHome,
            RUNTIME_PROVIDER: "container",
            CONTAINER_ENGINE: engine,
            CONTAINER_RUNTIME_IMAGE: (image = await buildKillTestImage(engine, directory)),
          }),
        );

        await expect(
          runner.run(
            {
              agentId: "agent-a",
              workspacePath,
              prompt: "run the resource capsule kill test",
              threadId: null,
            },
            plan,
          ),
        ).resolves.toMatchObject({
          output: "resource-capsule-kill-test-passed",
          threadId: "kill-test-thread",
        });
      } finally {
        expect(await captureFixtureBaseline(plan.sourcePath)).toEqual(ordersBefore);
        expect(await captureFixtureBaseline(paymentsPlan.sourcePath)).toEqual(paymentsBefore);
        if (image) {
          await execFileAsync(engine, ["image", "rm", "--force", image]).catch(
            () => undefined,
          );
        }
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
