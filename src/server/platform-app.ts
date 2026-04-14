import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { buildPlatformRouteNotFoundErrorResponse } from "themis-contracts/managed-agent-platform-access";
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
  ManagedAgentPlatformGovernanceFiltersPayload,
  ManagedAgentPlatformWaitingQueueListPayload,
} from "themis-contracts/managed-agent-platform-agents";
import { readPlatformAsset } from "./platform-assets.js";
import { createInMemoryPlatformGovernanceService, type PlatformGovernanceService } from "./platform-governance-service.js";
import { createInMemoryPlatformNodeService, type PlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService, type PlatformWorkerRunService } from "./platform-worker-run-service.js";

export interface PlatformAppOptions {
  serviceName?: string;
  nodeService?: PlatformNodeService;
  workerRunService?: PlatformWorkerRunService;
  governanceService?: PlatformGovernanceService;
  webAuthTokenLabel?: string;
}

export function createPlatformApp(options: PlatformAppOptions = {}): Server {
  const serviceName = options.serviceName ?? "themis-platform";
  const nodeService = options.nodeService ?? createInMemoryPlatformNodeService();
  const workerRunService = options.workerRunService ?? createInMemoryPlatformWorkerRunService({
    nodeService,
  });
  const governanceService = options.governanceService ?? createInMemoryPlatformGovernanceService({
    workerRunService,
  });
  const webAuthTokenLabel = options.webAuthTokenLabel ?? "";

  return createServer((request, response) => {
    void handlePlatformRequest(request, response, {
      serviceName,
      nodeService,
      workerRunService,
      governanceService,
      webAuthTokenLabel,
    });
  });
}

interface HandlePlatformRequestOptions {
  serviceName: string;
  nodeService: PlatformNodeService;
  workerRunService: PlatformWorkerRunService;
  governanceService: PlatformGovernanceService;
  webAuthTokenLabel: string;
}

async function handlePlatformRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HandlePlatformRequestOptions,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  try {
    const staticAsset = readPlatformAsset(url.pathname);

    if (method === "GET" && staticAsset) {
      return writeText(response, 200, staticAsset.contentType, staticAsset.body);
    }

    if (method === "GET" && url.pathname === "/api/health") {
      return writeJson(response, 200, {
        ok: true,
        service: options.serviceName,
      });
    }

    if (method === "GET" && url.pathname === "/api/web-auth/status") {
      return writeJson(response, 200, {
        authenticated: Boolean(options.webAuthTokenLabel),
        tokenLabel: options.webAuthTokenLabel,
      });
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/register") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeRegisterPayload>(request);
      return writeJson(response, 200, options.nodeService.registerNode(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/heartbeat") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeHeartbeatPayload>(request);
      const result = options.nodeService.heartbeatNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.node?.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/list") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeListPayload>(request);
      return writeJson(response, 200, {
        nodes: options.nodeService.listNodes(payload),
      });
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/detail") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeDetailPayload>(request);
      const result = options.nodeService.getNodeDetail(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/drain") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeDetailPayload>(request);
      const result = options.nodeService.drainNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/offline") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeDetailPayload>(request);
      const result = options.nodeService.offlineNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/nodes/reclaim") {
      const payload = await readJsonBody<ManagedAgentPlatformNodeReclaimPayload>(request);
      const result = options.nodeService.reclaimNode(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Node ${payload.nodeId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/governance-overview") {
      const payload = await readJsonBody<ManagedAgentPlatformGovernanceFiltersPayload>(request);
      return writeJson(response, 200, options.governanceService.getGovernanceOverview(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/agents/waiting/list") {
      const payload = await readJsonBody<ManagedAgentPlatformWaitingQueueListPayload>(request);
      return writeJson(response, 200, options.governanceService.listWaitingQueue(payload));
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/pull") {
      const payload = await readJsonBody<ManagedAgentPlatformWorkerPullPayload>(request);
      const result = options.workerRunService.pullAssignedRun(payload);
      return writeJson(response, 200, result ?? {});
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/update") {
      const payload = await readJsonBody<ManagedAgentPlatformWorkerRunStatusPayload>(request);
      const result = options.workerRunService.updateRunStatus(payload);
      return result
        ? writeJson(response, 200, result)
        : writeJson(response, 404, buildNotFoundErrorResponse(`Run ${payload.runId ?? "unknown"} not found.`));
    }

    if (method === "POST" && url.pathname === "/api/platform/worker/runs/complete") {
      const payload = await readJsonBody<ManagedAgentPlatformWorkerRunCompletePayload>(request);
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
