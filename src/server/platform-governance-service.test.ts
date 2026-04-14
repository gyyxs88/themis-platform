import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformGovernanceService } from "./platform-governance-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";

test("createInMemoryPlatformGovernanceService 会从 worker run 状态派生 waiting summary", () => {
  const nodeService = createInMemoryPlatformNodeService({
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
    now: () => "2026-04-14T10:00:00.000Z",
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
        departmentRole: "Manager",
        status: "active",
        createdAt: "2026-04-14T09:00:00.000Z",
        updatedAt: "2026-04-14T09:00:00.000Z",
      },
      workItem: {
        workItemId: "work-item-alpha",
        organizationId: "org-platform",
        targetAgentId: "agent-alpha",
        sourceType: "human",
        goal: "Need human approval.",
        status: "queued",
        priority: "urgent",
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
    }],
  });
  const governanceService = createInMemoryPlatformGovernanceService({
    workerRunService,
    now: () => "2026-04-14T10:00:00.000Z",
  });

  assert.deepEqual(governanceService.getGovernanceOverview({
    ownerPrincipalId: "principal-platform-owner",
  }), {
    summary: {
      total: 0,
      waitingHuman: 0,
      waitingAgent: 0,
      attentionCount: 0,
    },
    managerHotspots: [],
  });

  workerRunService.updateRunStatus({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-alpha",
    runId: "run-alpha",
    leaseToken: "lease-token-alpha",
    status: "waiting_human",
  });

  assert.deepEqual(governanceService.getGovernanceOverview({
    ownerPrincipalId: "principal-platform-owner",
  }), {
    summary: {
      total: 1,
      waitingHuman: 1,
      waitingAgent: 0,
      attentionCount: 1,
    },
    managerHotspots: [{
      managerAgentId: "agent-alpha",
      displayName: "Agent Alpha",
      itemCount: 1,
    }],
  });

  assert.deepEqual(governanceService.listWaitingQueue({
    ownerPrincipalId: "principal-platform-owner",
    waitingFor: "human",
  }), {
    summary: {
      total: 1,
      waitingHuman: 1,
      waitingAgent: 0,
      attentionCount: 1,
    },
    items: [{
      workItemId: "work-item-alpha",
      organizationId: "org-platform",
      targetAgentId: "agent-alpha",
      sourceType: "human",
      goal: "Need human approval.",
      status: "waiting_human",
      priority: "urgent",
      createdAt: "2026-04-14T09:35:00.000Z",
      updatedAt: "2026-04-14T10:00:00.000Z",
    }],
  });
});
