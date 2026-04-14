import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  buildPlatformRouteNotFoundErrorResponse,
} from "themis-contracts/managed-agent-platform-access";
import type {
  ManagedAgentPlatformNodeDetailPayload,
  ManagedAgentPlatformNodeHeartbeatPayload,
  ManagedAgentPlatformNodeListPayload,
  ManagedAgentPlatformNodeReclaimPayload,
  ManagedAgentPlatformNodeRegisterPayload,
  ManagedAgentPlatformWorkerPullPayload,
  ManagedAgentPlatformWorkerRunCompletePayload,
  ManagedAgentPlatformWorkerRunStatusPayload,
} from "themis-contracts/managed-agent-platform-worker";
import type {
  ManagedAgentPlatformAgentCreatePayload,
  ManagedAgentPlatformAgentDetailPayload,
  ManagedAgentPlatformAgentExecutionBoundaryUpdatePayload,
  ManagedAgentPlatformAgentLifecyclePayload,
  ManagedAgentPlatformCollaborationDashboardPayload,
  ManagedAgentPlatformGovernanceFiltersPayload,
  ManagedAgentPlatformAgentSpawnPolicyUpdatePayload,
  ManagedAgentPlatformWaitingQueueListPayload,
} from "themis-contracts/managed-agent-platform-agents";
import type {
  ManagedAgentPlatformHandoffListPayload,
  ManagedAgentPlatformMailboxAckPayload,
  ManagedAgentPlatformMailboxListPayload,
  ManagedAgentPlatformMailboxPullPayload,
  ManagedAgentPlatformMailboxRespondPayload,
  ManagedAgentPlatformRunDetailPayload,
  ManagedAgentPlatformRunListPayload,
} from "themis-contracts/managed-agent-platform-collaboration";
import type {
  ManagedAgentPlatformWorkItemCancelPayload,
  ManagedAgentPlatformWorkItemDetailPayload,
  ManagedAgentPlatformWorkItemDispatchPayload,
  ManagedAgentPlatformWorkItemEscalatePayload,
  ManagedAgentPlatformWorkItemListPayload,
  ManagedAgentPlatformWorkItemRespondPayload,
} from "themis-contracts/managed-agent-platform-work-items";
import type {
  ManagedAgentPlatformProjectWorkspaceBindingDetailPayload,
  ManagedAgentPlatformProjectWorkspaceBindingListPayload,
  ManagedAgentPlatformProjectWorkspaceBindingUpsertPayload,
} from "themis-contracts/managed-agent-platform-projects";
import type { ManagedAgentPlatformOncallSummaryPayload } from "themis-contracts/managed-agent-platform-oncall";
import { readPlatformAsset } from "./platform-assets.js";
import {
  createInMemoryPlatformCollaborationService,
  type PlatformCollaborationService,
} from "./platform-collaboration-service.js";
import {
  createInMemoryPlatformControlPlaneService,
  type PlatformControlPlaneService,
} from "./platform-control-plane-service.js";
import { createInMemoryPlatformGovernanceService, type PlatformGovernanceService } from "./platform-governance-service.js";
import { createInMemoryPlatformNodeService, type PlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformOncallService, type PlatformOncallService } from "./platform-oncall-service.js";
import { createInMemoryPlatformWorkerRunService, type PlatformWorkerRunService } from "./platform-worker-run-service.js";
import {
  createInMemoryPlatformWorkflowService,
  type PlatformQueuedWorkItemContext,
  type PlatformWorkflowService,
} from "./platform-workflow-service.js";
import {
  buildPlatformServiceOwnerMismatchBody,
  createPlatformWebAccessService,
  getPlatformServiceAuthContext,
  maybeHandlePlatformWebAccessRoute,
  PlatformWebAccessService,
  requirePlatformWebAccess,
} from "./platform-web-access.js";

export interface PlatformAppOptions {
  serviceName?: string;
  appDisplayName?: string;
  accessMode?: "open" | "protected";
  defaultWorkspacePath?: string;
  nodeService?: PlatformNodeService;
  workerRunService?: PlatformWorkerRunService;
  governanceService?: PlatformGovernanceService;
  collaborationService?: PlatformCollaborationService;
  workflowService?: PlatformWorkflowService;
  controlPlaneService?: PlatformControlPlaneService;
  oncallService?: PlatformOncallService;
  webAuthTokenLabel?: string;
  authService?: PlatformWebAccessService;
}

