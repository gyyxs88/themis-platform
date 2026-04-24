import type {
  ManagedAgentPlatformRunDetailPayload,
  ManagedAgentPlatformRunDetailResult,
  ManagedAgentPlatformRunListPayload,
  ManagedAgentPlatformRunListResult,
} from "themis-contracts/managed-agent-platform-collaboration";
import type {
  ManagedAgentPlatformAgentRecord,
  ManagedAgentPlatformOrganizationRecord,
  ManagedAgentPlatformWorkItemRecord,
} from "themis-contracts/managed-agent-platform-shared";
import type {
  ManagedAgentPlatformWorkerAssignedRunResult,
  ManagedAgentPlatformWorkerPullPayload,
  ManagedAgentPlatformWorkerRunCompletePayload,
  ManagedAgentPlatformWorkerRunMutationResult,
  ManagedAgentPlatformWorkerRunStatusPayload,
} from "themis-contracts/managed-agent-platform-worker";
import type { PlatformNodeService } from "./platform-node-service.js";

export interface PlatformWorkerRunService {
  listOwnerPrincipalIds(): string[];
  pullAssignedRun(payload: ManagedAgentPlatformWorkerPullPayload): ManagedAgentPlatformWorkerAssignedRunResult | null;
  assignQueuedWorkItem(input: {
    ownerPrincipalId: string;
    nodeId: string;
    organization: ManagedAgentPlatformOrganizationRecord;
    targetAgent: ManagedAgentPlatformAgentRecord;
    workItem: ManagedAgentPlatformWorkItemRecord;
    workspacePath: string;
  }): ManagedAgentPlatformWorkerAssignedRunResult | null;
  updateRunStatus(payload: ManagedAgentPlatformWorkerRunStatusPayload): ManagedAgentPlatformWorkerRunMutationResult | null;
  completeRun(payload: ManagedAgentPlatformWorkerRunCompletePayload): ManagedAgentPlatformWorkerRunMutationResult | null;
  listRuns(payload: ManagedAgentPlatformRunListPayload): ManagedAgentPlatformRunListResult;
  getRunDetail(payload: ManagedAgentPlatformRunDetailPayload): ManagedAgentPlatformRunDetailResult | null;
  getAssignedRunByWorkItem(input: {
    ownerPrincipalId: string;
    workItemId: string;
  }): ManagedAgentPlatformWorkerAssignedRunResult | null;
  updateAssignedRunByWorkItem(input: {
    ownerPrincipalId: string;
    workItemId: string;
    workItemPatch?: Partial<ManagedAgentPlatformWorkerAssignedRunResult["workItem"]>;
    runPatch?: Partial<ManagedAgentPlatformWorkerAssignedRunResult["run"]>;
    executionLeasePatch?: Partial<ManagedAgentPlatformWorkerAssignedRunResult["executionLease"]>;
  }): ManagedAgentPlatformWorkerAssignedRunResult | null;
  listAssignedRuns(input: {
    ownerPrincipalId: string;
    organizationId?: string;
  }): ManagedAgentPlatformWorkerAssignedRunResult[];
}

export interface PlatformWorkerRunServiceSnapshot {
  assignedRuns: ManagedAgentPlatformWorkerAssignedRunResult[];
}

export interface SnapshotCapablePlatformWorkerRunService extends PlatformWorkerRunService {
  exportSnapshot(): PlatformWorkerRunServiceSnapshot;
  replaceSnapshot(snapshot: PlatformWorkerRunServiceSnapshot): void;
}

export interface InMemoryPlatformWorkerRunServiceOptions {
  nodeService: PlatformNodeService;
  now?: () => string;
  assignedRuns?: ManagedAgentPlatformWorkerAssignedRunResult[];
  generateRunId?: () => string;
  generateLeaseId?: () => string;
  generateLeaseToken?: () => string;
}

