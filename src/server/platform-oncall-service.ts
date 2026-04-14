import type {
  ManagedAgentPlatformOncallCounts,
  ManagedAgentPlatformOncallDiagnosis,
  ManagedAgentPlatformOncallRecommendation,
  ManagedAgentPlatformOncallSummaryPayload,
  ManagedAgentPlatformOncallSummaryResult,
} from "themis-contracts/managed-agent-platform-oncall";
import type {
  ManagedAgentPlatformAgentRecord,
  ManagedAgentPlatformWorkItemRecord,
} from "themis-contracts/managed-agent-platform-shared";
import type {
  ManagedAgentPlatformWorkerAssignedRunResult,
  ManagedAgentPlatformWorkerNodeDetailResult,
  ManagedAgentPlatformWorkerNodeRecord,
} from "themis-contracts/managed-agent-platform-worker";
import type { PlatformControlPlaneService } from "./platform-control-plane-service.js";
import type { PlatformGovernanceService } from "./platform-governance-service.js";
import type { PlatformNodeService } from "./platform-node-service.js";
import type { PlatformWorkerRunService } from "./platform-worker-run-service.js";

interface NodeAttention {
  severity: "error" | "warning";
  code: "detail_failed" | "offline_active_lease" | "heartbeat_expired" | "heartbeat_stale" | "draining_active_lease";
  summary: string;
  recommendedAction: string;
}

interface NodeOncallContext {
  node: ManagedAgentPlatformWorkerNodeRecord;
  detail: ManagedAgentPlatformWorkerNodeDetailResult | null;
  attention: NodeAttention | null;
}

export interface PlatformOncallService {
  getOncallSummary(payload: ManagedAgentPlatformOncallSummaryPayload): ManagedAgentPlatformOncallSummaryResult;
}

export interface InMemoryPlatformOncallServiceOptions {
  nodeService: PlatformNodeService;
  governanceService: PlatformGovernanceService;
  workerRunService: PlatformWorkerRunService;
  controlPlaneService: PlatformControlPlaneService;
  now?: () => string;
  staleThresholdHours?: number;
}

export function createInMemoryPlatformOncallService(
  options: InMemoryPlatformOncallServiceOptions,
): PlatformOncallService {
  const now = options.now ?? (() => new Date().toISOString());
  const staleThresholdHours = Number.isFinite(options.staleThresholdHours)
    ? Math.max(1, Number(options.staleThresholdHours))
    : 24;

  return {
    getOncallSummary(payload) {
      const ownerPrincipalId = normalizeRequiredText(payload.ownerPrincipalId, "ownerPrincipalId is required.");
      const organizationId = normalizeOptionalText(payload.organizationId);
      const generatedAt = now();
      const limit = Number.isFinite(payload.limit) ? Math.max(1, Math.floor(Number(payload.limit))) : 8;
      const listPayload = {
        ownerPrincipalId,
        ...(organizationId ? { organizationId } : {}),
      };
      const nodeContexts = options.nodeService.listNodes(listPayload)
        .map((node) => summarizeNodeContext(options.nodeService, ownerPrincipalId, node, generatedAt));
      const waitingPayload = options.governanceService.listWaitingQueue(listPayload);
      const waitingItems = Array.isArray(waitingPayload.items) ? waitingPayload.items : [];
      const assignedRuns = options.workerRunService.listAssignedRuns(listPayload);
      const agentsResult = options.controlPlaneService.listAgents({ ownerPrincipalId });
      const agents = (Array.isArray(agentsResult.agents) ? agentsResult.agents : [])
        .filter((agent) => !organizationId || agent.organizationId === organizationId);
      const counts = summarizeCounts(nodeContexts, waitingItems, assignedRuns, agents, generatedAt, staleThresholdHours);
      const recommendations = buildRecommendations(
        nodeContexts,
        waitingItems,
        assignedRuns,
        counts,
        agents,
        generatedAt,
        staleThresholdHours,
        limit,
      );
      const primaryDiagnosis = buildPrimaryDiagnosis(counts, recommendations);
      const recommendedNextSteps = buildRecommendedNextSteps(primaryDiagnosis, recommendations, counts);

      return {
        generatedAt,
        ownerPrincipalId,
        organizationId,
        counts,
        primaryDiagnosis,
        recommendedNextSteps,
        recommendations,
      };
    },
  };
}

