import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";

test("createInMemoryPlatformNodeService 会支持 register、heartbeat、list 与 detail", () => {
  const service = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T09:00:00.000Z",
    generateNodeId: () => "node-fixed",
  });

  const registered = service.registerNode({
    ownerPrincipalId: "principal-platform-owner",
    node: {
      displayName: "Worker A",
      slotCapacity: 4,
      slotAvailable: 3,
      labels: ["linux", "linux", "build"],
      workspaceCapabilities: ["/srv/workspace", "/srv/workspace"],
      credentialCapabilities: ["default"],
      providerCapabilities: ["gateway-a"],
      heartbeatTtlSeconds: 45,
    },
  }, {
    nodeIp: "192.168.31.208",
  });

  assert.equal(registered.organization.ownerPrincipalId, "principal-platform-owner");
  assert.equal(registered.node.nodeId, "node-fixed");
  assert.equal(registered.node.status, "online");
  assert.equal(registered.node.nodeIp, "192.168.31.208");
  assert.deepEqual(registered.node.labels, ["linux", "build"]);

  const listed = service.listNodes({
    ownerPrincipalId: "principal-platform-owner",
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.nodeId, "node-fixed");

  const heartbeat = service.heartbeatNode({
    ownerPrincipalId: "principal-platform-owner",
    node: {
      nodeId: "node-fixed",
      status: "draining",
      slotAvailable: 1,
      labels: ["linux", "gpu"],
      credentialCapabilities: ["default", "backup"],
      providerCapabilities: ["gateway-a", "gateway-b"],
      heartbeatTtlSeconds: 90,
    },
  }, {
    nodeIp: "192.168.31.209",
  });

  assert.equal(heartbeat?.node.status, "draining");
  assert.equal(heartbeat?.node.nodeIp, "192.168.31.209");
  assert.equal(heartbeat?.node.slotAvailable, 1);
  assert.deepEqual(heartbeat?.node.labels, ["linux", "gpu"]);
  assert.deepEqual(heartbeat?.node.credentialCapabilities, ["default", "backup"]);
  assert.deepEqual(heartbeat?.node.providerCapabilities, ["gateway-a", "gateway-b"]);
  assert.equal(heartbeat?.node.heartbeatTtlSeconds, 90);

  const drained = service.drainNode({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-fixed",
  });
  assert.equal(drained?.node.status, "draining");

  const offline = service.offlineNode({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-fixed",
  });
  assert.equal(offline?.node.status, "offline");
  assert.equal(offline?.node.slotAvailable, 0);

  const detail = service.getNodeDetail({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-fixed",
  });
  assert.equal(detail?.organization.ownerPrincipalId, "principal-platform-owner");
  assert.equal(detail?.node.nodeId, "node-fixed");
  assert.deepEqual(detail?.leaseSummary, {
    totalCount: 0,
    activeCount: 0,
    expiredCount: 0,
    releasedCount: 0,
    revokedCount: 0,
  });
  assert.deepEqual(detail?.activeExecutionLeases, []);
  assert.deepEqual(detail?.recentExecutionLeases, []);

  const denied = service.getNodeDetail({
    ownerPrincipalId: "principal-other-owner",
    nodeId: "node-fixed",
  });
  assert.equal(denied, null);

  const missingMutation = service.drainNode({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-missing",
  });
  assert.equal(missingMutation, null);

  const reclaim = service.reclaimNode({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-fixed",
  });
  assert.equal(reclaim?.node.status, "offline");
  assert.deepEqual(reclaim?.summary, {
    activeLeaseCount: 0,
    reclaimedRunCount: 0,
    requeuedWorkItemCount: 0,
  });
  assert.deepEqual(reclaim?.reclaimedLeases, []);
});

