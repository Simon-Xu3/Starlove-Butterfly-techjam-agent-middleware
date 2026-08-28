import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, DeniedRunApiError } from "./api";
import {
  buildSendMessageBody,
  DecisionReceiptCard,
} from "./resource-capsule";

const deniedRunId = "11111111-1111-4111-8111-111111111111";
const deniedReceiptId = "22222222-2222-4222-8222-222222222222";
const deniedAgentId = "33333333-3333-4333-8333-333333333333";
const allowedRunId = "44444444-4444-4444-8444-444444444444";
const allowedReceiptId = "55555555-5555-4555-8555-555555555555";
const allowedAgentId = "66666666-6666-4666-8666-666666666666";

afterEach(() => vi.unstubAllGlobals());

describe("mocked Capsule deny flow", () => {
  it("carries one explicit Resource through 403 to a redacted Receipt view", async () => {
    const denied = {
      runId: deniedRunId,
      receiptId: deniedReceiptId,
      status: "denied",
      reason: "entitlement_missing",
    } as const;
    const receipt = {
      receiptId: denied.receiptId,
      runId: denied.runId,
      humanPrincipalId: "user-a",
      agentId: deniedAgentId,
      resourceId: "payments-incident",
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
      runnerStarted: false,
      createdAt: "2026-08-28T00:00:00.000Z",
    } as const;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/messages")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          content: "inspect payments",
          resourceIds: ["payments-incident"],
        });
        return new Response(JSON.stringify(denied), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/receipts")) {
        return new Response(JSON.stringify({ receipts: [receipt] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error("Unexpected URL: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    let terminal: typeof denied | null = null;
    try {
      await api.sendMessage(
        deniedAgentId,
        buildSendMessageBody("inspect payments", "payments-incident"),
      );
    } catch (reason) {
      if (!(reason instanceof DeniedRunApiError)) throw reason;
      terminal = reason.denied as typeof denied;
    }
    expect(terminal).toEqual(denied);

    const result = await api.receipts(denied.runId);
    const markup = renderToStaticMarkup(
      <DecisionReceiptCard receipt={result.receipts[0] ?? null} denied={terminal} />,
    );
    expect(markup).toContain("Run denied");
    expect(markup).toContain("payments-incident");
    expect(markup).toContain("Runner started");
    for (const forbidden of [
      "sourcePath",
      "secret prompt",
      "Bearer",
      "demo-session-a",
      "resource body",
    ]) {
      expect(markup).not.toContain(forbidden);
    }
  });
});

describe("mocked Capsule allow flow", () => {
  it("submits one approved Resource and renders its queryable safe Receipt", async () => {
    const accepted = {
      run: { id: allowedRunId },
      message: { id: "message-allowed" },
    };
    const receipt = {
      receiptId: allowedReceiptId,
      runId: accepted.run.id,
      humanPrincipalId: "user-a",
      agentId: allowedAgentId,
      resourceId: "orders-incident",
      decision: "allow",
      reason: "allowed",
      grantGeneration: 3,
      runnerStarted: true,
      createdAt: "2026-08-28T00:00:00.000Z",
    } as const;
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/messages")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            content: "inspect orders",
            resourceIds: ["orders-incident"],
          });
          return new Response(JSON.stringify(accepted), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/receipts")) {
          return new Response(
            JSON.stringify({
              receipts: [
                {
                  ...receipt,
                  sourcePath: "/private/protected/orders",
                  prompt: "secret prompt",
                  token: "Bearer secret",
                  session: "demo-session-a",
                  resourceBody: "resource body",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        throw new Error("Unexpected URL: " + url);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.sendMessage(
      allowedAgentId,
      buildSendMessageBody("inspect orders", "orders-incident"),
    );
    expect(result.run.id).toBe(accepted.run.id);

    const receipts = await api.receipts(result.run.id);
    expect(receipts.receipts[0]).toEqual(receipt);
    const markup = renderToStaticMarkup(
      <DecisionReceiptCard
        receipt={receipts.receipts[0] ?? null}
        denied={null}
      />,
    );
    expect(markup).toContain("Resource authorized");
    expect(markup).toContain("orders-incident");
    expect(markup).toContain("Runner started");
    expect(markup).toContain("yes");
    for (const forbidden of [
      "sourcePath",
      "secret prompt",
      "Bearer",
      "demo-session-a",
      "resource body",
    ]) {
      expect(markup).not.toContain(forbidden);
    }
  });
});