function summarizeCounts(
  nodeContexts: NodeOncallContext[],
  waitingItems: ManagedAgentPlatformWorkItemRecord[],
  assignedRuns: ManagedAgentPlatformWorkerAssignedRunResult[],
  agents: ManagedAgentPlatformAgentRecord[],
  now: string,
  staleThresholdHours: number,
): ManagedAgentPlatformOncallCounts {
  return {
    nodeTotal: nodeContexts.length,
    nodeErrorCount: nodeContexts.filter((context) => context.attention?.severity === "error").length,
    nodeWarningCount: nodeContexts.filter((context) => context.attention?.severity === "warning").length,
    waitingAttentionCount: waitingItems.filter((item) => isWaitingAttentionItem(item, now, staleThresholdHours)).length,
    waitingHumanCount: waitingItems.filter((item) => item.status === "waiting_human").length,
    runWaitingActionCount: assignedRuns.filter((item) => item.run.status === "waiting_action").length,
    runFailedCount: assignedRuns.filter((item) => item.run.status === "failed").length,
    pausedAgentCount: agents.filter((agent) => agent.status === "paused").length,
  };
}

function buildRecommendations(
  nodeContexts: NodeOncallContext[],
  waitingItems: ManagedAgentPlatformWorkItemRecord[],
  assignedRuns: ManagedAgentPlatformWorkerAssignedRunResult[],
  counts: ManagedAgentPlatformOncallCounts,
  agents: ManagedAgentPlatformAgentRecord[],
  now: string,
  staleThresholdHours: number,
  limit: number,
): ManagedAgentPlatformOncallRecommendation[] {
  const recommendations: ManagedAgentPlatformOncallRecommendation[] = [];

  for (const context of nodeContexts) {
    if (!context.attention) {
      continue;
    }

    const detail = context.detail;
    const activeLeaseCount = detail?.leaseSummary?.activeCount ?? 0;
    recommendations.push({
      recommendationId: `node:${context.node.nodeId}:${context.attention.code}`,
      category: "worker_fleet",
      severity: context.attention.severity,
      title: `${context.node.displayName} 需要值班处理`,
      summary: `${context.attention.summary} 当前节点状态 ${context.node.status}，active lease ${activeLeaseCount}。`,
      recommendedAction: context.attention.recommendedAction,
      subjectId: context.node.nodeId,
    });
  }

  for (const assignedRun of assignedRuns) {
    if (assignedRun.run.status !== "failed") {
      continue;
    }

    recommendations.push({
      recommendationId: `run:${assignedRun.run.runId}:failed`,
      category: "runs",
      severity: "error",
      title: `${assignedRun.run.runId} 执行失败`,
      summary: `${assignedRun.targetAgent.displayName} 的工作项“${assignedRun.workItem.goal}”执行失败，当前节点 ${assignedRun.node.displayName}。`,
      recommendedAction: `先查看 run ${assignedRun.run.runId} 的 detail 与节点 ${assignedRun.node.nodeId} 状态；必要时再决定是否 reclaim 或重新派发。`,
      subjectId: assignedRun.run.runId,
    });
  }

  for (const item of waitingItems) {
    if (!isWaitingAttentionItem(item, now, staleThresholdHours)) {
      continue;
    }

    recommendations.push({
      recommendationId: `waiting:${item.workItemId}`,
      category: "waiting_queue",
      severity: "warning",
      title: item.goal || item.workItemId,
      summary: buildWaitingSummary(item, now, staleThresholdHours),
      recommendedAction: resolveWaitingRecommendedAction(item, now, staleThresholdHours),
      subjectId: item.workItemId,
    });
  }

  if (counts.pausedAgentCount > 0 && (counts.waitingAttentionCount > 0 || counts.runWaitingActionCount > 0)) {
    const sampleAgents = agents
      .filter((agent) => agent.status === "paused")
      .slice(0, 2)
      .map((agent) => agent.displayName || agent.agentId)
      .filter(Boolean);
    const sampleLabel = sampleAgents.length > 0 ? `，例如 ${sampleAgents.join(" / ")}` : "";
    recommendations.push({
      recommendationId: "agents:paused-capacity",
      category: "agents",
      severity: "warning",
      title: `当前有 ${counts.pausedAgentCount} 个 paused agent`,
      summary: `平台仍有 ${counts.waitingAttentionCount} 条高关注 waiting 项与 ${counts.runWaitingActionCount} 条 waiting_action run${sampleLabel}。`,
      recommendedAction: "确认 paused agents 是否仍需保持暂停；如当前积压持续升高，优先评估是否恢复一个 agent 分担负载。",
      subjectId: sampleAgents[0] ?? undefined,
    });
  }

  return recommendations
    .sort((left, right) => compareSeverity(right.severity) - compareSeverity(left.severity) || left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, limit);
}

