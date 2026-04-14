import assert from "node:assert/strict";
import test from "node:test";
import { WorkerFleetGovernanceService } from "./worker-fleet-governance.js";

test("WorkerFleetGovernanceService 会按 reclaim 返回逐节点治理结果", async () => {
  const seenNodeIds: string[] = [];
  const service = new WorkerFleetGovernanceService({
    fetchImpl: createMockFetch({
      "/api/platform/nodes/reclaim": (body) => {
        seenNodeIds.push(String(body.nodeId ?? ""));
        return {
          organization: {
            organizationId: "org-platform",
            ownerPrincipalId: "principal-owner",
            displayName: "Platform Team",
            slug: "platform-team",
            createdAt: "2026-04-14T11:00:00.000Z",
            updatedAt: "2026-04-14T11:00:00.000Z",
          },
          node: {
            nodeId: body.nodeId,
            organizationId: "org-platform",
            displayName: "Worker Alpha",
            status: "offline",
            slotCapacity: 2,
            slotAvailable: 0,
            createdAt: "2026-04-14T11:00:00.000Z",
            updatedAt: "2026-04-14T12:00:00.000Z",
          },
          summary: {
            activeLeaseCount: 1,
            reclaimedRunCount: 1,
            requeuedWorkItemCount: 1,
          },
          reclaimedLeases: [],
        };
      },
    }),
  });

  const summary = await service.execute({
    platformBaseUrl: "http://platform.test",
    ownerPrincipalId: "principal-owner",
    webAccessToken: "platform-token",
    action: "reclaim",
    nodeIds: ["node-alpha"],
  });

  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 0);
  assert.equal(summary.results[0]?.reclaim?.summary.reclaimedRunCount, 1);
  assert.deepEqual(seenNodeIds, ["node-alpha"]);
});

function createMockFetch(
  routes: Record<string, (body: Record<string, unknown>) => unknown>,
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string"
      ? input
      : (input instanceof URL ? input.toString() : input.url);
    const pathname = new URL(url).pathname;
    const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) as Record<string, unknown> : {};
    const route = routes[pathname];

    if (!route) {
      return new Response(JSON.stringify({
        error: {
          code: "NOT_FOUND",
          message: `unexpected route: ${pathname}`,
        },
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    return new Response(JSON.stringify(route(body)), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  };
}
