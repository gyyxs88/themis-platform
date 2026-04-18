import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { loadProjectEnv } from "../config/project-env.js";
import { createPlatformControlPlaneRuntimeFromEnv, type PlatformControlPlaneDriver } from "./platform-control-plane-bootstrap.js";
import { PlatformControlPlaneMirrorFlushError } from "./platform-control-plane-mirror.js";
import { createInMemoryPlatformCollaborationService } from "./platform-collaboration-service.js";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";
import { createLocalPlatformExecutionRuntimeStore } from "./platform-execution-runtime-store.js";
import { createInMemoryPlatformGovernanceService } from "./platform-governance-service.js";
import { createInMemoryPlatformMeetingRoomService } from "./platform-meeting-room-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformOncallService } from "./platform-oncall-service.js";
import { createPlatformApp } from "./platform-app.js";
import {
  applyPlatformRuntimeSnapshot,
  exportPlatformRuntimeSnapshot,
  loadPlatformRuntimeSnapshotFile,
  savePlatformRuntimeSnapshotFile,
} from "./platform-runtime-snapshot.js";
import { createInMemoryPlatformSchedulerService } from "./platform-scheduler-service.js";
import { createPlatformWebAccessService } from "./platform-web-access.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

const DEFAULT_PLATFORM_HOST = "0.0.0.0";
const DEFAULT_PLATFORM_PORT = 3100;
const DEFAULT_PLATFORM_SERVICE_NAME = "themis-platform";
const DEFAULT_PLATFORM_SCHEDULER_INTERVAL_MS = 5000;
const DEFAULT_PLATFORM_RUNTIME_SNAPSHOT_FILE = "infra/platform/runtime-state.json";
const DEFAULT_PLATFORM_EXECUTION_RUNTIME_ROOT = "infra/platform/runtime-runs";

export interface PlatformMainConfig {
  host: string;
  port: number;
  serviceName: string;
  schedulerIntervalMs: number;
  controlPlaneDriver: PlatformControlPlaneDriver;
}

export interface CreatePlatformServerFromEnvOptions {
  createMySqlStore?: Parameters<typeof createPlatformControlPlaneRuntimeFromEnv>[0]["createMySqlStore"];
}

export function resolvePlatformMainConfig(env: NodeJS.ProcessEnv = process.env): PlatformMainConfig {
  const host = normalizeHost(env.THEMIS_HOST);
  const port = normalizePort(env.THEMIS_PORT ?? env.PORT, DEFAULT_PLATFORM_PORT);
  const serviceName = normalizeServiceName(env.THEMIS_PLATFORM_SERVICE_NAME);

  return {
    host,
    port,
    serviceName,
    schedulerIntervalMs: normalizePort(
      env.THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS,
      DEFAULT_PLATFORM_SCHEDULER_INTERVAL_MS,
    ),
    controlPlaneDriver: resolvePlatformControlPlaneDriver(env),
  };
}

export function bootstrapMessage(config: PlatformMainConfig): string {
  return `Themis Platform server listening on http://${config.host}:${config.port}`;
}

export function resolvePlatformRuntimeSnapshotFile(
  workingDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = normalizeFilePath(env.THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE);
  return resolve(workingDirectory, configured ?? DEFAULT_PLATFORM_RUNTIME_SNAPSHOT_FILE);
}

export function resolvePlatformExecutionRuntimeRoot(
  workingDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = normalizeFilePath(env.THEMIS_PLATFORM_EXECUTION_RUNTIME_ROOT);
  return resolve(workingDirectory, configured ?? DEFAULT_PLATFORM_EXECUTION_RUNTIME_ROOT);
}

export function resolveListenAddresses(host: string, port: number): string[] {
  const addresses = new Set<string>();
  addresses.add(`http://localhost:${port}`);

  if (host !== "0.0.0.0") {
    addresses.add(`http://${host}:${port}`);
    return [...addresses];
  }

  const interfaces = networkInterfaces();

  for (const values of Object.values(interfaces)) {
    for (const entry of values ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(`http://${entry.address}:${port}`);
      }
    }
  }

  return [...addresses];
}

