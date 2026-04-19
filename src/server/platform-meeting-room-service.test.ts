import assert from "node:assert/strict";
import test from "node:test";
import type { ManagedAgentPlatformMeetingRoomCreatePayload } from "themis-contracts/managed-agent-platform-meetings";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";
import { createInMemoryPlatformMeetingRoomService } from "./platform-meeting-room-service.js";

test("createRoom 会创建 themis 参与者、agent 参与者和 roomSessionId", () => {
  const ownerPrincipalId = "principal-owner";
  const controlPlaneService = createInMemoryPlatformControlPlaneService();
  const { organization, agent } = controlPlaneService.createAgent({
    ownerPrincipalId,
    agent: {
      departmentRole: "后端工程",
      displayName: "后端·衡",
      mission: "负责服务端实现。",
    },
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService: createInMemoryPlatformNodeService(),
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
  });
  const service = createInMemoryPlatformMeetingRoomService({
    controlPlaneService,
    workflowService,
    now: () => "2026-04-18T10:00:00.000Z",
  });

  const detail = service.createRoom({
    ownerPrincipalId,
    room: {
      title: "发布阻塞讨论",
      goal: "确认这次 prod 发布失败的根因。",
      operatorPrincipalId: ownerPrincipalId,
      organizationId: organization.organizationId,
      participants: [{
        agentId: agent.agentId,
        entryMode: "blank",
      }],
    },
  });

  assert.equal(detail.room.status, "open");
  assert.equal(detail.participants.length, 2);
  assert.equal(detail.participants[0]?.participantKind, "themis");
  assert.equal(detail.participants[1]?.agentId, agent.agentId);
  assert.equal(
    detail.participants[1]?.roomSessionId,
    `meeting-room:${detail.room.roomId}:participant:${agent.agentId}`,
  );
});

test("createRoom 会为 active_work_context 参与者生成当前工作上下文快照", () => {
  const ownerPrincipalId = "principal-owner";
  const controlPlaneService = createInMemoryPlatformControlPlaneService({
    now: () => "2026-04-18T09:50:00.000Z",
    generateOrganizationId: () => "org-platform",
    generatePrincipalId: () => "principal-agent",
    generateAgentId: () => "agent-backend",
  });
  const { organization, agent } = controlPlaneService.createAgent({
    ownerPrincipalId,
    agent: {
      organizationId: "org-platform",
      departmentRole: "后端工程",
      displayName: "后端·衡",
      mission: "负责服务端实现。",
    },
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService: createInMemoryPlatformNodeService({
      organizations: [organization],
    }),
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    workItemSeeds: [{
      ownerPrincipalId,
      organization,
      targetAgent: agent,
      workItem: {
        workItemId: "work-item-active",
        organizationId: organization.organizationId,
        targetAgentId: agent.agentId,
        sourceType: "human",
        dispatchReason: "发布阻塞排查",
        goal: "排查 prod 发布失败",
        status: "waiting_human",
        priority: "high",
        waitingFor: "human",
        latestWaitingMessage: "需要 DBA 确认 migration 锁冲突。",
        latestHumanResponse: "先按 migration 锁冲突排查。",
        waitingActionRequest: {
          prompt: "请确认数据库锁情况",
        },
        latestHandoffSummary: "怀疑 migration 锁冲突导致超时。",
        createdAt: "2026-04-18T09:55:00.000Z",
        updatedAt: "2026-04-18T09:59:00.000Z",
      },
    }],
    handoffSeeds: [{
      ownerPrincipalId,
      organizationId: organization.organizationId,
      agentId: agent.agentId,
      handoffs: [{
        handoffId: "handoff-1",
        workItemId: "work-item-active",
        summary: "已定位到 migration 锁等待。",
        blockers: ["需要 DBA 确认阻塞会话"],
        recommendedNextActions: ["拉取 innodb 锁等待信息"],
        createdAt: "2026-04-18T09:58:00.000Z",
        updatedAt: "2026-04-18T09:58:00.000Z",
      }],
      timeline: [],
    }],
  });
  const service = createInMemoryPlatformMeetingRoomService({
    controlPlaneService,
    workflowService,
    now: () => "2026-04-18T10:00:00.000Z",
  });

  const detail = service.createRoom({
    ownerPrincipalId,
    room: {
      title: "发布阻塞讨论",
      goal: "确认这次 prod 发布失败的根因。",
      operatorPrincipalId: ownerPrincipalId,
      organizationId: organization.organizationId,
      participants: [{
        agentId: agent.agentId,
        entryMode: "active_work_context",
      }],
    },
  });

  const participant = detail.participants.find((item) => item.agentId === agent.agentId);
  assert.ok(participant?.entryContextSnapshotJson);

  const snapshot = participant.entryContextSnapshotJson as Record<string, unknown>;
  const currentWorkItem = snapshot.currentWorkItem as Record<string, unknown>;
  const latestHandoff = snapshot.latestHandoff as Record<string, unknown>;

  assert.equal(snapshot.mode, "active_work_context");
  assert.equal(snapshot.generatedAt, "2026-04-18T10:00:00.000Z");
  assert.equal(currentWorkItem.workItemId, "work-item-active");
  assert.equal(currentWorkItem.status, "waiting_human");
  assert.equal(currentWorkItem.waitingFor, "human");
  assert.equal(currentWorkItem.latestWaitingMessage, "需要 DBA 确认 migration 锁冲突。");
  assert.equal(currentWorkItem.latestHumanResponse, "先按 migration 锁冲突排查。");
  assert.deepEqual(currentWorkItem.waitingActionRequest, {
    prompt: "请确认数据库锁情况",
  });
  assert.equal(latestHandoff.summary, "已定位到 migration 锁等待。");
  assert.deepEqual(latestHandoff.recommendedNextActions, ["拉取 innodb 锁等待信息"]);
});

