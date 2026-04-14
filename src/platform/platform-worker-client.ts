import { buildPlatformServiceAuthorizationHeader } from "themis-contracts/managed-agent-platform-access";
import type {
  ManagedAgentPlatformNodeDetailPayload,
  ManagedAgentPlatformNodeListPayload,
  ManagedAgentPlatformNodeReclaimPayload,
  ManagedAgentPlatformWorkerNodeDetailResult,
  ManagedAgentPlatformWorkerNodeLeaseRecoveryResult,
  ManagedAgentPlatformWorkerNodeMutationResult,
  ManagedAgentPlatformWorkerNodeRecord,
} from "themis-contracts/managed-agent-platform-worker";

export interface PlatformWorkerClientOptions {
  baseUrl: string;
  ownerPrincipalId: string;
  webAccessToken: string;
  fetchImpl?: typeof fetch;
}

export class PlatformWorkerClient {
  private readonly baseUrl: string;
  private readonly ownerPrincipalId: string;
  private readonly webAccessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PlatformWorkerClientOptions) {
    this.baseUrl = normalizeRequiredText(options.baseUrl, "baseUrl is required.");
    this.ownerPrincipalId = normalizeRequiredText(options.ownerPrincipalId, "ownerPrincipalId is required.");
    this.webAccessToken = normalizeRequiredText(options.webAccessToken, "webAccessToken is required.");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listNodes(input: {
    organizationId?: string | null;
  } = {}): Promise<ManagedAgentPlatformWorkerNodeRecord[]> {
    const organizationId = normalizeOptionalText(input.organizationId);
    const payload: ManagedAgentPlatformNodeListPayload = {
      ownerPrincipalId: this.ownerPrincipalId,
      ...(organizationId ? { organizationId } : {}),
    };
    const result = await this.requestJson<{ nodes?: ManagedAgentPlatformWorkerNodeRecord[] }>("/api/platform/nodes/list", payload);
    return Array.isArray(result.nodes) ? result.nodes : [];
  }

  async getNodeDetail(nodeId: string): Promise<ManagedAgentPlatformWorkerNodeDetailResult> {
    const payload: ManagedAgentPlatformNodeDetailPayload = {
      ownerPrincipalId: this.ownerPrincipalId,
      nodeId: normalizeRequiredText(nodeId, "nodeId is required."),
    };
    return await this.requestJson("/api/platform/nodes/detail", payload);
  }

  async drainNode(nodeId: string): Promise<ManagedAgentPlatformWorkerNodeMutationResult> {
    return await this.requestJson("/api/platform/nodes/drain", {
      ownerPrincipalId: this.ownerPrincipalId,
      nodeId: normalizeRequiredText(nodeId, "nodeId is required."),
    });
  }

  async offlineNode(nodeId: string): Promise<ManagedAgentPlatformWorkerNodeMutationResult> {
    return await this.requestJson("/api/platform/nodes/offline", {
      ownerPrincipalId: this.ownerPrincipalId,
      nodeId: normalizeRequiredText(nodeId, "nodeId is required."),
    });
  }

  async reclaimNodeLeases(
    nodeId: string,
    input: {
      failureCode?: string | null;
      failureMessage?: string | null;
    } = {},
  ): Promise<ManagedAgentPlatformWorkerNodeLeaseRecoveryResult> {
    const payload: ManagedAgentPlatformNodeReclaimPayload = {
      ownerPrincipalId: this.ownerPrincipalId,
      nodeId: normalizeRequiredText(nodeId, "nodeId is required."),
      ...(normalizeOptionalText(input.failureCode) ? { failureCode: normalizeOptionalText(input.failureCode) ?? undefined } : {}),
      ...(normalizeOptionalText(input.failureMessage) ? { failureMessage: normalizeOptionalText(input.failureMessage) ?? undefined } : {}),
    };
    return await this.requestJson("/api/platform/nodes/reclaim", payload);
  }

  private async requestJson<T>(pathname: string, payload: object): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildPlatformServiceAuthorizationHeader(this.webAccessToken),
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) as Record<string, unknown> : {};

    if (!response.ok) {
      const errorMessage = typeof json.error === "object"
        && json.error !== null
        && "message" in json.error
        && typeof (json.error as { message?: unknown }).message === "string"
        ? (json.error as { message: string }).message
        : `Platform request failed: ${response.status}`;
      throw new Error(errorMessage);
    }

    return json as T;
  }
}

function normalizeRequiredText(value: string | null | undefined, message: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}
