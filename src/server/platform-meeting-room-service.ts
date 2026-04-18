import type {
  ManagedAgentPlatformMeetingRoomAppendFailurePayload,
  ManagedAgentPlatformMeetingRoomAppendReplyPayload,
  ManagedAgentPlatformMeetingRoomAppendReplyResult,
  ManagedAgentPlatformMeetingRoomClosePayload,
  ManagedAgentPlatformMeetingRoomCloseResult,
  ManagedAgentPlatformMeetingRoomCreatePayload,
  ManagedAgentPlatformMeetingRoomCreateResolutionPayload,
  ManagedAgentPlatformMeetingRoomCreateResolutionResult,
  ManagedAgentPlatformMeetingRoomCreateResult,
  ManagedAgentPlatformMeetingRoomDetailPayload,
  ManagedAgentPlatformMeetingRoomDetailResult,
  ManagedAgentPlatformMeetingRoomListPayload,
  ManagedAgentPlatformMeetingRoomListResult,
  ManagedAgentPlatformMeetingRoomMessageCreatePayload,
  ManagedAgentPlatformMeetingRoomMessageCreateResult,
  ManagedAgentPlatformMeetingRoomParticipantsAddPayload,
  ManagedAgentPlatformMeetingRoomParticipantsAddResult,
  ManagedAgentPlatformMeetingRoomPromoteResolutionPayload,
  ManagedAgentPlatformMeetingRoomPromoteResolutionResult,
} from "themis-contracts/managed-agent-platform-meetings";
import type {
  ManagedAgentPlatformMeetingArtifactRefRecord,
  ManagedAgentPlatformMeetingMessageRecord,
  ManagedAgentPlatformMeetingParticipantRecord,
  ManagedAgentPlatformMeetingResolutionRecord,
  ManagedAgentPlatformMeetingRoomRecord,
  ManagedAgentPlatformMeetingRoundRecord,
} from "themis-contracts/managed-agent-platform-shared";
import type { PlatformControlPlaneService } from "./platform-control-plane-service.js";
import type { PlatformWorkflowService } from "./platform-workflow-service.js";

export interface PlatformMeetingRoomServiceSnapshot {
  rooms: ManagedAgentPlatformMeetingRoomRecord[];
  participants: ManagedAgentPlatformMeetingParticipantRecord[];
  rounds: ManagedAgentPlatformMeetingRoundRecord[];
  messages: ManagedAgentPlatformMeetingMessageRecord[];
  resolutions: ManagedAgentPlatformMeetingResolutionRecord[];
  artifactRefs: ManagedAgentPlatformMeetingArtifactRefRecord[];
}

export interface PlatformMeetingRoomService {
  listRooms(payload: ManagedAgentPlatformMeetingRoomListPayload): ManagedAgentPlatformMeetingRoomListResult;
  getRoomDetail(payload: ManagedAgentPlatformMeetingRoomDetailPayload): ManagedAgentPlatformMeetingRoomDetailResult | null;
  createRoom(payload: ManagedAgentPlatformMeetingRoomCreatePayload): ManagedAgentPlatformMeetingRoomCreateResult;
  addParticipants(payload: ManagedAgentPlatformMeetingRoomParticipantsAddPayload): ManagedAgentPlatformMeetingRoomParticipantsAddResult | null;
  createManagerMessage(payload: ManagedAgentPlatformMeetingRoomMessageCreatePayload): ManagedAgentPlatformMeetingRoomMessageCreateResult | null;
  appendAgentReply(payload: ManagedAgentPlatformMeetingRoomAppendReplyPayload): ManagedAgentPlatformMeetingRoomAppendReplyResult | null;
  appendAgentFailure(payload: ManagedAgentPlatformMeetingRoomAppendFailurePayload): ManagedAgentPlatformMeetingRoomAppendReplyResult | null;
  createResolution(payload: ManagedAgentPlatformMeetingRoomCreateResolutionPayload): ManagedAgentPlatformMeetingRoomCreateResolutionResult | null;
  promoteResolution(payload: ManagedAgentPlatformMeetingRoomPromoteResolutionPayload): ManagedAgentPlatformMeetingRoomPromoteResolutionResult | null;
  closeRoom(payload: ManagedAgentPlatformMeetingRoomClosePayload): ManagedAgentPlatformMeetingRoomCloseResult | null;
}

