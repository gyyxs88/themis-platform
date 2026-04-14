import type {
  ManagedAgentPlatformWorkerAssignedRunResult,
  ManagedAgentPlatformWorkerPullPayload,
  ManagedAgentPlatformWorkerRunCompletePayload,
  ManagedAgentPlatformWorkerRunMutationResult,
  ManagedAgentPlatformWorkerRunStatusPayload,
} from "themis-contracts/managed-agent-platform-worker";
import type { PlatformNodeService } from "./platform-node-service.js";

export interface PlatformWorkerRunService {
  pullAssignedRun(payload: ManagedAgentPlatformWorkerPullPayload): ManagedAgentPlatformWorkerAssignedRunResult | null;
  updateRunStatus(payload: ManagedAgentPlatformWorkerRunStatusPayload): ManagedAgentPlatformWorkerRunMutationResult | null;
  completeRun(payload: ManagedAgentPlatformWorkerRunCompletePayload): ManagedAgentPlatformWorkerRunMutationResult | null;
}

export interface InMemoryPlatformWorkerRunServiceOptions {
  nodeService: PlatformNodeService;
  now?: () => string;
  assignedRuns?: ManagedAgentPlatformWorkerAssignedRunResult[];
}

export function createInMemoryPlatformWorkerRunService(
  options: InMemoryPlatformWorkerRunServiceOptions,
): PlatformWorkerRunService {
  const now = options.now ?? (() => new Date().toISOString());
  const assignedRuns = new Map<string, ManagedAgentPlatformWorkerAssignedRunResult>();

  for (const assignedRun of options.assignedRuns ?? []) {
    assignedRuns.set(assignedRun.run.runId, cloneAssignedRun(assignedRun));
  }

  return {
    pullAssignedRun(payload) {
      const candidate = Array.from(assignedRuns.values()).find((assignedRun) => (
        assignedRun.node.nodeId === payload.nodeId
        && assignedRun.organization.ownerPrincipalId === payload.ownerPrincipalId
        && assignedRun.executionLease.status === "active"
        && assignedRun.run.status === "created"
      ));

      if (!candidate) {
        return null;
      }

      const detail = options.nodeService.getNodeDetail({
        ownerPrincipalId: payload.ownerPrincipalId,
        nodeId: payload.nodeId,
      });

      if (!detail) {
        return null;
      }

      candidate.node = {
        ...detail.node,
      };
      return cloneAssignedRun(candidate);
    },

    updateRunStatus(payload) {
      const assignedRun = requireOwnedAssignedRun(assignedRuns, payload.ownerPrincipalId, payload.nodeId, payload.runId, payload.leaseToken);
      const timestamp = now();
      const nextRunStatus = mapWorkerRunStatus(payload.status, assignedRun.run.status);
      assignedRun.run = {
        ...assignedRun.run,
        status: nextRunStatus,
        updatedAt: timestamp,
      };

      if (payload.status === "starting" || payload.status === "running") {
        assignedRun.workItem = {
          ...assignedRun.workItem,
          status: payload.status,
          updatedAt: timestamp,
        };
      } else if (payload.status === "waiting_human") {
        assignedRun.workItem = {
          ...assignedRun.workItem,
          status: "waiting_human",
          updatedAt: timestamp,
        };
      } else if (payload.status === "waiting_agent") {
        assignedRun.workItem = {
          ...assignedRun.workItem,
          status: "waiting_agent",
          updatedAt: timestamp,
        };
      } else if (payload.status === "failed") {
        assignedRun.workItem = {
          ...assignedRun.workItem,
          status: "failed",
          updatedAt: timestamp,
        };
        assignedRun.executionLease = {
          ...assignedRun.executionLease,
          status: "revoked",
          updatedAt: timestamp,
        };
      } else if (payload.status === "cancelled") {
        assignedRun.workItem = {
          ...assignedRun.workItem,
          status: "cancelled",
          updatedAt: timestamp,
        };
        assignedRun.executionLease = {
          ...assignedRun.executionLease,
          status: "revoked",
          updatedAt: timestamp,
        };
      } else {
        assignedRun.executionLease = {
          ...assignedRun.executionLease,
          updatedAt: timestamp,
        };
      }

      assignedRuns.set(assignedRun.run.runId, cloneAssignedRun(assignedRun));
      return buildRunMutationResult(assignedRun);
    },

    completeRun(payload) {
      const assignedRun = requireOwnedAssignedRun(assignedRuns, payload.ownerPrincipalId, payload.nodeId, payload.runId, payload.leaseToken);
      const timestamp = normalizeTimestamp(payload.result?.completedAt, now);
      assignedRun.run = {
        ...assignedRun.run,
        status: "completed",
        updatedAt: timestamp,
      };
      assignedRun.workItem = {
        ...assignedRun.workItem,
        status: "completed",
        updatedAt: timestamp,
      };
      assignedRun.executionLease = {
        ...assignedRun.executionLease,
        status: "released",
        updatedAt: timestamp,
      };
      assignedRuns.set(assignedRun.run.runId, cloneAssignedRun(assignedRun));
      return buildRunMutationResult(assignedRun);
    },
  };
}

function requireOwnedAssignedRun(
  assignedRuns: Map<string, ManagedAgentPlatformWorkerAssignedRunResult>,
  ownerPrincipalId: string,
  nodeId: string,
  runId: string,
  leaseToken: string,
): ManagedAgentPlatformWorkerAssignedRunResult {
  const assignedRun = assignedRuns.get(runId);

  if (!assignedRun) {
    throw new Error("Assigned run not found.");
  }

  if (assignedRun.organization.ownerPrincipalId !== ownerPrincipalId) {
    throw new Error("Assigned run owner mismatch.");
  }

  if (assignedRun.node.nodeId !== nodeId) {
    throw new Error("Assigned run node mismatch.");
  }

  if (assignedRun.executionLease.leaseToken !== leaseToken) {
    throw new Error("Assigned run leaseToken mismatch.");
  }

  return assignedRun;
}

function buildRunMutationResult(
  assignedRun: ManagedAgentPlatformWorkerAssignedRunResult,
): ManagedAgentPlatformWorkerRunMutationResult {
  return {
    organization: assignedRun.organization,
    node: assignedRun.node,
    targetAgent: assignedRun.targetAgent,
    workItem: assignedRun.workItem,
    run: assignedRun.run,
    executionLease: assignedRun.executionLease,
  };
}

function mapWorkerRunStatus(
  status: ManagedAgentPlatformWorkerRunStatusPayload["status"],
  currentStatus: ManagedAgentPlatformWorkerAssignedRunResult["run"]["status"],
) {
  if (status === "starting") {
    return "starting" as const;
  }

  if (status === "running") {
    return "running" as const;
  }

  if (status === "failed") {
    return "failed" as const;
  }

  if (status === "cancelled") {
    return "cancelled" as const;
  }

  if (status === "waiting_human" || status === "waiting_agent") {
    return "waiting_action" as const;
  }

  return currentStatus;
}

function cloneAssignedRun(
  assignedRun: ManagedAgentPlatformWorkerAssignedRunResult,
): ManagedAgentPlatformWorkerAssignedRunResult {
  return {
    organization: { ...assignedRun.organization },
    node: { ...assignedRun.node },
    targetAgent: { ...assignedRun.targetAgent },
    workItem: { ...assignedRun.workItem },
    run: { ...assignedRun.run },
    executionLease: { ...assignedRun.executionLease },
    executionContract: { ...assignedRun.executionContract },
  };
}

function normalizeTimestamp(value: string | undefined, fallbackNow: () => string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallbackNow();
}
