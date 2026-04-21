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
  ManagedAgentPlatformAgentCardUpdatePayload,
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
import type {
  ManagedAgentPlatformMeetingRoomAppendFailurePayload,
  ManagedAgentPlatformMeetingRoomAppendReplyPayload,
  ManagedAgentPlatformMeetingRoomClosePayload,
  ManagedAgentPlatformMeetingRoomCreatePayload,
  ManagedAgentPlatformMeetingRoomCreateResolutionPayload,
  ManagedAgentPlatformMeetingRoomDetailPayload,
  ManagedAgentPlatformMeetingRoomListPayload,
  ManagedAgentPlatformMeetingRoomMessageCreatePayload,
  ManagedAgentPlatformMeetingRoomParticipantsAddPayload,
  ManagedAgentPlatformMeetingRoomPromoteResolutionPayload,
  ManagedAgentPlatformMeetingRoomTerminatePayload,
} from "themis-contracts/managed-agent-platform-meetings";
import type { ManagedAgentPlatformOncallSummaryPayload } from "themis-contracts/managed-agent-platform-oncall";
import type { ManagedAgentPlatformWorkItemRecord } from "themis-contracts/managed-agent-platform-shared";
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
import {
  createInMemoryPlatformMeetingRoomService,
  type PlatformMeetingRoomService,
} from "./platform-meeting-room-service.js";
import {
  createInMemoryPlatformNodeService,
  type PlatformNodeExecutionLeaseRuntime,
  type PlatformNodeService,
} from "./platform-node-service.js";
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
import type { PlatformExecutionRuntimeStore } from "./platform-execution-runtime-store.js";

