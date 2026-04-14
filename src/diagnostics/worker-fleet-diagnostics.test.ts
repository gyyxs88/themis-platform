import assert from "node:assert/strict";
import test from "node:test";
import { WorkerFleetDiagnosticsService } from "./worker-fleet-diagnostics.js";

test("WorkerFleetDiagnosticsService 会给 draining active lease 节点打 warning attention", async () => {
  const service = new WorkerFleetDiagnosticsService({
    fetchImpl: createMockFetch({
      "/api/platform/nodes/list": () => ({
        nodes: [{
          nodeId: "node-alpha",
          organizationId: "org-platform",
          displayName: "Worker Alpha",
          status: "draining",
          slotCapacity: 2,
          slotAvailable: 0,
          heartbeatTtlSeconds: 60,
          lastHeartbeatAt: "2026-04-14T11:59:40.000Z",
          createdAt: "2026-04-14T11:00:00.000Z",
          updatedAt: "2026-04-14T11:59:40.000Z",
        }],
      }),
      "/api/platform/nodes/detail": () => ({
        organization: {
          organizationId: "org-platform",
          ownerPrincipalId: "principal-owner",
          displayName: "Platform Team",
          slug: "platform-team",
          createdAt: "2026-04-14T11:00:00.000Z",
          updatedAt: "2026-04-14T11:00:00.000Z",
        },
        node: {
          nodeId: "node-alpha",
          organizationId: "org-platform",
          displayName: "Worker Alpha",
          status: "draining",
          slotCapacity: 2,
          slotAvailable: 0,
          heartbeatTtlSeconds: 60,
          lastHeartbeatAt: "2026-04-14T11:59:40.000Z",
          createdAt: "2026-04-14T11:00:00.000Z",
          updatedAt: "2026-04-14T11:59:40.000Z",
        },
        leaseSummary: {
          totalCount: 1,
          activeCount: 1,
          expiredCount: 0,
          releasedCount: 0,
          revokedCount: 0,
        },
        activeExecutionLeases: [],
        recentExecutionLeases: [],
      }),
    }),
  });

  const summary = await service.readSummary({
    platformBaseUrl: "http://platform.test",
    ownerPrincipalId: "principal-owner",
    webAccessToken: "platform-token",
    now: "2026-04-14T12:00:00.000Z",
  });

  assert.equal(summary.counts.warningCount, 1);
  assert.equal(summary.primaryDiagnosis.severity, "warning");
  assert.equal(summary.nodes[0]?.attention?.code, "draining_active_lease");
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