export function createPlatformApp(options: PlatformAppOptions = {}): Server {
  const serviceName = options.serviceName ?? "themis-platform";
  const appDisplayName = options.appDisplayName ?? "Themis Platform";
  const accessMode = options.accessMode ?? "open";
  const defaultWorkspacePath = options.defaultWorkspacePath ?? "/tmp/themis-shared-worker-v1";
  const nodeService = options.nodeService ?? createInMemoryPlatformNodeService();
  const workerRunService = options.workerRunService ?? createInMemoryPlatformWorkerRunService({
    nodeService,
  });
  const governanceService = options.governanceService ?? createInMemoryPlatformGovernanceService({
    workerRunService,
  });
  const collaborationService = options.collaborationService ?? createInMemoryPlatformCollaborationService({
    workerRunService,
  });
  const workflowService = options.workflowService ?? createInMemoryPlatformWorkflowService({
    workerRunService,
  });
  const controlPlaneService = options.controlPlaneService ?? createInMemoryPlatformControlPlaneService();
  const oncallService = options.oncallService ?? createInMemoryPlatformOncallService({
    nodeService,
    governanceService,
    workerRunService,
    controlPlaneService,
  });
  const webAuthTokenLabel = options.webAuthTokenLabel ?? "";
  const authService = options.authService ?? (accessMode === "protected"
    ? createPlatformWebAccessService({
      webLoginTokenLabel: webAuthTokenLabel,
    })
    : null);

  return createServer((request, response) => {
    void handlePlatformRequest(request, response, {
      serviceName,
      appDisplayName,
      accessMode,
      defaultWorkspacePath,
      nodeService,
      workerRunService,
      governanceService,
      collaborationService,
      workflowService,
      controlPlaneService,
      oncallService,
      webAuthTokenLabel,
      authService,
    });
  });
}

interface HandlePlatformRequestOptions {
  serviceName: string;
  appDisplayName: string;
  accessMode: "open" | "protected";
  defaultWorkspacePath: string;
  nodeService: PlatformNodeService;
  workerRunService: PlatformWorkerRunService;
  governanceService: PlatformGovernanceService;
  collaborationService: PlatformCollaborationService;
  workflowService: PlatformWorkflowService;
  controlPlaneService: PlatformControlPlaneService;
  oncallService: PlatformOncallService;
  webAuthTokenLabel: string;
  authService: PlatformWebAccessService | null;
}