export interface PlatformAppOptions {
  serviceName?: string;
  appDisplayName?: string;
  accessMode?: "open" | "protected";
  defaultWorkspacePath?: string;
  onStateMutation?: () => void | Promise<void>;
  executionRuntimeStore?: PlatformExecutionRuntimeStore;
  nodeService?: PlatformNodeService;
  workerRunService?: PlatformWorkerRunService;
  governanceService?: PlatformGovernanceService;
  collaborationService?: PlatformCollaborationService;
  workflowService?: PlatformWorkflowService;
  controlPlaneService?: PlatformControlPlaneService;
  meetingRoomService?: PlatformMeetingRoomService;
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
  connectNodeExecutionLeaseRuntime(nodeService, workerRunService);
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
  const meetingRoomService = options.meetingRoomService ?? createInMemoryPlatformMeetingRoomService({
    controlPlaneService,
    workflowService,
  });
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
      onStateMutation: options.onStateMutation,
      executionRuntimeStore: options.executionRuntimeStore,
      nodeService,
      workerRunService,
      governanceService,
      collaborationService,
      workflowService,
      controlPlaneService,
      meetingRoomService,
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
  onStateMutation?: () => void | Promise<void>;
  executionRuntimeStore?: PlatformExecutionRuntimeStore;
  nodeService: PlatformNodeService;
  workerRunService: PlatformWorkerRunService;
  governanceService: PlatformGovernanceService;
  collaborationService: PlatformCollaborationService;
  workflowService: PlatformWorkflowService;
  controlPlaneService: PlatformControlPlaneService;
  meetingRoomService: PlatformMeetingRoomService;
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
      const result = options.nodeService.registerNode(payload, {
        nodeIp: resolveRequestIp(request),
      });
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/heartbeat") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeHeartbeatPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.heartbeatNode(payload, {
        nodeIp: resolveRequestIp(request),
      });
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.node?.nodeId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
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
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/offline") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.offlineNode(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/reclaim") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeReclaimPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.reclaimNode(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/delete") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformNodeDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.nodeService.deleteNode(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
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
      const result = options.controlPlaneService.createAgent(payload);
      options.workflowService.registerAgent({
        ownerPrincipalId: payload.ownerPrincipalId,
        organization: result.organization,
        agent: result.agent,
      });
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/execution-boundary/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentExecutionBoundaryUpdatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.updateExecutionBoundary(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/card/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentCardUpdatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.updateAgentCard(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/spawn-policy/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentSpawnPolicyUpdatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.updateSpawnPolicy(payload);
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/pause") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentLifecyclePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.pauseAgent(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/resume") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentLifecyclePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.resumeAgent(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/archive") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformAgentLifecyclePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.controlPlaneService.archiveAgent(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
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
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Agent ${payload.agentId ?? "unknown"} not found.`));
      }
      if (result.item) {
        await recordStateMutation(options);
      }
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/mailbox/ack") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMailboxAckPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.ackMailbox(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Mailbox entry ${payload.mailboxEntryId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/mailbox/respond") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMailboxRespondPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.respondMailbox(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Mailbox entry ${payload.mailboxEntryId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.workflowService.listWorkItems(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/list") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomListPayload>(request, response);
      if (!payload) {
        return;
      }
      return writeJson(response, 200, options.meetingRoomService.listRooms(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/create") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomCreatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.createRoom(payload);
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/detail") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomDetailPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.getRoomDetail(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.roomId ?? "unknown"} not found.`));
      }
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/participants/add") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomParticipantsAddPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.addParticipants(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/messages/create") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomMessageCreatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.createManagerMessage(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.message.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/messages/append-agent-reply") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomAppendReplyPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.appendAgentReply(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.reply.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/messages/append-agent-failure") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomAppendFailurePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.appendAgentFailure(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.failure.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/resolutions/create") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomCreateResolutionPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.createResolution(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.resolution.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/resolutions/promote") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomPromoteResolutionPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.promoteResolution(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.resolution.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/close") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomClosePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.closeRoom(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.room.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/meeting-rooms/terminate") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformMeetingRoomTerminatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.meetingRoomService.terminateRoom(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Meeting room ${payload.termination.roomId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
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
      const result = options.controlPlaneService.upsertProjectWorkspaceBinding(payload);
      await recordStateMutation(options);
      return writeJson(response, 200, result);
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
      const result = options.workflowService.dispatchWorkItem(payload);
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/cancel") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemCancelPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.cancelWorkItem(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/respond") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemRespondPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.respondToWorkItem(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/work-items/escalate") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkItemEscalatePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workflowService.escalateWorkItem(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Work item ${payload.workItemId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      return writeJson(response, 200, result);
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
      let didMutate = false;

      if (!result) {
        const scheduled = scheduleQueuedWorkItemForNode(payload, options);
        didMutate = Boolean(scheduled);
        result = scheduled ?? options.workerRunService.pullAssignedRun(payload);
      }

      if (didMutate) {
        await recordStateMutation(options);
      }

      if (result && options.executionRuntimeStore) {
        if (didMutate) {
          options.executionRuntimeStore.recordAssignedRun({
            assignedRun: result,
            source: "scheduled",
          });
        } else {
          options.executionRuntimeStore.ensureAssignedRun({
            assignedRun: result,
            source: "pull_restore",
          });
        }
      }
      return writeJson(response, 200, result ?? {});
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/update") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkerRunStatusPayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workerRunService.updateRunStatus(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Run ${payload.runId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      const assignedRun = options.workerRunService.getAssignedRunByWorkItem({
        ownerPrincipalId: payload.ownerPrincipalId,
        workItemId: result.workItem.workItemId,
      });
      if (assignedRun) {
        options.executionRuntimeStore?.recordRunStatus({
          assignedRun,
          payload,
        });
      }
      return writeJson(response, 200, result);
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/complete") {
      const payload = await readAuthorizedPayload<ManagedAgentPlatformWorkerRunCompletePayload>(request, response);
      if (!payload) {
        return;
      }
      const result = options.workerRunService.completeRun(payload);
      if (!result) {
        return writeJson(response, 404, buildNotFoundErrorResponse(`Run ${payload.runId ?? "unknown"} not found.`));
      }
      await recordStateMutation(options);
      const assignedRun = options.workerRunService.getAssignedRunByWorkItem({
        ownerPrincipalId: payload.ownerPrincipalId,
        workItemId: result.workItem.workItemId,
      });
      if (assignedRun) {
        options.executionRuntimeStore?.recordRunCompletion({
          assignedRun,
          completionResult: payload.result,
        });
      }
      return writeJson(response, 200, result);
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

