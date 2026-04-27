import type {
  ManagedAgentPlatformWorkerSecretAckPayload,
  ManagedAgentPlatformWorkerSecretAckResult,
  ManagedAgentPlatformWorkerSecretDeliveryRecord,
  ManagedAgentPlatformWorkerSecretDeliveryValueRecord,
  ManagedAgentPlatformWorkerSecretPullPayload,
  ManagedAgentPlatformWorkerSecretPullResult,
  ManagedAgentPlatformWorkerSecretPushPayload,
  ManagedAgentPlatformWorkerSecretPushResult,
} from "themis-contracts/managed-agent-platform-worker";
import type { PlatformNodeService } from "./platform-node-service.js";

interface PendingWorkerSecretDelivery extends ManagedAgentPlatformWorkerSecretDeliveryValueRecord {}

export interface PlatformWorkerSecretDeliveryService {
  pushSecret(payload: ManagedAgentPlatformWorkerSecretPushPayload): ManagedAgentPlatformWorkerSecretPushResult | null;
  pullSecrets(payload: ManagedAgentPlatformWorkerSecretPullPayload): ManagedAgentPlatformWorkerSecretPullResult | null;
  ackSecrets(payload: ManagedAgentPlatformWorkerSecretAckPayload): ManagedAgentPlatformWorkerSecretAckResult | null;
}

export interface InMemoryPlatformWorkerSecretDeliveryServiceOptions {
  nodeService: PlatformNodeService;
  now?: () => string;
  generateDeliveryId?: () => string;
}

export function createInMemoryPlatformWorkerSecretDeliveryService(
  options: InMemoryPlatformWorkerSecretDeliveryServiceOptions,
): PlatformWorkerSecretDeliveryService {
  const now = options.now ?? (() => new Date().toISOString());
  const generateDeliveryId = options.generateDeliveryId ?? (() => `worker-secret-delivery-${Math.random().toString(36).slice(2, 10)}`);
  const deliveries = new Map<string, PendingWorkerSecretDelivery>();

  return {
    pushSecret(payload) {
      const nodeDetail = options.nodeService.getNodeDetail({
        ownerPrincipalId: payload.ownerPrincipalId,
        nodeId: normalizeRequiredText(payload.delivery.nodeId, "nodeId is required."),
      });

      if (!nodeDetail) {
        return null;
      }

      const timestamp = now();
      const delivery: PendingWorkerSecretDelivery = {
        deliveryId: generateDeliveryId(),
        nodeId: nodeDetail.node.nodeId,
        secretRef: normalizeSecretRef(payload.delivery.secretRef),
        value: normalizeSecretValue(payload.delivery.value),
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      deliveries.set(delivery.deliveryId, delivery);
      return {
        delivery: redactDeliveryValue(delivery),
      };
    },

    pullSecrets(payload) {
      const nodeDetail = options.nodeService.getNodeDetail({
        ownerPrincipalId: payload.ownerPrincipalId,
        nodeId: normalizeRequiredText(payload.nodeId, "nodeId is required."),
      });

      if (!nodeDetail) {
        return null;
      }

      return {
        deliveries: Array.from(deliveries.values())
          .filter((delivery) => delivery.nodeId === nodeDetail.node.nodeId && delivery.status === "pending")
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt, "en")),
      };
    },

    ackSecrets(payload) {
      const nodeDetail = options.nodeService.getNodeDetail({
        ownerPrincipalId: payload.ownerPrincipalId,
        nodeId: normalizeRequiredText(payload.nodeId, "nodeId is required."),
      });

      if (!nodeDetail) {
        return null;
      }

      const timestamp = now();
      const deliveryIds = new Set(
        (payload.deliveryIds ?? [])
          .map((deliveryId) => normalizeOptionalText(deliveryId))
          .filter((deliveryId): deliveryId is string => Boolean(deliveryId)),
      );
      const acked: ManagedAgentPlatformWorkerSecretDeliveryRecord[] = [];

      for (const deliveryId of deliveryIds) {
        const delivery = deliveries.get(deliveryId);

        if (!delivery || delivery.nodeId !== nodeDetail.node.nodeId) {
          continue;
        }

        const delivered: ManagedAgentPlatformWorkerSecretDeliveryRecord = {
          ...redactDeliveryValue(delivery),
          status: "delivered",
          deliveredAt: timestamp,
          updatedAt: timestamp,
        };
        acked.push(delivered);
        deliveries.delete(deliveryId);
      }

      return {
        deliveries: acked.sort((left, right) => left.createdAt.localeCompare(right.createdAt, "en")),
        secretRefs: normalizeSecretRefs(payload.secretRefs),
      };
    },
  };
}

function redactDeliveryValue(delivery: PendingWorkerSecretDelivery): ManagedAgentPlatformWorkerSecretDeliveryRecord {
  return {
    deliveryId: delivery.deliveryId,
    nodeId: delivery.nodeId,
    secretRef: delivery.secretRef,
    status: delivery.status,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    ...(delivery.deliveredAt ? { deliveredAt: delivery.deliveredAt } : {}),
  };
}

function normalizeSecretRefs(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(
    values.map((value) => normalizeOptionalText(value)).filter((value): value is string => Boolean(value)),
  )).sort((left, right) => left.localeCompare(right, "en"));
}

function normalizeSecretRef(value: unknown): string {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error("secretRef is required.");
  }

  if (/\s/.test(normalized)) {
    throw new Error("secretRef must not contain whitespace.");
  }

  if (normalized.length > 160) {
    throw new Error("secretRef is too long.");
  }

  return normalized;
}

function normalizeSecretValue(value: unknown): string {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error("secret value is required.");
  }

  return normalized;
}

function normalizeRequiredText(value: unknown, message: string): string {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : null;
}
