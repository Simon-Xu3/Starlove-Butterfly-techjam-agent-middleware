import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { captureFixtureBaseline, makeMountPlan } from "./capsule-test-support.js";
import { buildReadonlyResourceMount } from "./container-codex-runner.js";

const execFileAsync = promisify(execFile);
const runContainerTests = process.env.RUN_CONTAINER_TESTS === "1";
const runWhenContainerTestsEnabled = runContainerTests ? it : it.skip;

describe("Container Resource Capsule Kill Test", () => {
  runWhenContainerTestsEnabled(
    "allows only the delegated readonly Resource without modifying its host fixture",
    async () => {
      const plan = makeMountPlan();
      const before = await captureFixtureBaseline(plan.sourcePath);
      const engine = process.env.CONTAINER_ENGINE ?? "docker";
      const image = process.env.CONTAINER_KILL_TEST_IMAGE ?? "alpine:3.20";

      try {
        const { stdout } = await execFileAsync(engine, [
          "run",
          "--rm",
          "--mount",
          buildReadonlyResourceMount(plan),
          image,
          "sh",
          "-ceu",
          [
            'test -r "$1/incident-report.md"',
            "test ! -e /resources/payments-incident",
            'if touch "$1/.capsule-write-probe"; then exit 1; fi',
            'printf "resource-capsule-kill-test-passed\\n"',
          ].join("\n"),
          "sh",
          plan.targetPath,
        ]);
        expect(stdout).toContain("resource-capsule-kill-test-passed");
      } finally {
        expect(await captureFixtureBaseline(plan.sourcePath)).toEqual(before);
      }
    },
  );
});
