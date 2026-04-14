import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";

test("createInMemoryPlatformWorkerRunService 会支持 pull / update / complete 最小闭环", () => {
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T11:00:00.000Z",
    nodes: [{
      nodeId: "node-a",
      organizationId: "org-platform",
      displayName: "Worker A",
      status: "online",
      slotCapacity: 2,
      slotAvailable: 1,
      createdAt: "2026-04-14T10:00:00.000Z",
      updatedAt: "2026-04-14T10:00:00.000Z",
    }],
    organizations: [{
      organizationId: "org-platform",
      ownerPrincipalId: "principal-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T10:00:00.000Z",
      updatedAt: "2026-04-14T10:00:00.000Z",
    }],
  });
  const service = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-14T11:05:00.000Z",
    assignedRuns: [{
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
      node: {
        nodeId: "node-a",
        organizationId: "org-platform",
        displayName: "Worker A",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 1,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
      targetAgent: {
        agentId: "agent-a",
        organizationId: "org-platform",
        displayName: "Agent A",
        departmentRole: "Platform",
        status: "active",
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
      workItem: {
        workItemId: "work-item-a",
        organizationId: "org-platform",
        targetAgentId: "agent-a",
        sourceType: "human",
        goal: "Finish migration",
        status: "queued",
        priority: "normal",
        createdAt: "2026-04-14T10:01:00.000Z",
        updatedAt: "2026-04-14T10:01:00.000Z",
      },
      run: {
        runId: "run-a",
        organizationId: "org-platform",
        workItemId: "work-item-a",
        nodeId: "node-a",
        status: "created",
        createdAt: "2026-04-14T10:01:00.000Z",
        updatedAt: "2026-04-14T10:01:00.000Z",
      },
      executionLease: {
        leaseId: "lease-a",
        runId: "run-a",
        nodeId: "node-a",
        workItemId: "work-item-a",
        leaseToken: "lease-token-a",
        status: "active",
        createdAt: "2026-04-14T10:01:00.000Z",
        updatedAt: "2026-04-14T10:01:00.000Z",
      },
      executionContract: {
        workspacePath: "/srv/workspace",
      },
    }],
  });

  const pulled = service.pullAssignedRun({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
  });
  assert.equal(pulled?.run.runId, "run-a");
  assert.equal(pulled?.executionLease.leaseId, "lease-a");

  const starting = service.updateRunStatus({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
    runId: "run-a",
    leaseToken: "lease-token-a",
    status: "starting",
  });
  assert.equal(starting?.run.status, "starting");
  assert.equal(starting?.workItem.status, "starting");
  assert.equal(starting?.executionLease.status, "active");

  const running = service.updateRunStatus({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
    runId: "run-a",
    leaseToken: "lease-token-a",
    status: "running",
  });
  assert.equal(running?.run.status, "running");
  assert.equal(running?.workItem.status, "running");
  assert.equal(running?.executionLease.status, "active");

  const completed = service.completeRun({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
    runId: "run-a",
    leaseToken: "lease-token-a",
  });
  assert.equal(completed?.run.status, "completed");
  assert.equal(completed?.workItem.status, "completed");
  assert.equal(completed?.executionLease.status, "released");
  assert.equal(completed?.targetAgent.agentId, "agent-a");
});