async function handlePlatformRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HandlePlatformRequestOptions,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  try {
    if (method === "GET" && url.pathname === "/api/health") {
      return writeJson(response, 200, {
        ok: true,
        service: options.serviceName,
      });
    }

    if (options.authService) {
      if (await maybeHandlePlatformWebAccessRoute(request, response, options.authService, {
        appDisplayName: options.appDisplayName,
      })) {
        return;
      }
    }

    if (options.accessMode === "protected") {
      if (!options.authService) {
        return writeJson(response, 500, buildBadRequestErrorResponse("平台鉴权服务未初始化。"));
      }

      if (!requirePlatformWebAccess(request, response, options.authService, {
        appDisplayName: options.appDisplayName,
      })) {
        return;
      }
    }

    const staticAsset = readPlatformAsset(url.pathname);

    if (method === "GET" && staticAsset) {
      return writeText(response, 200, staticAsset.contentType, staticAsset.body);
    }

    if (method === "GET" && url.pathname === "/api/web-auth/status") {
      return writeJson(response, 200, {
        authenticated: Boolean(options.webAuthTokenLabel),
        tokenLabel: options.webAuthTokenLabel,
      });
    }

    if (method === "POST" && url.pathname === "/api/platform/oncall/summary") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformOncallSummaryPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.oncallService.getOncallSummary(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/register") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeRegisterPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.nodeService.registerNode(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/heartbeat") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeHeartbeatPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.heartbeatNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.node?.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, {
        nodes: options.nodeService.listNodes(payload),
      });
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/detail") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.getNodeDetail(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/drain") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.drainNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/offline") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.offlineNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/reclaim") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeReclaimPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.reclaimNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/governance-overview") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformGovernanceFiltersPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.governanceService.getGovernanceOverview(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/list") {
      const payload = await readAuthorizedPayload<{ ownerPrincipalId: string }>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.controlPlaneService.listAgents(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/detail") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.getAgentDetail(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/create") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentCreatePayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.controlPlaneService.createAgent(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/execution-boundary/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentExecutionBoundaryUpdatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.updateExecutionBoundary(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/spawn-policy/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentSpawnPolicyUpdatePayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.controlPlaneService.updateSpawnPolicy(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/pause") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentLifecyclePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.pauseAgent(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/resume") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentLifecyclePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.resumeAgent(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/archive") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentLifecyclePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.archiveAgent(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/waiting/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWaitingQueueListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.governanceService.listWaitingQueue(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/collaboration-dashboard") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformCollaborationDashboardPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.collaborationService.getCollaborationDashboard(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/handoffs/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformHandoffListPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.collaborationService.getAgentHandoffList(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/mailbox/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMailboxListPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.listMailbox(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/mailbox/pull") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMailboxPullPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.pullMailbox(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/mailbox/ack") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMailboxAckPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.ackMailbox(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Mailbox entry ${payload.mailboxEntryId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/mailbox/respond") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMailboxRespondPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.respondMailbox(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Mailbox entry ${payload.mailboxEntryId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.workflowService.listWorkItems(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/projects/workspace-binding/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformProjectWorkspaceBindingListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.controlPlaneService.listProjectWorkspaceBindings(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/projects/workspace-binding/detail") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformProjectWorkspaceBindingDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.getProjectWorkspaceBinding(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Project ${payload.projectId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/projects/workspace-binding/upsert") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformProjectWorkspaceBindingUpsertPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.controlPlaneService.upsertProjectWorkspaceBinding(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/detail") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.getWorkItemDetail(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/dispatch") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemDispatchPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.workflowService.dispatchWorkItem(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/cancel") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemCancelPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.cancelWorkItem(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/respond") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemRespondPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.respondToWorkItem(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/escalate") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemEscalatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.escalateWorkItem(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/runs/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformRunListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.workerRunService.listRuns(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/runs/detail") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformRunDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workerRunService.getRunDetail(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Run ${payload.runId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/pull") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkerPullPayload>(request, response);
      if (!payload) {
        return;
      }
      let result = options.workerRunService.pullAssignedRun(payload);

      if (!result) {
        const scheduled = scheduleQueuedWorkItemForNode(payload, options);
        result = scheduled ?? options.workerRunService.pullAssignedRun(payload);
      }

      return writeJson(response, 200, result ?? {});
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkerRunStatusPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workerRunService.updateRunStatus(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Run ${payload.runId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/complete") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkerRunCompletePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workerRunService.completeRun(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Run ${payload.runId ?? "unknown"} not found.`));
    }

    if (url.pathname.startsWith("/api/")) {
      return writeJson(response, 404, buildPlatformRouteNotFoundErrorResponse(url.pathname));
    }

    return writeJson(response, 404, buildNotFoundErrorResponse(`Route not found: ${url.pathname}`));
  } catch (error) {
    if (response.writableEnded) {
      return;
    }

    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "平台请求处理失败。";
    writeJson(response, 400, buildBadRequestErrorResponse(message));
  }
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function writeText(response: ServerResponse, statusCode: number, contentType: string, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.end(body);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let body = "";

  for await (const chunk of request) {
    body += chunk.toString();
  }

  return JSON.parse(body || "{}") as T;
}

async function readAuthorizedPayload<T extends { ownerPrincipalId: string }>(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<T | null> {
  const payload = await readJsonBody<T>(request);
  const authContext = getPlatformServiceAuthContext(request);

  if (authContext && payload.ownerPrincipalId !== authContext.ownerPrincipalId) {
    writeJson(response, 403, buildPlatformServiceOwnerMismatchBody());
    return null;
  }

  return payload;
}

function scheduleQueuedWorkItemForNode(
  payload: ManagedAgentPlatformWorkerPullPayload,
  options: HandlePlatformRequestOptions,
) {
  const nodeDetail = options.nodeService.getNodeDetail({
    ownerPrincipalId: payload.ownerPrincipalId,
    nodeId: payload.nodeId,
  });

  if (!nodeDetail || nodeDetail.node.status !== "online") {
    return null;
  }

  const excludedWorkItemIds = options.workerRunService.listAssignedRuns({
    ownerPrincipalId: payload.ownerPrincipalId,
    organizationId: nodeDetail.organization.organizationId,
  }).map((assignedRun) => assignedRun.workItem.workItemId);

  const queuedWorkItem = options.workflowService.claimNextQueuedWorkItem({
    ownerPrincipalId: payload.ownerPrincipalId,
    organizationId: nodeDetail.organization.organizationId,
    excludeWorkItemIds: excludedWorkItemIds,
  });

  if (!queuedWorkItem) {
    return null;
  }

  return options.workerRunService.assignQueuedWorkItem({
    ownerPrincipalId: payload.ownerPrincipalId,
    nodeId: payload.nodeId,
    organization: queuedWorkItem.organization,
    targetAgent: queuedWorkItem.targetAgent,
    workItem: queuedWorkItem.workItem,
    workspacePath: resolveWorkspacePathForQueuedWorkItem(
      payload.ownerPrincipalId,
      queuedWorkItem,
      options,
    ),
  });
}

function resolveWorkspacePathForQueuedWorkItem(
  ownerPrincipalId: string,
  queuedWorkItem: PlatformQueuedWorkItemContext,
  options: HandlePlatformRequestOptions,
): string {
  const projectId = typeof queuedWorkItem.workItem.projectId === "string"
    ? queuedWorkItem.workItem.projectId.trim()
    : "";

  if (projectId) {
    const binding = options.controlPlaneService.getProjectWorkspaceBinding({
      ownerPrincipalId,
      projectId,
    });
    const projectBinding = binding?.binding ?? null;
    const preferredWorkspacePath = projectBinding?.lastActiveWorkspacePath
      ?? projectBinding?.canonicalWorkspacePath;

    if (preferredWorkspacePath) {
      return preferredWorkspacePath;
    }
  }

  return options.defaultWorkspacePath;
}

function buildNotFoundErrorResponse(message: string): { error: { code: "NOT_FOUND"; message: string } } {
  return {
    error: {
      code: "NOT_FOUND",
      message,
    },
  };
}

function buildBadRequestErrorResponse(message: string): { error: { code: "BAD_REQUEST"; message: string } } {
  return {
    error: {
      code: "BAD_REQUEST",
      message,
    },
  };
}
