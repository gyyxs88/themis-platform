import type {
  ManagedAgentPlatformCollaborationDashboardPayload,
  ManagedAgentPlatformCollaborationDashboardResult,
} from "themis-contracts/managed-agent-platform-agents";
import type {
  ManagedAgentPlatformAgentRecord,
  ManagedAgentPlatformHandoffRecord,
  ManagedAgentPlatformTimelineEntry,
  ManagedAgentPlatformWaitingQueueSummary,
} from "themis-contracts/managed-agent-platform-shared";
import type {
  ManagedAgentPlatformHandoffListPayload,
  ManagedAgentPlatformHandoffListResult,
} from "themis-contracts/managed-agent-platform-collaboration";
import type { ManagedAgentPlatformWorkerAssignedRunResult } from "themis-contracts/managed-agent-platform-worker";
import type { PlatformWorkerRunService } from "./platform-worker-run-service.js";

type PlatformWorkItemRecord = ManagedAgentPlatformWorkerAssignedRunResult["workItem"];
type PlatformWaitingFor = "human" | "agent";

export interface PlatformCollaborationParentSeed {
  ownerPrincipalId: string;
  organizationId?: string;
  parentWorkItemId: string;
  displayName?: string;
  childWorkItemIds: string[];
}

export interface PlatformAgentHandoffSeed {
  ownerPrincipalId: string;
  organizationId?: string;
  agentId: string;
  agent?: ManagedAgentPlatformAgentRecord;
  handoffs: ManagedAgentPlatformHandoffRecord[];
  timeline: ManagedAgentPlatformTimelineEntry[];
}

export interface PlatformCollaborationService {
  getCollaborationDashboard(
    payload: ManagedAgentPlatformCollaborationDashboardPayload,
  ): ManagedAgentPlatformCollaborationDashboardResult;
  getAgentHandoffList(payload: ManagedAgentPlatformHandoffListPayload): ManagedAgentPlatformHandoffListResult | null;
  replaceSeeds(input: {
    parentSeeds: PlatformCollaborationParentSeed[];
    handoffSeeds: PlatformAgentHandoffSeed[];
  }): void;
}

export interface InMemoryPlatformCollaborationServiceOptions {
  workerRunService: PlatformWorkerRunService;
  parentSeeds?: PlatformCollaborationParentSeed[];
  handoffSeeds?: PlatformAgentHandoffSeed[];
  now?: () => string;
  staleThresholdHours?: number;
}

export function createInMemoryPlatformCollaborationService(
  options: InMemoryPlatformCollaborationServiceOptions,
): PlatformCollaborationService {
  const now = options.now ?? (() => new Date().toISOString());
  const staleThresholdHours = Number.isFinite(options.staleThresholdHours)
    ? Math.max(1, Number(options.staleThresholdHours))
    : 24;
  const parentSeeds = Array.isArray(options.parentSeeds) ? options.parentSeeds.map(cloneParentSeed) : [];
  const handoffSeeds = Array.isArray(options.handoffSeeds) ? options.handoffSeeds.map(cloneHandoffSeed) : [];

  return {
    replaceSeeds(input) {
      parentSeeds.splice(0, parentSeeds.length, ...input.parentSeeds.map(cloneParentSeed));
      handoffSeeds.splice(0, handoffSeeds.length, ...input.handoffSeeds.map(cloneHandoffSeed));
    },

    getCollaborationDashboard(payload) {
      const contexts = selectWaitingContexts(options.workerRunService, payload, now, staleThresholdHours);
      const parents = buildParentGroups(contexts, parentSeeds, payload);

      return {
        summary: buildWaitingSummary(contexts.map((context) => context.workItem), now, staleThresholdHours),
        parents: applyLimit(parents, payload.limit),
      };
    },

    getAgentHandoffList(payload) {
      const agent = resolveAgentRecord(options.workerRunService, handoffSeeds, payload);

      if (!agent) {
        return null;
      }

      const seed = handoffSeeds.find((candidate) => (
        candidate.ownerPrincipalId === payload.ownerPrincipalId
        && candidate.agentId === payload.agentId
      ));
      const handoffs = (seed?.handoffs ?? [])
        .filter((handoff) => matchesWorkItemFilter(handoff.workItemId, payload.workItemId))
        .sort(compareTimestampedDesc);
      const timeline = (seed?.timeline ?? [])
        .filter((entry) => matchesWorkItemFilter(entry.workItemId, payload.workItemId))
        .sort(compareTimestampedDesc);

      return {
        agent,
        handoffs: applyLimit(handoffs, payload.limit).map((handoff) => ({ ...handoff })),
        timeline: applyLimit(timeline, payload.limit).map((entry) => ({ ...entry })),
      };
    },
  };
}

