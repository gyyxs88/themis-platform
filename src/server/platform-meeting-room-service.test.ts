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
