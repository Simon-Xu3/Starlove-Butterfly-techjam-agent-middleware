import { afterEach, describe, expect, it, vi } from "vitest";
import { api, DeniedRunApiError, setDemoSession } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  setDemoSession("demo-session-a");
});

describe("Resource Capsule API client", () => {
  it("submits a baseline Run with no Resource and includes mock identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run: { id: "run-1" }, message: { id: "msg-1" } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.sendMessage("agent-1", { content: "baseline" });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ content: "baseline" });
    expect(options.headers).toMatchObject({ "X-Demo-Session": "demo-session-a" });
  });

  it("submits exactly one approved Resource ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run: { id: "run-1" }, message: { id: "msg-1" } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setDemoSession("demo-session-b");

    await api.sendMessage("agent-1", {
      content: "inspect payments",
      resourceIds: ["payments-incident"],
    });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      content: "inspect payments",
      resourceIds: ["payments-incident"],
    });
    expect(options.headers).toMatchObject({ "X-Demo-Session": "demo-session-b" });
  });

  it("preserves a denied 403 as a structured terminal result", async () => {
    const denied = {
      runId: "run-denied",
      receiptId: "receipt-denied",
      status: "denied",
      reason: "entitlement_missing",
    } as const;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(denied), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      api.sendMessage("agent-1", {
        content: "inspect payments",
        resourceIds: ["payments-incident"],
      }),
    ).rejects.toMatchObject({
      status: 403,
      denied,
    } satisfies Partial<DeniedRunApiError>);
  });
});

