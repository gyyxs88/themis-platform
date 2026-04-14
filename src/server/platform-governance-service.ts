import type {
  ManagedAgentPlatformGovernanceFiltersPayload,
  ManagedAgentPlatformGovernanceOverviewResult,
  ManagedAgentPlatformWaitingQueueListPayload,
  ManagedAgentPlatformWaitingQueueResult,
} from "themis-contracts/managed-agent-platform-agents";
import type { ManagedAgentPlatformWorkerAssignedRunResult } from "themis-contracts/managed-agent-platform-worker";
import type { PlatformWorkerRunService } from "./platform-worker-run-service.js";

type PlatformWaitingFor = "human" | "agent";
type PlatformWorkItemRecord = ManagedAgentPlatformWorkerAssignedRunResult["workItem"];

export interface PlatformGovernanceService {
  getGovernanceOverview(payload: ManagedAgentPlatformGovernanceFiltersPayload): ManagedAgentPlatformGovernanceOverviewResult;
  listWaitingQueue(payload: ManagedAgentPlatformWaitingQueueListPayload): ManagedAgentPlatformWaitingQueueResult;
}

export interface InMemoryPlatformGovernanceServiceOptions {
  workerRunService: PlatformWorkerRunService;
  now?: () => string;
  staleThresholdHours?: number;
}

export function createInMemoryPlatformGovernanceService(
  options: InMemoryPlatformGovernanceServiceOptions,
): PlatformGovernanceService {
  const now = options.now ?? (() => new Date().toISOString());
  const staleThresholdHours = Number.isFinite(options.staleThresholdHours)
    ? Math.max(1, Number(options.staleThresholdHours))
    : 24;

  return {
    getGovernanceOverview(payload) {
      const contexts = selectWaitingContexts(options.workerRunService, payload, now, staleThresholdHours);
      const items = contexts.map((context) => context.workItem);

      return {
        summary: buildWaitingSummary(items, now, staleThresholdHours),
        managerHotspots: buildManagerHotspots(contexts),
      };
    },

    listWaitingQueue(payload) {
      const contexts = selectWaitingContexts(options.workerRunService, payload, now, staleThresholdHours);
      const items = contexts.map((context) => ({ ...context.workItem }));

      return {
        summary: buildWaitingSummary(items, now, staleThresholdHours),
        items,
      };
    },
  };
}

function selectWaitingContexts(
  workerRunService: PlatformWorkerRunService,
  payload: ManagedAgentPlatformGovernanceFiltersPayload | ManagedAgentPlatformWaitingQueueListPayload,
  now: () => string,
  staleThresholdHours: number,
): ManagedAgentPlatformWorkerAssignedRunResult[] {
  const contexts = workerRunService.listAssignedRuns({
    ownerPrincipalId: payload.ownerPrincipalId,
    organizationId: payload.organizationId,
  });

  return contexts
    .filter((context) => isWaitingStatus(context.workItem.status))
    .filter((context) => matchesGovernanceFilters(context, payload, now, staleThresholdHours))
    .sort((left, right) => compareWorkItems(left.workItem, right.workItem));
}

function buildWaitingSummary(
  items: PlatformWorkItemRecord[],
  now: () => string,
  staleThresholdHours: number,
) {
  return {
    total: items.length,
    waitingHuman: items.filter((item) => resolveWaitingFor(item) === "human").length,
    waitingAgent: items.filter((item) => resolveWaitingFor(item) === "agent").length,
    attentionCount: items.filter((item) => isAttentionItem(item, now, staleThresholdHours)).length,
  };
}

function buildManagerHotspots(contexts: ManagedAgentPlatformWorkerAssignedRunResult[]) {
  const hotspots = new Map<string, { managerAgentId: string; displayName?: string; itemCount: number }>();

  for (const context of contexts) {
    const managerAgentId = context.targetAgent.agentId;
    const existing = hotspots.get(managerAgentId);

    if (existing) {
      existing.itemCount += 1;
      continue;
    }

    hotspots.set(managerAgentId, {
      managerAgentId,
      displayName: context.targetAgent.displayName,
      itemCount: 1,
    });
  }

  return Array.from(hotspots.values()).sort((left, right) => right.itemCount - left.itemCount);
}

function matchesGovernanceFilters(
  context: ManagedAgentPlatformWorkerAssignedRunResult,
  payload: ManagedAgentPlatformGovernanceFiltersPayload | ManagedAgentPlatformWaitingQueueListPayload,
  now: () => string,
  staleThresholdHours: number,
): boolean {
  const item = context.workItem;

  if (payload.managerAgentId && context.targetAgent.agentId !== payload.managerAgentId) {
    return false;
  }

  if (payload.waitingFor && resolveWaitingFor(item) !== payload.waitingFor) {
    return false;
  }

  if (payload.failedOnly && item.status !== "failed") {
    return false;
  }

  if (payload.staleOnly && !isStaleItem(item, now, staleThresholdHours)) {
    return false;
  }

  if (payload.attentionOnly && !isAttentionItem(item, now, staleThresholdHours)) {
    return false;
  }

  if (Array.isArray(payload.attentionLevels) && payload.attentionLevels.length > 0) {
    const allowedLevels = payload.attentionLevels
      .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
      .filter(Boolean);

    if (allowedLevels.length > 0 && !allowedLevels.includes(resolveAttentionLevel(item, now, staleThresholdHours))) {
      return false;
    }
  }

  return true;
}

function compareWorkItems(left: PlatformWorkItemRecord, right: PlatformWorkItemRecord) {
  const priorityDelta = resolvePriorityWeight(right.priority) - resolvePriorityWeight(left.priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const rightUpdatedAt = Date.parse(right.updatedAt);
  const leftUpdatedAt = Date.parse(left.updatedAt);

  if (Number.isFinite(rightUpdatedAt) && Number.isFinite(leftUpdatedAt) && rightUpdatedAt !== leftUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return right.workItemId.localeCompare(left.workItemId, "en");
}

function resolvePriorityWeight(priority: PlatformWorkItemRecord["priority"]) {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function resolveWaitingFor(item: PlatformWorkItemRecord): PlatformWaitingFor | null {
  if (item.status === "waiting_human") {
    return "human";
  }

  if (item.status === "waiting_agent") {
    return "agent";
  }

  if (item.waitingFor === "human" || item.waitingFor === "agent") {
    return item.waitingFor;
  }

  return null;
}

function isWaitingStatus(status: PlatformWorkItemRecord["status"]) {
  return status === "waiting_human" || status === "waiting_agent";
}

function isAttentionItem(
  item: PlatformWorkItemRecord,
  now: () => string,
  staleThresholdHours: number,
) {
  return item.priority === "urgent"
    || item.priority === "high"
    || isStaleItem(item, now, staleThresholdHours);
}

function isStaleItem(
  item: PlatformWorkItemRecord,
  now: () => string,
  staleThresholdHours: number,
) {
  const updatedAt = Date.parse(item.updatedAt);
  const currentTime = Date.parse(now());

  if (!Number.isFinite(updatedAt) || !Number.isFinite(currentTime)) {
    return false;
  }

  return currentTime - updatedAt >= staleThresholdHours * 60 * 60 * 1000;
}

function resolveAttentionLevel(
  item: PlatformWorkItemRecord,
  now: () => string,
  staleThresholdHours: number,
) {
  if (item.priority === "urgent") {
    return "urgent";
  }

  if (item.priority === "high" || isStaleItem(item, now, staleThresholdHours)) {
    return "attention";
  }

  return "normal";
}
