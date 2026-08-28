import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  DeniedRunApiError,
  setDemoSession,
  StaleDemoSessionError,
} from "./api";

const deniedRunId = "11111111-1111-4111-8111-111111111111";
const deniedReceiptId = "22222222-2222-4222-8222-222222222222";

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
      runId: deniedRunId,
      receiptId: deniedReceiptId,
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

  it("does not treat an unrecognized denial reason as a safe Receipt result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            runId: deniedRunId,
            receiptId: deniedReceiptId,
            status: "denied",
            reason: "/private/protected/orders",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const request = api.sendMessage("agent-1", {
      content: "inspect payments",
      resourceIds: ["payments-incident"],
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.not.toBeInstanceOf(DeniedRunApiError);
  });

  it("discards a response from the previous demo principal", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const pending = api.resources();
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf("function"));
    setDemoSession("demo-session-b");
    resolveFetch?.(
      new Response(JSON.stringify({ resources: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(pending).rejects.toBeInstanceOf(StaleDemoSessionError);
  });

  it("rejects a Receipt that does not correlate to the requested Run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            receipts: [
              {
                receiptId: deniedReceiptId,
                runId: "77777777-7777-4777-8777-777777777777",
                humanPrincipalId: "user-a",
                agentId: "33333333-3333-4333-8333-333333333333",
                resourceId: "payments-incident",
                decision: "deny",
                reason: "entitlement_missing",
                grantGeneration: null,
                runnerStarted: false,
                createdAt: "2026-08-28T00:00:00.000Z",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(api.receipts(deniedRunId)).rejects.toBeInstanceOf(ApiError);
  });
});
