import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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

export interface PlatformRuntimeSnapshot {
  version: 1;
  savedAt: string;
  nodeService: PlatformNodeServiceSnapshot;
  controlPlaneService: PlatformControlPlaneServiceSnapshot;
  workerRunService: PlatformWorkerRunServiceSnapshot;
  workflowService: PlatformWorkflowServiceSnapshot;
}

export interface PlatformRuntimeSnapshotServices {
  nodeService: SnapshotCapablePlatformNodeService;
  controlPlaneService: SnapshotCapablePlatformControlPlaneService;
  workerRunService: SnapshotCapablePlatformWorkerRunService;
  workflowService: SnapshotCapablePlatformWorkflowService;
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
  };
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