export interface SnapshotCapablePlatformMeetingRoomService extends PlatformMeetingRoomService {
  exportSnapshot(): PlatformMeetingRoomServiceSnapshot;
  replaceSnapshot(snapshot: PlatformMeetingRoomServiceSnapshot): void;
}

export interface CreateInMemoryPlatformMeetingRoomServiceOptions {
  controlPlaneService: PlatformControlPlaneService;
  workflowService: PlatformWorkflowService;
  snapshot?: PlatformMeetingRoomServiceSnapshot;
  now?: () => string;
  generateRoomId?: () => string;
  generateParticipantId?: () => string;
  generateRoundId?: () => string;
  generateMessageId?: () => string;
  generateResolutionId?: () => string;
  generateArtifactRefId?: () => string;
}

export function createInMemoryPlatformMeetingRoomService(
  options: CreateInMemoryPlatformMeetingRoomServiceOptions,
): SnapshotCapablePlatformMeetingRoomService {
  const ACTIVE_WORK_CONTEXT_STATUSES = new Set([
    "waiting_human",
    "waiting_agent",
    "waiting_action",
    "running",
    "starting",
    "planning",
    "queued",
  ]);
  const now = options.now ?? (() => new Date().toISOString());
  const rooms = new Map<string, ManagedAgentPlatformMeetingRoomRecord>();
  const participants = new Map<string, ManagedAgentPlatformMeetingParticipantRecord>();
  const rounds = new Map<string, ManagedAgentPlatformMeetingRoundRecord>();
  const messages = new Map<string, ManagedAgentPlatformMeetingMessageRecord>();
  const resolutions = new Map<string, ManagedAgentPlatformMeetingResolutionRecord>();
  const artifactRefs = new Map<string, ManagedAgentPlatformMeetingArtifactRefRecord>();
  let generatedRoomCount = 0;
  let generatedParticipantCount = 0;
  let generatedRoundCount = 0;
  let generatedMessageCount = 0;
  let generatedResolutionCount = 0;
  let generatedArtifactRefCount = 0;

  const nextRoomId = () => options.generateRoomId?.() ?? `meeting-room-${++generatedRoomCount}`;
  const nextParticipantId = () => options.generateParticipantId?.() ?? `meeting-participant-${++generatedParticipantCount}`;
  const nextRoundId = () => options.generateRoundId?.() ?? `meeting-round-${++generatedRoundCount}`;
  const nextMessageId = () => options.generateMessageId?.() ?? `meeting-message-${++generatedMessageCount}`;
  const nextResolutionId = () => options.generateResolutionId?.() ?? `meeting-resolution-${++generatedResolutionCount}`;
  const nextArtifactRefId = () => options.generateArtifactRefId?.() ?? `meeting-artifact-ref-${++generatedArtifactRefCount}`;

  const replaceSnapshot = (snapshot: PlatformMeetingRoomServiceSnapshot) => {
    rooms.clear();
    participants.clear();
    rounds.clear();
    messages.clear();
    resolutions.clear();
    artifactRefs.clear();

    for (const room of snapshot.rooms) {
      rooms.set(room.roomId, cloneValue(room));
    }
    for (const participant of snapshot.participants) {
      participants.set(participant.participantId, cloneValue(participant));
    }
    for (const round of snapshot.rounds) {
      rounds.set(round.roundId, cloneValue(round));
    }
    for (const message of snapshot.messages) {
      messages.set(message.messageId, cloneValue(message));
    }
    for (const resolution of snapshot.resolutions) {
      resolutions.set(resolution.resolutionId, cloneValue(resolution));
    }
    for (const artifactRef of snapshot.artifactRefs) {
      artifactRefs.set(artifactRef.artifactRefId, cloneValue(artifactRef));
    }
  };

  if (options.snapshot) {
    replaceSnapshot(options.snapshot);
  }

  const listRoomParticipants = (roomId: string) => (
    Array.from(participants.values())
      .filter((participant) => participant.roomId === roomId)
      .sort(compareTimestampAsc)
  );

  const listRoomRounds = (roomId: string) => (
    Array.from(rounds.values())
      .filter((round) => round.roomId === roomId)
      .sort(compareTimestampAsc)
  );

  const listRoomMessages = (roomId: string) => (
    Array.from(messages.values())
      .filter((message) => message.roomId === roomId)
      .sort(compareTimestampAsc)
  );

  const listRoomResolutions = (roomId: string) => (
    Array.from(resolutions.values())
      .filter((resolution) => resolution.roomId === roomId)
      .sort(compareTimestampAsc)
  );

  const listRoomArtifactRefs = (roomId: string) => (
    Array.from(artifactRefs.values())
      .filter((artifactRef) => artifactRef.roomId === roomId)
      .sort(compareTimestampAsc)
  );

  const listManagedAgentParticipants = (roomId: string) => listRoomParticipants(roomId)
    .filter((participant) => participant.participantKind === "managed_agent" && !participant.leftAt);

  const getOwnedRoom = (ownerPrincipalId: string, roomId: string): ManagedAgentPlatformMeetingRoomRecord | null => {
    const room = rooms.get(normalizeText(roomId));
    if (!room) {
      return null;
    }
    return room.ownerPrincipalId === normalizeText(ownerPrincipalId) ? room : null;
  };

  const buildRoomDetail = (roomId: string): ManagedAgentPlatformMeetingRoomDetailResult | null => {
    const room = rooms.get(roomId);
    if (!room) {
      return null;
    }
    return {
      room: cloneValue(room),
      participants: listRoomParticipants(roomId).map(cloneValue),
      rounds: listRoomRounds(roomId).map(cloneValue),
      messages: listRoomMessages(roomId).map(cloneValue),
      resolutions: listRoomResolutions(roomId).map(cloneValue),
      artifactRefs: listRoomArtifactRefs(roomId).map(cloneValue),
    };
  };

  const touchRoom = (room: ManagedAgentPlatformMeetingRoomRecord, timestamp: string) => {
    const nextRoom = {
      ...room,
      updatedAt: timestamp,
    } satisfies ManagedAgentPlatformMeetingRoomRecord;
    rooms.set(room.roomId, nextRoom);
    return nextRoom;
  };

  const createThemisParticipant = (
    roomId: string,
    ownerPrincipalId: string,
    timestamp: string,
  ): ManagedAgentPlatformMeetingParticipantRecord => ({
    participantId: nextParticipantId(),
    roomId,
    participantKind: "themis",
    principalId: normalizeText(ownerPrincipalId),
    displayName: "Themis",
    roomRole: "host",
    entryMode: "blank",
    joinedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const buildActiveWorkContextSnapshot = (
    ownerPrincipalId: string,
    agentId: string,
    displayName: string,
    timestamp: string,
  ) => {
    const workItems = options.workflowService.listWorkItems({
      ownerPrincipalId,
      agentId,
    }).workItems ?? [];
    const activeWorkItem = workItems.find((workItem) => ACTIVE_WORK_CONTEXT_STATUSES.has(String(workItem.status ?? "")));

    if (!activeWorkItem) {
      return {
        mode: "active_work_context",
        generatedAt: timestamp,
        agentId,
        displayName,
        currentWorkItem: null,
        note: "当前没有进行中或等待中的工作项。",
      };
    }

    const detail = options.workflowService.getWorkItemDetail({
      ownerPrincipalId,
      workItemId: activeWorkItem.workItemId,
    });

    if (!detail) {
      return {
        mode: "active_work_context",
        generatedAt: timestamp,
        agentId,
        displayName,
        currentWorkItem: null,
        note: `当前工作项 ${activeWorkItem.workItemId} 详情暂不可读。`,
      };
    }

    return {
      mode: "active_work_context",
      generatedAt: timestamp,
      agentId,
      displayName,
      currentWorkItem: {
        workItemId: detail.workItem.workItemId,
        status: detail.workItem.status,
        priority: detail.workItem.priority,
        sourceType: detail.workItem.sourceType,
        dispatchReason: normalizeOptionalText(String(detail.workItem.dispatchReason ?? "")),
        goal: detail.workItem.goal,
        waitingFor: detail.workItem.waitingFor ?? null,
        projectId: detail.workItem.projectId ?? null,
        latestWaitingMessage: normalizeOptionalText(String(detail.workItem.latestWaitingMessage ?? "")),
        latestHumanResponse: normalizeOptionalText(String(detail.workItem.latestHumanResponse ?? "")),
        waitingActionRequest: Object.prototype.hasOwnProperty.call(detail.workItem, "waitingActionRequest")
          ? cloneValue(detail.workItem.waitingActionRequest)
          : null,
        latestHandoffSummary: normalizeOptionalText(String(detail.workItem.latestHandoffSummary ?? "")),
        updatedAt: detail.workItem.updatedAt,
      },
      ...(detail.parentWorkItem
        ? {
            parentWorkItem: {
              workItemId: detail.parentWorkItem.workItemId,
              goal: detail.parentWorkItem.goal,
              status: detail.parentWorkItem.status,
            },
          }
        : {}),
      ...(Array.isArray(detail.childWorkItems) && detail.childWorkItems.length > 0
        ? {
            childWorkItems: detail.childWorkItems.slice(0, 3).map((workItem) => ({
              workItemId: workItem.workItemId,
              goal: workItem.goal,
              status: workItem.status,
            })),
          }
        : {}),
      ...(Array.isArray(detail.runs) && detail.runs.length > 0
        ? {
            latestRun: {
              runId: detail.runs[0]?.runId,
              status: detail.runs[0]?.status,
              updatedAt: detail.runs[0]?.updatedAt,
            },
          }
        : {}),
      ...(detail.latestHandoff
        ? {
            latestHandoff: {
              handoffId: detail.latestHandoff.handoffId,
              summary: normalizeOptionalText(String(detail.latestHandoff.summary ?? "")),
              blockers: Array.isArray(detail.latestHandoff.blockers)
                ? detail.latestHandoff.blockers.map((item) => String(item))
                : [],
              recommendedNextActions: Array.isArray(detail.latestHandoff.recommendedNextActions)
                ? detail.latestHandoff.recommendedNextActions.map((item) => String(item))
                : [],
              updatedAt: detail.latestHandoff.updatedAt,
            },
          }
        : {}),
    };
  };

  const buildSelectedContextSnapshot = (
    selectedArtifactRefs: NonNullable<ManagedAgentPlatformMeetingRoomCreatePayload["room"]["participants"]>[number]["selectedArtifactRefs"],
    timestamp: string,
  ) => ({
    mode: "selected_context",
    generatedAt: timestamp,
    selectedArtifactRefs: (selectedArtifactRefs ?? []).map((artifactRef) => ({
      refType: artifactRef.refType,
      refId: artifactRef.refId,
      ...(Object.prototype.hasOwnProperty.call(artifactRef, "snapshotJson")
        ? { snapshotJson: cloneValue(artifactRef.snapshotJson) }
        : {}),
    })),
  });

  const buildParticipantEntryContextSnapshot = (
    ownerPrincipalId: string,
    agentId: string,
    displayName: string,
    entryMode: ManagedAgentPlatformMeetingParticipantRecord["entryMode"],
    selectedArtifactRefs: NonNullable<ManagedAgentPlatformMeetingRoomCreatePayload["room"]["participants"]>[number]["selectedArtifactRefs"],
    timestamp: string,
  ) => {
    if (entryMode === "active_work_context") {
      return buildActiveWorkContextSnapshot(ownerPrincipalId, agentId, displayName, timestamp);
    }

    if (entryMode === "selected_context") {
      return buildSelectedContextSnapshot(selectedArtifactRefs, timestamp);
    }

    return null;
  };

  const addParticipantRecords = (
    ownerPrincipalId: string,
    roomId: string,
    organizationId: string,
    requestedParticipants: ManagedAgentPlatformMeetingRoomCreatePayload["room"]["participants"],
    timestamp: string,
  ): ManagedAgentPlatformMeetingParticipantRecord[] => {
    const added: ManagedAgentPlatformMeetingParticipantRecord[] = [];

    for (const requestedParticipant of requestedParticipants ?? []) {
      const agentId = normalizeOptionalText(requestedParticipant?.agentId);
      if (!agentId) {
        continue;
      }

      const existing = listManagedAgentParticipants(roomId)
        .find((participant) => participant.agentId === agentId);
      if (existing) {
        continue;
      }

      const agentDetail = options.controlPlaneService.getAgentDetail({
        ownerPrincipalId,
        agentId,
      });
      if (!agentDetail || agentDetail.organization.organizationId !== organizationId) {
        continue;
      }

      const entryMode = requestedParticipant.entryMode
        ?? ((requestedParticipant.selectedArtifactRefs?.length ?? 0) > 0 ? "selected_context" : "blank");
      const selectedArtifactRefs = requestedParticipant.selectedArtifactRefs?.map(cloneValue) ?? [];
      const entryContextSnapshotJson = buildParticipantEntryContextSnapshot(
        ownerPrincipalId,
        agentDetail.agent.agentId,
        agentDetail.agent.displayName,
        entryMode,
        selectedArtifactRefs,
        timestamp,
      );
      const participant: ManagedAgentPlatformMeetingParticipantRecord = {
        participantId: nextParticipantId(),
        roomId,
        participantKind: "managed_agent",
        principalId: agentDetail.principal.principalId,
        agentId: agentDetail.agent.agentId,
        displayName: agentDetail.agent.displayName,
        roomRole: "participant",
        entryMode,
        ...(entryContextSnapshotJson ? { entryContextSnapshotJson } : {}),
        roomSessionId: `meeting-room:${roomId}:participant:${agentDetail.agent.agentId}`,
        joinedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      participants.set(participant.participantId, participant);
      added.push(participant);

      for (const selectedArtifactRef of selectedArtifactRefs) {
        const artifactRef: ManagedAgentPlatformMeetingArtifactRefRecord = {
          artifactRefId: nextArtifactRefId(),
          roomId,
          participantId: participant.participantId,
          refType: selectedArtifactRef.refType,
          refId: selectedArtifactRef.refId,
          ...(Object.prototype.hasOwnProperty.call(selectedArtifactRef, "snapshotJson")
            ? { snapshotJson: cloneValue(selectedArtifactRef.snapshotJson) }
            : {}),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        artifactRefs.set(artifactRef.artifactRefId, artifactRef);
      }
    }

    return added;
  };

  const findOwnedOrganization = (ownerPrincipalId: string, organizationId: string) => {
    const organizations = options.controlPlaneService.listAgents({ ownerPrincipalId }).organizations;
    return organizations.find((organization) => organization.organizationId === normalizeText(organizationId)) ?? null;
  };

  const createRoundRecord = (
    roomId: string,
    triggerMessageId: string,
    targetParticipantIds: string[],
    timestamp: string,
    shouldQueue = false,
  ): ManagedAgentPlatformMeetingRoundRecord => {
    const normalizedTargetParticipantIds = uniqueValues(targetParticipantIds.map(normalizeText));
    const baseRound: ManagedAgentPlatformMeetingRoundRecord = {
      roundId: nextRoundId(),
      roomId,
      triggerMessageId,
      status: normalizedTargetParticipantIds.length > 0
        ? (shouldQueue ? "queued" : "running")
        : "completed",
      targetParticipantIds: normalizedTargetParticipantIds,
      respondedParticipantIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (normalizedTargetParticipantIds.length === 0) {
      return {
        ...baseRound,
        completedAt: timestamp,
      };
    }

    return {
      ...baseRound,
      ...(shouldQueue ? {} : { startedAt: timestamp }),
    };
  };

  const finalizeRoundIfReady = (
    round: ManagedAgentPlatformMeetingRoundRecord,
    timestamp: string,
  ): ManagedAgentPlatformMeetingRoundRecord => {
    if (round.respondedParticipantIds.length < round.targetParticipantIds.length) {
      return round;
    }

    if (round.status === "failed") {
      return {
        ...round,
        completedAt: round.completedAt ?? timestamp,
        updatedAt: timestamp,
      };
    }

    return {
      ...round,
      status: "completed",
      completedAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const activateNextQueuedRound = (
    roomId: string,
    timestamp: string,
  ): ManagedAgentPlatformMeetingRoundRecord | null => {
    const nextQueuedRound = listRoomRounds(roomId)
      .find((round) => round.status === "queued");
    if (!nextQueuedRound) {
      return null;
    }

    const promotedRound: ManagedAgentPlatformMeetingRoundRecord = {
      ...nextQueuedRound,
      status: "running",
      startedAt: nextQueuedRound.startedAt ?? timestamp,
      updatedAt: timestamp,
    };
    rounds.set(promotedRound.roundId, promotedRound);
    return promotedRound;
  };

  return {
    exportSnapshot() {
      return {
        rooms: Array.from(rooms.values()).map(cloneValue),
        participants: Array.from(participants.values()).map(cloneValue),
        rounds: Array.from(rounds.values()).map(cloneValue),
        messages: Array.from(messages.values()).map(cloneValue),
        resolutions: Array.from(resolutions.values()).map(cloneValue),
        artifactRefs: Array.from(artifactRefs.values()).map(cloneValue),
      };
    },

    replaceSnapshot,

    listRooms(payload) {
      const ownerPrincipalId = normalizeText(payload.ownerPrincipalId);
      return {
        rooms: Array.from(rooms.values())
          .filter((room) => room.ownerPrincipalId === ownerPrincipalId)
          .filter((room) => !payload.status || room.status === payload.status)
          .sort(compareTimestampDesc)
          .map(cloneValue),
      };
    },

    getRoomDetail(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.roomId);
      return room ? buildRoomDetail(room.roomId) : null;
    },

    createRoom(payload) {
      const ownerPrincipalId = normalizeText(payload.ownerPrincipalId);
      const organization = findOwnedOrganization(ownerPrincipalId, payload.room.organizationId);
      if (!organization) {
        throw new Error(`Organization ${payload.room.organizationId} is not available to ${ownerPrincipalId}.`);
      }

      const timestamp = now();
      const roomId = nextRoomId();
      const room: ManagedAgentPlatformMeetingRoomRecord = {
        roomId,
        ownerPrincipalId,
        organizationId: organization.organizationId,
        title: normalizeText(payload.room.title),
        goal: normalizeText(payload.room.goal),
        status: "open",
        discussionMode: payload.room.discussionMode ?? "moderated",
        createdByOperatorPrincipalId: normalizeText(payload.room.operatorPrincipalId),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      rooms.set(roomId, room);

      const themisParticipant = createThemisParticipant(roomId, ownerPrincipalId, timestamp);
      participants.set(themisParticipant.participantId, themisParticipant);
      addParticipantRecords(
        ownerPrincipalId,
        roomId,
        organization.organizationId,
        payload.room.participants,
        timestamp,
      );

      return buildRoomDetail(roomId)!;
    },

    addParticipants(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.roomId);
      if (!room) {
        return null;
      }

      const timestamp = now();
      addParticipantRecords(
        payload.ownerPrincipalId,
        room.roomId,
        room.organizationId,
        payload.participants,
        timestamp,
      );
      touchRoom(room, timestamp);
      return buildRoomDetail(room.roomId);
    },

    createManagerMessage(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.message.roomId);
      if (!room || room.status === "closed") {
        return null;
      }

      const timestamp = now();
      const targetParticipantIds = payload.message.targetParticipantIds?.map(normalizeText) ?? [];
      const targetParticipants = (targetParticipantIds.length > 0
        ? listManagedAgentParticipants(room.roomId).filter((participant) => targetParticipantIds.includes(participant.participantId))
        : listManagedAgentParticipants(room.roomId)
      );
      const message: ManagedAgentPlatformMeetingMessageRecord = {
        messageId: nextMessageId(),
        roomId: room.roomId,
        speakerType: "themis",
        speakerPrincipalId: normalizeText(payload.ownerPrincipalId),
        operatorPrincipalId: normalizeText(payload.message.operatorPrincipalId),
        audience: payload.message.audience ?? (targetParticipantIds.length > 0 ? "selected_participants" : "all_participants"),
        ...(targetParticipantIds.length > 0 ? { visibleParticipantIds: targetParticipantIds } : {}),
        content: payload.message.content,
        messageKind: "message",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      messages.set(message.messageId, message);

      const round = createRoundRecord(
        room.roomId,
        message.messageId,
        targetParticipants.map((participant) => participant.participantId),
        timestamp,
        listRoomRounds(room.roomId).some((item) => !item.completedAt && item.respondedParticipantIds.length < item.targetParticipantIds.length),
      );
      rounds.set(round.roundId, round);
      const nextRoom = touchRoom(room, timestamp);

      return {
        room: cloneValue(nextRoom),
        message: cloneValue(message),
        round: cloneValue(round),
        targetParticipants: targetParticipants.map(cloneValue),
      };
    },

    appendAgentReply(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.reply.roomId);
      if (!room) {
        return null;
      }

      const round = rounds.get(normalizeText(payload.reply.roundId));
      const participant = participants.get(normalizeText(payload.reply.participantId));
      if (!round || !participant || round.roomId !== room.roomId || participant.roomId !== room.roomId) {
        return null;
      }
      if (participant.participantKind !== "managed_agent") {
        return null;
      }
      if (!round.targetParticipantIds.includes(participant.participantId)) {
        return null;
      }

      const timestamp = now();
      const message: ManagedAgentPlatformMeetingMessageRecord = {
        messageId: nextMessageId(),
        roomId: room.roomId,
        roundId: round.roundId,
        speakerType: "managed_agent",
        speakerPrincipalId: participant.principalId,
        speakerAgentId: participant.agentId ?? null,
        audience: "all_participants",
        content: payload.reply.content,
        messageKind: "message",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      messages.set(message.messageId, message);

      const nextRound = finalizeRoundIfReady({
        ...round,
        status: round.status === "failed" ? round.status : "running",
        startedAt: round.startedAt ?? timestamp,
        respondedParticipantIds: uniqueValues([...round.respondedParticipantIds, participant.participantId]),
        updatedAt: timestamp,
      }, timestamp);
      rounds.set(nextRound.roundId, nextRound);
      if (nextRound.respondedParticipantIds.length >= nextRound.targetParticipantIds.length) {
        activateNextQueuedRound(room.roomId, timestamp);
      }
      const nextRoom = touchRoom(room, timestamp);

      return {
        room: cloneValue(nextRoom),
        round: cloneValue(nextRound),
        message: cloneValue(message),
      };
    },

    appendAgentFailure(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.failure.roomId);
      if (!room) {
        return null;
      }

      const round = rounds.get(normalizeText(payload.failure.roundId));
      const participant = participants.get(normalizeText(payload.failure.participantId));
      if (!round || !participant || round.roomId !== room.roomId || participant.roomId !== room.roomId) {
        return null;
      }
      if (participant.participantKind !== "managed_agent") {
        return null;
      }

      const timestamp = now();
      const message: ManagedAgentPlatformMeetingMessageRecord = {
        messageId: nextMessageId(),
        roomId: room.roomId,
        roundId: round.roundId,
        speakerType: "system",
        speakerAgentId: participant.agentId ?? null,
        audience: "themis_only",
        content: payload.failure.failureMessage,
        messageKind: "error",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      messages.set(message.messageId, message);

      const nextRound: ManagedAgentPlatformMeetingRoundRecord = {
        ...finalizeRoundIfReady({
          ...round,
          status: "failed",
          startedAt: round.startedAt ?? timestamp,
          respondedParticipantIds: uniqueValues([...round.respondedParticipantIds, participant.participantId]),
          failureMessage: payload.failure.failureMessage,
          updatedAt: timestamp,
        }, timestamp),
      };
      rounds.set(nextRound.roundId, nextRound);
      if (nextRound.respondedParticipantIds.length >= nextRound.targetParticipantIds.length) {
        activateNextQueuedRound(room.roomId, timestamp);
      }
      const nextRoom = touchRoom(room, timestamp);

      return {
        room: cloneValue(nextRoom),
        round: cloneValue(nextRound),
        message: cloneValue(message),
      };
    },

    createResolution(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.resolution.roomId);
      if (!room || room.status === "closed") {
        return null;
      }

      const timestamp = now();
      const resolution: ManagedAgentPlatformMeetingResolutionRecord = {
        resolutionId: nextResolutionId(),
        roomId: room.roomId,
        sourceMessageIds: payload.resolution.sourceMessageIds.map(normalizeText),
        title: normalizeText(payload.resolution.title),
        summary: normalizeText(payload.resolution.summary),
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      resolutions.set(resolution.resolutionId, resolution);
      touchRoom(room, timestamp);
      return buildRoomDetail(room.roomId);
    },

    promoteResolution(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.resolution.roomId);
      if (!room || room.status === "closed") {
        return null;
      }

      const resolutionId = normalizeText(payload.resolution.resolutionId);
      const resolution = resolutions.get(resolutionId);
      if (!resolution || resolution.roomId !== room.roomId) {
        return null;
      }

      const dispatchResult = options.workflowService.dispatchWorkItem({
        ownerPrincipalId: payload.ownerPrincipalId,
        workItem: {
          targetAgentId: normalizeText(payload.resolution.targetAgentId),
          sourceType: "human",
          dispatchReason: payload.resolution.dispatchReason
            ?? `会议室 ${room.title} / ${resolution.title}`,
          goal: payload.resolution.goal ?? resolution.summary,
        },
      });

      const timestamp = now();
      const nextResolution: ManagedAgentPlatformMeetingResolutionRecord = {
        ...resolution,
        status: "promoted",
        promotedWorkItemId: dispatchResult.workItem.workItemId,
        updatedAt: timestamp,
      };
      resolutions.set(nextResolution.resolutionId, nextResolution);
      touchRoom(room, timestamp);
      return buildRoomDetail(room.roomId);
    },

    closeRoom(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.room.roomId);
      if (!room || room.status === "closed") {
        return null;
      }

      const timestamp = now();
      const nextRoom: ManagedAgentPlatformMeetingRoomRecord = {
        ...room,
        status: "closed",
        closedAt: timestamp,
        closingSummary: normalizeText(payload.room.closingSummary),
        updatedAt: timestamp,
      };
      rooms.set(nextRoom.roomId, nextRoom);
      return buildRoomDetail(nextRoom.roomId);
    },
  };
}

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function compareTimestampAsc(
  left: { createdAt: string; updatedAt: string },
  right: { createdAt: string; updatedAt: string },
): number {
  return left.createdAt.localeCompare(right.createdAt) || left.updatedAt.localeCompare(right.updatedAt);
}

function compareTimestampDesc(
  left: { createdAt: string; updatedAt: string },
  right: { createdAt: string; updatedAt: string },
): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
