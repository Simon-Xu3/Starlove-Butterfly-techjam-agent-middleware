import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("Resource Registry configuration", () => {
  it("defaults to the repository fixture directory", () => {
    const config = loadConfig({ NODE_ENV: "test" });

    expect(config.resourceRoot).toBe(
      fileURLToPath(new URL("../../../fixtures/resources", import.meta.url)),
    );
  });

  it("resolves the server-owned Resource root to an absolute path", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      RESOURCE_ROOT: "fixtures/resources",
    });

    expect(config.resourceRoot).toBe(path.resolve("fixtures/resources"));
  });
});