test("createManagerMessage + appendAgentReply 会把 round 推进到 completed", () => {
  const service = createFixtureService();
  const room = service.createRoom(createFixtureRoomPayload()).room;
  const detail = service.createManagerMessage({
    ownerPrincipalId: "principal-owner",
    message: {
      roomId: room.roomId,
      content: "先各自给出你们判断到的根因。",
      operatorPrincipalId: "principal-owner",
    },
  });
  assert.ok(detail);
  const participant = detail.targetParticipants[0];
  assert.ok(participant);

  const afterReply = service.appendAgentReply({
    ownerPrincipalId: "principal-owner",
    reply: {
      roomId: room.roomId,
      roundId: detail.round.roundId,
      participantId: participant.participantId,
      content: "我判断是 deploy 阶段的 migration 超时。",
    },
  });

  assert.ok(afterReply);
  assert.equal(afterReply.round.status, "completed");
  assert.equal(afterReply.message.speakerType, "managed_agent");
});

test("createManagerMessage 会在已有 running round 时把新 round 排队并在上一轮结束后启动", () => {
  const service = createFixtureService();
  const room = service.createRoom(createFixtureRoomPayload()).room;

  const first = service.createManagerMessage({
    ownerPrincipalId: "principal-owner",
    message: {
      roomId: room.roomId,
      content: "先给出第一轮判断。",
      operatorPrincipalId: "principal-owner",
    },
  });
  assert.ok(first);
  assert.equal(first.round.status, "running");

  const second = service.createManagerMessage({
    ownerPrincipalId: "principal-owner",
    message: {
      roomId: room.roomId,
      content: "第二轮再给出收敛建议。",
      operatorPrincipalId: "principal-owner",
    },
  });
  assert.ok(second);
  assert.equal(second.round.status, "queued");

  const participant = first.targetParticipants[0];
  assert.ok(participant);
  service.appendAgentReply({
    ownerPrincipalId: "principal-owner",
    reply: {
      roomId: room.roomId,
      roundId: first.round.roundId,
      participantId: participant.participantId,
      content: "第一轮先确认 migration 超时。",
    },
  });

  const detail = service.getRoomDetail({
    ownerPrincipalId: "principal-owner",
    roomId: room.roomId,
  });
  assert.ok(detail);

  const promotedRound = detail.rounds.find((item) => item.roundId === second.round.roundId);
  assert.ok(promotedRound);
  assert.equal(promotedRound.status, "running");
  assert.equal(promotedRound.startedAt, "2026-04-18T10:00:00.000Z");
});

test("promoteResolution 会创建 human-sourced work item 并回填 promotedWorkItemId", () => {
  const service = createFixtureService();
  const room = service.createRoom(createFixtureRoomPayload()).room;
  const resolutionDetail = service.createResolution({
    ownerPrincipalId: "principal-owner",
    resolution: {
      roomId: room.roomId,
      sourceMessageIds: [],
      title: "补 migration 重试",
      summary: "先补重试和告警，再重新发版。",
    },
  });
  assert.ok(resolutionDetail);

  const promoted = service.promoteResolution({
    ownerPrincipalId: "principal-owner",
    resolution: {
      roomId: room.roomId,
      resolutionId: resolutionDetail.resolutions[0]?.resolutionId ?? "",
      targetAgentId: resolutionDetail.participants.find((item) => item.agentId)?.agentId ?? "",
      dispatchReason: "会议结论落地",
      goal: "补 migration 重试和告警。",
    },
  });

  assert.ok(promoted);
  assert.equal(promoted.resolutions[0]?.status, "promoted");
  assert.ok(promoted.resolutions[0]?.promotedWorkItemId);
});

