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

  assert.deepEqual(service.listRuns({
    ownerPrincipalId: "principal-owner",
  }), {
    runs: [{
      runId: "run-a",
      organizationId: "org-platform",
      workItemId: "work-item-a",
      nodeId: "node-a",
      status: "created",
      createdAt: "2026-04-14T10:01:00.000Z",
      updatedAt: "2026-04-14T10:01:00.000Z",
    }],
  });

  assert.deepEqual(service.getRunDetail({
    ownerPrincipalId: "principal-owner",
    runId: "run-a",
  }), {
    organization: {
      organizationId: "org-platform",
      ownerPrincipalId: "principal-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T10:00:00.000Z",
      updatedAt: "2026-04-14T10:00:00.000Z",
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
    targetAgent: {
      agentId: "agent-a",
      organizationId: "org-platform",
      displayName: "Agent A",
      departmentRole: "Platform",
      status: "active",
      createdAt: "2026-04-14T10:00:00.000Z",
      updatedAt: "2026-04-14T10:00:00.000Z",
    },
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

test("createInMemoryPlatformWorkerRunService 会把失败原因保存到 run detail", () => {
  const organization = {
    organizationId: "org-platform",
    ownerPrincipalId: "principal-owner",
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-04-24T14:00:00.000Z",
    updatedAt: "2026-04-24T14:00:00.000Z",
  };
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-24T14:00:00.000Z",
    nodes: [{
      nodeId: "node-a",
      organizationId: organization.organizationId,
      displayName: "Worker A",
      status: "online",
      slotCapacity: 1,
      slotAvailable: 1,
      createdAt: "2026-04-24T14:00:00.000Z",
      updatedAt: "2026-04-24T14:00:00.000Z",
    }],
    organizations: [organization],
  });
  const service = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-24T14:05:00.000Z",
  });
  const assigned = service.assignQueuedWorkItem({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
    organization,
    targetAgent: {
      agentId: "agent-a",
      organizationId: organization.organizationId,
      displayName: "Agent A",
      departmentRole: "Platform",
      status: "active",
      createdAt: "2026-04-24T14:00:00.000Z",
      updatedAt: "2026-04-24T14:00:00.000Z",
    },
    workItem: {
      workItemId: "work-item-a",
      organizationId: organization.organizationId,
      targetAgentId: "agent-a",
      sourceType: "human",
      goal: "Fail with reason",
      status: "queued",
      priority: "normal",
      createdAt: "2026-04-24T14:01:00.000Z",
      updatedAt: "2026-04-24T14:01:00.000Z",
    },
    workspacePath: "/srv/workspace",
  });
  assert.ok(assigned);
  const leaseToken = assigned.executionLease.leaseToken;
  if (!leaseToken) {
    throw new Error("lease token is required for this test.");
  }

  const failed = service.updateRunStatus({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
    runId: assigned.run.runId,
    leaseToken,
    status: "failed",
    failureCode: "WORKER_NODE_EXECUTION_FAILED",
    failureMessage: "spawn codex ENOENT",
  });
  assert.equal(failed?.run.status, "failed");
  assert.equal(failed?.run.failureCode, "WORKER_NODE_EXECUTION_FAILED");
  assert.equal(failed?.run.failureMessage, "spawn codex ENOENT");
  assert.equal(failed?.workItem.status, "failed");
  assert.equal(failed?.executionLease.status, "revoked");

  const detail = service.getRunDetail({
    ownerPrincipalId: "principal-owner",
    runId: assigned.run.runId,
  });
  assert.equal(detail?.run.failureCode, "WORKER_NODE_EXECUTION_FAILED");
  assert.equal(detail?.run.failureMessage, "spawn codex ENOENT");
});

test("createInMemoryPlatformWorkerRunService 会在已有 snapshot 基础上继续递增 run / lease id", () => {
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-21T11:00:00.000Z",
    nodes: [{
      nodeId: "node-a",
      organizationId: "org-platform",
      displayName: "Worker A",
      status: "online",
      slotCapacity: 2,
      slotAvailable: 1,
      createdAt: "2026-04-21T10:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
    }],
    organizations: [{
      organizationId: "org-platform",
      ownerPrincipalId: "principal-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-21T10:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
    }],
  });
  const service = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-21T11:05:00.000Z",
    assignedRuns: [{
      organization: {
        organizationId: "org-platform",
        ownerPrincipalId: "principal-owner",
        displayName: "Platform Team",
        slug: "platform-team",
        createdAt: "2026-04-21T10:00:00.000Z",
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      node: {
        nodeId: "node-a",
        organizationId: "org-platform",
        displayName: "Worker A",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 1,
        createdAt: "2026-04-21T10:00:00.000Z",
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      targetAgent: {
        agentId: "agent-a",
        organizationId: "org-platform",
        displayName: "Agent A",
        departmentRole: "Platform",
        status: "active",
        createdAt: "2026-04-21T10:00:00.000Z",
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      workItem: {
        workItemId: "work-item-a",
        organizationId: "org-platform",
        targetAgentId: "agent-a",
        sourceType: "human",
        goal: "Keep old run ids.",
        status: "queued",
        priority: "normal",
        createdAt: "2026-04-21T10:01:00.000Z",
        updatedAt: "2026-04-21T10:01:00.000Z",
      },
      run: {
        runId: "run-platform-7",
        organizationId: "org-platform",
        workItemId: "work-item-a",
        nodeId: "node-a",
        status: "completed",
        createdAt: "2026-04-21T10:01:00.000Z",
        updatedAt: "2026-04-21T10:01:00.000Z",
      },
      executionLease: {
        leaseId: "lease-platform-9",
        runId: "run-platform-7",
        nodeId: "node-a",
        workItemId: "work-item-a",
        leaseToken: "lease-token-platform-11",
        status: "released",
        createdAt: "2026-04-21T10:01:00.000Z",
        updatedAt: "2026-04-21T10:01:00.000Z",
      },
      executionContract: {
        workspacePath: "/srv/workspace",
      },
    }],
  });

  const assigned = service.assignQueuedWorkItem({
    ownerPrincipalId: "principal-owner",
    nodeId: "node-a",
    organization: {
      organizationId: "org-platform",
      ownerPrincipalId: "principal-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-21T10:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
    },
    targetAgent: {
      agentId: "agent-b",
      organizationId: "org-platform",
      displayName: "Agent B",
      departmentRole: "Platform",
      status: "active",
      createdAt: "2026-04-21T10:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
    },
    workItem: {
      workItemId: "work-item-b",
      organizationId: "org-platform",
      targetAgentId: "agent-b",
      sourceType: "human",
      goal: "New run should continue sequence.",
      status: "queued",
      priority: "normal",
      createdAt: "2026-04-21T11:00:00.000Z",
      updatedAt: "2026-04-21T11:00:00.000Z",
    },
    workspacePath: "/srv/workspace-b",
  });

  assert.equal(assigned?.run.runId, "run-platform-8");
  assert.equal(assigned?.executionLease.leaseId, "lease-platform-10");
  assert.equal(assigned?.executionLease.leaseToken, "lease-token-platform-12");
});