export function createInMemoryPlatformWorkerRunService(
  options: InMemoryPlatformWorkerRunServiceOptions,
): SnapshotCapablePlatformWorkerRunService {
  const now = options.now ?? (() => new Date().toISOString());
  const assignedRuns = new Map<string, ManagedAgentPlatformWorkerAssignedRunResult>();
  let generatedRunCount = 0;
  let generatedLeaseCount = 0;
  let generatedLeaseTokenCount = 0;

  for (const assignedRun of options.assignedRuns ?? []) {
    assignedRuns.set(assignedRun.run.runId, cloneAssignedRun(assignedRun));
  }

  const resetGeneratedCounters = () => {
    const values = Array.from(assignedRuns.values());
    generatedRunCount = resolveMaxSequentialId(
      values.map((assignedRun) => assignedRun.run.runId),
      "run-platform-",
    );
    generatedLeaseCount = resolveMaxSequentialId(
      values.map((assignedRun) => assignedRun.executionLease.leaseId),
      "lease-platform-",
    );
    generatedLeaseTokenCount = resolveMaxSequentialId(
      values.map((assignedRun) => assignedRun.executionLease.leaseToken),
      "lease-token-platform-",
    );
  };

  resetGeneratedCounters();

  const generateRunId = options.generateRunId ?? (() => `run-platform-${++generatedRunCount}`);
  const generateLeaseId = options.generateLeaseId ?? (() => `lease-platform-${++generatedLeaseCount}`);
  const generateLeaseToken = options.generateLeaseToken ?? (() => `lease-token-platform-${++generatedLeaseTokenCount}`);

  const replaceSnapshot = (snapshot: PlatformWorkerRunServiceSnapshot) => {
    assignedRuns.clear();

    for (const assignedRun of snapshot.assignedRuns) {
      assignedRuns.set(assignedRun.run.runId, cloneAssignedRun(assignedRun));
    }

    resetGeneratedCounters();
  };

  return {
    exportSnapshot() {
      return {
        assignedRuns: Array.from(assignedRuns.values()).map((assignedRun) => cloneAssignedRun(assignedRun)),
      };
    },

    replaceSnapshot,

    listOwnerPrincipalIds() {
      return Array.from(
        new Set(
          Array.from(assignedRuns.values()).map((assignedRun) => assignedRun.organization.ownerPrincipalId),
        ),
      ).sort((left, right) => left.localeCompare(right, "en"));
    },

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

    assignQueuedWorkItem(input) {
      const existing = findAssignedRunByWorkItem(assignedRuns, input.ownerPrincipalId, input.workItem.workItemId);

      if (existing && existing.executionLease.status === "active") {
        return cloneAssignedRun(existing);
      }

      const detail = options.nodeService.getNodeDetail({
        ownerPrincipalId: input.ownerPrincipalId,
        nodeId: input.nodeId,
      });

      if (!detail || detail.node.status !== "online") {
        return null;
      }

      const timestamp = now();
      const runId = generateRunId();
      const leaseId = generateLeaseId();
      const leaseToken = generateLeaseToken();
      const assignedRun: ManagedAgentPlatformWorkerAssignedRunResult = {
        organization: { ...input.organization },
        node: { ...detail.node },
        targetAgent: { ...input.targetAgent },
        workItem: {
          ...input.workItem,
          updatedAt: input.workItem.updatedAt ?? timestamp,
        },
        run: {
          runId,
          organizationId: input.organization.organizationId,
          workItemId: input.workItem.workItemId,
          nodeId: detail.node.nodeId,
          status: "created",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        executionLease: {
          leaseId,
          runId,
          nodeId: detail.node.nodeId,
          workItemId: input.workItem.workItemId,
          leaseToken,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        executionContract: {
          workspacePath: normalizeRequiredText(input.workspacePath, "workspacePath is required."),
        },
      };
      assignedRuns.set(runId, cloneAssignedRun(assignedRun));
      return cloneAssignedRun(assignedRun);
    },

    updateRunStatus(payload) {
      const assignedRun = requireOwnedAssignedRun(assignedRuns, payload.ownerPrincipalId, payload.nodeId, payload.runId, payload.leaseToken);
      const timestamp = now();
      const nextRunStatus = mapWorkerRunStatus(payload.status, assignedRun.run.status);
      const failureCode = normalizeOptionalText(payload.failureCode);
      const failureMessage = normalizeOptionalText(payload.failureMessage);
      assignedRun.run = {
        ...assignedRun.run,
        status: nextRunStatus,
        ...(payload.status === "failed" && failureCode ? { failureCode } : {}),
        ...(payload.status === "failed" && failureMessage ? { failureMessage } : {}),
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

    listRuns(payload) {
      const limit = Number.isFinite(payload.limit) ? Math.max(1, Number(payload.limit)) : 20;
      const runs = Array.from(assignedRuns.values())
        .filter((assignedRun) => matchesRunFilters(assignedRun, payload))
        .sort((left, right) => compareAssignedRuns(right, left))
        .slice(0, limit)
        .map((assignedRun) => ({ ...assignedRun.run }));

      return { runs };
    },

    getRunDetail(payload) {
      const assignedRun = assignedRuns.get(payload.runId);

      if (!assignedRun || assignedRun.organization.ownerPrincipalId !== payload.ownerPrincipalId) {
        return null;
      }

      return {
        organization: { ...assignedRun.organization },
        run: { ...assignedRun.run },
        workItem: { ...assignedRun.workItem },
        targetAgent: { ...assignedRun.targetAgent },
      };
    },

    getAssignedRunByWorkItem(input) {
      const assignedRun = findAssignedRunByWorkItem(assignedRuns, input.ownerPrincipalId, input.workItemId);
      return assignedRun ? cloneAssignedRun(assignedRun) : null;
    },

    updateAssignedRunByWorkItem(input) {
      const assignedRun = findAssignedRunByWorkItem(assignedRuns, input.ownerPrincipalId, input.workItemId);

      if (!assignedRun) {
        return null;
      }

      if (input.workItemPatch) {
        assignedRun.workItem = {
          ...assignedRun.workItem,
          ...input.workItemPatch,
        };
      }

      if (input.runPatch) {
        assignedRun.run = {
          ...assignedRun.run,
          ...input.runPatch,
        };
      }

      if (input.executionLeasePatch) {
        assignedRun.executionLease = {
          ...assignedRun.executionLease,
          ...input.executionLeasePatch,
        };
      }

      assignedRuns.set(assignedRun.run.runId, cloneAssignedRun(assignedRun));
      return cloneAssignedRun(assignedRun);
    },

    listAssignedRuns(input) {
      const ownerPrincipalId = input.ownerPrincipalId.trim();
      const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";

      return Array.from(assignedRuns.values())
        .filter((assignedRun) => (
          assignedRun.organization.ownerPrincipalId === ownerPrincipalId
          && (!organizationId || assignedRun.organization.organizationId === organizationId)
        ))
        .map((assignedRun) => cloneAssignedRun(assignedRun));
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

function findAssignedRunByWorkItem(
  assignedRuns: Map<string, ManagedAgentPlatformWorkerAssignedRunResult>,
  ownerPrincipalId: string,
  workItemId: string,
): ManagedAgentPlatformWorkerAssignedRunResult | null {
  const matches = Array.from(assignedRuns.values())
    .filter((assignedRun) => (
      assignedRun.organization.ownerPrincipalId === ownerPrincipalId
      && assignedRun.workItem.workItemId === workItemId
    ))
    .sort(compareAssignedRunsForSameWorkItem);

  return matches[0] ?? null;
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

function compareAssignedRunsForSameWorkItem(
  left: ManagedAgentPlatformWorkerAssignedRunResult,
  right: ManagedAgentPlatformWorkerAssignedRunResult,
) {
  const leaseDelta = resolveExecutionLeaseScore(right.executionLease.status) - resolveExecutionLeaseScore(left.executionLease.status);

  if (leaseDelta !== 0) {
    return leaseDelta;
  }

  const runDelta = resolveRunStatusScore(right.run.status) - resolveRunStatusScore(left.run.status);

  if (runDelta !== 0) {
    return runDelta;
  }

  return compareAssignedRuns(right, left);
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

function normalizeRequiredText(value: string | null | undefined, message: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
}

function resolveExecutionLeaseScore(status: ManagedAgentPlatformWorkerAssignedRunResult["executionLease"]["status"]) {
  switch (status) {
    case "active":
      return 4;
    case "expired":
      return 3;
    case "released":
      return 2;
    case "revoked":
      return 1;
    default:
      return 0;
  }
}

function resolveRunStatusScore(status: ManagedAgentPlatformWorkerAssignedRunResult["run"]["status"]) {
  switch (status) {
    case "running":
      return 6;
    case "starting":
      return 5;
    case "created":
      return 4;
    case "waiting_action":
      return 3;
    case "interrupted":
      return 2;
    case "failed":
      return 1;
    case "completed":
    case "cancelled":
      return 0;
    default:
      return 0;
  }
}

function resolveMaxSequentialId(values: Array<string | undefined>, prefix: string): number {
  let maxValue = 0;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const match = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`).exec(value);
    const suffix = match?.[1];

    if (!suffix) {
      continue;
    }

    const parsed = Number.parseInt(suffix, 10);

    if (Number.isFinite(parsed) && parsed > maxValue) {
      maxValue = parsed;
    }
  }

  return maxValue;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTimestamp(value: string | undefined, fallbackNow: () => string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallbackNow();
}

function matchesRunFilters(
  assignedRun: ManagedAgentPlatformWorkerAssignedRunResult,
  payload: ManagedAgentPlatformRunListPayload,
) {
  if (assignedRun.organization.ownerPrincipalId !== payload.ownerPrincipalId) {
    return false;
  }

  if (payload.nodeId && assignedRun.node.nodeId !== payload.nodeId) {
    return false;
  }

  if (payload.workItemId && assignedRun.workItem.workItemId !== payload.workItemId) {
    return false;
  }

  if (payload.status && assignedRun.run.status !== payload.status) {
    return false;
  }

  return true;
}

function compareAssignedRuns(
  left: ManagedAgentPlatformWorkerAssignedRunResult,
  right: ManagedAgentPlatformWorkerAssignedRunResult,
) {
  const leftUpdatedAt = Date.parse(left.run.updatedAt);
  const rightUpdatedAt = Date.parse(right.run.updatedAt);

  if (Number.isFinite(leftUpdatedAt) && Number.isFinite(rightUpdatedAt) && leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt - rightUpdatedAt;
  }

  return left.run.runId.localeCompare(right.run.runId, "en");
}
