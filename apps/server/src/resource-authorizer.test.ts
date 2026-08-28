import { describe, expect, it } from "vitest";
import {
  makeEntitlement,
  makeFakeEntitlementReader,
  makeFakeOwnershipReader,
  makeFakeRegistryReader,
  makeHumanPrincipal,
  makeRegisteredResource,
} from "./capsule-test-support.js";
import { createResourceAuthorizer } from "./resource-authorizer.js";
import type { PrincipalResourceEntitlement } from "./types.js";

function makeAuthorizer(options?: {
  ownerByAgentId?: Record<string, "user-a" | "user-b">;
  resources?: ReturnType<typeof makeRegisteredResource>[];
  entitlements?: PrincipalResourceEntitlement[];
}) {
  return createResourceAuthorizer({
    ownership: makeFakeOwnershipReader(options?.ownerByAgentId),
    registry: makeFakeRegistryReader(options?.resources),
    entitlements: makeFakeEntitlementReader(options?.entitlements),
  });
}

describe("resource authorization", () => {
  it("allows only the owner with a current read Entitlement", async () => {
    const decision = await makeAuthorizer().authorizeResources(
      makeHumanPrincipal(),
      "agent-a",
      ["orders-incident"],
    );

    expect(decision).toMatchObject({
      decision: "allow",
      principalId: "user-a",
      agentId: "agent-a",
      grantGeneration: 1,
      resource: { id: "orders-incident", kind: "directory" },
    });
    expect(Object.isFrozen(decision)).toBe(true);
    if (decision.decision === "allow") {
      expect(Object.isFrozen(decision.resource)).toBe(true);
    }
  });

  it("treats cardinality and malformed ids as programmer errors", async () => {
    const authorizer = makeAuthorizer();
    for (const resourceIds of [
      [],
      ["orders-incident", "payments-incident"],
      ["../orders-incident"],
      ["C:\\orders-incident"],
      ["orders/incident"],
    ]) {
      await expect(
        authorizer.authorizeResources(
          makeHumanPrincipal(),
          "agent-a",
          resourceIds,
        ),
      ).rejects.toThrow("exactly one valid resourceId");
    }
  });

  it("fails closed when Agent ownership is missing or mismatched", async () => {
    for (const ownerByAgentId of [
      {},
      { "agent-a": "user-b" as const },
    ]) {
      await expect(
        makeAuthorizer({ ownerByAgentId }).authorizeResources(
          makeHumanPrincipal(),
          "agent-a",
          ["orders-incident"],
        ),
      ).resolves.toEqual({
        decision: "deny",
        principalId: "user-a",
        agentId: "agent-a",
        resourceId: "orders-incident",
        reason: "ownership_denied",
        grantGeneration: null,
      });
    }
  });

  it("distinguishes unknown, missing, and revoked Resource access", async () => {
    const unknown = await makeAuthorizer().authorizeResources(
      makeHumanPrincipal(),
      "agent-a",
      ["payments-incident"],
    );
    expect(unknown).toMatchObject({
      decision: "deny",
      reason: "unknown_resource",
      grantGeneration: null,
    });

    const missing = await makeAuthorizer({ entitlements: [] })
      .authorizeResources(makeHumanPrincipal(), "agent-a", [
        "orders-incident",
      ]);
    expect(missing).toMatchObject({
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
    });

    const revoked = await makeAuthorizer({
      entitlements: [
        makeEntitlement({ status: "revoked", generation: 4 }),
      ],
    }).authorizeResources(makeHumanPrincipal(), "agent-a", [
      "orders-incident",
    ]);
    expect(revoked).toMatchObject({
      decision: "deny",
      reason: "entitlement_revoked",
      grantGeneration: 4,
    });
  });

  it("denies wrong permissions and invalid generations", async () => {
    const wrongPermission = {
      ...makeEntitlement(),
      permission: "write",
    } as unknown as PrincipalResourceEntitlement;
    const wrongPermissionDecision = await makeAuthorizer({
      entitlements: [wrongPermission],
    }).authorizeResources(makeHumanPrincipal(), "agent-a", [
      "orders-incident",
    ]);
    expect(wrongPermissionDecision).toMatchObject({
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: 1,
    });

    const invalidGeneration = await makeAuthorizer({
      entitlements: [makeEntitlement({ generation: 0 })],
    }).authorizeResources(makeHumanPrincipal(), "agent-a", [
      "orders-incident",
    ]);
    expect(invalidGeneration).toMatchObject({
      decision: "deny",
      reason: "stale_entitlement_generation",
      grantGeneration: null,
    });
  });

  it("does not trust an Entitlement record returned for another subject", async () => {
    const authorizer = createResourceAuthorizer({
      ownership: makeFakeOwnershipReader(),
      registry: makeFakeRegistryReader(),
      entitlements: {
        getCurrentEntitlement: () =>
          makeEntitlement({ principalId: "user-b" }),
      },
    });

    await expect(
      authorizer.authorizeResources(makeHumanPrincipal(), "agent-a", [
        "orders-incident",
      ]),
    ).resolves.toMatchObject({
      decision: "deny",
      reason: "entitlement_missing",
      grantGeneration: null,
    });
  });

  it("rejects an internally inconsistent Registry lookup", async () => {
    const inconsistent = makeRegisteredResource({
      id: "payments-incident",
    });
    const registry = {
      getResource: () => inconsistent,
      listResources: () => [inconsistent],
    };
    const authorizer = createResourceAuthorizer({
      ownership: makeFakeOwnershipReader(),
      registry,
      entitlements: makeFakeEntitlementReader(),
    });

    await expect(
      authorizer.authorizeResources(makeHumanPrincipal(), "agent-a", [
        "orders-incident",
      ]),
    ).resolves.toMatchObject({
      decision: "deny",
      reason: "invalid_resource_path",
      grantGeneration: null,
    });
  });
});
