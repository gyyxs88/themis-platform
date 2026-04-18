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
      const participant: ManagedAgentPlatformMeetingParticipantRecord = {
        participantId: nextParticipantId(),
        roomId,
        participantKind: "managed_agent",
        principalId: agentDetail.principal.principalId,
        agentId: agentDetail.agent.agentId,
        displayName: agentDetail.agent.displayName,
        roomRole: "participant",
        entryMode,
        ...(selectedArtifactRefs.length > 0
          ? { entryContextSnapshotJson: { selectedArtifactRefs } }
          : {}),
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
  ): ManagedAgentPlatformMeetingRoundRecord => {
    const normalizedTargetParticipantIds = uniqueValues(targetParticipantIds.map(normalizeText));
    const baseRound: ManagedAgentPlatformMeetingRoundRecord = {
      roundId: nextRoundId(),
      roomId,
      triggerMessageId,
      status: normalizedTargetParticipantIds.length > 0 ? "queued" : "completed",
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
      status: "running",
      startedAt: timestamp,
    };
  };

  const completeRoundIfReady = (
    round: ManagedAgentPlatformMeetingRoundRecord,
    timestamp: string,
  ): ManagedAgentPlatformMeetingRoundRecord => {
    if (round.status === "failed") {
      return round;
    }

    if (round.respondedParticipantIds.length < round.targetParticipantIds.length) {
      return round;
    }

    return {
      ...round,
      status: "completed",
      completedAt: timestamp,
      updatedAt: timestamp,
    };
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

      const nextRound = completeRoundIfReady({
        ...round,
        status: round.status === "failed" ? round.status : "running",
        startedAt: round.startedAt ?? timestamp,
        respondedParticipantIds: uniqueValues([...round.respondedParticipantIds, participant.participantId]),
        updatedAt: timestamp,
      }, timestamp);
      rounds.set(nextRound.roundId, nextRound);
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
        ...round,
        status: "failed",
        startedAt: round.startedAt ?? timestamp,
        respondedParticipantIds: uniqueValues([...round.respondedParticipantIds, participant.participantId]),
        failureMessage: payload.failure.failureMessage,
        updatedAt: timestamp,
      };
      rounds.set(nextRound.roundId, nextRound);
      const nextRoom = touchRoom(room, timestamp);

      return {
        room: cloneValue(nextRoom),
        round: cloneValue(nextRound),
        message: cloneValue(message),
      };
    },

    createResolution(payload) {
      const room = getOwnedRoom(payload.ownerPrincipalId, payload.resolution.roomId);
      if (!room) {
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
      if (!room) {
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
      if (!room) {
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
