import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformControlPlaneService } from "./platform-control-plane-service.js";
import { createInMemoryPlatformOncallService } from "./platform-oncall-service.js";
import type { PlatformGovernanceService } from "./platform-governance-service.js";
import type { PlatformNodeService } from "./platform-node-service.js";
import type { PlatformWorkerRunService } from "./platform-worker-run-service.js";

test("PlatformOncallService 会汇总节点、waiting、runs 与 paused agents 的值班建议", () => {
  const nodeService: PlatformNodeService = {
    registerNode() {
      throw new Error("not implemented");
    },
    heartbeatNode() {
      throw new Error("not implemented");
    },
    listNodes() {
      return [{
        nodeId: "node-alpha",
        organizationId: "org-platform",
        displayName: "Worker Alpha",
        status: "offline",
        slotCapacity: 2,
        slotAvailable: 0,
        heartbeatTtlSeconds: 60,
        lastHeartbeatAt: "2026-04-14T10:59:00.000Z",
        createdAt: "2026-04-14T10:00:00.000Z",
        updatedAt: "2026-04-14T10:59:00.000Z",
      }];
    },
    getNodeDetail() {
      return {
        organization: {
          organizationId: "org-platform",
          ownerPrincipalId: "principal-owner",
          displayName: "Platform Team",
          slug: "platform-team",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        node: {
          nodeId: "node-alpha",
          organizationId: "org-platform",
          displayName: "Worker Alpha",
          status: "offline",
          slotCapacity: 2,
          slotAvailable: 0,
          heartbeatTtlSeconds: 60,
          lastHeartbeatAt: "2026-04-14T10:59:00.000Z",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:59:00.000Z",
        },
        leaseSummary: {
          totalCount: 1,
          activeCount: 1,
          expiredCount: 0,
          releasedCount: 0,
          revokedCount: 0,
        },
        activeExecutionLeases: [],
        recentExecutionLeases: [],
      };
    },
    drainNode() {
      throw new Error("not implemented");
    },
    offlineNode() {
      throw new Error("not implemented");
    },
    reclaimNode() {
      throw new Error("not implemented");
    },
    deleteNode() {
      throw new Error("not implemented");
    },
  };
  const governanceService: PlatformGovernanceService = {
    getGovernanceOverview() {
      return {
        summary: {
          total: 1,
          waitingHuman: 1,
          waitingAgent: 0,
          attentionCount: 1,
        },
        managerHotspots: [],
      };
    },
    listWaitingQueue() {
      return {
        summary: {
          total: 1,
          waitingHuman: 1,
          waitingAgent: 0,
          attentionCount: 1,
        },
        items: [{
          workItemId: "work-item-human",
          organizationId: "org-platform",
          targetAgentId: "agent-beta",
          sourceType: "human",
          goal: "确认是否允许继续发布",
          status: "waiting_human",
          priority: "urgent",
          waitingFor: "human",
          createdAt: "2026-04-14T08:00:00.000Z",
          updatedAt: "2026-04-14T08:30:00.000Z",
        }],
      };
    },
  };
  const workerRunService: PlatformWorkerRunService = {
    listOwnerPrincipalIds() {
      return ["principal-owner"];
    },
    pullAssignedRun() {
      throw new Error("not implemented");
    },
    assignQueuedWorkItem() {
      throw new Error("not implemented");
    },
    updateRunStatus() {
      throw new Error("not implemented");
    },
    completeRun() {
      throw new Error("not implemented");
    },
    listRuns() {
      return { runs: [] };
    },
    getRunDetail() {
      return null;
    },
    getAssignedRunByWorkItem() {
      return null;
    },
    updateAssignedRunByWorkItem() {
      return null;
    },
    listAssignedRuns() {
      return [{
        organization: {
          organizationId: "org-platform",
          ownerPrincipalId: "principal-owner",
          displayName: "Platform Team",
          slug: "platform-team",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        node: {
          nodeId: "node-alpha",
          organizationId: "org-platform",
          displayName: "Worker Alpha",
          status: "offline",
          slotCapacity: 2,
          slotAvailable: 0,
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        targetAgent: {
          agentId: "agent-beta",
          organizationId: "org-platform",
          displayName: "平台值班员",
          departmentRole: "Platform",
          status: "active",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        workItem: {
          workItemId: "work-item-run-failed",
          organizationId: "org-platform",
          targetAgentId: "agent-beta",
          sourceType: "human",
          goal: "处理执行失败的 run",
          status: "failed",
          priority: "high",
          createdAt: "2026-04-14T10:10:00.000Z",
          updatedAt: "2026-04-14T10:20:00.000Z",
        },
        run: {
          runId: "run-failed",
          organizationId: "org-platform",
          workItemId: "work-item-run-failed",
          nodeId: "node-alpha",
          status: "failed",
          createdAt: "2026-04-14T10:10:00.000Z",
          updatedAt: "2026-04-14T10:20:00.000Z",
        },
        executionLease: {
          leaseId: "lease-failed",
          runId: "run-failed",
          nodeId: "node-alpha",
          workItemId: "work-item-run-failed",
          leaseToken: "lease-failed-token",
          status: "revoked",
          createdAt: "2026-04-14T10:10:00.000Z",
          updatedAt: "2026-04-14T10:20:00.000Z",
        },
        executionContract: {
          workspacePath: "/srv/platform-alpha",
        },
      }, {
        organization: {
          organizationId: "org-platform",
          ownerPrincipalId: "principal-owner",
          displayName: "Platform Team",
          slug: "platform-team",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        node: {
          nodeId: "node-beta",
          organizationId: "org-platform",
          displayName: "Worker Beta",
          status: "online",
          slotCapacity: 2,
          slotAvailable: 1,
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        targetAgent: {
          agentId: "agent-gamma",
          organizationId: "org-platform",
          displayName: "执行代理",
          departmentRole: "Execution",
          status: "active",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        },
        workItem: {
          workItemId: "work-item-waiting",
          organizationId: "org-platform",
          targetAgentId: "agent-gamma",
          sourceType: "agent",
          goal: "等待对端 agent 回复",
          status: "waiting_agent",
          priority: "normal",
          waitingFor: "agent",
          createdAt: "2026-04-14T10:20:00.000Z",
          updatedAt: "2026-04-14T10:40:00.000Z",
        },
        run: {
          runId: "run-waiting",
          organizationId: "org-platform",
          workItemId: "work-item-waiting",
          nodeId: "node-beta",
          status: "waiting_action",
          createdAt: "2026-04-14T10:20:00.000Z",
          updatedAt: "2026-04-14T10:40:00.000Z",
        },
        executionLease: {
          leaseId: "lease-waiting",
          runId: "run-waiting",
          nodeId: "node-beta",
          workItemId: "work-item-waiting",
          leaseToken: "lease-waiting-token",
          status: "active",
          createdAt: "2026-04-14T10:20:00.000Z",
          updatedAt: "2026-04-14T10:40:00.000Z",
        },
        executionContract: {
          workspacePath: "/srv/platform-beta",
        },
      }];
    },
  };
  const controlPlaneService: PlatformControlPlaneService = {
    listAgents() {
      return {
        organizations: [],
        agents: [{
          agentId: "agent-paused",
          organizationId: "org-platform",
          displayName: "暂停中的平台代理",
          departmentRole: "Platform",
          status: "paused",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:00:00.000Z",
        }],
      };
    },
    getAgentDetail() {
      return null;
    },
    createAgent() {
      throw new Error("not implemented");
    },
    updateExecutionBoundary() {
      return null;
    },
    updateSpawnPolicy() {
      throw new Error("not implemented");
    },
    pauseAgent() {
      return null;
    },
    resumeAgent() {
      return null;
    },
    archiveAgent() {
      return null;
    },
    listProjectWorkspaceBindings() {
      return {
        bindings: [],
      };
    },
    getProjectWorkspaceBinding() {
      return null;
    },
    upsertProjectWorkspaceBinding() {
      throw new Error("not implemented");
    },
  };

  const service = createInMemoryPlatformOncallService({
    nodeService,
    governanceService,
    workerRunService,
    controlPlaneService,
    now: () => "2026-04-14T11:00:00.000Z",
  });
  const summary = service.getOncallSummary({
    ownerPrincipalId: "principal-owner",
  });

  assert.equal(summary.counts.nodeTotal, 1);
  assert.equal(summary.counts.nodeErrorCount, 1);
  assert.equal(summary.counts.waitingAttentionCount, 1);
  assert.equal(summary.counts.runFailedCount, 1);
  assert.equal(summary.counts.runWaitingActionCount, 1);
  assert.equal(summary.counts.pausedAgentCount, 1);
  assert.equal(summary.primaryDiagnosis.severity, "error");
  assert.match(summary.primaryDiagnosis.title, /立即处理/);
  assert.ok(summary.recommendations.some((item: { recommendationId?: string }) => item.recommendationId === "node:node-alpha:offline_active_lease"));
  assert.ok(summary.recommendations.some((item: { recommendationId?: string }) => item.recommendationId === "run:run-failed:failed"));
  assert.ok(summary.recommendations.some((item: { recommendationId?: string }) => item.recommendationId === "waiting:work-item-human"));
  assert.ok(summary.recommendations.some((item: { recommendationId?: string }) => item.recommendationId === "agents:paused-capacity"));
  assert.ok(summary.recommendedNextSteps.some((item: string) => item.includes("节点 error attention")));
});