async function recordStateMutation(options: HandlePlatformRequestOptions): Promise<void> {
  await options.onStateMutation?.();
}

function connectNodeExecutionLeaseRuntime(
  nodeService: PlatformNodeService,
  workerRunService: PlatformWorkerRunService,
) {
  if (!("connectExecutionLeaseRuntime" in nodeService) || typeof nodeService.connectExecutionLeaseRuntime !== "function") {
    return;
  }

  const runtime: PlatformNodeExecutionLeaseRuntime = {
    listNodeExecutionLeaseContexts({ ownerPrincipalId, node }) {
      return workerRunService.listAssignedRuns({ ownerPrincipalId })
        .filter((assignedRun) => assignedRun.node.nodeId === node.nodeId)
        .sort(compareAssignedRunsByLeaseUpdatedDesc)
        .map((assignedRun) => ({
          lease: { ...assignedRun.executionLease },
          run: { ...assignedRun.run },
          workItem: { ...assignedRun.workItem },
          targetAgent: { ...assignedRun.targetAgent },
        }));
    },

    reclaimNodeExecutionLeases({ ownerPrincipalId, node, now }) {
      const reclaimedLeases = workerRunService.listAssignedRuns({ ownerPrincipalId })
        .filter((assignedRun) => (
          assignedRun.node.nodeId === node.nodeId
          && assignedRun.executionLease.status === "active"
          && !shouldPreserveQueuedCreatedLease(assignedRun)
        ))
        .sort(compareAssignedRunsByLeaseUpdatedDesc)
        .map((assignedRun) => reclaimAssignedRunLease(workerRunService, assignedRun, now));

      return {
        summary: summarizeReclaimedNodeLeases(reclaimedLeases),
        reclaimedLeases,
      };
    },
  };

  nodeService.connectExecutionLeaseRuntime(runtime);
}

function shouldPreserveQueuedCreatedLease(
  assignedRun: ReturnType<PlatformWorkerRunService["listAssignedRuns"]>[number],
) {
  return assignedRun.run.status === "created" && assignedRun.workItem.status === "queued";
}

function reclaimAssignedRunLease(
  workerRunService: PlatformWorkerRunService,
  assignedRun: ReturnType<PlatformWorkerRunService["listAssignedRuns"]>[number],
  now: string,
) {
  const workItemStatus = assignedRun.workItem.status;
  const workItemPatch = buildRecoveredWorkItemPatch(workItemStatus, now);
  const updatedAssignedRun = workerRunService.updateAssignedRunByWorkItem({
    ownerPrincipalId: assignedRun.organization.ownerPrincipalId,
    workItemId: assignedRun.workItem.workItemId,
    ...(workItemPatch ? { workItemPatch } : {}),
    runPatch: {
      status: "interrupted",
      updatedAt: now,
    },
    executionLeasePatch: {
      status: "revoked",
      updatedAt: now,
    },
  }) ?? assignedRun;
  const recoveryAction = resolveNodeLeaseRecoveryAction(workItemStatus, updatedAssignedRun.workItem?.status);

  return {
    lease: { ...updatedAssignedRun.executionLease },
    run: updatedAssignedRun.run ? { ...updatedAssignedRun.run } : null,
    workItem: updatedAssignedRun.workItem ? { ...updatedAssignedRun.workItem } : null,
    targetAgent: updatedAssignedRun.targetAgent ? { ...updatedAssignedRun.targetAgent } : null,
    recoveryAction,
  };
}