test("createInMemoryPlatformNodeService 接入 execution lease runtime 后会返回真实 detail 与 reclaim", () => {
  const service = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T09:10:00.000Z",
    generateNodeId: () => "node-runtime",
    organizations: [{
      organizationId: "org-platform",
      ownerPrincipalId: "principal-platform-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T09:00:00.000Z",
      updatedAt: "2026-04-14T09:00:00.000Z",
    }],
  });

  service.registerNode({
    ownerPrincipalId: "principal-platform-owner",
    node: {
      displayName: "Worker Runtime",
      slotCapacity: 2,
      slotAvailable: 1,
    },
  });

  service.connectExecutionLeaseRuntime({
    listNodeExecutionLeaseContexts() {
      return [{
        lease: {
          leaseId: "lease-active",
          runId: "run-active",
          nodeId: "node-runtime",
          workItemId: "work-item-active",
          status: "active",
          createdAt: "2026-04-14T09:02:00.000Z",
          updatedAt: "2026-04-14T09:06:00.000Z",
        },
        run: {
          runId: "run-active",
          organizationId: "org-platform",
          workItemId: "work-item-active",
          nodeId: "node-runtime",
          status: "running",
          createdAt: "2026-04-14T09:02:00.000Z",
          updatedAt: "2026-04-14T09:06:00.000Z",
        },
        workItem: {
          workItemId: "work-item-active",
          organizationId: "org-platform",
          targetAgentId: "agent-active",
          sourceType: "human",
          goal: "执行运行中的节点任务",
          status: "running",
          priority: "high",
          createdAt: "2026-04-14T09:02:00.000Z",
          updatedAt: "2026-04-14T09:06:00.000Z",
        },
        targetAgent: {
          agentId: "agent-active",
          organizationId: "org-platform",
          displayName: "Agent Active",
          departmentRole: "Platform",
          status: "active",
          createdAt: "2026-04-14T09:02:00.000Z",
          updatedAt: "2026-04-14T09:02:00.000Z",
        },
      }, {
        lease: {
          leaseId: "lease-released",
          runId: "run-released",
          nodeId: "node-runtime",
          workItemId: "work-item-released",
          status: "released",
          createdAt: "2026-04-14T09:01:00.000Z",
          updatedAt: "2026-04-14T09:03:00.000Z",
        },
        run: {
          runId: "run-released",
          organizationId: "org-platform",
          workItemId: "work-item-released",
          nodeId: "node-runtime",
          status: "completed",
          createdAt: "2026-04-14T09:01:00.000Z",
          updatedAt: "2026-04-14T09:03:00.000Z",
        },
        workItem: {
          workItemId: "work-item-released",
          organizationId: "org-platform",
          targetAgentId: "agent-released",
          sourceType: "human",
          goal: "已完成节点任务",
          status: "completed",
          priority: "normal",
          createdAt: "2026-04-14T09:01:00.000Z",
          updatedAt: "2026-04-14T09:03:00.000Z",
        },
        targetAgent: {
          agentId: "agent-released",
          organizationId: "org-platform",
          displayName: "Agent Released",
          departmentRole: "Platform",
          status: "active",
          createdAt: "2026-04-14T09:01:00.000Z",
          updatedAt: "2026-04-14T09:01:00.000Z",
        },
      }];
    },
    reclaimNodeExecutionLeases() {
      return {
        summary: {
          activeLeaseCount: 1,
          reclaimedRunCount: 1,
          requeuedWorkItemCount: 1,
        },
        reclaimedLeases: [{
          lease: {
            leaseId: "lease-active",
            runId: "run-active",
            nodeId: "node-runtime",
            workItemId: "work-item-active",
            status: "revoked",
            createdAt: "2026-04-14T09:02:00.000Z",
            updatedAt: "2026-04-14T09:10:00.000Z",
          },
          run: {
            runId: "run-active",
            organizationId: "org-platform",
            workItemId: "work-item-active",
            nodeId: "node-runtime",
            status: "interrupted",
            createdAt: "2026-04-14T09:02:00.000Z",
            updatedAt: "2026-04-14T09:10:00.000Z",
          },
          workItem: {
            workItemId: "work-item-active",
            organizationId: "org-platform",
            targetAgentId: "agent-active",
            sourceType: "human",
            goal: "执行运行中的节点任务",
            status: "queued",
            priority: "high",
            createdAt: "2026-04-14T09:02:00.000Z",
            updatedAt: "2026-04-14T09:10:00.000Z",
          },
          targetAgent: {
            agentId: "agent-active",
            organizationId: "org-platform",
            displayName: "Agent Active",
            departmentRole: "Platform",
            status: "active",
            createdAt: "2026-04-14T09:02:00.000Z",
            updatedAt: "2026-04-14T09:02:00.000Z",
          },
          recoveryAction: "requeued",
        }],
      };
    },
  });

  const detail = service.getNodeDetail({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-runtime",
  });
  assert.deepEqual(detail?.leaseSummary, {
    totalCount: 2,
    activeCount: 1,
    expiredCount: 0,
    releasedCount: 1,
    revokedCount: 0,
  });
  assert.equal(detail?.activeExecutionLeases.length, 1);
  assert.equal(detail?.recentExecutionLeases[0]?.lease.leaseId, "lease-active");

  service.offlineNode({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-runtime",
  });

  const reclaim = service.reclaimNode({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-runtime",
  });
  assert.equal(reclaim?.summary.activeLeaseCount, 1);
  assert.equal(reclaim?.summary.reclaimedRunCount, 1);
  assert.equal(reclaim?.summary.requeuedWorkItemCount, 1);
  assert.equal(reclaim?.reclaimedLeases[0]?.recoveryAction, "requeued");
});
