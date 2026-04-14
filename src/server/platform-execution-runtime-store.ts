import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  ManagedAgentPlatformWorkerAssignedRunResult,
  ManagedAgentPlatformWorkerCompletionResult,
  ManagedAgentPlatformWorkerRunStatusPayload,
  ManagedAgentPlatformWorkerWaitingActionPayload,
} from "themis-contracts/managed-agent-platform-worker";

const ASSIGNED_RUN_FILE_NAME = "assigned-run.json";
const STATE_FILE_NAME = "state.json";
const EVENTS_FILE_NAME = "events.ndjson";

export type PlatformExecutionRuntimeEventKind = "assigned" | "status" | "completed" | "reclaimed";

export interface PlatformExecutionRuntimeState {
  version: 1;
  ownerPrincipalId: string;
  organizationId: string;
  runId: string;
  workItemId: string;
  targetAgentId: string;
  nodeId: string;
  createdAt: string;
  updatedAt: string;
  lastEventKind: PlatformExecutionRuntimeEventKind;
  latestReportedStatus?: string | null;
  runStatus: ManagedAgentPlatformWorkerAssignedRunResult["run"]["status"];
  workItemStatus: ManagedAgentPlatformWorkerAssignedRunResult["workItem"]["status"];
  leaseStatus: ManagedAgentPlatformWorkerAssignedRunResult["executionLease"]["status"];
  executionContract: ManagedAgentPlatformWorkerAssignedRunResult["executionContract"];
  waitingAction?: ManagedAgentPlatformWorkerWaitingActionPayload | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completionResult?: ManagedAgentPlatformWorkerCompletionResult | null;
}

export interface PlatformExecutionRuntimeEvent {
  version: 1;
  kind: PlatformExecutionRuntimeEventKind;
  recordedAt: string;
  ownerPrincipalId: string;
  organizationId: string;
  nodeId: string;
  runId: string;
  workItemId: string;
  targetAgentId: string;
  runStatus: ManagedAgentPlatformWorkerAssignedRunResult["run"]["status"];
  workItemStatus: ManagedAgentPlatformWorkerAssignedRunResult["workItem"]["status"];
  leaseStatus: ManagedAgentPlatformWorkerAssignedRunResult["executionLease"]["status"];
  latestReportedStatus?: string | null;
  waitingAction?: ManagedAgentPlatformWorkerWaitingActionPayload | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completionResult?: ManagedAgentPlatformWorkerCompletionResult | null;
  source?: string | null;
  reason?: string | null;
}

export interface PlatformExecutionRuntimeStore {
  ensureAssignedRun(input: {
    assignedRun: ManagedAgentPlatformWorkerAssignedRunResult;
    source?: string;
  }): void;
  recordAssignedRun(input: {
    assignedRun: ManagedAgentPlatformWorkerAssignedRunResult;
    source?: string;
  }): void;
  recordRunStatus(input: {
    assignedRun: ManagedAgentPlatformWorkerAssignedRunResult;
    payload: ManagedAgentPlatformWorkerRunStatusPayload;
  }): void;
  recordRunCompletion(input: {
    assignedRun: ManagedAgentPlatformWorkerAssignedRunResult;
    completionResult?: ManagedAgentPlatformWorkerCompletionResult;
  }): void;
  recordRunReclaim(input: {
    assignedRun: ManagedAgentPlatformWorkerAssignedRunResult;
    reason?: string;
  }): void;
}

export interface LocalPlatformExecutionRuntimeStoreOptions {
  rootDirectory: string;
  now?: () => string;
}

export function createLocalPlatformExecutionRuntimeStore(
  options: LocalPlatformExecutionRuntimeStoreOptions,
): PlatformExecutionRuntimeStore {
  const rootDirectory = resolve(options.rootDirectory);
  const now = options.now ?? (() => new Date().toISOString());

  return {
    ensureAssignedRun(input) {
      const runDirectory = resolvePlatformExecutionRuntimeRunDirectory(
        rootDirectory,
        input.assignedRun.organization.ownerPrincipalId,
        input.assignedRun.run.runId,
      );

      if (existsSync(join(runDirectory, STATE_FILE_NAME))) {
        return;
      }

      this.recordAssignedRun({
        assignedRun: input.assignedRun,
        source: input.source ?? "pull_restore",
      });
    },

    recordAssignedRun(input) {
      const recordedAt = now();
      persistExecutionRuntimeRecord(rootDirectory, input.assignedRun, buildExecutionRuntimeEvent({
        kind: "assigned",
        recordedAt,
        assignedRun: input.assignedRun,
        source: input.source ?? "scheduled",
      }));
    },

    recordRunStatus(input) {
      const recordedAt = now();
      persistExecutionRuntimeRecord(rootDirectory, input.assignedRun, buildExecutionRuntimeEvent({
        kind: "status",
        recordedAt,
        assignedRun: input.assignedRun,
        latestReportedStatus: input.payload.status,
        waitingAction: input.payload.waitingAction ?? null,
        failureCode: input.payload.failureCode ?? null,
        failureMessage: input.payload.failureMessage ?? null,
      }));
    },

    recordRunCompletion(input) {
      const recordedAt = now();
      persistExecutionRuntimeRecord(rootDirectory, input.assignedRun, buildExecutionRuntimeEvent({
        kind: "completed",
        recordedAt,
        assignedRun: input.assignedRun,
        latestReportedStatus: "completed",
        completionResult: input.completionResult ?? null,
      }));
    },

    recordRunReclaim(input) {
      const recordedAt = now();
      persistExecutionRuntimeRecord(rootDirectory, input.assignedRun, buildExecutionRuntimeEvent({
        kind: "reclaimed",
        recordedAt,
        assignedRun: input.assignedRun,
        latestReportedStatus: "reclaimed",
        reason: input.reason ?? null,
      }));
    },
  };
}

