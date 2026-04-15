import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformCollaborationService } from "./platform-collaboration-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

test("PlatformWorkflowService 会提供 work-items 与 mailbox 最小读写闭环", () => {
  const organization = buildOrganization();
  const backendAgent = buildAgent("agent-backend", "平台后端");
  const frontendAgent = buildAgent("agent-frontend", "平台前端");
  const nodeService = createInMemoryPlatformNodeService({
    organizations: [organization],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    assignedRuns: [
      buildAssignedRun({
        organization,
        targetAgent: backendAgent,
        workItemId: "work-item-human",
        goal: "等待人工审批是否继续发布",
        status: "waiting_human",
        waitingFor: "human",
        priority: "urgent",
        updatedAt: "2026-04-14T10:10:00.000Z",
      }),
      buildAssignedRun({
        organization,
        targetAgent: backendAgent,
        workItemId: "work-item-agent",
        goal: "等待上游 agent 反馈执行边界",
        status: "waiting_agent",
        waitingFor: "agent",
        priority: "high",
        updatedAt: "2026-04-14T10:12:00.000Z",
      }),
    ],
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    now: () => "2026-04-14T10:30:00.000Z",
    agentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organization,
      agent: frontendAgent,
    }],
    workItemSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organization,
      targetAgent: frontendAgent,
      workItem: {
        workItemId: "work-item-dispatch",
        organizationId: organization.organizationId,
        targetAgentId: frontendAgent.agentId,
        sourceType: "human",
        goal: "等待单独排队的前端任务",
        status: "queued",
        priority: "normal",
        createdAt: "2026-04-14T10:20:00.000Z",
        updatedAt: "2026-04-14T10:20:00.000Z",
      },
    }],
    parentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: organization.organizationId,
      parentWorkItemId: "parent-work-item-1",
      displayName: "平台父任务",
      childWorkItemIds: ["work-item-human", "work-item-agent"],
    }],
    handoffSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organizationId: organization.organizationId,
      agentId: backendAgent.agentId,
      handoffs: [{
        handoffId: "handoff-1",
        fromAgentId: "agent-manager",
        toAgentId: backendAgent.agentId,
        workItemId: "work-item-human",
        summary: "经理已补齐上下文。",
        createdAt: "2026-04-14T10:08:00.000Z",
        updatedAt: "2026-04-14T10:08:00.000Z",
      }],
      timeline: [],
    }],
    mailboxSeeds: [
      buildMailboxSeed({
        organization,
        agent: frontendAgent,
        mailboxEntryId: "mailbox-front-1",
        messageId: "message-front-1",
        workItemId: "work-item-human",
        fromAgentId: backendAgent.agentId,
        toAgentId: frontendAgent.agentId,
        summary: "请先确认最近一次构建状态。",
        priority: "normal",
        createdAt: "2026-04-14T10:18:00.000Z",
      }),
      buildMailboxSeed({
        organization,
        agent: frontendAgent,
        mailboxEntryId: "mailbox-front-2",
        messageId: "message-front-2",
        workItemId: "work-item-agent",
        fromAgentId: backendAgent.agentId,
        toAgentId: frontendAgent.agentId,
        summary: "是否允许继续执行发布。",
        priority: "urgent",
        createdAt: "2026-04-14T10:19:00.000Z",
      }),
    ],
  });

  const listPayload = workflowService.listWorkItems({
    ownerPrincipalId: "principal-platform-owner",
  });
  assert.equal(listPayload.workItems?.length, 3);
  assert.equal(listPayload.workItems?.[0]?.workItemId, "work-item-human");

  const detailPayload = workflowService.getWorkItemDetail({
    ownerPrincipalId: "principal-platform-owner",
    workItemId: "work-item-human",
  });
  assert.equal(detailPayload?.parentWorkItem?.workItemId, "parent-work-item-1");
  assert.equal(detailPayload?.latestHandoff?.handoffId, "handoff-1");

  const dispatchPayload = workflowService.dispatchWorkItem({
    ownerPrincipalId: "principal-platform-owner",
    workItem: {
      targetAgentId: frontendAgent.agentId,
      sourceType: "human",
      goal: "新建一条平台前端待办",
      priority: "high",
    },
  });
  assert.equal(dispatchPayload.workItem.status, "queued");
  assert.equal(dispatchPayload.workItem.targetAgentId, frontendAgent.agentId);

  const respondPayload = workflowService.respondToWorkItem({
    ownerPrincipalId: "principal-platform-owner",
    workItemId: "work-item-human",
    response: {
      decision: "approve",
      inputText: "可以继续执行。",
    },
  });
  assert.equal(respondPayload?.workItem.status, "queued");
  assert.equal(respondPayload?.message?.messageType, "approval_result");

  const escalatePayload = workflowService.escalateWorkItem({
    ownerPrincipalId: "principal-platform-owner",
    workItemId: "work-item-agent",
    escalation: {
      inputText: "请平台 owner 接手。",
    },
  });
  assert.equal(escalatePayload?.workItem.status, "waiting_human");

  const cancelPayload = workflowService.cancelWorkItem({
    ownerPrincipalId: "principal-platform-owner",
    workItemId: "work-item-dispatch",
  });
  assert.equal(cancelPayload?.workItem.status, "cancelled");

  const mailboxList = workflowService.listMailbox({
    ownerPrincipalId: "principal-platform-owner",
    agentId: frontendAgent.agentId,
  });
  assert.equal(mailboxList?.items.length, 2);
  assert.equal(mailboxList?.items[0]?.entry.mailboxEntryId, "mailbox-front-2");

  const mailboxPull = workflowService.pullMailbox({
    ownerPrincipalId: "principal-platform-owner",
    agentId: frontendAgent.agentId,
  });
  assert.equal(mailboxPull?.item?.entry.mailboxEntryId, "mailbox-front-2");
  assert.equal(mailboxPull?.item?.entry.status, "leased");

  const mailboxAck = workflowService.ackMailbox({
    ownerPrincipalId: "principal-platform-owner",
    agentId: frontendAgent.agentId,
    mailboxEntryId: "mailbox-front-1",
  });
  assert.equal(mailboxAck?.mailboxEntry.status, "acked");

  const mailboxRespond = workflowService.respondMailbox({
    ownerPrincipalId: "principal-platform-owner",
    agentId: frontendAgent.agentId,
    mailboxEntryId: "mailbox-front-2",
    response: {
      decision: "approve",
      inputText: "可以继续，请同步 release note。",
      priority: "urgent",
    },
  });
  assert.equal(mailboxRespond?.sourceMailboxEntry.status, "acked");
  assert.equal(mailboxRespond?.responseMessage.messageType, "approval_result");
  assert.equal(mailboxRespond?.responseMailboxEntry.ownerAgentId, backendAgent.agentId);
  assert.equal(mailboxRespond?.resumedWorkItem?.status, "queued");
  assert.equal(mailboxRespond?.resumedRuns[0]?.status, "interrupted");
});

