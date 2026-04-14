import type { PlatformNodeService } from "./platform-node-service.js";
import type { PlatformWorkerRunService } from "./platform-worker-run-service.js";
import type { PlatformExecutionRuntimeStore } from "./platform-execution-runtime-store.js";

export interface PlatformSchedulerTickResult {
  ownerCount: number;
  reclaimedRunCount: number;
  requeuedWorkItemCount: number;
  revokedLeaseCount: number;
}

export interface PlatformSchedulerService {
  runTick(): PlatformSchedulerTickResult;
}

export interface InMemoryPlatformSchedulerServiceOptions {
  nodeService: PlatformNodeService;
  workerRunService: PlatformWorkerRunService;
  executionRuntimeStore?: PlatformExecutionRuntimeStore;
  now?: () => string;
}

export function createInMemoryPlatformSchedulerService(
  options: InMemoryPlatformSchedulerServiceOptions,
): PlatformSchedulerService {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    runTick() {
      const ownerPrincipalIds = options.workerRunService.listOwnerPrincipalIds();
      const summary: PlatformSchedulerTickResult = {
        ownerCount: ownerPrincipalIds.length,
        reclaimedRunCount: 0,
        requeuedWorkItemCount: 0,
        revokedLeaseCount: 0,
      };

      for (const ownerPrincipalId of ownerPrincipalIds) {
        const assignedRuns = options.workerRunService.listAssignedRuns({
          ownerPrincipalId,
        });

        for (const assignedRun of assignedRuns) {
          if (assignedRun.executionLease.status !== "active") {
            continue;
          }

          const nodeDetail = options.nodeService.getNodeDetail({
            ownerPrincipalId,
            nodeId: assignedRun.node.nodeId,
          });
          const nodeStatus = nodeDetail?.node.status ?? "offline";

          if (nodeStatus === "online") {
            continue;
          }

          const timestamp = now();
          const updated = options.workerRunService.updateAssignedRunByWorkItem({
            ownerPrincipalId,
            workItemId: assignedRun.workItem.workItemId,
            workItemPatch: {
              status: "queued",
              waitingFor: null,
              updatedAt: timestamp,
            },
            runPatch: {
              status: "interrupted",
              updatedAt: timestamp,
            },
            executionLeasePatch: {
              status: "revoked",
              updatedAt: timestamp,
            },
          });

          if (!updated) {
            continue;
          }

          options.executionRuntimeStore?.recordRunReclaim({
            assignedRun: updated,
            reason: `node_status_${nodeStatus}`,
          });
          summary.reclaimedRunCount += 1;
          summary.requeuedWorkItemCount += 1;
          summary.revokedLeaseCount += 1;
        }
      }

      return summary;
    },
  };
}
