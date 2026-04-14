import { networkInterfaces } from "node:os";
import { loadProjectEnv } from "../config/project-env.js";
import { createInMemoryPlatformCollaborationService } from "./platform-collaboration-service.js";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";
import { createInMemoryPlatformGovernanceService } from "./platform-governance-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformOncallService } from "./platform-oncall-service.js";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformSchedulerService } from "./platform-scheduler-service.js";
import { createPlatformWebAccessService } from "./platform-web-access.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

const DEFAULT_PLATFORM_HOST = "0.0.0.0";
const DEFAULT_PLATFORM_PORT = 3100;
const DEFAULT_PLATFORM_SERVICE_NAME = "themis-platform";
const DEFAULT_PLATFORM_SCHEDULER_INTERVAL_MS = 5000;

export interface PlatformMainConfig {
  host: string;
  port: number;
  serviceName: string;
  schedulerIntervalMs: number;
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
  };
}

export function bootstrapMessage(config: PlatformMainConfig): string {
  return `Themis Platform server listening on http://${config.host}:${config.port}`;
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

export function createPlatformServerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const config = resolvePlatformMainConfig(env);
  const nodeService = createInMemoryPlatformNodeService();
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
  });
  const governanceService = createInMemoryPlatformGovernanceService({
    workerRunService,
  });
  const collaborationService = createInMemoryPlatformCollaborationService({
    workerRunService,
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
  });
  const controlPlaneService = createInMemoryPlatformControlPlaneService();
  const oncallService = createInMemoryPlatformOncallService({
    nodeService,
    governanceService,
    workerRunService,
    controlPlaneService,
  });
  const schedulerService = createInMemoryPlatformSchedulerService({
    nodeService,
    workerRunService,
  });
  const server = createPlatformApp({
    serviceName: config.serviceName,
    appDisplayName: "Themis Platform",
    accessMode: "protected",
    nodeService,
    workerRunService,
    governanceService,
    collaborationService,
    workflowService,
    controlPlaneService,
    oncallService,
    authService: createPlatformWebAccessService({
      webLoginSecret: env.THEMIS_PLATFORM_WEB_ACCESS_TOKEN,
      webLoginTokenLabel: env.THEMIS_PLATFORM_WEB_ACCESS_TOKEN_LABEL,
    }),
  });

  return {
    config,
    server,
    schedulerService,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadProjectEnv();
  const { config, server, schedulerService } = createPlatformServerFromEnv(process.env);
  let schedulerTickRunning = false;

  const runSchedulerTick = () => {
    if (schedulerTickRunning) {
      return;
    }

    schedulerTickRunning = true;

    try {
      const tick = schedulerService.runTick();

      if (tick.reclaimedRunCount > 0) {
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
    const timer = setInterval(runSchedulerTick, config.schedulerIntervalMs);
    timer.unref?.();
    runSchedulerTick();
  }

  server.listen(config.port, config.host, () => {
    console.log(`[themis/platform] ${bootstrapMessage(config)}`);
    console.log(
      `[themis/platform] Scheduler interval ${Math.max(1, Math.round(config.schedulerIntervalMs / 1000))}s`,
    );

    for (const address of resolveListenAddresses(config.host, config.port)) {
      console.log(`[themis/platform] Open ${address}`);
    }
  });
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