function buildRecoveredWorkItemPatch(
  status: ManagedAgentPlatformWorkItemRecord["status"] | null | undefined,
  now: string,
): Partial<ManagedAgentPlatformWorkItemRecord> {
  if (status === "planning" || status === "starting" || status === "running") {
    return {
      status: "queued",
      waitingFor: null,
      updatedAt: now,
    };
  }

  if (status === "waiting_human" || status === "waiting_agent") {
    return {
      updatedAt: now,
    };
  }

  return {
    updatedAt: now,
  };
}

function resolveNodeLeaseRecoveryAction(
  previousWorkItemStatus: ManagedAgentPlatformWorkItemRecord["status"] | null | undefined,
  nextWorkItemStatus: ManagedAgentPlatformWorkItemRecord["status"] | null | undefined,
) {
  if (
    (previousWorkItemStatus === "planning" || previousWorkItemStatus === "starting" || previousWorkItemStatus === "running")
    && nextWorkItemStatus === "queued"
  ) {
    return "requeued";
  }

  if (previousWorkItemStatus === "waiting_human" || previousWorkItemStatus === "waiting_agent") {
    return "waiting_preserved";
  }

  return "lease_revoked";
}

function summarizeReclaimedNodeLeases(reclaimedLeases: Array<{ run: unknown; recoveryAction?: string }>) {
  return {
    activeLeaseCount: reclaimedLeases.length,
    reclaimedRunCount: reclaimedLeases.filter((item) => item.run).length,
    requeuedWorkItemCount: reclaimedLeases.filter((item) => item.recoveryAction === "requeued").length,
  };
}

function compareAssignedRunsByLeaseUpdatedDesc(
  left: ReturnType<PlatformWorkerRunService["listAssignedRuns"]>[number],
  right: ReturnType<PlatformWorkerRunService["listAssignedRuns"]>[number],
) {
  const leftUpdatedAt = Date.parse(
    left.executionLease.updatedAt
      ?? left.run.updatedAt
      ?? left.workItem.updatedAt
      ?? left.executionLease.createdAt
      ?? "",
  );
  const rightUpdatedAt = Date.parse(
    right.executionLease.updatedAt
      ?? right.run.updatedAt
      ?? right.workItem.updatedAt
      ?? right.executionLease.createdAt
      ?? "",
  );

  if (Number.isFinite(leftUpdatedAt) && Number.isFinite(rightUpdatedAt) && leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return right.executionLease.leaseId.localeCompare(left.executionLease.leaseId, "en");
}

function resolveRequestIp(request: IncomingMessage): string | null {
  const candidates = [
    readForwardedIpHeader(request.headers["x-forwarded-for"]),
    readForwardedHeader(request.headers.forwarded),
    readForwardedIpHeader(request.headers["x-real-ip"]),
    request.socket.remoteAddress,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function readForwardedIpHeader(value: string | string[] | undefined): string | null {
  const normalized = normalizeHeaderValue(value);
  if (!normalized) {
    return null;
  }

  const [firstIp = ""] = normalized.split(",");
  return firstIp.trim() || null;
}

function readForwardedHeader(value: string | string[] | undefined): string | null {
  const normalized = normalizeHeaderValue(value);
  if (!normalized) {
    return null;
  }

  for (const segment of normalized.split(/[;,]/)) {
    const trimmed = segment.trim();
    if (!trimmed.toLowerCase().startsWith("for=")) {
      continue;
    }

    return trimmed.slice(4).trim() || null;
  }

  return null;
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean).join(",");
  }

  return typeof value === "string" ? value.trim() : "";
}

function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("\"") && normalized.endsWith("\"")) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.toLowerCase() === "unknown") {
    return null;
  }

  if (normalized.startsWith("[")) {
    const endBracket = normalized.indexOf("]");
    if (endBracket > 0) {
      normalized = normalized.slice(1, endBracket);
    }
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(normalized)) {
    normalized = normalized.replace(/:\d+$/, "");
  }

  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.slice(7);
  }

  return normalized || null;
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