function buildPrimaryDiagnosis(
  counts: ManagedAgentPlatformOncallCounts,
  recommendations: ManagedAgentPlatformOncallRecommendation[],
): ManagedAgentPlatformOncallDiagnosis {
  if (counts.nodeTotal === 0) {
    return {
      id: "oncall_worker_fleet_empty",
      severity: "warning",
      title: "当前平台还没有已注册 Worker Node",
      summary: "平台控制面可用，但当前节点列表为空，值班还无法形成稳定执行闭环。",
    };
  }

  if (counts.nodeErrorCount > 0 || counts.runFailedCount > 0) {
    return {
      id: "oncall_error_attention",
      severity: "error",
      title: "当前存在需要立即处理的值班故障",
      summary: `节点 error ${counts.nodeErrorCount} 台，失败 run ${counts.runFailedCount} 条。建议先处理 Worker Node 或执行链路故障，再看普通 waiting 积压。`,
    };
  }

  if (
    counts.nodeWarningCount > 0
    || counts.waitingAttentionCount > 0
    || counts.runWaitingActionCount > 0
    || recommendations.length > 0
  ) {
    return {
      id: "oncall_warning_attention",
      severity: "warning",
      title: "当前有需要继续跟进的值班建议",
      summary: `节点 warning ${counts.nodeWarningCount} 台，高关注 waiting ${counts.waitingAttentionCount} 条，waiting_action run ${counts.runWaitingActionCount} 条。`,
    };
  }

  return {
    id: "oncall_healthy",
    severity: "info",
    title: "当前值班面整体稳定",
    summary: "没有发现需要立即处理的节点、执行链路或 waiting attention 项。",
  };
}

function buildRecommendedNextSteps(
  diagnosis: ManagedAgentPlatformOncallDiagnosis,
  recommendations: ManagedAgentPlatformOncallRecommendation[],
  counts: ManagedAgentPlatformOncallCounts,
): string[] {
  const steps = new Set<string>();

  if (diagnosis.id === "oncall_worker_fleet_empty") {
    steps.add("先启动至少 1 台 Worker Node，并确认 register / heartbeat 能稳定写回平台。");
  }

  if (counts.nodeErrorCount > 0) {
    steps.add("优先处理节点 error attention，再决定是否执行 reclaim / offline。");
  }

  if (counts.runFailedCount > 0) {
    steps.add("打开 recent runs detail，先确认失败 run 的节点状态和 work-item 是否需要重新派发。");
  }

  if (counts.waitingAttentionCount > 0) {
    steps.add("按 waiting queue 的高关注项顺序处理人工决策、对端 agent 阻塞和超时积压。");
  }

  if (counts.runWaitingActionCount > 0) {
    steps.add("对 waiting_action runs，按 handoff -> mailbox -> work-item detail 的顺序补齐上下文。");
  }

  if (counts.pausedAgentCount > 0 && counts.waitingAttentionCount > 0) {
    steps.add("确认 paused agents 是否需要恢复，以避免 waiting attention 持续累积。");
  }

  for (const recommendation of recommendations) {
    steps.add(recommendation.recommendedAction);
  }

  if (steps.size === 0) {
    steps.add("继续按 nodes -> waiting queue -> recent runs 的顺序巡检平台控制面。");
  }

  return Array.from(steps).slice(0, 6);
}

function summarizeNodeContext(
  nodeService: PlatformNodeService,
  ownerPrincipalId: string,
  node: ManagedAgentPlatformWorkerNodeRecord,
  now: string,
): NodeOncallContext {
  const detail = nodeService.getNodeDetail({
    ownerPrincipalId,
    nodeId: node.nodeId,
  });

  if (!detail) {
    return {
      node,
      detail: null,
      attention: {
        severity: "error",
        code: "detail_failed",
        summary: "节点详情读取失败，当前无法确认 lease 与 recent execution 状态。",
        recommendedAction: `重试读取节点 ${node.displayName} (${node.nodeId}) 的 detail；若仍失败，再排查平台服务端日志。`,
      },
    };
  }

  return {
    node,
    detail,
    attention: summarizeNodeAttention(node, detail, now),
  };
}