export async function createPlatformServerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  workingDirectory: string = process.cwd(),
  options: CreatePlatformServerFromEnvOptions = {},
) {
  const config = resolvePlatformMainConfig(env);
  const runtimeSnapshotFile = resolvePlatformRuntimeSnapshotFile(workingDirectory, env);
  const executionRuntimeRoot = resolvePlatformExecutionRuntimeRoot(workingDirectory, env);
  const runtimeSnapshotFromFile = loadPlatformRuntimeSnapshotFile(runtimeSnapshotFile);
  const controlPlaneRuntime = await createPlatformControlPlaneRuntimeFromEnv({
    workingDirectory,
    env,
    runtimeSnapshotFallback: runtimeSnapshotFromFile,
    createMySqlStore: options.createMySqlStore,
  });
  const initialSnapshot = controlPlaneRuntime.initialSnapshot ?? runtimeSnapshotFromFile;

  const nodeService = createInMemoryPlatformNodeService({
    organizations: initialSnapshot?.nodeService.organizations,
    nodes: initialSnapshot?.nodeService.nodes,
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    assignedRuns: initialSnapshot?.workerRunService.assignedRuns,
  });
  const governanceService = createInMemoryPlatformGovernanceService({
    workerRunService,
  });
  const collaborationService = createInMemoryPlatformCollaborationService({
    workerRunService,
    parentSeeds: initialSnapshot?.workflowService.parentSeeds,
    handoffSeeds: initialSnapshot?.workflowService.handoffSeeds,
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    agentSeeds: initialSnapshot?.workflowService.agentSeeds,
    workItemSeeds: initialSnapshot?.workflowService.workItemSeeds,
    mailboxSeeds: initialSnapshot?.workflowService.mailboxSeeds,
    parentSeeds: initialSnapshot?.workflowService.parentSeeds,
    handoffSeeds: initialSnapshot?.workflowService.handoffSeeds,
  });
  const controlPlaneService = createInMemoryPlatformControlPlaneService({
    snapshot: initialSnapshot?.controlPlaneService,
  });
  const meetingRoomService = createInMemoryPlatformMeetingRoomService({
    controlPlaneService,
    workflowService,
    snapshot: initialSnapshot?.meetingRoomService,
  });
  const oncallService = createInMemoryPlatformOncallService({
    nodeService,
    governanceService,
    workerRunService,
    controlPlaneService,
  });
  const executionRuntimeStore = createLocalPlatformExecutionRuntimeStore({
    rootDirectory: executionRuntimeRoot,
  });
  const schedulerService = createInMemoryPlatformSchedulerService({
    nodeService,
    workerRunService,
    executionRuntimeStore,
  });

  const snapshotServices = {
    nodeService,
    controlPlaneService,
    workerRunService,
    workflowService,
    meetingRoomService,
  };
  const restorableServices = {
    ...snapshotServices,
    collaborationService,
  };

  const exportCurrentSnapshot = () => exportPlatformRuntimeSnapshot(snapshotServices);
  const saveCurrentRuntimeSnapshot = (snapshot = exportCurrentSnapshot()) => {
    savePlatformRuntimeSnapshotFile(runtimeSnapshotFile, snapshot);
  };
  const restorePlatformState = (snapshot: Parameters<typeof applyPlatformRuntimeSnapshot>[1]) => {
    applyPlatformRuntimeSnapshot(restorableServices, snapshot);
    saveCurrentRuntimeSnapshot(snapshot);
  };
  let persistQueue = Promise.resolve();

  const persistPlatformState = async () => {
    const snapshot = exportCurrentSnapshot();
    saveCurrentRuntimeSnapshot(snapshot);

    if (!controlPlaneRuntime.mirror) {
      return;
    }

    try {
      await controlPlaneRuntime.mirror.flushSnapshot(snapshot);
    } catch (error) {
      if (error instanceof PlatformControlPlaneMirrorFlushError && error.restoredSnapshot) {
        restorePlatformState(error.restoredSnapshot);
      }

      throw error;
    }
  };

  const enqueuePersistPlatformState = () => {
    const pending = persistQueue.then(async () => {
      await persistPlatformState();
    });
    persistQueue = pending.catch(() => {});
    return pending;
  };

  if (initialSnapshot) {
    saveCurrentRuntimeSnapshot(initialSnapshot);
  }

  const server = createPlatformApp({
    serviceName: config.serviceName,
    appDisplayName: "Themis Platform",
    accessMode: "protected",
    onStateMutation: enqueuePersistPlatformState,
    executionRuntimeStore,
    nodeService,
    workerRunService,
    governanceService,
    collaborationService,
    workflowService,
    controlPlaneService,
    meetingRoomService,
    oncallService,
    authService: createPlatformWebAccessService({
      webLoginSecret: env.THEMIS_PLATFORM_WEB_ACCESS_TOKEN,
      webLoginTokenLabel: env.THEMIS_PLATFORM_WEB_ACCESS_TOKEN_LABEL,
    }),
  });

  server.on("close", () => {
    void controlPlaneRuntime.mirror?.close();
  });

  return {
    config,
    server,
    schedulerService,
    runtimeSnapshotFile,
    executionRuntimeRoot,
    localSharedCacheFile: controlPlaneRuntime.localSharedCacheFile,
    mirrorBootstrapResult: controlPlaneRuntime.bootstrapResult,
    persistPlatformState: enqueuePersistPlatformState,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startPlatformMain();
}

async function startPlatformMain(): Promise<void> {
  loadProjectEnv();
  const {
    config,
    server,
    schedulerService,
    runtimeSnapshotFile,
    executionRuntimeRoot,
    localSharedCacheFile,
    mirrorBootstrapResult,
    persistPlatformState,
  } = await createPlatformServerFromEnv(
    process.env,
    process.cwd(),
  );
  let schedulerTickRunning = false;

  const runSchedulerTick = async () => {
    if (schedulerTickRunning) {
      return;
    }

    schedulerTickRunning = true;

    try {
      const tick = schedulerService.runTick();

      if (tick.reclaimedRunCount > 0) {
        await persistPlatformState();
        console.warn(
          `[themis/platform] Scheduler reclaimed ${tick.reclaimedRunCount} runs,`
          + ` requeued ${tick.requeuedWorkItemCount} work-items.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[themis/platform] Scheduler tick failed: ${message}`);
    } finally {
      schedulerTickRunning = false;
    }
  };

  if (config.schedulerIntervalMs > 0) {
    const timer = setInterval(() => {
      void runSchedulerTick();
    }, config.schedulerIntervalMs);
    timer.unref?.();
    void runSchedulerTick();
  }

  server.listen(config.port, config.host, () => {
    console.log(`[themis/platform] ${bootstrapMessage(config)}`);
    console.log(`[themis/platform] Control plane driver ${config.controlPlaneDriver}`);

    if (localSharedCacheFile) {
      console.log(`[themis/platform] Shared cache ${localSharedCacheFile}`);
    }

    if (mirrorBootstrapResult) {
      console.log(`[themis/platform] Mirror bootstrap source ${mirrorBootstrapResult.source}`);
    }

    console.log(
      `[themis/platform] Scheduler interval ${Math.max(1, Math.round(config.schedulerIntervalMs / 1000))}s`,
    );
    console.log(`[themis/platform] Runtime snapshot ${runtimeSnapshotFile}`);
    console.log(`[themis/platform] Execution runtime ${executionRuntimeRoot}`);

    for (const address of resolveListenAddresses(config.host, config.port)) {
      console.log(`[themis/platform] Open ${address}`);
    }
  });
}

function resolvePlatformControlPlaneDriver(env: NodeJS.ProcessEnv = process.env): PlatformControlPlaneDriver {
  const configured = env.THEMIS_PLATFORM_CONTROL_PLANE_DRIVER?.trim().toLowerCase();

  if (!configured || configured === "sqlite") {
    return "sqlite";
  }

  if (configured === "mysql") {
    return "mysql";
  }

  throw new Error(
    `Unsupported THEMIS_PLATFORM_CONTROL_PLANE_DRIVER: ${configured}. Expected sqlite or mysql.`,
  );
}

function normalizePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHost(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : DEFAULT_PLATFORM_HOST;
}

function normalizeServiceName(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : DEFAULT_PLATFORM_SERVICE_NAME;
}

function normalizeFilePath(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