function buildParentGroups(
  contexts: ManagedAgentPlatformWorkerAssignedRunResult[],
  parentSeeds: PlatformCollaborationParentSeed[],
  payload: ManagedAgentPlatformCollaborationDashboardPayload,
): ManagedAgentPlatformCollaborationDashboardResult["parents"] {
  const parents = [];
  const workItemsById = new Map(contexts.map((context) => [context.workItem.workItemId, { ...context.workItem }] as const));
  const matchedWorkItemIds = new Set<string>();

  for (const seed of parentSeeds) {
    if (seed.ownerPrincipalId !== payload.ownerPrincipalId) {
      continue;
    }

    if (!matchesOrganization(seed.organizationId, payload.organizationId)) {
      continue;
    }

    const items = seed.childWorkItemIds
      .map((workItemId) => workItemsById.get(workItemId))
      .filter((item): item is PlatformWorkItemRecord => Boolean(item));

    if (items.length === 0) {
      continue;
    }

    for (const item of items) {
      matchedWorkItemIds.add(item.workItemId);
    }

    parents.push({
      parentWorkItemId: seed.parentWorkItemId,
      ...(seed.displayName ? { displayName: seed.displayName } : {}),
      items: items.sort(compareWorkItems),
    });
  }

  for (const context of contexts) {
    if (matchedWorkItemIds.has(context.workItem.workItemId)) {
      continue;
    }

    parents.push({
      parentWorkItemId: context.workItem.workItemId,
      displayName: context.workItem.goal,
      items: [{ ...context.workItem }],
    });
  }

  return parents.sort(compareParentGroups);
}

function resolveAgentRecord(
  workerRunService: PlatformWorkerRunService,
  handoffSeeds: PlatformAgentHandoffSeed[],
  payload: ManagedAgentPlatformHandoffListPayload,
): ManagedAgentPlatformAgentRecord | null {
  const context = workerRunService.listAssignedRuns({
    ownerPrincipalId: payload.ownerPrincipalId,
  }).find((candidate) => candidate.targetAgent.agentId === payload.agentId);

  if (context) {
    return { ...context.targetAgent };
  }

  const seed = handoffSeeds.find((candidate) => (
    candidate.ownerPrincipalId === payload.ownerPrincipalId
    && candidate.agentId === payload.agentId
    && candidate.agent
  ));

  return seed?.agent ? { ...seed.agent } : null;
}

function selectWaitingContexts(
  workerRunService: PlatformWorkerRunService,
  payload: ManagedAgentPlatformCollaborationDashboardPayload,
  now: () => string,
  staleThresholdHours: number,
) {
  return workerRunService.listAssignedRuns({
    ownerPrincipalId: payload.ownerPrincipalId,
    organizationId: payload.organizationId,
  })
    .filter((context) => isWaitingStatus(context.workItem.status))
    .filter((context) => matchesGovernanceFilters(context, payload, now, staleThresholdHours))
    .sort((left, right) => compareWorkItems(left.workItem, right.workItem));
}

function buildWaitingSummary(
  items: PlatformWorkItemRecord[],
  now: () => string,
  staleThresholdHours: number,
): ManagedAgentPlatformWaitingQueueSummary {
  return {
    total: items.length,
    waitingHuman: items.filter((item) => resolveWaitingFor(item) === "human").length,
    waitingAgent: items.filter((item) => resolveWaitingFor(item) === "agent").length,
    attentionCount: items.filter((item) => isAttentionItem(item, now, staleThresholdHours)).length,
  };
}

function matchesGovernanceFilters(
  context: ManagedAgentPlatformWorkerAssignedRunResult,
  payload: ManagedAgentPlatformCollaborationDashboardPayload,
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

function compareParentGroups(
  left: ManagedAgentPlatformCollaborationDashboardResult["parents"][number],
  right: ManagedAgentPlatformCollaborationDashboardResult["parents"][number],
) {
  const itemCountDelta = right.items.length - left.items.length;

  if (itemCountDelta !== 0) {
    return itemCountDelta;
  }

  return compareWorkItems(left.items[0], right.items[0]);
}

function compareWorkItems(left: PlatformWorkItemRecord, right: PlatformWorkItemRecord) {
  const priorityDelta = resolvePriorityWeight(right.priority) - resolvePriorityWeight(left.priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return compareTimestampedDesc(left, right);
}

function compareTimestampedDesc(
  left: { updatedAt?: string; createdAt?: string; [key: string]: unknown },
  right: { updatedAt?: string; createdAt?: string; [key: string]: unknown },
) {
  const leftTimestamp = Date.parse(String(left.updatedAt ?? left.createdAt ?? ""));
  const rightTimestamp = Date.parse(String(right.updatedAt ?? right.createdAt ?? ""));

  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? ""), "en");
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

function matchesOrganization(seedOrganizationId: string | undefined, organizationId: string | undefined) {
  if (!organizationId) {
    return true;
  }

  return !seedOrganizationId || seedOrganizationId === organizationId;
}

function matchesWorkItemFilter(candidateWorkItemId: string | null | undefined, workItemId: string | undefined) {
  if (!workItemId) {
    return true;
  }

  return candidateWorkItemId === workItemId;
}

function cloneParentSeed(seed: PlatformCollaborationParentSeed): PlatformCollaborationParentSeed {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    ...(seed.organizationId ? { organizationId: seed.organizationId } : {}),
    parentWorkItemId: seed.parentWorkItemId,
    ...(seed.displayName ? { displayName: seed.displayName } : {}),
    childWorkItemIds: [...seed.childWorkItemIds],
  };
}

function cloneHandoffSeed(seed: PlatformAgentHandoffSeed): PlatformAgentHandoffSeed {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    ...(seed.organizationId ? { organizationId: seed.organizationId } : {}),
    agentId: seed.agentId,
    ...(seed.agent ? { agent: { ...seed.agent } } : {}),
    handoffs: seed.handoffs.map((handoff) => ({ ...handoff })),
    timeline: seed.timeline.map((entry) => ({ ...entry })),
  };
}

function applyLimit<T>(items: T[], limit: number | undefined): T[] {
  if (!Number.isFinite(limit)) {
    return items;
  }

  return items.slice(0, Math.max(1, Number(limit)));
}
