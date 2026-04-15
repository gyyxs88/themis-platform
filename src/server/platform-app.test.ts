import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformCollaborationService } from "./platform-collaboration-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

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
  const collaborationService = createInMemoryPlatformCollaborationService({
    workerRunService,
    now: () => "2026-04-14T09:40:00.000Z",
    parentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: "org-platform",
      parentWorkItemId: "parent-work-item-platform",
      displayName: "平台父任务",
      childWorkItemIds: ["work-item-beta", "work-item-gamma"],
    }],
    handoffSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: "org-platform",
      agentId: "agent-beta",
      handoffs: [{
        handoffId: "handoff-beta",
        fromAgentId: "agent-alpha",
        toAgentId: "agent-beta",
        workItemId: "work-item-beta",
        summary: "平台经理已补齐上下文并交接给执行 agent。",
        blockers: ["等待人工确认"],
        recommendedNextActions: ["确认执行边界", "恢复执行"],
        attachedArtifacts: ["artifact-platform-beta"],
        createdAt: "2026-04-14T09:18:00.000Z",
        updatedAt: "2026-04-14T09:18:00.000Z",
      }],
      timeline: [{
        entryId: "timeline-beta",
        kind: "handoff",
        title: "平台经理交接",
        summary: "平台经理已补齐上下文并交接给执行 agent。",
        workItemId: "work-item-beta",
        handoffId: "handoff-beta",
        counterpartyAgentId: "agent-alpha",
        counterpartyDisplayName: "Agent Alpha",
        createdAt: "2026-04-14T09:18:00.000Z",
        updatedAt: "2026-04-14T09:18:00.000Z",
      }],
    }],
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    now: () => "2026-04-14T09:40:00.000Z",
    agentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-platform-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      agent: {
        agentId: "agent-delta",
        organizationId: "org-platform",
        displayName: "Agent Delta",
        departmentRole: "Frontend",
        status: "active",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
    }],
    parentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: "org-platform",
      parentWorkItemId: "parent-work-item-platform",
      displayName: "平台父任务",
      childWorkItemIds: ["work-item-beta", "work-item-gamma"],
    }],
    handoffSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: "org-platform",
      agentId: "agent-beta",
      handoffs: [{
        handoffId: "handoff-beta",
        fromAgentId: "agent-alpha",
        toAgentId: "agent-beta",
        workItemId: "work-item-beta",
        summary: "平台经理已补齐上下文并交接给执行 agent。",
        blockers: ["等待人工确认"],
        recommendedNextActions: ["确认执行边界", "恢复执行"],
        attachedArtifacts: ["artifact-platform-beta"],
        createdAt: "2026-04-14T09:18:00.000Z",
        updatedAt: "2026-04-14T09:18:00.000Z",
      }],
      timeline: [{
        entryId: "timeline-beta",
        kind: "handoff",
        title: "平台经理交接",
        summary: "平台经理已补齐上下文并交接给执行 agent。",
        workItemId: "work-item-beta",
        handoffId: "handoff-beta",
        counterpartyAgentId: "agent-alpha",
        counterpartyDisplayName: "Agent Alpha",
        createdAt: "2026-04-14T09:18:00.000Z",
        updatedAt: "2026-04-14T09:18:00.000Z",
      }],
    }],
    mailboxSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-platform-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      agent: {
        agentId: "agent-delta",
        organizationId: "org-platform",
        displayName: "Agent Delta",
        departmentRole: "Frontend",
        status: "active",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      entry: {
        mailboxEntryId: "mailbox-delta-1",
        organizationId: "org-platform",
        ownerAgentId: "agent-delta",
        agentId: "agent-delta",
        messageId: "message-delta-1",
        workItemId: "work-item-gamma",
        priority: "urgent",
        status: "pending",
        requiresAck: true,
        availableAt: "2026-04-14T09:24:00.000Z",
        createdAt: "2026-04-14T09:24:00.000Z",
        updatedAt: "2026-04-14T09:24:00.000Z",
      },
      message: {
        messageId: "message-delta-1",
        organizationId: "org-platform",
        fromAgentId: "agent-beta",
        toAgentId: "agent-delta",
        workItemId: "work-item-gamma",
        messageType: "approval_request",
        payload: {
          summary: "请确认是否继续发布。",
        },
        artifactRefs: [],
        priority: "urgent",
        requiresAck: true,
        createdAt: "2026-04-14T09:24:00.000Z",
        updatedAt: "2026-04-14T09:24:00.000Z",
      },
    }],
  });
  const server = createPlatformApp({
    nodeService,
    workerRunService,
    collaborationService,
    workflowService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    const indexHtml = await index.text();
    assert.match(indexHtml, /Themis Platform/);
    assert.match(indexHtml, /<aside id="platform-sidebar" class="platform-sidebar">/);
    assert.doesNotMatch(indexHtml, /platform-session-card--sidebar/);
    assert.doesNotMatch(indexHtml, /platform-sidebar-status/);

    const script = await fetch(`${baseUrl}/platform.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /initializePlatformSurface/);

    const stylesheet = await fetch(`${baseUrl}/platform.css`);
    assert.equal(stylesheet.status, 200);
    const stylesheetText = await stylesheet.text();
    assert.match(stylesheetText, /body\s*\{[\s\S]*overflow:\s*hidden;/);
    assert.match(stylesheetText, /\.platform-shell\s*\{[\s\S]*height:\s*100vh;/);
    assert.match(stylesheetText, /\.platform-shell\s*\{[\s\S]*padding:\s*20px 0 20px 24px;/);
    assert.match(stylesheetText, /\.platform-workbench\s*\{[\s\S]*overflow:\s*hidden;/);
    assert.match(stylesheetText, /\.platform-workspace\s*\{[\s\S]*overflow-y:\s*auto;/);
    assert.doesNotMatch(stylesheetText, /\.platform-workspace\s*\{[\s\S]*padding-right:\s*4px;/);
    assert.doesNotMatch(stylesheetText, /::-webkit-scrollbar|scrollbar-width|scrollbar-color/);

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
        "X-Forwarded-For": "192.168.31.208, 10.0.0.5",
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
      node?: { nodeId?: string; labels?: string[]; status?: string; nodeIp?: string | null };
      organization?: { ownerPrincipalId?: string };
    };
    assert.equal(registerPayload.organization?.ownerPrincipalId, "principal-platform-owner");
    assert.equal(registerPayload.node?.nodeId, "node-alpha");
    assert.equal(registerPayload.node?.status, "online");
    assert.equal(registerPayload.node?.nodeIp, "192.168.31.208");
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
      nodes?: Array<{ nodeId?: string; displayName?: string; nodeIp?: string | null }>;
    };
    assert.equal(listPayload.nodes?.length, 1);
    assert.equal(listPayload.nodes?.[0]?.nodeId, "node-alpha");
    assert.equal(listPayload.nodes?.[0]?.displayName, "Worker Alpha");
    assert.equal(listPayload.nodes?.[0]?.nodeIp, "192.168.31.208");

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
      node?: { nodeId?: string; nodeIp?: string | null };
      leaseSummary?: { totalCount?: number; activeCount?: number; revokedCount?: number };
      activeExecutionLeases?: Array<unknown>;
    };
    assert.equal(detailPayload.node?.nodeId, "node-alpha");
    assert.equal(detailPayload.node?.nodeIp, "192.168.31.208");
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
        "X-Forwarded-For": "192.168.31.209",
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
      node?: { status?: string; slotAvailable?: number; nodeIp?: string | null };
    };
    assert.equal(heartbeatPayload.node?.status, "draining");
    assert.equal(heartbeatPayload.node?.slotAvailable, 0);
    assert.equal(heartbeatPayload.node?.nodeIp, "192.168.31.209");

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

    const collaborationDashboard = await fetch(`${baseUrl}/api/platform/agents/collaboration-dashboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(collaborationDashboard.status, 200);
    const collaborationDashboardPayload = await collaborationDashboard.json() as {
      summary?: { total?: number; waitingHuman?: number; waitingAgent?: number; attentionCount?: number };
      parents?: Array<{ parentWorkItemId?: string; displayName?: string; items?: Array<{ workItemId?: string }> }>;
    };
    assert.deepEqual(collaborationDashboardPayload.summary, {
      total: 2,
      waitingHuman: 1,
      waitingAgent: 1,
      attentionCount: 1,
    });
    assert.deepEqual(collaborationDashboardPayload.parents, [
      {
        parentWorkItemId: "parent-work-item-platform",
        displayName: "平台父任务",
        items: [
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
        ],
      },
    ]);

    const handoffList = await fetch(`${baseUrl}/api/platform/agents/handoffs/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-beta",
      }),
    });
    assert.equal(handoffList.status, 200);
    const handoffListPayload = await handoffList.json() as {
      agent?: { agentId?: string; displayName?: string };
      handoffs?: Array<{ handoffId?: string; summary?: string }>;
      timeline?: Array<{ kind?: string; title?: string }>;
    };
    assert.equal(handoffListPayload.agent?.agentId, "agent-beta");
    assert.equal(handoffListPayload.agent?.displayName, "Agent Beta");
    assert.equal(handoffListPayload.handoffs?.[0]?.handoffId, "handoff-beta");
    assert.equal(handoffListPayload.handoffs?.[0]?.summary, "平台经理已补齐上下文并交接给执行 agent。");
    assert.equal(handoffListPayload.timeline?.[0]?.kind, "handoff");
    assert.equal(handoffListPayload.timeline?.[0]?.title, "平台经理交接");

    const workItemsList = await fetch(`${baseUrl}/api/platform/work-items/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(workItemsList.status, 200);
    const workItemsListPayload = await workItemsList.json() as {
      workItems?: Array<{ workItemId?: string; status?: string }>;
    };
    assert.equal(workItemsListPayload.workItems?.[0]?.workItemId, "work-item-beta");

    const workItemDetail = await fetch(`${baseUrl}/api/platform/work-items/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItemId: "work-item-beta",
      }),
    });
    assert.equal(workItemDetail.status, 200);
    const workItemDetailPayload = await workItemDetail.json() as {
      workItem?: { workItemId?: string };
      parentWorkItem?: { workItemId?: string } | null;
      latestHandoff?: { handoffId?: string } | null;
    };
    assert.equal(workItemDetailPayload.workItem?.workItemId, "work-item-beta");
    assert.equal(workItemDetailPayload.parentWorkItem?.workItemId, "parent-work-item-platform");
    assert.equal(workItemDetailPayload.latestHandoff?.handoffId, "handoff-beta");

    const workItemDispatch = await fetch(`${baseUrl}/api/platform/work-items/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItem: {
          targetAgentId: "agent-delta",
          sourceType: "human",
          goal: "新建一条平台前端待办。",
          priority: "high",
        },
      }),
    });
    assert.equal(workItemDispatch.status, 200);
    const workItemDispatchPayload = await workItemDispatch.json() as {
      workItem?: { workItemId?: string; targetAgentId?: string; status?: string };
    };
    assert.equal(workItemDispatchPayload.workItem?.targetAgentId, "agent-delta");
    assert.equal(workItemDispatchPayload.workItem?.status, "queued");

    const workItemRespond = await fetch(`${baseUrl}/api/platform/work-items/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItemId: "work-item-beta",
        response: {
          decision: "approve",
          inputText: "可以继续。",
        },
      }),
    });
    assert.equal(workItemRespond.status, 200);
    const workItemRespondPayload = await workItemRespond.json() as {
      workItem?: { status?: string };
      message?: { messageType?: string };
    };
    assert.equal(workItemRespondPayload.workItem?.status, "queued");
    assert.equal(workItemRespondPayload.message?.messageType, "approval_result");

    const workItemEscalate = await fetch(`${baseUrl}/api/platform/work-items/escalate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItemId: "work-item-gamma",
        escalation: {
          inputText: "请 owner 接手。",
        },
      }),
    });
    assert.equal(workItemEscalate.status, 200);
    const workItemEscalatePayload = await workItemEscalate.json() as {
      workItem?: { status?: string };
    };
    assert.equal(workItemEscalatePayload.workItem?.status, "waiting_human");

    const workItemCancel = await fetch(`${baseUrl}/api/platform/work-items/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItemId: workItemDispatchPayload.workItem?.workItemId,
      }),
    });
    assert.equal(workItemCancel.status, 200);
    const workItemCancelPayload = await workItemCancel.json() as {
      workItem?: { status?: string };
    };
    assert.equal(workItemCancelPayload.workItem?.status, "cancelled");

    const mailboxList = await fetch(`${baseUrl}/api/platform/agents/mailbox/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-delta",
      }),
    });
    assert.equal(mailboxList.status, 200);
    const mailboxListPayload = await mailboxList.json() as {
      items?: Array<{ entry?: { mailboxEntryId?: string } }>;
    };
    assert.equal(mailboxListPayload.items?.[0]?.entry?.mailboxEntryId, "mailbox-delta-1");

    const mailboxPull = await fetch(`${baseUrl}/api/platform/agents/mailbox/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-delta",
      }),
    });
    assert.equal(mailboxPull.status, 200);
    const mailboxPullPayload = await mailboxPull.json() as {
      item?: { entry?: { status?: string; mailboxEntryId?: string } } | null;
    };
    assert.equal(mailboxPullPayload.item?.entry?.mailboxEntryId, "mailbox-delta-1");
    assert.equal(mailboxPullPayload.item?.entry?.status, "leased");

    const mailboxAck = await fetch(`${baseUrl}/api/platform/agents/mailbox/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-delta",
        mailboxEntryId: "mailbox-delta-1",
      }),
    });
    assert.equal(mailboxAck.status, 200);
    const mailboxAckPayload = await mailboxAck.json() as {
      mailboxEntry?: { status?: string };
    };
    assert.equal(mailboxAckPayload.mailboxEntry?.status, "acked");

    const mailboxRespond = await fetch(`${baseUrl}/api/platform/agents/mailbox/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-delta",
        mailboxEntryId: "mailbox-delta-1",
        response: {
          decision: "approve",
          inputText: "可以继续执行。",
          priority: "urgent",
        },
      }),
    });
    assert.equal(mailboxRespond.status, 200);
    const mailboxRespondPayload = await mailboxRespond.json() as {
      responseMessage?: { messageType?: string };
      responseMailboxEntry?: { ownerAgentId?: string };
      resumedWorkItem?: { status?: string };
    };
    assert.equal(mailboxRespondPayload.responseMessage?.messageType, "approval_result");
    assert.equal(mailboxRespondPayload.responseMailboxEntry?.ownerAgentId, "agent-beta");
    assert.equal(mailboxRespondPayload.resumedWorkItem?.status, "queued");

    const runsList = await fetch(`${baseUrl}/api/platform/runs/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(runsList.status, 200);
    const runsListPayload = await runsList.json() as {
      runs?: Array<{ runId?: string; status?: string }>;
    };
    assert.deepEqual(runsListPayload.runs, [
      {
        runId: "run-gamma",
        organizationId: "org-platform",
        workItemId: "work-item-gamma",
        nodeId: "node-alpha",
        status: "interrupted",
        createdAt: "2026-04-14T09:25:00.000Z",
        updatedAt: "2026-04-14T09:40:00.000Z",
      },
      {
        runId: "run-beta",
        organizationId: "org-platform",
        workItemId: "work-item-beta",
        nodeId: "node-alpha",
        status: "interrupted",
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:40:00.000Z",
      },
      {
        runId: "run-alpha",
        organizationId: "org-platform",
        workItemId: "work-item-alpha",
        nodeId: "node-alpha",
        status: "created",
        createdAt: "2026-04-14T09:35:00.000Z",
        updatedAt: "2026-04-14T09:35:00.000Z",
      },
    ]);

    const runDetail = await fetch(`${baseUrl}/api/platform/runs/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        runId: "run-beta",
      }),
    });
    assert.equal(runDetail.status, 200);
    const runDetailPayload = await runDetail.json() as {
      run?: { runId?: string; status?: string };
      workItem?: { workItemId?: string; status?: string };
      targetAgent?: { agentId?: string; displayName?: string };
    };
    assert.deepEqual(runDetailPayload, {
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-platform-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      run: {
        runId: "run-beta",
        organizationId: "org-platform",
        workItemId: "work-item-beta",
        nodeId: "node-alpha",
        status: "interrupted",
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:40:00.000Z",
      },
      workItem: {
        workItemId: "work-item-beta",
        organizationId: "org-platform",
        targetAgentId: "agent-beta",
        sourceType: "human",
        goal: "Review waiting human escalation.",
        status: "queued",
        priority: "urgent",
        waitingFor: null,
        createdAt: "2026-04-14T09:20:00.000Z",
        updatedAt: "2026-04-14T09:40:00.000Z",
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
    });

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

    const workItemsListAfterComplete = await fetch(`${baseUrl}/api/platform/work-items/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(workItemsListAfterComplete.status, 200);
    const workItemsListAfterCompletePayload = await workItemsListAfterComplete.json() as {
      workItems?: Array<{ workItemId?: string; status?: string }>;
    };
    const completedWorkItem = workItemsListAfterCompletePayload.workItems?.find(
      (item) => item?.workItemId === "work-item-alpha",
    );
    assert.equal(completedWorkItem?.status, "completed");

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
