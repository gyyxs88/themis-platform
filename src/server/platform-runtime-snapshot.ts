import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  PlatformCollaborationService,
} from "./platform-collaboration-service.js";
import type {
  SnapshotCapablePlatformControlPlaneService,
  PlatformControlPlaneServiceSnapshot,
} from "./platform-control-plane-service.js";
import type {
  SnapshotCapablePlatformNodeService,
  PlatformNodeServiceSnapshot,
} from "./platform-node-service.js";
import type {
  SnapshotCapablePlatformWorkerRunService,
  PlatformWorkerRunServiceSnapshot,
} from "./platform-worker-run-service.js";
import type {
  SnapshotCapablePlatformWorkflowService,
  PlatformWorkflowServiceSnapshot,
} from "./platform-workflow-service.js";
import type {
  SnapshotCapablePlatformMeetingRoomService,
  PlatformMeetingRoomServiceSnapshot,
} from "./platform-meeting-room-service.js";

export interface PlatformRuntimeSnapshot {
  version: 1;
  savedAt: string;
  nodeService: PlatformNodeServiceSnapshot;
  controlPlaneService: PlatformControlPlaneServiceSnapshot;
  workerRunService: PlatformWorkerRunServiceSnapshot;
  workflowService: PlatformWorkflowServiceSnapshot;
  meetingRoomService: PlatformMeetingRoomServiceSnapshot;
}

export interface PlatformRuntimeSnapshotServices {
  nodeService: SnapshotCapablePlatformNodeService;
  controlPlaneService: SnapshotCapablePlatformControlPlaneService;
  workerRunService: SnapshotCapablePlatformWorkerRunService;
  workflowService: SnapshotCapablePlatformWorkflowService;
  meetingRoomService: SnapshotCapablePlatformMeetingRoomService;
}

export interface RestorablePlatformRuntimeSnapshotServices extends PlatformRuntimeSnapshotServices {
  collaborationService: PlatformCollaborationService;
}

export function exportPlatformRuntimeSnapshot(
  services: PlatformRuntimeSnapshotServices,
  now: () => string = () => new Date().toISOString(),
): PlatformRuntimeSnapshot {
  return {
    version: 1,
    savedAt: now(),
    nodeService: services.nodeService.exportSnapshot(),
    controlPlaneService: services.controlPlaneService.exportSnapshot(),
    workerRunService: services.workerRunService.exportSnapshot(),
    workflowService: services.workflowService.exportSnapshot(),
    meetingRoomService: services.meetingRoomService.exportSnapshot(),
  };
}

export function applyPlatformRuntimeSnapshot(
  services: RestorablePlatformRuntimeSnapshotServices,
  snapshot: PlatformRuntimeSnapshot,
): void {
  services.nodeService.replaceSnapshot(snapshot.nodeService);
  services.controlPlaneService.replaceSnapshot(snapshot.controlPlaneService);
  services.workerRunService.replaceSnapshot(snapshot.workerRunService);
  services.workflowService.replaceSnapshot(snapshot.workflowService);
  services.meetingRoomService.replaceSnapshot(snapshot.meetingRoomService);
  services.collaborationService.replaceSeeds({
    parentSeeds: snapshot.workflowService.parentSeeds,
    handoffSeeds: snapshot.workflowService.handoffSeeds,
  });
}

export function createEmptyPlatformRuntimeSnapshot(
  now: () => string = () => new Date().toISOString(),
): PlatformRuntimeSnapshot {
  return {
    version: 1,
    savedAt: now(),
    nodeService: {
      organizations: [],
      nodes: [],
    },
    controlPlaneService: {
      owners: [],
    },
    workerRunService: {
      assignedRuns: [],
    },
    workflowService: {
      agentSeeds: [],
      workItemSeeds: [],
      mailboxSeeds: [],
      parentSeeds: [],
      handoffSeeds: [],
    },
    meetingRoomService: {
      rooms: [],
      participants: [],
      rounds: [],
      messages: [],
      resolutions: [],
      artifactRefs: [],
    },
  };
}

export function hasPlatformRuntimeSnapshotData(snapshot: PlatformRuntimeSnapshot | null | undefined): boolean {
  if (!snapshot || snapshot.version !== 1) {
    return false;
  }

  return snapshot.nodeService.organizations.length > 0
    || snapshot.nodeService.nodes.length > 0
    || snapshot.controlPlaneService.owners.length > 0
    || snapshot.workerRunService.assignedRuns.length > 0
    || snapshot.workflowService.agentSeeds.length > 0
    || snapshot.workflowService.workItemSeeds.length > 0
    || snapshot.workflowService.mailboxSeeds.length > 0
    || snapshot.workflowService.parentSeeds.length > 0
    || snapshot.workflowService.handoffSeeds.length > 0
    || snapshot.meetingRoomService.rooms.length > 0
    || snapshot.meetingRoomService.participants.length > 0
    || snapshot.meetingRoomService.rounds.length > 0
    || snapshot.meetingRoomService.messages.length > 0
    || snapshot.meetingRoomService.resolutions.length > 0
    || snapshot.meetingRoomService.artifactRefs.length > 0;
}

export function loadPlatformRuntimeSnapshotFile(filePath: string): PlatformRuntimeSnapshot | null {
  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content) as PlatformRuntimeSnapshot;

    if (!parsed || parsed.version !== 1) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (isFileMissing(error)) {
      return null;
    }

    throw error;
  }
}

export function savePlatformRuntimeSnapshotFile(filePath: string, snapshot: PlatformRuntimeSnapshot): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempFilePath = `${filePath}.tmp`;
  writeFileSync(tempFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  renameSync(tempFilePath, filePath);
}

function isFileMissing(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT";
}
