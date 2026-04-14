import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createLocalPlatformExecutionRuntimeStore,
  loadPlatformExecutionRuntimeEvents,
  loadPlatformExecutionRuntimeState,
} from "./platform-execution-runtime-store.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformSchedulerService } from "./platform-scheduler-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

test("PlatformSchedulerService 会回收离线节点 active lease，并允许 work-item 重新分配", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-scheduler-"));
  const ownerPrincipalId = "principal-owner";
  const organization = {
    organizationId: "org-platform",
    ownerPrincipalId,
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-04-14T10:00:00.000Z",
    updatedAt: "2026-04-14T10:00:00.000Z",
  };
  const targetAgent = {
    agentId: "agent-a",
    organizationId: organization.organizationId,
    displayName: "Agent A",
    departmentRole: "Platform",
    status: "active" as const,
    createdAt: "2026-04-14T10:00:00.000Z",
    updatedAt: "2026-04-14T10:00:00.000Z",
  };
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T11:00:00.000Z",
    organizations: [organization],
    nodes: [
      {
        nodeId: "node-offline",
        organizationId: organization.organizationId,
        displayName: "Worker Offline",
        status: "offline",
        slotCapacity: 2,
        slotAvailable: 0,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
      {
        nodeId: "node-online",
        organizationId: organization.organizationId,
        displayName: "Worker Online",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 2,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
    ],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-14T11:05:00.000Z",
    generateRunId: () => "run-reassigned",
    generateLeaseId: () => "lease-reassigned",
    generateLeaseToken: () => "lease-token-reassigned",
    assignedRuns: [{
      organization,
      node: {
        nodeId: "node-offline",
        organizationId: organization.organizationId,
        displayName: "Worker Offline",
        status: "offline",
        slotCapacity: 2,
        slotAvailable: 0,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      },
      targetAgent,
      workItem: {
        workItemId: "work-item-a",
        organizationId: organization.organizationId,
        targetAgentId: targetAgent.agentId,
        sourceType: "human",
        goal: "Recover and requeue",
        status: "running",
        priority: "high",
        createdAt: "2026-04-14T10:01:00.000Z",
        updatedAt: "2026-04-14T10:10:00.000Z",
      },
      run: {
        runId: "run-a",
        organizationId: organization.organizationId,
        workItemId: "work-item-a",
        nodeId: "node-offline",
        status: "running",
        createdAt: "2026-04-14T10:01:00.000Z",
        updatedAt: "2026-04-14T10:10:00.000Z",
      },
      executionLease: {
        leaseId: "lease-a",
        runId: "run-a",
        nodeId: "node-offline",
        workItemId: "work-item-a",
        leaseToken: "lease-token-a",
        status: "active",
        createdAt: "2026-04-14T10:01:00.000Z",
        updatedAt: "2026-04-14T10:10:00.000Z",
      },
      executionContract: {
        workspacePath: "/srv/original",
      },
    }],
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    now: () => "2026-04-14T11:05:00.000Z",
    agentSeeds: [{
      ownerPrincipalId,
      organization,
      agent: targetAgent,
    }],
  });
  const executionRuntimeStore = createLocalPlatformExecutionRuntimeStore({
    rootDirectory: join(workingDirectory, "infra/platform/runtime-runs"),
    now: () => "2026-04-14T11:06:00.000Z",
  });

  try {
    const schedulerService = createInMemoryPlatformSchedulerService({
      nodeService,
      workerRunService,
      executionRuntimeStore,
      now: () => "2026-04-14T11:06:00.000Z",
    });

    const tick = schedulerService.runTick();
    assert.deepEqual(tick, {
      ownerCount: 1,
      reclaimedRunCount: 1,
      requeuedWorkItemCount: 1,
      revokedLeaseCount: 1,
    });

    const recovered = workerRunService.getAssignedRunByWorkItem({
      ownerPrincipalId,
      workItemId: "work-item-a",
    });
    assert.equal(recovered?.run.runId, "run-a");
    assert.equal(recovered?.run.status, "interrupted");
    assert.equal(recovered?.executionLease.status, "revoked");
    assert.equal(recovered?.workItem.status, "queued");

    const runtimeState = loadPlatformExecutionRuntimeState(
      join(workingDirectory, "infra/platform/runtime-runs"),
      ownerPrincipalId,
      "run-a",
    );
    assert(runtimeState);
    assert.equal(runtimeState.lastEventKind, "reclaimed");
    assert.equal(runtimeState.runStatus, "interrupted");
    assert.equal(runtimeState.leaseStatus, "revoked");

    const runtimeEvents = loadPlatformExecutionRuntimeEvents(
      join(workingDirectory, "infra/platform/runtime-runs"),
      ownerPrincipalId,
      "run-a",
    );
    assert.deepEqual(runtimeEvents.map((event) => event.kind), ["reclaimed"]);
    assert.equal(runtimeEvents[0]?.reason, "node_status_offline");

    const queued = workflowService.claimNextQueuedWorkItem({
      ownerPrincipalId,
      organizationId: organization.organizationId,
    });
    assert.equal(queued?.workItem.workItemId, "work-item-a");

    const reassigned = workerRunService.assignQueuedWorkItem({
      ownerPrincipalId,
      nodeId: "node-online",
      organization,
      targetAgent,
      workItem: queued!.workItem,
      workspacePath: "/srv/reassigned",
    });
    assert.equal(reassigned?.run.runId, "run-reassigned");
    assert.equal(reassigned?.node.nodeId, "node-online");
    assert.equal(reassigned?.executionLease.status, "active");
    assert.equal(reassigned?.executionContract.workspacePath, "/srv/reassigned");

    const current = workerRunService.getAssignedRunByWorkItem({
      ownerPrincipalId,
      workItemId: "work-item-a",
    });
    assert.equal(current?.run.runId, "run-reassigned");
    assert.equal(current?.node.nodeId, "node-online");
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
