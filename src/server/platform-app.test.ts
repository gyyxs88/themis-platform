import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";

test("createPlatformApp 会暴露平台静态页、节点 API 与共享错误契约响应", async () => {
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T09:30:00.000Z",
    generateNodeId: () => "node-alpha",
    organizations: [{
      organizationId: "org-platform",
      ownerPrincipalId: "principal-platform-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T09:00:00.000Z",
      updatedAt: "2026-04-14T09:00:00.000Z",
    }],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-14T09:40:00.000Z",
    assignedRuns: [{
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-platform-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      node: {
        nodeId: "node-alpha",
        organizationId: "org-platform",
        displayName: "Worker Alpha",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 1,
        createdAt: "2026-04-14T09:30:00.000Z",
        updatedAt: "2026-04-14T09:30:00.000Z",
      },
      targetAgent: {
        agentId: "agent-alpha",
        organizationId: "org-platform",
        displayName: "Agent Alpha",
        departmentRole: "Platform",
        status: "active",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      workItem: {
        workItemId: "work-item-alpha",
        organizationId: "org-platform",
        targetAgentId: "agent-alpha",
        sourceType: "human",
        goal: "Verify platform worker run routes.",
        status: "queued",
        priority: "normal",
        createdAt: "2026-04-14T09:35:00.000Z",
        updatedAt: "2026-04-14T09:35:00.000Z",
      },
      run: {
        runId: "run-alpha",
        organizationId: "org-platform",
        workItemId: "work-item-alpha",
        nodeId: "node-alpha",
        status: "created",
        createdAt: "2026-04-14T09:35:00.000Z",
        updatedAt: "2026-04-14T09:35:00.000Z",
      },
      executionLease: {
        leaseId: "lease-alpha",
        runId: "run-alpha",
        nodeId: "node-alpha",
        workItemId: "work-item-alpha",
        leaseToken: "lease-token-alpha",
        status: "active",
        createdAt: "2026-04-14T09:35:00.000Z",
        updatedAt: "2026-04-14T09:35:00.000Z",
      },
      executionContract: {
        workspacePath: "/srv/platform-alpha",
      },
    }, {
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-platform-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      node: {
        nodeId: "node-alpha",
        organizationId: "org-platform",
        displayName: "Worker Alpha",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 1,
        createdAt: "2026-04-14T09:30:00.000Z",
        updatedAt: "2026-04-14T09:30:00.000Z",
      },
      targetAgent: {
        agentId: "agent-beta",
        organizationId: "org-platform",
        displayName: "Agent Beta",
        departmentRole: "Manager",
        status: "active",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      workItem: {
        workItemId: "work-item-beta",
        organizationId: "org-platform",
        targetAgentId: "agent-beta",
        sourceType: "human",
        goal: "Review waiting human escalation.",
        status: "waiting_human",
        priority: "urgent",
        waitingFor: "human",
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:20:00.000Z",
      },
      run: {
        runId: "run-beta",
        organizationId: "org-platform",
        workItemId: "work-item-beta",
        nodeId: "node-alpha",
        status: "waiting_action",
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:20:00.000Z",
      },
      executionLease: {
        leaseId: "lease-beta",
        runId: "run-beta",
        nodeId: "node-alpha",
        workItemId: "work-item-beta",
        leaseToken: "lease-token-beta",
        status: "active",
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:20:00.000Z",
      },
      executionContract: {
        workspacePath: "/srv/platform-beta",
      },
    }, {
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-platform-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      node: {
        nodeId: "node-alpha",
        organizationId: "org-platform",
        displayName: "Worker Alpha",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 1,
        createdAt: "2026-04-14T09:30:00.000Z",
        updatedAt: "2026-04-14T09:30:00.000Z",
      },
      targetAgent: {
        agentId: "agent-gamma",
        organizationId: "org-platform",
        displayName: "Agent Gamma",
        departmentRole: "Manager",
        status: "active",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      workItem: {
        workItemId: "work-item-gamma",
        organizationId: "org-platform",
        targetAgentId: "agent-gamma",
        sourceType: "agent",
        goal: "Wait for downstream agent confirmation.",
        status: "waiting_agent",
        priority: "normal",
        waitingFor: "agent",
        createdAt: "2026-04-14T09:25:00.000Z",
        updatedAt: "2026-04-14T09:25:00.000Z",
      },
      run: {
        runId: "run-gamma",
        organizationId: "org-platform",
        workItemId: "work-item-gamma",
        nodeId: "node-alpha",
        status: "waiting_action",
        createdAt: "2026-04-14T09:25:00.000Z",
        updatedAt: "2026-04-14T09:25:00.000Z",
      },
      executionLease: {
        leaseId: "lease-gamma",
        runId: "run-gamma",
        nodeId: "node-alpha",
        workItemId: "work-item-gamma",
        leaseToken: "lease-token-gamma",
        status: "active",
        createdAt: "2026-04-14T09:25:00.000Z",
        updatedAt: "2026-04-14T09:25:00.000Z",
      },
      executionContract: {
        workspacePath: "/srv/platform-gamma",
      },
    }],
  });
  const server = createPlatformApp({
    nodeService,
    workerRunService,
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
      leaseSummary?: { totalCount?: number; activeCount?: number; revokedCount?: number };
      activeExecutionLeases?: Array<unknown>;
    };
    assert.equal(detailPayload.node?.nodeId, "node-alpha");
    assert.deepEqual(detailPayload.leaseSummary, {
      totalCount: 0,
      activeCount: 0,
      expiredCount: 0,
      releasedCount: 0,
      revokedCount: 0,
    });
    assert.deepEqual(detailPayload.activeExecutionLeases, []);

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

    const drain = await fetch(`${baseUrl}/api/platform/nodes/drain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
      }),
    });
    assert.equal(drain.status, 200);
    const drainPayload = await drain.json() as {
      node?: { status?: string };
    };
    assert.equal(drainPayload.node?.status, "draining");

    const offline = await fetch(`${baseUrl}/api/platform/nodes/offline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
      }),
    });
    assert.equal(offline.status, 200);
    const offlinePayload = await offline.json() as {
      node?: { status?: string; slotAvailable?: number };
    };
    assert.equal(offlinePayload.node?.status, "offline");
    assert.equal(offlinePayload.node?.slotAvailable, 0);

    const reclaim = await fetch(`${baseUrl}/api/platform/nodes/reclaim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
      }),
    });
    assert.equal(reclaim.status, 200);
    const reclaimPayload = await reclaim.json() as {
      node?: { status?: string; slotAvailable?: number };
      summary?: { activeLeaseCount?: number; reclaimedRunCount?: number; requeuedWorkItemCount?: number };
      reclaimedLeases?: Array<unknown>;
    };
    assert.equal(reclaimPayload.node?.status, "offline");
    assert.equal(reclaimPayload.node?.slotAvailable, 0);
    assert.deepEqual(reclaimPayload.summary, {
      activeLeaseCount: 0,
      reclaimedRunCount: 0,
      requeuedWorkItemCount: 0,
    });
    assert.deepEqual(reclaimPayload.reclaimedLeases, []);

    const governanceOverview = await fetch(`${baseUrl}/api/platform/agents/governance-overview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(governanceOverview.status, 200);
    const governanceOverviewPayload = await governanceOverview.json() as {
      summary?: { total?: number; waitingHuman?: number; waitingAgent?: number; attentionCount?: number };
      managerHotspots?: Array<{ managerAgentId?: string; displayName?: string; itemCount?: number }>;
    };
    assert.deepEqual(governanceOverviewPayload.summary, {
      total: 2,
      waitingHuman: 1,
      waitingAgent: 1,
      attentionCount: 1,
    });
    assert.deepEqual(governanceOverviewPayload.managerHotspots, [
      {
        managerAgentId: "agent-beta",
        displayName: "Agent Beta",
        itemCount: 1,
      },
      {
        managerAgentId: "agent-gamma",
        displayName: "Agent Gamma",
        itemCount: 1,
      },
    ]);

    const waitingList = await fetch(`${baseUrl}/api/platform/agents/waiting/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(waitingList.status, 200);
    const waitingListPayload = await waitingList.json() as {
      summary?: { total?: number; waitingHuman?: number; waitingAgent?: number; attentionCount?: number };
      items?: Array<{ workItemId?: string; status?: string; priority?: string }>;
    };
    assert.deepEqual(waitingListPayload.summary, {
      total: 2,
      waitingHuman: 1,
      waitingAgent: 1,
      attentionCount: 1,
    });
    assert.deepEqual(waitingListPayload.items, [
      {
        workItemId: "work-item-beta",
        organizationId: "org-platform",
        targetAgentId: "agent-beta",
        sourceType: "human",
        goal: "Review waiting human escalation.",
        status: "waiting_human",
        priority: "urgent",
        waitingFor: "human",
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:20:00.000Z",
      },
      {
        workItemId: "work-item-gamma",
        organizationId: "org-platform",
        targetAgentId: "agent-gamma",
        sourceType: "agent",
        goal: "Wait for downstream agent confirmation.",
        status: "waiting_agent",
        priority: "normal",
        waitingFor: "agent",
        createdAt: "2026-04-14T09:25:00.000Z",
        updatedAt: "2026-04-14T09:25:00.000Z",
      },
    ]);

    const pull = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
      }),
    });
    assert.equal(pull.status, 200);
    const pullPayload = await pull.json() as {
      run?: { runId?: string; status?: string };
      executionLease?: { leaseId?: string };
      executionContract?: { workspacePath?: string };
    };
    assert.equal(pullPayload.run?.runId, "run-alpha");
    assert.equal(pullPayload.run?.status, "created");
    assert.equal(pullPayload.executionLease?.leaseId, "lease-alpha");
    assert.equal(pullPayload.executionContract?.workspacePath, "/srv/platform-alpha");

    const starting = await fetch(`${baseUrl}/api/platform/worker/runs/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
        runId: "run-alpha",
        leaseToken: "lease-token-alpha",
        status: "starting",
      }),
    });
    assert.equal(starting.status, 200);
    const startingPayload = await starting.json() as {
      run?: { status?: string };
      workItem?: { status?: string };
      executionLease?: { status?: string };
    };
    assert.equal(startingPayload.run?.status, "starting");
    assert.equal(startingPayload.workItem?.status, "starting");
    assert.equal(startingPayload.executionLease?.status, "active");

    const update = await fetch(`${baseUrl}/api/platform/worker/runs/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
        runId: "run-alpha",
        leaseToken: "lease-token-alpha",
        status: "running",
      }),
    });
    assert.equal(update.status, 200);
    const updatePayload = await update.json() as {
      run?: { status?: string };
      workItem?: { status?: string };
      executionLease?: { status?: string };
    };
    assert.equal(updatePayload.run?.status, "running");
    assert.equal(updatePayload.workItem?.status, "running");
    assert.equal(updatePayload.executionLease?.status, "active");

    const complete = await fetch(`${baseUrl}/api/platform/worker/runs/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
        runId: "run-alpha",
        leaseToken: "lease-token-alpha",
      }),
    });
    assert.equal(complete.status, 200);
    const completePayload = await complete.json() as {
      targetAgent?: { agentId?: string };
      run?: { status?: string };
      workItem?: { status?: string };
      executionLease?: { status?: string };
    };
    assert.equal(completePayload.targetAgent?.agentId, "agent-alpha");
    assert.equal(completePayload.run?.status, "completed");
    assert.equal(completePayload.workItem?.status, "completed");
    assert.equal(completePayload.executionLease?.status, "released");

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
