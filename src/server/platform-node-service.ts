import type {
  ManagedAgentPlatformNodeDetailPayload,
  ManagedAgentPlatformNodeHeartbeatPayload,
  ManagedAgentPlatformNodeListPayload,
  ManagedAgentPlatformNodeReclaimPayload,
  ManagedAgentPlatformNodeRegisterPayload,
  ManagedAgentPlatformWorkerNodeDetailInput,
  ManagedAgentPlatformWorkerNodeDetailResult,
  ManagedAgentPlatformWorkerNodeLeaseRecoveryResult,
  ManagedAgentPlatformWorkerNodeMutationResult,
  ManagedAgentPlatformWorkerNodeRecord,
  ManagedAgentPlatformWorkerOrganizationRecord,
} from "themis-contracts/managed-agent-platform-worker";

export interface PlatformNodeService {
  registerNode(payload: ManagedAgentPlatformNodeRegisterPayload): ManagedAgentPlatformWorkerNodeMutationResult;
  heartbeatNode(payload: ManagedAgentPlatformNodeHeartbeatPayload): ManagedAgentPlatformWorkerNodeMutationResult | null;
  listNodes(payload: ManagedAgentPlatformNodeListPayload): ManagedAgentPlatformWorkerNodeRecord[];
  getNodeDetail(payload: ManagedAgentPlatformNodeDetailPayload): ManagedAgentPlatformWorkerNodeDetailResult | null;
  drainNode(payload: PlatformNodeMutationPayload): ManagedAgentPlatformWorkerNodeMutationResult | null;
  offlineNode(payload: PlatformNodeMutationPayload): ManagedAgentPlatformWorkerNodeMutationResult | null;
  reclaimNode(payload: ManagedAgentPlatformNodeReclaimPayload): ManagedAgentPlatformWorkerNodeLeaseRecoveryResult | null;
}

export interface PlatformNodeMutationPayload extends ManagedAgentPlatformWorkerNodeDetailInput {
  ownerPrincipalId: string;
}

export interface PlatformNodeServiceSnapshot {
  organizations: ManagedAgentPlatformWorkerOrganizationRecord[];
  nodes: ManagedAgentPlatformWorkerNodeRecord[];
}

export interface SnapshotCapablePlatformNodeService extends PlatformNodeService {
  exportSnapshot(): PlatformNodeServiceSnapshot;
  replaceSnapshot(snapshot: PlatformNodeServiceSnapshot): void;
}

export interface InMemoryPlatformNodeServiceOptions {
  now?: () => string;
  generateNodeId?: () => string;
  organizations?: ManagedAgentPlatformWorkerOrganizationRecord[];
  nodes?: ManagedAgentPlatformWorkerNodeRecord[];
}