test("PlatformWorkflowService 会优先返回 assigned run 上的最新 work-item 状态", () => {
  const organization = buildOrganization();
  const agent = buildAgent("agent-alpha", "平台联调");
  const nodeService = createInMemoryPlatformNodeService({
    organizations: [organization],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    assignedRuns: [{
      organization,
      node: {
        nodeId: "node-alpha",
        organizationId: organization.organizationId,
        displayName: "Worker Alpha",
        status: "online",
        slotCapacity: 1,
        slotAvailable: 1,
        createdAt: "2026-04-14T09:30:00.000Z",
        updatedAt: "2026-04-14T09:30:00.000Z",
      },
      targetAgent: agent,
      workItem: {
        workItemId: "work-item-platform-1",
        organizationId: organization.organizationId,
        targetAgentId: agent.agentId,
        sourceType: "human",
        goal: "确认主链联调状态",
        status: "completed",
        priority: "low",
        createdAt: "2026-04-14T14:33:27.705Z",
        updatedAt: "2026-04-14T14:33:28.564Z",
      },
      run: {
        runId: "run-platform-1",
        organizationId: organization.organizationId,
        workItemId: "work-item-platform-1",
        nodeId: "node-alpha",
        status: "completed",
        createdAt: "2026-04-14T14:33:28.534Z",
        updatedAt: "2026-04-14T14:33:28.564Z",
      },
      executionLease: {
        leaseId: "lease-platform-1",
        runId: "run-platform-1",
        nodeId: "node-alpha",
        workItemId: "work-item-platform-1",
        leaseToken: "lease-token-platform-1",
        status: "released",
        createdAt: "2026-04-14T14:33:28.534Z",
        updatedAt: "2026-04-14T14:33:28.564Z",
      },
      executionContract: {
        workspacePath: "/srv/platform-alpha",
      },
    }],
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    workItemSeeds: [{
      ownerPrincipalId: organization.ownerPrincipalId,
      organization,
      targetAgent: agent,
      workItem: {
        workItemId: "work-item-platform-1",
        organizationId: organization.organizationId,
        targetAgentId: agent.agentId,
        sourceType: "human",
        goal: "确认主链联调状态",
        status: "queued",
        priority: "low",
        createdAt: "2026-04-14T14:33:27.705Z",
        updatedAt: "2026-04-14T14:33:27.705Z",
      },
    }],
  });

  const listPayload = workflowService.listWorkItems({
    ownerPrincipalId: organization.ownerPrincipalId,
  });
  assert.equal(listPayload.workItems?.[0]?.workItemId, "work-item-platform-1");
  assert.equal(listPayload.workItems?.[0]?.status, "completed");

  const detailPayload = workflowService.getWorkItemDetail({
    ownerPrincipalId: organization.ownerPrincipalId,
    workItemId: "work-item-platform-1",
  });
  assert.equal(detailPayload?.workItem.status, "completed");
  assert.equal(detailPayload?.runs?.[0]?.status, "completed");
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

function buildAgent(agentId: string, displayName: string) {
  return {
    agentId,
    organizationId: "org-platform",
    displayName,
    departmentRole: "Platform",
    status: "active" as const,
    createdAt: "2026-04-14T09:00:00.000Z",
    updatedAt: "2026-04-14T09:00:00.000Z",
  };
}

function buildAssignedRun(input: {
  organization: ReturnType<typeof buildOrganization>;
  targetAgent: ReturnType<typeof buildAgent>;
  workItemId: string;
  goal: string;
  status: "waiting_human" | "waiting_agent";
  waitingFor: "human" | "agent";
  priority: "urgent" | "high" | "normal" | "low";
  updatedAt: string;
}) {
  return {
    organization: input.organization,
    node: {
      nodeId: "node-alpha",
      organizationId: input.organization.organizationId,
      displayName: "Worker Alpha",
      status: "online" as const,
      slotCapacity: 2,
      slotAvailable: 1,
      createdAt: "2026-04-14T09:30:00.000Z",
      updatedAt: "2026-04-14T09:30:00.000Z",
    },
    targetAgent: input.targetAgent,
    workItem: {
      workItemId: input.workItemId,
      organizationId: input.organization.organizationId,
      targetAgentId: input.targetAgent.agentId,
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
      organizationId: input.organization.organizationId,
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

function buildMailboxSeed(input: {
  organization: ReturnType<typeof buildOrganization>;
  agent: ReturnType<typeof buildAgent>;
  mailboxEntryId: string;
  messageId: string;
  workItemId: string;
  fromAgentId: string;
  toAgentId: string;
  summary: string;
  priority: "urgent" | "high" | "normal" | "low";
  createdAt: string;
}) {
  return {
    ownerPrincipalId: "principal-platform-owner",
    organization: input.organization,
    agent: input.agent,
    entry: {
      mailboxEntryId: input.mailboxEntryId,
      organizationId: input.organization.organizationId,
      ownerAgentId: input.agent.agentId,
      agentId: input.agent.agentId,
      messageId: input.messageId,
      workItemId: input.workItemId,
      priority: input.priority,
      status: "pending" as const,
      requiresAck: true,
      availableAt: input.createdAt,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
    message: {
      messageId: input.messageId,
      organizationId: input.organization.organizationId,
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      workItemId: input.workItemId,
      messageType: "approval_request",
      payload: {
        summary: input.summary,
      },
      artifactRefs: [],
      priority: input.priority,
      requiresAck: true,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  };
}
