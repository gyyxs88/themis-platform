import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";

test("createPlatformApp 会暴露平台静态页、节点 API 与共享错误契约响应", async () => {
  const server = createPlatformApp({
    nodeService: createInMemoryPlatformNodeService({
      now: () => "2026-04-14T09:30:00.000Z",
      generateNodeId: () => "node-alpha",
    }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Themis Platform/);

    const script = await fetch(`${baseUrl}/platform.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /initializePlatformSurface/);

    const stylesheet = await fetch(`${baseUrl}/platform.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(await stylesheet.text(), /platform-shell/);

    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      service: "themis-platform",
    });

    const webAuthStatus = await fetch(`${baseUrl}/api/web-auth/status`);
    assert.equal(webAuthStatus.status, 200);
    assert.deepEqual(await webAuthStatus.json(), {
      authenticated: false,
      tokenLabel: "",
    });

    const register = await fetch(`${baseUrl}/api/platform/nodes/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        node: {
          displayName: "Worker Alpha",
          slotCapacity: 2,
          slotAvailable: 1,
          labels: ["linux", "linux", "build"],
          workspaceCapabilities: ["/srv/alpha"],
          credentialCapabilities: ["default"],
          providerCapabilities: ["gateway-a"],
        },
      }),
    });
    assert.equal(register.status, 200);
    const registerPayload = await register.json() as {
      node?: { nodeId?: string; labels?: string[]; status?: string };
      organization?: { ownerPrincipalId?: string };
    };
    assert.equal(registerPayload.organization?.ownerPrincipalId, "principal-platform-owner");
    assert.equal(registerPayload.node?.nodeId, "node-alpha");
    assert.equal(registerPayload.node?.status, "online");
    assert.deepEqual(registerPayload.node?.labels, ["linux", "build"]);

    const list = await fetch(`${baseUrl}/api/platform/nodes/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(list.status, 200);
    const listPayload = await list.json() as {
      nodes?: Array<{ nodeId?: string; displayName?: string }>;
    };
    assert.equal(listPayload.nodes?.length, 1);
    assert.equal(listPayload.nodes?.[0]?.nodeId, "node-alpha");
    assert.equal(listPayload.nodes?.[0]?.displayName, "Worker Alpha");

    const detail = await fetch(`${baseUrl}/api/platform/nodes/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
      }),
    });
    assert.equal(detail.status, 200);
    const detailPayload = await detail.json() as {
      node?: { nodeId?: string };
      leaseSummary?: { activeLeaseCount?: number; activeRunCount?: number };
    };
    assert.equal(detailPayload.node?.nodeId, "node-alpha");
    assert.deepEqual(detailPayload.leaseSummary, {
      activeLeaseCount: 0,
      activeRunCount: 0,
    });

    const heartbeat = await fetch(`${baseUrl}/api/platform/nodes/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        node: {
          nodeId: "node-alpha",
          status: "draining",
          slotAvailable: 0,
        },
      }),
    });
    assert.equal(heartbeat.status, 200);
    const heartbeatPayload = await heartbeat.json() as {
      node?: { status?: string; slotAvailable?: number };
    };
    assert.equal(heartbeatPayload.node?.status, "draining");
    assert.equal(heartbeatPayload.node?.slotAvailable, 0);

    const blocked = await fetch(`${baseUrl}/api/runtime/config`);
    assert.equal(blocked.status, 404);
    assert.deepEqual(await blocked.json(), {
      error: {
        code: "PLATFORM_ROUTE_NOT_FOUND",
        message: "Platform surface does not expose /api/runtime/config.",
      },
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});