export function createInMemoryPlatformNodeService(
  options: InMemoryPlatformNodeServiceOptions = {},
): SnapshotCapablePlatformNodeService {
  const now = options.now ?? (() => new Date().toISOString());
  const generateNodeId = options.generateNodeId ?? (() => `node-${Math.random().toString(36).slice(2, 10)}`);
  const organizations = new Map<string, ManagedAgentPlatformWorkerOrganizationRecord>();
  const nodes = new Map<string, ManagedAgentPlatformWorkerNodeRecord>();

  for (const organization of options.organizations ?? []) {
    organizations.set(organization.organizationId, {
      ...organization,
    });
  }

  for (const node of options.nodes ?? []) {
    nodes.set(node.nodeId, {
      ...node,
    });
  }

  const replaceSnapshot = (snapshot: PlatformNodeServiceSnapshot) => {
    organizations.clear();
    nodes.clear();

    for (const organization of snapshot.organizations) {
      organizations.set(organization.organizationId, {
        ...organization,
      });
    }

    for (const node of snapshot.nodes) {
      nodes.set(node.nodeId, {
        ...node,
      });
    }
  };

  return {
    exportSnapshot() {
      return {
        organizations: Array.from(organizations.values()).map((organization) => ({ ...organization })),
        nodes: Array.from(nodes.values()).map((node) => ({ ...node })),
      };
    },

    replaceSnapshot,

    registerNode(payload) {
      const timestamp = now();
      const organization = getOrCreateOrganization(organizations, payload.ownerPrincipalId, payload.node.organizationId, timestamp);
      const nodeId = normalizeText(payload.node.nodeId) || generateNodeId();
      const existingNode = nodes.get(nodeId);
      const record: ManagedAgentPlatformWorkerNodeRecord = {
        nodeId,
        organizationId: organization.organizationId,
        displayName: normalizeText(payload.node.displayName) || existingNode?.displayName || nodeId,
        status: "online",
        slotCapacity: normalizePositiveInteger(payload.node.slotCapacity, 1),
        slotAvailable: normalizeSlotAvailable(payload.node.slotAvailable, payload.node.slotCapacity),
        labels: normalizeUniqueStrings(payload.node.labels),
        workspaceCapabilities: normalizeUniqueStrings(payload.node.workspaceCapabilities),
        credentialCapabilities: normalizeUniqueStrings(payload.node.credentialCapabilities),
        providerCapabilities: normalizeUniqueStrings(payload.node.providerCapabilities),
        heartbeatTtlSeconds: normalizeOptionalPositiveInteger(payload.node.heartbeatTtlSeconds),
        lastHeartbeatAt: timestamp,
        createdAt: existingNode?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      nodes.set(record.nodeId, record);
      return {
        organization,
        node: record,
      };
    },

    heartbeatNode(payload) {
      const existingNode = nodes.get(payload.node.nodeId);

      if (!existingNode) {
        return null;
      }

      const organization = organizations.get(existingNode.organizationId);

      if (!organization || organization.ownerPrincipalId !== payload.ownerPrincipalId) {
        return null;
      }

      const timestamp = now();
      const record: ManagedAgentPlatformWorkerNodeRecord = {
        ...existingNode,
        status: payload.node.status ?? existingNode.status,
        slotAvailable: payload.node.slotAvailable == null
          ? existingNode.slotAvailable
          : normalizeSlotAvailable(payload.node.slotAvailable, existingNode.slotCapacity),
        labels: payload.node.labels == null ? existingNode.labels : normalizeUniqueStrings(payload.node.labels),
        workspaceCapabilities: payload.node.workspaceCapabilities == null
          ? existingNode.workspaceCapabilities
          : normalizeUniqueStrings(payload.node.workspaceCapabilities),
        credentialCapabilities: payload.node.credentialCapabilities == null
          ? existingNode.credentialCapabilities
          : normalizeUniqueStrings(payload.node.credentialCapabilities),
        providerCapabilities: payload.node.providerCapabilities == null
          ? existingNode.providerCapabilities
          : normalizeUniqueStrings(payload.node.providerCapabilities),
        heartbeatTtlSeconds: payload.node.heartbeatTtlSeconds == null
          ? existingNode.heartbeatTtlSeconds
          : normalizeOptionalPositiveInteger(payload.node.heartbeatTtlSeconds),
        lastHeartbeatAt: timestamp,
        updatedAt: timestamp,
      };
      nodes.set(record.nodeId, record);
      return {
        organization,
        node: record,
      };
    },

    listNodes(payload) {
      return Array.from(nodes.values())
        .filter((node) => {
          if (payload.organizationId && node.organizationId !== payload.organizationId) {
            return false;
          }

          const organization = organizations.get(node.organizationId);
          return organization?.ownerPrincipalId === payload.ownerPrincipalId;
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN"));
    },

    getNodeDetail(payload) {
      const node = nodes.get(payload.nodeId);

      if (!node) {
        return null;
      }

      const organization = organizations.get(node.organizationId);

      if (!organization || organization.ownerPrincipalId !== payload.ownerPrincipalId) {
        return null;
      }

      return {
        organization,
        node,
        leaseSummary: {
          totalCount: 0,
          activeCount: 0,
          expiredCount: 0,
          releasedCount: 0,
          revokedCount: 0,
        },
        activeExecutionLeases: [],
        recentExecutionLeases: [],
      };
    },

    drainNode(payload) {
      return mutateNodeStatus(organizations, nodes, payload, "draining");
    },

    offlineNode(payload) {
      return mutateNodeStatus(organizations, nodes, payload, "offline", {
        slotAvailable: 0,
      });
    },

    reclaimNode(payload) {
      const mutation = mutateNodeStatus(organizations, nodes, payload, "offline", {
        slotAvailable: 0,
      });

      if (!mutation) {
        return null;
      }

      return {
        organization: mutation.organization,
        node: mutation.node,
        summary: {
          activeLeaseCount: 0,
          reclaimedRunCount: 0,
          requeuedWorkItemCount: 0,
        },
        reclaimedLeases: [],
      };
    },
  };
}

function mutateNodeStatus(
  organizations: Map<string, ManagedAgentPlatformWorkerOrganizationRecord>,
  nodes: Map<string, ManagedAgentPlatformWorkerNodeRecord>,
  payload: PlatformNodeMutationPayload,
  status: ManagedAgentPlatformWorkerNodeRecord["status"],
  overrides: Partial<ManagedAgentPlatformWorkerNodeRecord> = {},
): ManagedAgentPlatformWorkerNodeMutationResult | null {
  const node = nodes.get(payload.nodeId);

  if (!node) {
    return null;
  }

  const organization = organizations.get(node.organizationId);

  if (!organization || organization.ownerPrincipalId !== payload.ownerPrincipalId) {
    return null;
  }

  const updatedNode: ManagedAgentPlatformWorkerNodeRecord = {
    ...node,
    status,
    ...overrides,
    updatedAt: node.updatedAt,
  };
  nodes.set(updatedNode.nodeId, updatedNode);
  return {
    organization,
    node: updatedNode,
  };
}

function getOrCreateOrganization(
  organizations: Map<string, ManagedAgentPlatformWorkerOrganizationRecord>,
  ownerPrincipalId: string,
  requestedOrganizationId: string | undefined,
  timestamp: string,
): ManagedAgentPlatformWorkerOrganizationRecord {
  const normalizedOwnerPrincipalId = normalizeText(ownerPrincipalId) || "principal-platform-owner";
  const explicitOrganizationId = normalizeText(requestedOrganizationId);

  if (explicitOrganizationId) {
    const existingOrganization = organizations.get(explicitOrganizationId);

    if (existingOrganization) {
      return existingOrganization;
    }

    const createdOrganization = createOrganizationRecord(explicitOrganizationId, normalizedOwnerPrincipalId, timestamp);
    organizations.set(createdOrganization.organizationId, createdOrganization);
    return createdOrganization;
  }

  for (const organization of organizations.values()) {
    if (organization.ownerPrincipalId === normalizedOwnerPrincipalId) {
      return organization;
    }
  }

  const fallbackOrganizationId = `org-${slugify(normalizedOwnerPrincipalId) || "platform-owner"}`;
  const createdOrganization = createOrganizationRecord(fallbackOrganizationId, normalizedOwnerPrincipalId, timestamp);
  organizations.set(createdOrganization.organizationId, createdOrganization);
  return createdOrganization;
}

function createOrganizationRecord(
  organizationId: string,
  ownerPrincipalId: string,
  timestamp: string,
): ManagedAgentPlatformWorkerOrganizationRecord {
  const slug = slugify(ownerPrincipalId) || slugify(organizationId) || "platform-team";
  return {
    organizationId,
    ownerPrincipalId,
    displayName: `Platform ${slug}`,
    slug,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeUniqueStrings(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const unique = Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
  return unique.length > 0 ? unique : [];
}

function normalizeSlotAvailable(value: number | undefined, slotCapacity: number | undefined): number {
  const capacity = normalizePositiveInteger(slotCapacity, 1);

  if (!Number.isFinite(value)) {
    return capacity;
  }

  return Math.max(0, Math.min(capacity, Math.trunc(Number(value))));
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(Number(value));
  return normalized > 0 ? normalized : fallback;
}

function normalizeOptionalPositiveInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(Number(value));
  return normalized > 0 ? normalized : undefined;
}

function normalizeText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