test("closeRoom 后不再允许继续创建结论或提升结论", () => {
  const service = createFixtureService();
  const room = service.createRoom(createFixtureRoomPayload()).room;
  const resolutionDetail = service.createResolution({
    ownerPrincipalId: "principal-owner",
    resolution: {
      roomId: room.roomId,
      sourceMessageIds: [],
      title: "补 migration 重试",
      summary: "先补重试和告警，再重新发版。",
    },
  });
  assert.ok(resolutionDetail?.resolutions[0]?.resolutionId);

  const closed = service.closeRoom({
    ownerPrincipalId: "principal-owner",
    room: {
      roomId: room.roomId,
      closingSummary: "本次会议已收口。",
    },
  });
  assert.equal(closed?.room.status, "closed");

  assert.throws(() => service.createResolution({
    ownerPrincipalId: "principal-owner",
    resolution: {
      roomId: room.roomId,
      sourceMessageIds: [],
      title: "关闭后新结论",
      summary: "不应成功。",
    },
  }), /已关闭/);
  assert.throws(() => service.promoteResolution({
    ownerPrincipalId: "principal-owner",
    resolution: {
      roomId: room.roomId,
      resolutionId: resolutionDetail?.resolutions[0]?.resolutionId ?? "",
      targetAgentId: "agent-backend",
    },
  }), /已关闭/);
});

test("terminateRoom 会冻结会议室、终止排队轮次，并阻止后续写入", () => {
  const service = createFixtureService();
  const room = service.createRoom(createFixtureRoomPayload()).room;

  const first = service.createManagerMessage({
    ownerPrincipalId: "principal-owner",
    message: {
      roomId: room.roomId,
      content: "先给出第一轮判断。",
      operatorPrincipalId: "principal-owner",
    },
  });
  assert.ok(first);

  const second = service.createManagerMessage({
    ownerPrincipalId: "principal-owner",
    message: {
      roomId: room.roomId,
      content: "第二轮补充收敛动作。",
      operatorPrincipalId: "principal-owner",
    },
  });
  assert.ok(second);
  assert.equal(second.round.status, "queued");

  const terminated = service.terminateRoom({
    ownerPrincipalId: "principal-owner",
    termination: {
      roomId: room.roomId,
      operatorPrincipalId: "principal-owner",
      terminationReason: "平台值班员判断当前会议进入异常循环。",
    },
  });
  assert.equal(terminated?.room.status, "terminated");
  assert.equal(terminated?.room.terminationReason, "平台值班员判断当前会议进入异常循环。");
  assert.equal(terminated?.rounds.every((round) => round.status === "failed"), true);
  assert.match(terminated?.messages.at(-1)?.content ?? "", /平台已终止会议/);

  assert.throws(() => service.createManagerMessage({
    ownerPrincipalId: "principal-owner",
    message: {
      roomId: room.roomId,
      content: "终止后不应再创建新讨论。",
      operatorPrincipalId: "principal-owner",
    },
  }), /已被平台终止/);
  assert.throws(() => service.createResolution({
    ownerPrincipalId: "principal-owner",
    resolution: {
      roomId: room.roomId,
      sourceMessageIds: [],
      title: "终止后新结论",
      summary: "不应成功。",
    },
  }), /已被平台终止/);
  assert.throws(() => service.closeRoom({
    ownerPrincipalId: "principal-owner",
    room: {
      roomId: room.roomId,
      closingSummary: "终止后不应再正常收口。",
    },
  }), /已被平台终止/);
});

function createFixtureService() {
  const ownerPrincipalId = "principal-owner";
  const controlPlaneService = createInMemoryPlatformControlPlaneService({
    now: () => "2026-04-18T09:50:00.000Z",
    generateOrganizationId: () => "org-platform",
    generatePrincipalId: () => "principal-agent",
    generateAgentId: () => "agent-backend",
  });
  const created = controlPlaneService.createAgent({
    ownerPrincipalId,
    agent: {
      organizationId: "org-platform",
      departmentRole: "后端工程",
      displayName: "后端·衡",
      mission: "负责服务端实现。",
    },
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService: createInMemoryPlatformNodeService({
      organizations: [created.organization],
    }),
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
  });
  workflowService.registerAgent({
    ownerPrincipalId,
    organization: created.organization,
    agent: created.agent,
  });

  return createInMemoryPlatformMeetingRoomService({
    controlPlaneService,
    workflowService,
    now: () => "2026-04-18T10:00:00.000Z",
    generateRoomId: () => "room-fixed",
    generateParticipantId: createSequenceFactory("participant"),
    generateRoundId: createSequenceFactory("round"),
    generateMessageId: createSequenceFactory("message"),
    generateResolutionId: createSequenceFactory("resolution"),
    generateArtifactRefId: createSequenceFactory("artifact-ref"),
  });
}

function createFixtureRoomPayload(): ManagedAgentPlatformMeetingRoomCreatePayload {
  return {
    ownerPrincipalId: "principal-owner",
    room: {
      title: "发布阻塞讨论",
      goal: "确认这次 prod 发布失败的根因。",
      operatorPrincipalId: "principal-owner",
      organizationId: "org-platform",
      participants: [{
        agentId: "agent-backend",
        entryMode: "blank",
      }],
    },
  };
}

function createSequenceFactory(prefix: string): () => string {
  let count = 0;
  return () => `${prefix}-${++count}`;
}
