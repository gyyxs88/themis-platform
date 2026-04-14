import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import {
  exportPlatformRuntimeSnapshot,
  loadPlatformRuntimeSnapshotFile,
  savePlatformRuntimeSnapshotFile,
} from "./platform-runtime-snapshot.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

test("platform runtime snapshot 会保存并恢复 nodes/control-plane/workflow/runs", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-runtime-"));
  const snapshotFile = join(workingDirectory, "infra/platform/runtime-state.json");

  try {
    const organization = {
      organizationId: "org-platform",
      ownerPrincipalId: "principal-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T10:00:00.000Z",
      updatedAt: "2026-04-14T10:00:00.000Z",
    };
    const nodeService = createInMemoryPlatformNodeService({
      organizations: [organization],
      nodes: [{
        nodeId: "node-a",
        organizationId: organization.organizationId,
        displayName: "Worker A",
        status: "online",
        slotCapacity: 2,
        slotAvailable: 2,
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:00:00.000Z",
      }],
    });
    const workerRunService = createInMemoryPlatformWorkerRunService({
      nodeService,
      assignedRuns: [{
        organization,
        node: {
          nodeId: "node-a",
          organizationId: organization.organizationId,
          displayName: "Worker A",
          status: "online",
          slotCapacity: 2,
          slotAvailable: 2,
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        targetAgent: {
          agentId: "agent-active",
          organizationId: organization.organizationId,
          displayName: "Active Agent",
          departmentRole: "Platform",
          status: "active",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        workItem: {
          workItemId: "work-item-active",
          organizationId: organization.organizationId,
          targetAgentId: "agent-active",
          sourceType: "human",
          goal: "Persist active run",
          status: "queued",
          priority: "high",
          createdAt: "2026-04-14T10:01:00.000Z",
          updatedAt: "2026-04-14T10:01:00.000Z",
        },
        run: {
          runId: "run-a",
          organizationId: organization.organizationId,
          workItemId: "work-item-active",
          nodeId: "node-a",
          status: "created",
          createdAt: "2026-04-14T10:01:00.000Z",
          updatedAt: "2026-04-14T10:01:00.000Z",
        },
        executionLease: {
          leaseId: "lease-a",
          runId: "run-a",
          nodeId: "node-a",
          workItemId: "work-item-active",
          leaseToken: "lease-token-a",
          status: "active",
          createdAt: "2026-04-14T10:01:00.000Z",
          updatedAt: "2026-04-14T10:01:00.000Z",
        },
        executionContract: {
          workspacePath: "/srv/persisted",
        },
      }],
    });
    const workflowService = createInMemoryPlatformWorkflowService({
      workerRunService,
      agentSeeds: [{
        ownerPrincipalId: "principal-owner",
        organization,
        agent: {
          agentId: "agent-queued",
          organizationId: organization.organizationId,
          displayName: "Queued Agent",
          departmentRole: "Platform",
          status: "active",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
      }],
      mailboxSeeds: [{
        ownerPrincipalId: "principal-owner",
        organization,
        agent: {
          agentId: "agent-queued",
          organizationId: organization.organizationId,
          displayName: "Queued Agent",
          departmentRole: "Platform",
          status: "active",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        entry: {
          mailboxEntryId: "mailbox-entry-a",
          organizationId: organization.organizationId,
          ownerAgentId: "agent-queued",
          agentId: "agent-queued",
          messageId: "message-a",
          workItemId: "work-item-queued",
          priority: "normal",
          status: "pending",
          requiresAck: true,
          availableAt: "2026-04-14T10:02:00.000Z",
          createdAt: "2026-04-14T10:02:00.000Z",
          updatedAt: "2026-04-14T10:02:00.000Z",
        },
        message: {
          messageId: "message-a",
          organizationId: organization.organizationId,
          toAgentId: "agent-queued",
          workItemId: "work-item-queued",
          messageType: "handoff",
          payload: { text: "please continue" },
          artifactRefs: [],
          priority: "normal",
          requiresAck: true,
          createdAt: "2026-04-14T10:02:00.000Z",
          updatedAt: "2026-04-14T10:02:00.000Z",
        },
      }],
    });
    const controlPlaneService = createInMemoryPlatformControlPlaneService({
      now: () => "2026-04-14T10:00:00.000Z",
      generateOrganizationId: () => "org-platform",
      generatePrincipalId: () => "principal-queued",
      generateAgentId: () => "agent-queued",
    });
    const created = controlPlaneService.createAgent({
      ownerPrincipalId: "principal-owner",
      agent: {
        organizationId: "org-platform",
        displayName: "Queued Agent",
        departmentRole: "Platform",
      },
    });
    workflowService.registerAgent({
      ownerPrincipalId: "principal-owner",
      organization: created.organization,
      agent: created.agent,
    });
    controlPlaneService.upsertProjectWorkspaceBinding({
      ownerPrincipalId: "principal-owner",
      binding: {
        projectId: "project-a",
        organizationId: "org-platform",
        displayName: "Persist Project",
        canonicalWorkspacePath: "/srv/project-a",
        continuityMode: "sticky",
      },
    });
    const dispatched = workflowService.dispatchWorkItem({
      ownerPrincipalId: "principal-owner",
      workItem: {
        targetAgentId: "agent-queued",
        sourceType: "human",
        goal: "Persist queued item",
        priority: "normal",
        projectId: "project-a",
      },
    });
    const dispatchedWorkItemId = dispatched.workItem.workItemId;

    savePlatformRuntimeSnapshotFile(snapshotFile, exportPlatformRuntimeSnapshot({
      nodeService,
      controlPlaneService,
      workerRunService,
      workflowService,
    }, () => "2026-04-14T11:00:00.000Z"));

    const snapshot = loadPlatformRuntimeSnapshotFile(snapshotFile);
    assert.equal(snapshot?.savedAt, "2026-04-14T11:00:00.000Z");

    const restoredNodeService = createInMemoryPlatformNodeService({
      organizations: snapshot?.nodeService.organizations,
      nodes: snapshot?.nodeService.nodes,
    });
    const restoredWorkerRunService = createInMemoryPlatformWorkerRunService({
      nodeService: restoredNodeService,
      assignedRuns: snapshot?.workerRunService.assignedRuns,
    });
    const restoredWorkflowService = createInMemoryPlatformWorkflowService({
      workerRunService: restoredWorkerRunService,
      agentSeeds: snapshot?.workflowService.agentSeeds,
      workItemSeeds: snapshot?.workflowService.workItemSeeds,
      mailboxSeeds: snapshot?.workflowService.mailboxSeeds,
      parentSeeds: snapshot?.workflowService.parentSeeds,
      handoffSeeds: snapshot?.workflowService.handoffSeeds,
    });
    const restoredControlPlaneService = createInMemoryPlatformControlPlaneService({
      snapshot: snapshot?.controlPlaneService,
    });

    assert.equal(restoredNodeService.listNodes({ ownerPrincipalId: "principal-owner" }).length, 1);
    assert.equal(
      restoredWorkerRunService.getAssignedRunByWorkItem({
        ownerPrincipalId: "principal-owner",
        workItemId: "work-item-active",
      })?.run.runId,
      "run-a",
    );
    assert.equal(
      restoredControlPlaneService.getProjectWorkspaceBinding({
        ownerPrincipalId: "principal-owner",
        projectId: "project-a",
      })?.binding?.canonicalWorkspacePath,
      "/srv/project-a",
    );
    const restoredWorkItems = restoredWorkflowService.listWorkItems({
      ownerPrincipalId: "principal-owner",
    }).workItems ?? [];
    assert.equal(
      restoredWorkItems.some((workItem) => workItem.workItemId === dispatchedWorkItemId),
      true,
    );
    assert.equal(
      restoredWorkflowService.listMailbox({
        ownerPrincipalId: "principal-owner",
        agentId: "agent-queued",
      })?.items.length,
      1,
    );
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
