import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, DeniedRunApiError } from "./api";
import {
  buildSendMessageBody,
  DecisionReceiptCard,
} from "./resource-capsule";

afterEach(() => vi.unstubAllGlobals());

describe("mocked Capsule deny flow", () => {
  it("carries one explicit Resource through 403 to a redacted Receipt view", async () => {
    const denied = {
      runId: "run-denied",
      receiptId: "receipt-denied",
      status: "denied",
      reason: "entitlement_missing",
    } as const;
    const receipt = {
      receiptId: denied.receiptId,
      runId: denied.runId,
      humanPrincipalId: "user-a",
      agentId: "agent-a",
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
        "agent-a",
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

