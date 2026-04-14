import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformCollaborationService } from "./platform-collaboration-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";

test("PlatformCollaborationService 会按父任务分组 waiting 项，并返回 agent handoffs", () => {
  const nodeService = createInMemoryPlatformNodeService({
    organizations: [buildOrganization()],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    assignedRuns: [
      buildAssignedRun({
        targetAgentId: "agent-alpha",
        targetAgentName: "平台经理",
        workItemId: "work-item-alpha",
        goal: "等待人工确认发布窗口",
        status: "waiting_human",
        waitingFor: "human",
        priority: "urgent",
        updatedAt: "2026-04-14T10:10:00.000Z",
      }),
      buildAssignedRun({
        targetAgentId: "agent-alpha",
        targetAgentName: "平台经理",
        workItemId: "work-item-beta",
        goal: "等待执行 agent 回传结果",
        status: "waiting_agent",
        waitingFor: "agent",
        priority: "normal",
        updatedAt: "2026-04-13T09:08:00.000Z",
      }),
      buildAssignedRun({
        targetAgentId: "agent-gamma",
        targetAgentName: "独立值班",
        workItemId: "work-item-gamma",
        goal: "另一路 waiting_human",
        status: "waiting_human",
        waitingFor: "human",
        priority: "high",
        updatedAt: "2026-04-14T09:40:00.000Z",
      }),
    ],
  });
  const service = createInMemoryPlatformCollaborationService({
    workerRunService,
    now: () => "2026-04-14T10:30:00.000Z",
    parentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: "org-platform",
      parentWorkItemId: "parent-work-item-alpha",
      displayName: "平台主任务 Alpha",
      childWorkItemIds: ["work-item-alpha", "work-item-beta"],
    }],
    handoffSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: "org-platform",
      agentId: "agent-alpha",
      handoffs: [{
        handoffId: "handoff-alpha",
        fromAgentId: "agent-manager",
        toAgentId: "agent-alpha",
        workItemId: "work-item-alpha",
        summary: "经理已补齐上下文并要求确认发布窗口。",
        blockers: ["等待人工确认"],
        recommendedNextActions: ["确认窗口", "恢复执行"],
        attachedArtifacts: ["artifact-alpha"],
        createdAt: "2026-04-14T10:05:00.000Z",
        updatedAt: "2026-04-14T10:05:00.000Z",
      }],
      timeline: [{
        entryId: "timeline-alpha",
        kind: "handoff",
        title: "经理交接",
        summary: "经理已补齐上下文并要求确认发布窗口。",
        workItemId: "work-item-alpha",
        handoffId: "handoff-alpha",
        counterpartyAgentId: "agent-manager",
        counterpartyDisplayName: "平台经理",
        createdAt: "2026-04-14T10:05:00.000Z",
        updatedAt: "2026-04-14T10:05:00.000Z",
      }],
    }],
  });

  const dashboard = service.getCollaborationDashboard({
    ownerPrincipalId: "principal-platform-owner",
  });

  assert.equal(dashboard.summary.total, 3);
  assert.equal(dashboard.summary.waitingHuman, 2);
  assert.equal(dashboard.summary.waitingAgent, 1);
  assert.equal(dashboard.summary.attentionCount, 3);
  assert.equal(dashboard.parents[0]?.parentWorkItemId, "parent-work-item-alpha");
  assert.equal(dashboard.parents[0]?.items.length, 2);
  assert.equal(dashboard.parents[1]?.parentWorkItemId, "work-item-gamma");

  const handoffs = service.getAgentHandoffList({
    ownerPrincipalId: "principal-platform-owner",
    agentId: "agent-alpha",
  });

  assert.equal(handoffs?.agent.agentId, "agent-alpha");
  assert.equal(handoffs?.handoffs[0]?.summary, "经理已补齐上下文并要求确认发布窗口。");
  assert.equal(handoffs?.timeline[0]?.kind, "handoff");
  assert.equal(handoffs?.timeline[0]?.title, "经理交接");
});

function buildOrganization() {
  return {
    organizationId: "org-platform",
    ownerPrincipalId: "principal-platform-owner",
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-04-14T09:00:00.000Z",
    updatedAt: "2026-04-14T09:00:00.000Z",
  };
}

function buildAssignedRun(input: {
  targetAgentId: string;
  targetAgentName: string;
  workItemId: string;
  goal: string;
  status: "waiting_human" | "waiting_agent";
  waitingFor: "human" | "agent";
  priority: "urgent" | "high" | "normal" | "low";
  updatedAt: string;
}) {
  return {
    organization: buildOrganization(),
    node: {
      nodeId: "node-alpha",
      organizationId: "org-platform",
      displayName: "Worker Alpha",
      status: "online" as const,
      slotCapacity: 2,
      slotAvailable: 1,
      createdAt: "2026-04-14T09:30:00.000Z",
      updatedAt: "2026-04-14T09:30:00.000Z",
    },
    targetAgent: {
      agentId: input.targetAgentId,
      organizationId: "org-platform",
      displayName: input.targetAgentName,
      departmentRole: "Platform",
      status: "active" as const,
      createdAt: "2026-04-14T09:00:00.000Z",
      updatedAt: "2026-04-14T09:00:00.000Z",
    },
    workItem: {
      workItemId: input.workItemId,
      organizationId: "org-platform",
      targetAgentId: input.targetAgentId,
      sourceType: "agent" as const,
      goal: input.goal,
      status: input.status,
      priority: input.priority,
      waitingFor: input.waitingFor,
      createdAt: "2026-04-14T09:40:00.000Z",
      updatedAt: input.updatedAt,
    },
    run: {
      runId: `run-${input.workItemId}`,
      organizationId: "org-platform",
      workItemId: input.workItemId,
      nodeId: "node-alpha",
      status: "waiting_action" as const,
      createdAt: "2026-04-14T09:40:00.000Z",
      updatedAt: input.updatedAt,
    },
    executionLease: {
      leaseId: `lease-${input.workItemId}`,
      runId: `run-${input.workItemId}`,
      nodeId: "node-alpha",
      workItemId: input.workItemId,
      leaseToken: `lease-token-${input.workItemId}`,
      status: "active" as const,
      createdAt: "2026-04-14T09:40:00.000Z",
      updatedAt: input.updatedAt,
    },
    executionContract: {
      workspacePath: "/srv/platform",
    },
  };
}