function summarizeNodeAttention(
  node: ManagedAgentPlatformWorkerNodeRecord,
  detail: ManagedAgentPlatformWorkerNodeDetailResult,
  now: string,
): NodeAttention | null {
  const heartbeat = summarizeHeartbeat(node, now);
  const activeLeaseCount = detail.leaseSummary?.activeCount ?? 0;

  if (node.status === "offline" && activeLeaseCount > 0) {
    return {
      severity: "error",
      code: "offline_active_lease",
      summary: "节点已 offline，但仍有 active lease 残留。",
      recommendedAction: `先确认节点 ${node.displayName} (${node.nodeId}) 是否已真正停机；必要时再执行 reclaim。`,
    };
  }

  if (heartbeat === "expired" && node.status !== "offline") {
    return {
      severity: "error",
      code: "heartbeat_expired",
      summary: "节点心跳已超过 TTL，但仍停留在调度面。",
      recommendedAction: `先在节点 ${node.displayName} (${node.nodeId}) 本机确认服务状态；必要时再显式 offline。`,
    };
  }

  if (node.status === "draining" && activeLeaseCount > 0) {
    return {
      severity: "warning",
      code: "draining_active_lease",
      summary: "节点正在 draining，仍有任务在跑。",
      recommendedAction: `继续观察节点 ${node.displayName} (${node.nodeId}) 的 active lease 是否自然清空，再决定是否停机。`,
    };
  }

  if (heartbeat === "stale" && node.status !== "offline") {
    return {
      severity: "warning",
      code: "heartbeat_stale",
      summary: "节点心跳已接近 TTL。",
      recommendedAction: `先检查节点 ${node.displayName} (${node.nodeId}) 是否卡死或频繁重启。`,
    };
  }

  return null;
}

function summarizeHeartbeat(node: ManagedAgentPlatformWorkerNodeRecord, now: string) {
  const ttlSeconds = Number(node.heartbeatTtlSeconds ?? 0);
  const nowTs = Date.parse(now);
  const heartbeatTs = Date.parse(node.lastHeartbeatAt ?? "");

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || Number.isNaN(nowTs) || Number.isNaN(heartbeatTs)) {
    return "unknown";
  }

  const ageSeconds = Math.max(0, Math.floor((nowTs - heartbeatTs) / 1000));

  if (ageSeconds > ttlSeconds) {
    return "expired";
  }

  if (ageSeconds > Math.floor((ttlSeconds * 2) / 3)) {
    return "stale";
  }

  return "fresh";
}

function isWaitingAttentionItem(
  item: ManagedAgentPlatformWorkItemRecord,
  now: string,
  staleThresholdHours: number,
) {
  return item.priority === "urgent"
    || item.priority === "high"
    || isStaleWaitingItem(item, now, staleThresholdHours);
}

function isStaleWaitingItem(
  item: ManagedAgentPlatformWorkItemRecord,
  now: string,
  staleThresholdHours: number,
) {
  const updatedAt = Date.parse(item.updatedAt);
  const currentTime = Date.parse(now);

  if (!Number.isFinite(updatedAt) || !Number.isFinite(currentTime)) {
    return false;
  }

  return currentTime - updatedAt >= staleThresholdHours * 60 * 60 * 1000;
}

function buildWaitingSummary(
  item: ManagedAgentPlatformWorkItemRecord,
  now: string,
  staleThresholdHours: number,
) {
  const segments = [
    item.status === "waiting_human" ? "当前等待人工处理" : "",
    item.status === "waiting_agent" ? "当前等待对端 agent 继续推进" : "",
    item.priority === "urgent" ? "优先级 urgent" : "",
    item.priority === "high" ? "优先级 high" : "",
    isStaleWaitingItem(item, now, staleThresholdHours) ? `已超过 ${staleThresholdHours} 小时未更新` : "",
  ].filter(Boolean);

  return segments.length > 0
    ? `工作项 ${item.workItemId}：${segments.join("，")}。`
    : `工作项 ${item.workItemId} 当前处于 ${item.status}。`;
}

function resolveWaitingRecommendedAction(
  item: ManagedAgentPlatformWorkItemRecord,
  now: string,
  staleThresholdHours: number,
) {
  if (item.status === "waiting_human") {
    return `优先打开 work-item ${item.workItemId} 的 detail，补齐人工决策后再决定是否 approve / deny。`;
  }

  if (item.status === "waiting_agent") {
    return `优先查看 work-item ${item.workItemId} 的 handoff 与 mailbox 上下文，确认对端 agent 是否卡在输入不足。`;
  }

  if (isStaleWaitingItem(item, now, staleThresholdHours)) {
    return `优先查看 work-item ${item.workItemId} 最近一次更新时间，确认是否需要升级或重新派发。`;
  }

  return `先打开 work-item ${item.workItemId} detail，确认当前 waiting 原因和下一步处理动作。`;
}

function compareSeverity(severity: ManagedAgentPlatformOncallRecommendation["severity"]) {
  switch (severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    default:
      return 1;
  }
}

function normalizeRequiredText(value: string | null | undefined, message: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}