export function resolvePlatformExecutionRuntimeRunDirectory(
  rootDirectory: string,
  ownerPrincipalId: string,
  runId: string,
): string {
  return resolve(
    rootDirectory,
    sanitizePathSegment(ownerPrincipalId),
    sanitizePathSegment(runId),
  );
}

export function loadPlatformExecutionRuntimeState(
  rootDirectory: string,
  ownerPrincipalId: string,
  runId: string,
): PlatformExecutionRuntimeState | null {
  const filePath = join(
    resolvePlatformExecutionRuntimeRunDirectory(rootDirectory, ownerPrincipalId, runId),
    STATE_FILE_NAME,
  );

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as PlatformExecutionRuntimeState;
  } catch (error) {
    if (isFileMissing(error)) {
      return null;
    }

    throw error;
  }
}

export function loadPlatformExecutionRuntimeEvents(
  rootDirectory: string,
  ownerPrincipalId: string,
  runId: string,
): PlatformExecutionRuntimeEvent[] {
  const filePath = join(
    resolvePlatformExecutionRuntimeRunDirectory(rootDirectory, ownerPrincipalId, runId),
    EVENTS_FILE_NAME,
  );

  try {
    const content = readFileSync(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as PlatformExecutionRuntimeEvent);
  } catch (error) {
    if (isFileMissing(error)) {
      return [];
    }

    throw error;
  }
}

function persistExecutionRuntimeRecord(
  rootDirectory: string,
  assignedRun: ManagedAgentPlatformWorkerAssignedRunResult,
  event: PlatformExecutionRuntimeEvent,
): void {
  const runDirectory = resolvePlatformExecutionRuntimeRunDirectory(
    rootDirectory,
    assignedRun.organization.ownerPrincipalId,
    assignedRun.run.runId,
  );
  mkdirSync(runDirectory, { recursive: true });
  writeJsonFile(join(runDirectory, ASSIGNED_RUN_FILE_NAME), assignedRun);
  writeJsonFile(join(runDirectory, STATE_FILE_NAME), buildExecutionRuntimeState(assignedRun, event));
  appendFileSync(join(runDirectory, EVENTS_FILE_NAME), `${JSON.stringify(event)}\n`, "utf8");
}

function buildExecutionRuntimeState(
  assignedRun: ManagedAgentPlatformWorkerAssignedRunResult,
  event: PlatformExecutionRuntimeEvent,
): PlatformExecutionRuntimeState {
  return {
    version: 1,
    ownerPrincipalId: assignedRun.organization.ownerPrincipalId,
    organizationId: assignedRun.organization.organizationId,
    runId: assignedRun.run.runId,
    workItemId: assignedRun.workItem.workItemId,
    targetAgentId: assignedRun.targetAgent.agentId,
    nodeId: assignedRun.node.nodeId,
    createdAt: assignedRun.run.createdAt,
    updatedAt: event.recordedAt,
    lastEventKind: event.kind,
    latestReportedStatus: event.latestReportedStatus ?? null,
    runStatus: assignedRun.run.status,
    workItemStatus: assignedRun.workItem.status,
    leaseStatus: assignedRun.executionLease.status,
    executionContract: { ...assignedRun.executionContract },
    waitingAction: event.waitingAction ?? null,
    failureCode: event.failureCode ?? null,
    failureMessage: event.failureMessage ?? null,
    completionResult: event.completionResult ?? null,
  };
}

function buildExecutionRuntimeEvent(input: {
  kind: PlatformExecutionRuntimeEventKind;
  recordedAt: string;
  assignedRun: ManagedAgentPlatformWorkerAssignedRunResult;
  latestReportedStatus?: string | null;
  waitingAction?: ManagedAgentPlatformWorkerWaitingActionPayload | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  completionResult?: ManagedAgentPlatformWorkerCompletionResult | null;
  source?: string | null;
  reason?: string | null;
}): PlatformExecutionRuntimeEvent {
  return {
    version: 1,
    kind: input.kind,
    recordedAt: input.recordedAt,
    ownerPrincipalId: input.assignedRun.organization.ownerPrincipalId,
    organizationId: input.assignedRun.organization.organizationId,
    nodeId: input.assignedRun.node.nodeId,
    runId: input.assignedRun.run.runId,
    workItemId: input.assignedRun.workItem.workItemId,
    targetAgentId: input.assignedRun.targetAgent.agentId,
    runStatus: input.assignedRun.run.status,
    workItemStatus: input.assignedRun.workItem.status,
    leaseStatus: input.assignedRun.executionLease.status,
    latestReportedStatus: input.latestReportedStatus ?? null,
    waitingAction: input.waitingAction ?? null,
    failureCode: input.failureCode ?? null,
    failureMessage: input.failureMessage ?? null,
    completionResult: input.completionResult ?? null,
    source: input.source ?? null,
    reason: input.reason ?? null,
  };
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sanitizePathSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized || "unknown";
}

function isFileMissing(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "ENOENT";
}
