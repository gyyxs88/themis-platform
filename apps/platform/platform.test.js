import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNodeAttentionById,
  filterAndSortNodes,
  initializePlatformSurface,
  resolveInitialOwnerPrincipalId,
  summarizeNodes,
  summarizeReclaimResult,
} from "./platform.js";

test("resolveInitialOwnerPrincipalId 会优先读取 query param", () => {
  assert.equal(
    resolveInitialOwnerPrincipalId("?ownerPrincipalId=principal-platform-owner", "principal-local-fallback"),
    "principal-platform-owner",
  );
});

test("resolveInitialOwnerPrincipalId 会在 query param 缺失时回退到本地缓存", () => {
  assert.equal(resolveInitialOwnerPrincipalId("", "principal-local-fallback"), "principal-local-fallback");
});

test("summarizeNodes 会汇总在线、排水中和离线节点数量", () => {
  assert.deepEqual(summarizeNodes([
    { status: "online" },
    { status: "draining" },
    { status: "offline" },
    { status: "online" },
  ]), {
    total: 4,
    online: 2,
    draining: 1,
    offline: 1,
  });
});

test("initializePlatformSurface 默认进入节点与值班并支持切换 view", async () => {
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    fetch: async (url) => {
      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: false, tokenLabel: "" });
      }

      return createJsonResponse(200, {
        nodes: [],
        runs: [],
        workItems: [],
        items: [],
        summary: {},
        managerHotspots: [],
        parents: [],
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(document.getElementById("platform-view-nodes-oncall").hidden, false);
  assert.equal(document.getElementById("platform-view-overview").hidden, true);
  assert.equal(document.getElementById("platform-nav-nodes-oncall").dataset.selected, "true");

  surface.setActiveView("governance");

  assert.equal(document.getElementById("platform-view-governance").hidden, false);
  assert.equal(document.getElementById("platform-view-nodes-oncall").hidden, true);
  assert.equal(document.getElementById("platform-nav-governance").dataset.selected, "true");
});

test("initializePlatformSurface 会从 hash 恢复 view 并在切换时回写 hash", async () => {
  const hashes = [];
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    locationHash: "#mailbox",
    setLocationHash(hash) {
      hashes.push(hash);
    },
    fetch: async (url) => {
      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: false, tokenLabel: "" });
      }

      return createJsonResponse(200, {
        nodes: [],
        runs: [],
        workItems: [],
        items: [],
        summary: {},
        managerHotspots: [],
        parents: [],
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(document.getElementById("platform-view-mailbox").hidden, false);
  assert.equal(document.getElementById("platform-nav-mailbox").dataset.selected, "true");

  surface.setActiveView("overview");

  assert.equal(document.getElementById("platform-view-overview").hidden, false);
  assert.equal(document.getElementById("platform-view-mailbox").hidden, true);
  assert.equal(hashes.at(-1), "#overview");
});

test("initializePlatformSurface 会加载会议室观察台并支持终止当前会议", async () => {
  const requests = [];
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    locationHash: "#meeting-rooms",
    fetch: async (url, init = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: true, tokenLabel: "platform-web" });
      }

      if (url === "/api/platform/meeting-rooms/list") {
        return createJsonResponse(200, {
          rooms: [{
            roomId: "room-1",
            title: "发布阻塞讨论",
            goal: "确认 prod 发布失败根因",
            status: "open",
            discussionMode: "collaborative",
            organizationId: "org-platform",
            updatedAt: "2026-04-19T01:00:00.000Z",
          }],
        });
      }

      if (url === "/api/platform/meeting-rooms/detail") {
        return createJsonResponse(200, {
          room: {
            roomId: "room-1",
            title: "发布阻塞讨论",
            goal: "确认 prod 发布失败根因",
            status: "open",
            discussionMode: "collaborative",
            organizationId: "org-platform",
            createdByOperatorPrincipalId: "principal-owner",
            updatedAt: "2026-04-19T01:00:00.000Z",
          },
          participants: [{
            participantId: "participant-1",
            roomId: "room-1",
            participantKind: "managed_agent",
            agentId: "agent-backend",
            displayName: "后端·衡",
            roomRole: "participant",
            entryMode: "blank",
          }],
          rounds: [{
            roundId: "round-1",
            roomId: "room-1",
            triggerMessageId: "message-1",
            status: "completed",
            targetParticipantIds: ["participant-1"],
            respondedParticipantIds: ["participant-1"],
            createdAt: "2026-04-19T01:00:00.000Z",
            updatedAt: "2026-04-19T01:00:20.000Z",
          }],
          messages: [{
            messageId: "message-1",
            roomId: "room-1",
            speakerType: "themis",
            audience: "all_participants",
            content: "请直接给出发布失败根因。",
            messageKind: "message",
            createdAt: "2026-04-19T01:00:00.000Z",
            updatedAt: "2026-04-19T01:00:00.000Z",
          }, {
            messageId: "message-2",
            roomId: "room-1",
            speakerType: "managed_agent",
            speakerAgentId: "agent-backend",
            audience: "all_participants",
            content: "我判断是 migration 锁等待导致超时。",
            messageKind: "message",
            createdAt: "2026-04-19T01:00:20.000Z",
            updatedAt: "2026-04-19T01:00:20.000Z",
          }],
          resolutions: [{
            resolutionId: "resolution-1",
            roomId: "room-1",
            sourceMessageIds: ["message-2"],
            title: "补 migration 重试",
            summary: "先补重试和告警，再重新发版。",
            status: "draft",
            createdAt: "2026-04-19T01:00:40.000Z",
            updatedAt: "2026-04-19T01:00:40.000Z",
          }],
          artifactRefs: [],
        });
      }

      if (url === "/api/platform/meeting-rooms/terminate") {
        return createJsonResponse(200, {
          room: {
            roomId: "room-1",
            title: "发布阻塞讨论",
            goal: "确认 prod 发布失败根因",
            status: "terminated",
            discussionMode: "collaborative",
            organizationId: "org-platform",
            createdByOperatorPrincipalId: "principal-owner",
            updatedAt: "2026-04-19T01:02:00.000Z",
            terminatedAt: "2026-04-19T01:02:00.000Z",
            terminatedByOperatorPrincipalId: "principal-owner",
            terminationReason: "平台值班判断当前讨论进入异常循环。",
          },
          participants: [],
          rounds: [],
          messages: [{
            messageId: "message-3",
            roomId: "room-1",
            speakerType: "system",
            audience: "all_participants",
            content: "平台已终止会议：平台值班判断当前讨论进入异常循环。",
            messageKind: "status",
            createdAt: "2026-04-19T01:02:00.000Z",
            updatedAt: "2026-04-19T01:02:00.000Z",
          }],
          resolutions: [],
          artifactRefs: [],
        });
      }

      return createJsonResponse(200, {
        nodes: [],
        runs: [],
        workItems: [],
        items: [],
        summary: {},
        managerHotspots: [],
        parents: [],
        organizations: [],
        agents: [],
        bindings: [],
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(document.getElementById("platform-view-meeting-rooms").hidden, false);
  assert.equal(document.getElementById("platform-nav-meeting-rooms").dataset.selected, "true");
  assert.equal(document.getElementById("platform-meeting-rooms-total").textContent, "1");
  assert.match(document.getElementById("platform-meeting-rooms-list").innerHTML, /发布阻塞讨论/);
  assert.match(document.getElementById("platform-meeting-room-detail").innerHTML, /migration 锁等待导致超时/);

  await surface.terminateMeetingRoom("room-1", "平台值班判断当前讨论进入异常循环。");

  assert.deepEqual(requests.at(-1), {
    url: "/api/platform/meeting-rooms/terminate",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      termination: {
        roomId: "room-1",
        operatorPrincipalId: "principal-owner",
        terminationReason: "平台值班判断当前讨论进入异常循环。",
      },
    },
  });
  assert.equal(document.getElementById("platform-meeting-rooms-terminated").textContent, "1");
  assert.equal(document.getElementById("platform-meeting-room-terminate-submit").disabled, true);
  assert.match(document.getElementById("platform-meeting-room-detail").innerHTML, /终止原因/);
});

test("initializePlatformSurface 会对节点治理动作调用对应平台接口", async () => {
  const requests = [];
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    fetch: async (url, init = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: false, tokenLabel: "" });
      }

      if (url === "/api/platform/nodes/offline") {
        return createJsonResponse(200, {
          node: {
            nodeId: "node-a",
            status: "offline",
            slotAvailable: 0,
          },
        });
      }

      return createJsonResponse(200, { nodes: [] });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  requests.length = 0;
  await surface.updateNodeStatus("node-a", "offline");

  assert.deepEqual(requests.at(-1), {
    url: "/api/platform/nodes/offline",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      nodeId: "node-a",
    },
  });
});

test("initializePlatformSurface 会支持删除离线历史节点", async () => {
  const requests = [];
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    fetch: async (url, init = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: false, tokenLabel: "" });
      }

      if (url === "/api/platform/nodes/list") {
        return createJsonResponse(200, {
          nodes: [{
            nodeId: "node-stale",
            displayName: "Worker Stale",
            organizationId: "org-platform",
            status: "offline",
            nodeIp: "192.168.31.8",
            slotAvailable: 0,
            slotCapacity: 1,
            heartbeatTtlSeconds: 30,
            lastHeartbeatAt: "2026-04-14T11:00:00.000Z",
            labels: [],
            workspaceCapabilities: ["/srv/platform-stale"],
            credentialCapabilities: ["default"],
            providerCapabilities: [],
          }],
        });
      }

      if (url === "/api/platform/nodes/detail") {
        const payload = init.body ? JSON.parse(init.body) : {};

        if (payload.nodeId === "node-stale") {
          return createJsonResponse(200, {
            node: {
              nodeId: "node-stale",
              displayName: "Worker Stale",
              organizationId: "org-platform",
              status: "offline",
              nodeIp: "192.168.31.8",
              slotAvailable: 0,
              slotCapacity: 1,
              heartbeatTtlSeconds: 30,
              lastHeartbeatAt: "2026-04-14T11:00:00.000Z",
              labels: [],
              workspaceCapabilities: ["/srv/platform-stale"],
              credentialCapabilities: ["default"],
              providerCapabilities: [],
            },
            leaseSummary: {
              totalCount: 0,
              activeCount: 0,
              expiredCount: 0,
              releasedCount: 0,
              revokedCount: 0,
            },
            activeExecutionLeases: [],
            recentExecutionLeases: [],
          });
        }

        return createJsonResponse(404, {
          error: {
            message: "missing node detail",
          },
        });
      }

      if (url === "/api/platform/nodes/delete") {
        return createJsonResponse(200, {
          node: {
            nodeId: "node-stale",
            status: "offline",
            slotAvailable: 0,
          },
        });
      }

      return createJsonResponse(200, {
        nodes: [],
        runs: [],
        workItems: [],
        items: [],
        summary: {},
        managerHotspots: [],
        parents: [],
        organizations: [],
        agents: [],
        bindings: [],
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(document.getElementById("platform-nodes-list").innerHTML, /Delete/);

  requests.length = 0;
  await surface.updateNodeStatus("node-stale", "delete");

  assert.deepEqual(requests.at(-1), {
    url: "/api/platform/nodes/delete",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      nodeId: "node-stale",
    },
  });
  assert.equal(document.getElementById("platform-nodes-list").innerHTML, "");
  assert.match(document.getElementById("platform-action-status").textContent, /已删除/);
});

test("initializePlatformSurface 会对 work-item 与 mailbox 动作调用对应平台接口", async () => {
  const requests = [];
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    fetch: async (url, init = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: false, tokenLabel: "" });
      }

      if (url === "/api/platform/work-items/list") {
        return createJsonResponse(200, {
          workItems: [{
            workItemId: "work-item-1",
            goal: "等待人工审批是否继续发布",
            targetAgentId: "agent-delta",
            status: "waiting_human",
            priority: "urgent",
            updatedAt: "2026-04-14T10:10:00.000Z",
          }],
        });
      }

      if (url === "/api/platform/work-items/detail") {
        return createJsonResponse(200, {
          workItem: {
            workItemId: "work-item-1",
            goal: "等待人工审批是否继续发布",
            targetAgentId: "agent-delta",
            status: "waiting_human",
            priority: "urgent",
          },
          targetAgent: {
            agentId: "agent-delta",
            displayName: "Agent Delta",
          },
        });
      }

      if (url === "/api/platform/agents/mailbox/list") {
        return createJsonResponse(200, {
          agent: {
            agentId: "agent-delta",
            displayName: "Agent Delta",
          },
          items: [{
            entry: {
              mailboxEntryId: "mailbox-1",
              ownerAgentId: "agent-delta",
              status: "pending",
            },
            message: {
              messageId: "message-1",
              summary: "请确认是否继续发布。",
            },
          }],
        });
      }

      if (url === "/api/platform/work-items/dispatch") {
        return createJsonResponse(200, {
          workItem: {
            workItemId: "work-item-2",
            goal: "新建平台待办",
            targetAgentId: "agent-delta",
            status: "queued",
            priority: "high",
            updatedAt: "2026-04-14T10:12:00.000Z",
          },
        });
      }

      if (url === "/api/platform/work-items/respond") {
        return createJsonResponse(200, {
          workItem: {
            workItemId: "work-item-1",
            status: "queued",
          },
        });
      }

      if (url === "/api/platform/agents/mailbox/respond") {
        return createJsonResponse(200, {
          responseMessage: {
            messageId: "message-2",
            messageType: "approval_result",
          },
        });
      }

      return createJsonResponse(200, { nodes: [], runs: [] });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  requests.length = 0;

  await surface.dispatchWorkItem({
    targetAgentId: "agent-delta",
    sourceType: "human",
    goal: "新建平台待办",
    priority: "high",
  });
  await surface.respondWorkItem("work-item-1", {
    decision: "approve",
    inputText: "可以继续执行。",
  });
  await surface.respondMailbox("agent-delta", "mailbox-1", {
    decision: "approve",
    inputText: "已确认，可以继续。",
  });

  assert.deepEqual(requests.slice(-3), [{
    url: "/api/platform/work-items/dispatch",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      workItem: {
        targetAgentId: "agent-delta",
        sourceType: "human",
        goal: "新建平台待办",
        priority: "high",
      },
    },
  }, {
    url: "/api/platform/work-items/respond",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      workItemId: "work-item-1",
      response: {
        decision: "approve",
        inputText: "可以继续执行。",
      },
    },
  }, {
    url: "/api/platform/agents/mailbox/respond",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      agentId: "agent-delta",
      mailboxEntryId: "mailbox-1",
      response: {
        decision: "approve",
        inputText: "已确认，可以继续。",
      },
    },
  }]);
});

test("initializePlatformSurface 会对 agents 与 projects 动作调用对应平台接口", async () => {
  const requests = [];
  const document = createDocumentStub();
  const surface = initializePlatformSurface({
    document,
    fetch: async (url, init = {}) => {
      requests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: false, tokenLabel: "" });
      }

      if (url === "/api/platform/agents/list") {
        return createJsonResponse(200, {
          organizations: [{ organizationId: "org-platform" }],
          agents: [{
            agentId: "agent-alpha",
            displayName: "平台值班员",
            departmentRole: "Platform",
            organizationId: "org-platform",
            status: "active",
          }],
        });
      }

      if (url === "/api/platform/agents/detail") {
        return createJsonResponse(200, {
          agent: {
            agentId: "agent-alpha",
            displayName: "平台值班员",
            departmentRole: "Platform",
            status: "active",
          },
          workspacePolicy: {
            agentId: "agent-alpha",
            canonicalWorkspacePath: "/srv/platform-alpha",
          },
          runtimeProfile: {
            agentId: "agent-alpha",
            provider: "openai",
            model: "gpt-5.4-mini",
          },
          organization: {
            organizationId: "org-platform",
          },
          principal: {
            principalId: "principal-agent-alpha",
          },
          authAccounts: [],
          thirdPartyProviders: [],
        });
      }

      if (url === "/api/platform/projects/workspace-binding/list") {
        return createJsonResponse(200, {
          bindings: [{
            projectId: "project-site-foo",
            organizationId: "org-platform",
            displayName: "官网 site-foo",
            canonicalWorkspacePath: "/srv/platform-alpha",
            continuityMode: "sticky",
          }],
        });
      }

      if (url === "/api/platform/agents/create") {
        return createJsonResponse(200, {
          organization: {
            organizationId: "org-platform",
          },
          principal: {
            principalId: "principal-agent-beta",
          },
          agent: {
            agentId: "agent-beta",
            displayName: "平台值班员 Beta",
            departmentRole: "Platform",
            status: "active",
            organizationId: "org-platform",
          },
        });
      }

      if (url === "/api/platform/projects/workspace-binding/upsert") {
        return createJsonResponse(200, {
          binding: {
            projectId: "project-site-bar",
            organizationId: "org-platform",
            displayName: "官网 site-bar",
            canonicalWorkspacePath: "/srv/platform-beta",
            continuityMode: "replicated",
          },
        });
      }

      return createJsonResponse(200, {
        nodes: [],
        runs: [],
        workItems: [],
        items: [],
        summary: {},
        managerHotspots: [],
        parents: [],
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  requests.length = 0;

  await surface.createAgent({
    departmentRole: "Platform",
    displayName: "平台值班员 Beta",
    mission: "负责值班升级。",
  });
  await surface.upsertProjectBinding({
    projectId: "project-site-bar",
    organizationId: "org-platform",
    displayName: "官网 site-bar",
    canonicalWorkspacePath: "/srv/platform-beta",
    continuityMode: "replicated",
  });

  assert.deepEqual(requests.slice(-2), [{
    url: "/api/platform/agents/create",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      agent: {
        departmentRole: "Platform",
        displayName: "平台值班员 Beta",
        mission: "负责值班升级。",
      },
    },
  }, {
    url: "/api/platform/projects/workspace-binding/upsert",
    method: "POST",
    body: {
      ownerPrincipalId: "principal-owner",
      binding: {
        projectId: "project-site-bar",
        organizationId: "org-platform",
        displayName: "官网 site-bar",
        canonicalWorkspacePath: "/srv/platform-beta",
        continuityMode: "replicated",
      },
    },
  }]);
});

test("initializePlatformSurface 会读取治理摘要、waiting queue 和 recent runs", async () => {
  const document = createDocumentStub();
  initializePlatformSurface({
    document,
    fetch: async (url) => {
      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: true, tokenLabel: "platform-web" });
      }

      if (url === "/api/platform/nodes/list") {
        return createJsonResponse(200, {
          nodes: [
            { nodeId: "node-a", status: "online", nodeIp: "192.168.31.208" },
            { nodeId: "node-b", status: "draining" },
          ],
        });
      }

      if (url === "/api/platform/nodes/detail") {
        return createJsonResponse(200, {
          node: {
            nodeId: "node-a",
            displayName: "Worker Alpha",
            organizationId: "org-platform",
            status: "online",
            nodeIp: "192.168.31.208",
            slotCapacity: 2,
            slotAvailable: 1,
            heartbeatTtlSeconds: 60,
            lastHeartbeatAt: "2026-04-14T11:59:40.000Z",
            workspaceCapabilities: ["/srv/platform-alpha"],
            credentialCapabilities: ["default"],
            providerCapabilities: ["gateway-a"],
            labels: ["linux", "build"],
          },
          leaseSummary: {
            totalCount: 2,
            activeCount: 1,
            expiredCount: 0,
            releasedCount: 1,
            revokedCount: 0,
          },
          activeExecutionLeases: [{
            lease: {
              leaseId: "lease-node-a-active",
              runId: "run-node-a-active",
              nodeId: "node-a",
              workItemId: "work-item-node-a-active",
              status: "active",
              updatedAt: "2026-04-14T11:59:50.000Z",
            },
            run: {
              runId: "run-node-a-active",
              status: "running",
            },
            workItem: {
              workItemId: "work-item-node-a-active",
              goal: "处理节点 A 的运行中任务",
              status: "running",
            },
            targetAgent: {
              agentId: "agent-node-a",
              displayName: "Agent Node A",
            },
          }],
          recentExecutionLeases: [{
            lease: {
              leaseId: "lease-node-a-active",
              runId: "run-node-a-active",
              nodeId: "node-a",
              workItemId: "work-item-node-a-active",
              status: "active",
              updatedAt: "2026-04-14T11:59:50.000Z",
            },
            run: {
              runId: "run-node-a-active",
              status: "running",
            },
            workItem: {
              workItemId: "work-item-node-a-active",
              goal: "处理节点 A 的运行中任务",
              status: "running",
            },
            targetAgent: {
              agentId: "agent-node-a",
              displayName: "Agent Node A",
            },
          }, {
            lease: {
              leaseId: "lease-node-a-released",
              runId: "run-node-a-released",
              nodeId: "node-a",
              workItemId: "work-item-node-a-released",
              status: "released",
              updatedAt: "2026-04-14T11:40:00.000Z",
            },
            run: {
              runId: "run-node-a-released",
              status: "completed",
            },
            workItem: {
              workItemId: "work-item-node-a-released",
              goal: "节点 A 已完成任务",
              status: "completed",
            },
            targetAgent: {
              agentId: "agent-node-a",
              displayName: "Agent Node A",
            },
          }],
        });
      }

      if (url === "/api/platform/oncall/summary") {
        return createJsonResponse(200, {
          counts: {
            nodeTotal: 2,
            nodeErrorCount: 1,
            nodeWarningCount: 1,
            waitingAttentionCount: 1,
            waitingHumanCount: 1,
            runWaitingActionCount: 1,
            runFailedCount: 0,
            pausedAgentCount: 0,
          },
          primaryDiagnosis: {
            id: "oncall_warning_attention",
            severity: "warning",
            title: "当前有需要继续跟进的值班建议",
            summary: "节点 warning 1 台，高关注 waiting 1 条，waiting_action run 1 条。",
          },
          recommendedNextSteps: [
            "优先查看 waiting queue 的高关注项。",
            "对 waiting_action runs，按 handoff -> mailbox -> work-item detail 的顺序补齐上下文。",
          ],
          recommendations: [
            {
              recommendationId: "node:node-b:draining_active_lease",
              category: "worker_fleet",
              severity: "warning",
              title: "Worker Beta 需要值班处理",
              summary: "节点正在 draining，仍有任务在跑。",
              recommendedAction: "继续观察节点 active lease 是否自然清空。",
              subjectId: "node-b",
            },
          ],
        });
      }

      if (url === "/api/platform/agents/governance-overview") {
        return createJsonResponse(200, {
          summary: {
            total: 2,
            waitingHuman: 1,
            waitingAgent: 1,
            attentionCount: 1,
          },
          managerHotspots: [
            {
              managerAgentId: "agent-manager",
              displayName: "经理·曜",
              itemCount: 2,
            },
          ],
        });
      }

      if (url === "/api/platform/agents/waiting/list") {
        return createJsonResponse(200, {
          items: [
            {
              workItemId: "work-item-1",
              goal: "确认是否允许继续发布",
              status: "waiting_human",
              priority: "urgent",
              targetAgentId: "agent-manager",
              sourceType: "human",
              updatedAt: "2026-04-14T10:10:00.000Z",
            },
          ],
        });
      }

      if (url === "/api/platform/agents/collaboration-dashboard") {
        return createJsonResponse(200, {
          summary: {
            total: 1,
            waitingHuman: 1,
            waitingAgent: 0,
            attentionCount: 1,
          },
          parents: [
            {
              parentWorkItemId: "parent-1",
              displayName: "平台父任务 Alpha",
              items: [
                {
                  workItemId: "work-item-1",
                  goal: "确认是否允许继续发布",
                  status: "waiting_human",
                  priority: "urgent",
                  targetAgentId: "agent-manager",
                  sourceType: "human",
                  updatedAt: "2026-04-14T10:10:00.000Z",
                },
              ],
            },
          ],
        });
      }

      if (url === "/api/platform/agents/handoffs/list") {
        return createJsonResponse(200, {
          agent: {
            agentId: "agent-manager",
            displayName: "经理·曜",
          },
          handoffs: [
            {
              handoffId: "handoff-1",
              workItemId: "work-item-1",
              summary: "平台经理已补齐上下文并交接给执行 agent。",
              blockers: ["等待人工确认"],
              recommendedNextActions: ["确认边界", "恢复执行"],
            },
          ],
          timeline: [
            {
              entryId: "timeline-1",
              kind: "handoff",
              title: "平台经理交接",
              summary: "平台经理已补齐上下文并交接给执行 agent。",
              updatedAt: "2026-04-14T10:09:00.000Z",
            },
          ],
        });
      }

      if (url === "/api/platform/runs/list") {
        return createJsonResponse(200, {
          runs: [
            {
              runId: "run-1",
              workItemId: "work-item-1",
              nodeId: "node-a",
              status: "waiting_action",
              updatedAt: "2026-04-14T10:10:00.000Z",
            },
          ],
        });
      }

      if (url === "/api/platform/runs/detail") {
        return createJsonResponse(200, {
          run: {
            runId: "run-1",
            nodeId: "node-a",
            status: "waiting_action",
            updatedAt: "2026-04-14T10:10:00.000Z",
          },
          workItem: {
            workItemId: "work-item-1",
            goal: "确认是否允许继续发布",
          },
          targetAgent: {
            displayName: "经理·曜",
          },
        });
      }

      if (url === "/api/platform/work-items/list") {
        return createJsonResponse(200, {
          workItems: [
            {
              workItemId: "work-item-2",
              goal: "等待单独排队的前端任务",
              status: "queued",
              priority: "normal",
              targetAgentId: "agent-delta",
              updatedAt: "2026-04-14T10:15:00.000Z",
            },
          ],
        });
      }

      if (url === "/api/platform/work-items/detail") {
        return createJsonResponse(200, {
          workItem: {
            workItemId: "work-item-2",
            goal: "等待单独排队的前端任务",
            status: "queued",
            priority: "normal",
            targetAgentId: "agent-delta",
            sourceType: "human",
            updatedAt: "2026-04-14T10:15:00.000Z",
          },
          targetAgent: {
            agentId: "agent-delta",
            displayName: "Agent Delta",
          },
          parentWorkItem: {
            workItemId: "parent-work-item-1",
            goal: "平台父任务",
          },
          latestHandoff: {
            handoffId: "handoff-work-item-2",
            summary: "前端工作项已进入独立排队。",
          },
        });
      }

      if (url === "/api/platform/agents/mailbox/list") {
        return createJsonResponse(200, {
          agent: {
            agentId: "agent-delta",
            displayName: "Agent Delta",
          },
          items: [
            {
              entry: {
                mailboxEntryId: "mailbox-delta-1",
                ownerAgentId: "agent-delta",
                status: "pending",
                priority: "urgent",
                updatedAt: "2026-04-14T10:16:00.000Z",
              },
              message: {
                messageId: "message-delta-1",
                summary: "请确认是否继续发布。",
                messageType: "approval_request",
              },
            },
          ],
        });
      }

      if (url === "/api/platform/agents/list") {
        return createJsonResponse(200, {
          organizations: [
            {
              organizationId: "org-platform",
            },
          ],
          agents: [
            {
              agentId: "agent-alpha",
              displayName: "平台值班员",
              departmentRole: "Platform",
              organizationId: "org-platform",
              status: "active",
            },
          ],
        });
      }

      if (url === "/api/platform/agents/detail") {
        return createJsonResponse(200, {
          organization: {
            organizationId: "org-platform",
          },
          principal: {
            principalId: "principal-agent-alpha",
          },
          agent: {
            agentId: "agent-alpha",
            displayName: "平台值班员",
            departmentRole: "Platform",
            status: "active",
          },
          workspacePolicy: {
            agentId: "agent-alpha",
            canonicalWorkspacePath: "/srv/platform-alpha",
          },
          runtimeProfile: {
            agentId: "agent-alpha",
            provider: "openai",
            model: "gpt-5.4-mini",
          },
          authAccounts: [],
          thirdPartyProviders: [],
        });
      }

      if (url === "/api/platform/projects/workspace-binding/list") {
        return createJsonResponse(200, {
          bindings: [
            {
              projectId: "project-site-foo",
              organizationId: "org-platform",
              displayName: "官网 site-foo",
              canonicalWorkspacePath: "/srv/platform-alpha",
              continuityMode: "sticky",
            },
          ],
        });
      }

      if (url === "/api/platform/meeting-rooms/list") {
        return createJsonResponse(200, {
          rooms: [],
        });
      }

      return createJsonResponse(404, {
        error: {
          message: "unexpected request",
        },
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(document.getElementById("platform-session-title").textContent, "已登录：platform-web");
  assert.equal(document.getElementById("platform-summary-total").textContent, "2");
  assert.match(document.getElementById("platform-nodes-list").innerHTML, /IP 192\.168\.31\.208/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /Worker Alpha/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /处理节点 A 的运行中任务/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /\/srv\/platform-alpha/);
  assert.equal(document.getElementById("platform-oncall-errors").textContent, "1");
  assert.equal(document.getElementById("platform-oncall-warnings").textContent, "1");
  assert.equal(document.getElementById("platform-oncall-waiting").textContent, "1");
  assert.equal(document.getElementById("platform-oncall-runs").textContent, "1");
  assert.match(document.getElementById("platform-oncall-status").textContent, /持续关注/);
  assert.match(document.getElementById("platform-oncall-diagnosis").innerHTML, /当前有需要继续跟进的值班建议/);
  assert.match(document.getElementById("platform-oncall-next-steps").innerHTML, /优先查看 waiting queue 的高关注项/);
  assert.match(document.getElementById("platform-oncall-list").innerHTML, /Worker Beta 需要值班处理/);
  assert.equal(document.getElementById("platform-oncall-empty").hidden, true);
  assert.equal(document.getElementById("platform-governance-total").textContent, "2");
  assert.equal(document.getElementById("platform-governance-waiting-human").textContent, "1");
  assert.equal(document.getElementById("platform-governance-waiting-agent").textContent, "1");
  assert.equal(document.getElementById("platform-governance-attention").textContent, "1");
  assert.match(document.getElementById("platform-hotspots-summary").textContent, /1 个需关注的 manager 热点/);
  assert.match(document.getElementById("platform-hotspots-list").innerHTML, /经理·曜/);
  assert.match(document.getElementById("platform-waiting-list").innerHTML, /确认是否允许继续发布/);
  assert.equal(document.getElementById("platform-waiting-empty").hidden, true);
  assert.equal(document.getElementById("platform-collaboration-total").textContent, "1");
  assert.equal(document.getElementById("platform-collaboration-handoffs-total").textContent, "1");
  assert.match(document.getElementById("platform-collaboration-list").innerHTML, /平台父任务 Alpha/);
  assert.match(document.getElementById("platform-handoffs-list").innerHTML, /平台经理已补齐上下文并交接给执行 agent/);
  assert.equal(document.getElementById("platform-collaboration-empty").hidden, true);
  assert.equal(document.getElementById("platform-handoffs-empty").hidden, true);
  assert.equal(document.getElementById("platform-runs-total").textContent, "1");
  assert.match(document.getElementById("platform-runs-list").innerHTML, /run-1/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /确认是否允许继续发布/);
  assert.equal(document.getElementById("platform-runs-empty").hidden, true);
  assert.equal(document.getElementById("platform-work-items-total").textContent, "1");
  assert.equal(document.getElementById("platform-work-items-queued").textContent, "1");
  assert.match(document.getElementById("platform-work-items-list").innerHTML, /等待单独排队的前端任务/);
  assert.match(document.getElementById("platform-work-item-detail").innerHTML, /parent-work-item-1/);
  assert.equal(document.getElementById("platform-work-items-empty").hidden, true);
  assert.equal(document.getElementById("platform-mailbox-total").textContent, "1");
  assert.match(document.getElementById("platform-mailbox-list").innerHTML, /请确认是否继续发布/);
  assert.match(document.getElementById("platform-mailbox-status").textContent, /Agent Delta/);
  assert.equal(document.getElementById("platform-mailbox-empty").hidden, true);
  assert.equal(document.getElementById("platform-agents-total").textContent, "1");
  assert.equal(document.getElementById("platform-projects-total").textContent, "1");
  assert.match(document.getElementById("platform-agents-list").innerHTML, /平台值班员/);
  assert.match(document.getElementById("platform-agent-detail").innerHTML, /\/srv\/platform-alpha/);
  assert.match(document.getElementById("platform-projects-list").innerHTML, /官网 site-foo/);
  assert.equal(document.getElementById("platform-agents-empty").hidden, true);
  assert.equal(document.getElementById("platform-projects-empty").hidden, true);
});

test("initializePlatformSurface 会在 work-item 和 run 详情渲染完整执行快照", async () => {
  const document = createDocumentStub();
  const completionSnapshot = {
    summary: "已完成 DNS 与公网返回态核查。",
    output: {
      reportFile: "/srv/worker-runs/run-42/report.json",
      resultFile: "/srv/worker-runs/run-42/result.json",
    },
    touchedFiles: [
      "/srv/worker-runs/run-42/prompt.txt",
      "/srv/worker-runs/run-42/result.json",
      "/srv/worker-runs/run-42/report.json",
    ],
    completedAt: "2026-04-21T14:40:00.000Z",
    structuredOutput: {
      deliverable: "结论：站点应保留，当前 DNS 与源站返回都正常。",
      artifactPaths: ["reports/site-foo.md"],
      resolvedArtifactPaths: ["/srv/site-foo/reports/site-foo.md"],
      followUp: ["继续观察 24 小时内的波动。"],
      workspacePath: "/srv/site-foo",
      workspaceEntryCount: 4,
      workspaceSampleEntries: ["README.md", "reports/", "package.json"],
      provider: "openai",
      model: "gpt-5.4-mini",
      runtimeContext: {
        contextFile: "/srv/worker-runtime/run-42/runtime-context.json",
      },
      git: {
        branch: "main",
        changedFileCount: 2,
      },
      artifactContents: {
        prompt: {
          label: "执行 prompt",
          filePath: "/srv/worker-runs/run-42/prompt.txt",
          mediaType: "text/plain",
          content: "请核实 DNS、Cloudflare 与公网返回态。",
          truncated: false,
          byteLength: 24,
        },
        output: {
          label: "Codex 最后输出",
          filePath: "/srv/worker-runs/run-42/last-message.txt",
          mediaType: "text/plain",
          content: "最终确认站点可以继续保留。",
          truncated: false,
          byteLength: 18,
        },
        result: {
          label: "结构化结果",
          filePath: "/srv/worker-runs/run-42/result.json",
          mediaType: "application/json",
          content: "{\n  \"summary\": \"已完成 DNS 与公网返回态核查。\"\n}",
          truncated: false,
          byteLength: 54,
        },
        report: {
          label: "执行报告",
          filePath: "/srv/worker-runs/run-42/report.json",
          mediaType: "application/json",
          content: "{\n  \"git\": {\n    \"branch\": \"main\"\n  }\n}",
          truncated: false,
          byteLength: 42,
        },
        stdout: {
          label: "标准输出",
          filePath: "/srv/worker-runs/run-42/stdout.log",
          mediaType: "text/plain",
          content: "worker stdout line 1\nworker stdout line 2",
          truncated: false,
          byteLength: 39,
        },
        stderr: {
          label: "标准错误",
          filePath: "/srv/worker-runs/run-42/stderr.log",
          mediaType: "text/plain",
          content: "worker stderr warning",
          truncated: false,
          byteLength: 21,
        },
      },
    },
  };

  initializePlatformSurface({
    document,
    fetch: async (url) => {
      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: true, tokenLabel: "platform-web" });
      }

      if (url === "/api/platform/nodes/list") {
        return createJsonResponse(200, { nodes: [] });
      }

      if (url === "/api/platform/oncall/summary") {
        return createJsonResponse(200, {});
      }

      if (url === "/api/platform/agents/governance-overview") {
        return createJsonResponse(200, { summary: {}, managerHotspots: [] });
      }

      if (url === "/api/platform/agents/waiting/list") {
        return createJsonResponse(200, { summary: {}, items: [] });
      }

      if (url === "/api/platform/agents/collaboration-dashboard") {
        return createJsonResponse(200, { summary: {}, parents: [] });
      }

      if (url === "/api/platform/runs/list") {
        return createJsonResponse(200, {
          runs: [{
            runId: "run-42",
            organizationId: "org-platform",
            workItemId: "work-item-42",
            nodeId: "node-alpha",
            status: "completed",
            updatedAt: "2026-04-21T14:40:00.000Z",
          }],
        });
      }

      if (url === "/api/platform/runs/detail") {
        return createJsonResponse(200, {
          run: {
            runId: "run-42",
            organizationId: "org-platform",
            workItemId: "work-item-42",
            nodeId: "node-alpha",
            status: "completed",
            updatedAt: "2026-04-21T14:40:00.000Z",
          },
          workItem: {
            workItemId: "work-item-42",
            goal: "核实 site-foo 当前是否应继续保留。",
          },
          targetAgent: {
            displayName: "站点治理负责人",
          },
          completionResult: completionSnapshot,
        });
      }

      if (url === "/api/platform/work-items/list") {
        return createJsonResponse(200, {
          workItems: [{
            workItemId: "work-item-42",
            organizationId: "org-platform",
            targetAgentId: "agent-ops",
            sourceType: "human",
            goal: "核实 site-foo 当前是否应继续保留。",
            status: "completed",
            priority: "high",
            updatedAt: "2026-04-21T14:40:00.000Z",
          }],
        });
      }

      if (url === "/api/platform/work-items/detail") {
        return createJsonResponse(200, {
          workItem: {
            workItemId: "work-item-42",
            organizationId: "org-platform",
            targetAgentId: "agent-ops",
            sourceType: "human",
            goal: "核实 site-foo 当前是否应继续保留。",
            status: "completed",
            priority: "high",
            updatedAt: "2026-04-21T14:40:00.000Z",
          },
          targetAgent: {
            agentId: "agent-ops",
            displayName: "站点治理负责人",
          },
          runs: [{
            runId: "run-42",
            status: "completed",
            updatedAt: "2026-04-21T14:40:00.000Z",
          }],
          latestCompletion: completionSnapshot,
        });
      }

      if (url === "/api/platform/agents/mailbox/list") {
        return createJsonResponse(200, {
          agent: {
            agentId: "agent-ops",
            displayName: "站点治理负责人",
          },
          items: [],
        });
      }

      if (url === "/api/platform/agents/list") {
        return createJsonResponse(200, {
          organizations: [],
          agents: [],
        });
      }

      if (url === "/api/platform/projects/workspace-binding/list") {
        return createJsonResponse(200, { bindings: [] });
      }

      if (url === "/api/platform/meeting-rooms/list") {
        return createJsonResponse(200, { rooms: [] });
      }

      return createJsonResponse(404, {
        error: {
          message: `unexpected request: ${url}`,
        },
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(document.getElementById("platform-work-item-detail").innerHTML, /最近一次完成详情/);
  assert.match(document.getElementById("platform-work-item-detail").innerHTML, /结论：站点应保留/);
  assert.match(document.getElementById("platform-work-item-detail").innerHTML, /执行 prompt/);
  assert.match(document.getElementById("platform-work-item-detail").innerHTML, /worker stdout line 1/);
  assert.match(document.getElementById("platform-work-item-detail").innerHTML, /继续观察 24 小时内的波动/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /执行详情/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /Codex 最后输出/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /最终确认站点可以继续保留/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /结构化结果/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /worker stderr warning/);
  assert.match(document.getElementById("platform-run-detail").innerHTML, /runtime-context\.json/);
});

test("summarizeReclaimResult 会归一化 reclaim summary", () => {
  assert.deepEqual(summarizeReclaimResult({
    summary: {
      activeLeaseCount: 1,
      reclaimedRunCount: 2,
      requeuedWorkItemCount: 3,
    },
  }), {
    activeLeaseCount: 1,
    reclaimedRunCount: 2,
    requeuedWorkItemCount: 3,
  });
});

test("buildNodeAttentionById 与 filterAndSortNodes 会按值班关注度筛选并排序节点", () => {
  const nodes = [
    {
      nodeId: "node-zeta",
      displayName: "Worker Zeta",
      status: "online",
      nodeIp: "192.168.31.210",
    },
    {
      nodeId: "node-beta",
      displayName: "Worker Beta",
      status: "draining",
      nodeIp: "192.168.31.208",
    },
    {
      nodeId: "node-alpha",
      displayName: "Worker Alpha",
      status: "offline",
      nodeIp: "192.168.31.207",
    },
  ];
  const attentionByNodeId = buildNodeAttentionById({
    recommendations: [
      {
        category: "worker_fleet",
        severity: "warning",
        title: "Worker Beta 需要值班处理",
        subjectId: "node-beta",
      },
      {
        category: "worker_fleet",
        severity: "error",
        title: "Worker Alpha 已离线且有风险",
        subjectId: "node-alpha",
      },
    ],
  });

  assert.deepEqual(filterAndSortNodes(nodes, {
    statusFilter: "attention",
    sortBy: "attention",
  }, attentionByNodeId).map((node) => node.nodeId), ["node-alpha", "node-beta"]);

  assert.deepEqual(filterAndSortNodes(nodes, {
    searchTerm: "192.168.31.210",
    statusFilter: "all",
    sortBy: "displayName",
  }, attentionByNodeId).map((node) => node.nodeId), ["node-zeta"]);

  assert.deepEqual(filterAndSortNodes(nodes, {
    statusFilter: "all",
    sortBy: "nodeId",
  }, attentionByNodeId).map((node) => node.nodeId), ["node-alpha", "node-beta", "node-zeta"]);
});

test("initializePlatformSurface 支持节点 attention 筛选排序，并在详情区展开 reclaim 结果", async () => {
  const document = createDocumentStub();
  let detailMode = "before";
  const surface = initializePlatformSurface({
    document,
    fetch: async (url, init = {}) => {
      if (url === "/api/web-auth/status") {
        return createJsonResponse(200, { authenticated: true, tokenLabel: "platform-web" });
      }

      if (url === "/api/platform/nodes/list") {
        return createJsonResponse(200, {
          nodes: [
            {
              nodeId: "node-zeta",
              displayName: "Worker Zeta",
              organizationId: "org-platform",
              status: "online",
              nodeIp: "192.168.31.210",
              slotAvailable: 1,
              slotCapacity: 2,
              heartbeatTtlSeconds: 90,
              lastHeartbeatAt: "2026-04-14T11:59:40.000Z",
              labels: [],
              workspaceCapabilities: [],
              credentialCapabilities: [],
              providerCapabilities: [],
            },
            {
              nodeId: "node-beta",
              displayName: "Worker Beta",
              organizationId: "org-platform",
              status: "draining",
              nodeIp: "192.168.31.208",
              slotAvailable: 0,
              slotCapacity: 2,
              heartbeatTtlSeconds: 90,
              lastHeartbeatAt: "2026-04-14T11:59:50.000Z",
              labels: ["beta"],
              workspaceCapabilities: ["/srv/platform-beta"],
              credentialCapabilities: ["cred-beta"],
              providerCapabilities: ["provider-beta"],
            },
          ],
        });
      }

      if (url === "/api/platform/nodes/detail") {
        const payload = init.body ? JSON.parse(init.body) : {};

        if (payload.nodeId === "node-beta") {
          return createJsonResponse(200, detailMode === "before"
            ? {
                node: {
                  nodeId: "node-beta",
                  displayName: "Worker Beta",
                  organizationId: "org-platform",
                  status: "draining",
                  nodeIp: "192.168.31.208",
                  slotAvailable: 0,
                  slotCapacity: 2,
                  heartbeatTtlSeconds: 90,
                  lastHeartbeatAt: "2026-04-14T11:59:50.000Z",
                  labels: ["beta"],
                  workspaceCapabilities: ["/srv/platform-beta"],
                  credentialCapabilities: ["cred-beta"],
                  providerCapabilities: ["provider-beta"],
                },
                leaseSummary: {
                  totalCount: 1,
                  activeCount: 1,
                  releasedCount: 0,
                  revokedCount: 0,
                  expiredCount: 0,
                },
                activeExecutionLeases: [{
                  lease: {
                    leaseId: "lease-beta-1",
                    runId: "run-beta-1",
                    nodeId: "node-beta",
                    workItemId: "work-item-beta-1",
                    status: "active",
                    updatedAt: "2026-04-14T11:59:50.000Z",
                  },
                  run: {
                    runId: "run-beta-1",
                    status: "running",
                  },
                  workItem: {
                    workItemId: "work-item-beta-1",
                    goal: "恢复节点 B 的运行任务",
                    status: "running",
                  },
                  targetAgent: {
                    agentId: "agent-beta",
                    displayName: "Agent Beta",
                  },
                }],
                recentExecutionLeases: [],
              }
            : {
                node: {
                  nodeId: "node-beta",
                  displayName: "Worker Beta",
                  organizationId: "org-platform",
                  status: "offline",
                  nodeIp: "192.168.31.208",
                  slotAvailable: 0,
                  slotCapacity: 2,
                  heartbeatTtlSeconds: 90,
                  lastHeartbeatAt: "2026-04-14T11:59:50.000Z",
                  labels: ["beta"],
                  workspaceCapabilities: ["/srv/platform-beta"],
                  credentialCapabilities: ["cred-beta"],
                  providerCapabilities: ["provider-beta"],
                },
                leaseSummary: {
                  totalCount: 1,
                  activeCount: 0,
                  releasedCount: 0,
                  revokedCount: 1,
                  expiredCount: 0,
                },
                activeExecutionLeases: [],
                recentExecutionLeases: [{
                  lease: {
                    leaseId: "lease-beta-1",
                    runId: "run-beta-1",
                    nodeId: "node-beta",
                    workItemId: "work-item-beta-1",
                    status: "revoked",
                    updatedAt: "2026-04-14T12:02:00.000Z",
                  },
                  run: {
                    runId: "run-beta-1",
                    status: "interrupted",
                  },
                  workItem: {
                    workItemId: "work-item-beta-1",
                    goal: "恢复节点 B 的运行任务",
                    status: "queued",
                  },
                  targetAgent: {
                    agentId: "agent-beta",
                    displayName: "Agent Beta",
                  },
                }],
              });
        }

        return createJsonResponse(404, { error: { message: "missing node detail" } });
      }

      if (url === "/api/platform/nodes/reclaim") {
        detailMode = "after";
        return createJsonResponse(200, {
          node: {
            nodeId: "node-beta",
            displayName: "Worker Beta",
            organizationId: "org-platform",
            status: "offline",
            nodeIp: "192.168.31.208",
            slotAvailable: 0,
            slotCapacity: 2,
          },
          summary: {
            activeLeaseCount: 1,
            reclaimedRunCount: 1,
            requeuedWorkItemCount: 1,
          },
          reclaimedLeases: [{
            lease: {
              leaseId: "lease-beta-1",
              runId: "run-beta-1",
              nodeId: "node-beta",
              workItemId: "work-item-beta-1",
              status: "revoked",
              updatedAt: "2026-04-14T12:02:00.000Z",
            },
            run: {
              runId: "run-beta-1",
              status: "interrupted",
            },
            workItem: {
              workItemId: "work-item-beta-1",
              goal: "恢复节点 B 的运行任务",
              status: "queued",
            },
            targetAgent: {
              agentId: "agent-beta",
              displayName: "Agent Beta",
            },
            recoveryAction: "requeued",
          }],
        });
      }

      if (url === "/api/platform/oncall/summary") {
        return createJsonResponse(200, {
          counts: {
            nodeTotal: 2,
            nodeErrorCount: 0,
            nodeWarningCount: 1,
            waitingAttentionCount: 0,
            waitingHumanCount: 0,
            runWaitingActionCount: 0,
            runFailedCount: 0,
            pausedAgentCount: 0,
          },
          primaryDiagnosis: {
            id: "oncall-node-beta-warning",
            severity: "warning",
            title: "Worker Beta 需要值班处理",
            summary: "节点正在 draining，仍有任务在跑。",
          },
          recommendedNextSteps: [],
          recommendations: [{
            recommendationId: "node:node-beta:draining_active_lease",
            category: "worker_fleet",
            severity: "warning",
            title: "Worker Beta 需要值班处理",
            summary: "节点正在 draining，仍有任务在跑。",
            recommendedAction: "继续观察 active lease 是否自然清空。",
            subjectId: "node-beta",
          }],
        });
      }

      return createJsonResponse(200, {
        runs: [],
        workItems: [],
        items: [],
        summary: {},
        managerHotspots: [],
        parents: [],
        organizations: [],
        agents: [],
        bindings: [],
      });
    },
    storage: {
      getItem() {
        return "principal-owner";
      },
      setItem() {},
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(
    document.getElementById("platform-nodes-list").innerHTML.indexOf("Worker Beta")
      < document.getElementById("platform-nodes-list").innerHTML.indexOf("Worker Zeta"),
  );

  await surface.setNodeListControls({
    statusFilter: "attention",
    sortBy: "attention",
    searchTerm: "",
  });

  assert.match(document.getElementById("platform-nodes-status").textContent, /1 \/ 2/);
  assert.match(document.getElementById("platform-nodes-list").innerHTML, /Worker Beta/);
  assert.doesNotMatch(document.getElementById("platform-nodes-list").innerHTML, /Worker Zeta/);

  await surface.updateNodeStatus("node-beta", "reclaim");

  assert.match(document.getElementById("platform-action-status").textContent, /reclaim 完成/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /最近治理结果/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /恢复节点 B 的运行任务/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /run-beta-1/);
  assert.match(document.getElementById("platform-node-detail").innerHTML, /已重新排队/);
});

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function toDatasetKey(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function createDocumentStub() {
  const elements = new Map();

  const createElement = () => ({
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    innerHTML: "",
    dataset: {},
    attributes: new Map(),
    addEventListener() {},
    setAttribute(name, value) {
      const normalized = String(value);
      this.attributes.set(name, normalized);

      if (name.startsWith("data-")) {
        this.dataset[toDatasetKey(name.slice(5))] = normalized;
      }
    },
    getAttribute(name) {
      if (this.attributes.has(name)) {
        return this.attributes.get(name);
      }

      if (name.startsWith("data-")) {
        return this.dataset[toDatasetKey(name.slice(5))] ?? null;
      }

      return null;
    },
  });

  const ids = [
    "platform-sidebar",
    "platform-nav-toggle",
    "platform-nav-nodes-oncall",
    "platform-nav-governance",
    "platform-nav-work-items",
    "platform-nav-mailbox",
    "platform-nav-agents-projects",
    "platform-nav-collaboration-runs",
    "platform-nav-meeting-rooms",
    "platform-nav-overview",
    "platform-view-nodes-oncall",
    "platform-view-governance",
    "platform-view-work-items",
    "platform-view-mailbox",
    "platform-view-agents-projects",
    "platform-view-collaboration-runs",
    "platform-view-meeting-rooms",
    "platform-view-overview",
    "platform-session-title",
    "platform-session-note",
    "platform-owner-form",
    "platform-owner-input",
    "platform-owner-submit",
    "platform-owner-note",
    "platform-refresh-button",
    "platform-nodes-status",
    "platform-action-status",
    "platform-node-search-input",
    "platform-node-status-filter",
    "platform-node-sort-select",
    "platform-nodes-empty",
    "platform-nodes-list",
    "platform-node-detail-status",
    "platform-node-detail",
    "platform-summary-total",
    "platform-summary-online",
    "platform-summary-draining",
    "platform-summary-offline",
    "platform-oncall-status",
    "platform-oncall-errors",
    "platform-oncall-warnings",
    "platform-oncall-waiting",
    "platform-oncall-runs",
    "platform-oncall-diagnosis",
    "platform-oncall-next-steps",
    "platform-oncall-empty",
    "platform-oncall-list",
    "platform-governance-status",
    "platform-governance-total",
    "platform-governance-waiting-human",
    "platform-governance-waiting-agent",
    "platform-governance-attention",
    "platform-hotspots-summary",
    "platform-hotspots-list",
    "platform-waiting-empty",
    "platform-waiting-list",
    "platform-collaboration-status",
    "platform-collaboration-total",
    "platform-collaboration-handoffs-total",
    "platform-collaboration-empty",
    "platform-collaboration-list",
    "platform-handoffs-status",
    "platform-handoffs-empty",
    "platform-handoffs-list",
    "platform-runs-status",
    "platform-runs-total",
    "platform-runs-empty",
    "platform-runs-list",
    "platform-run-detail",
    "platform-meeting-rooms-status",
    "platform-meeting-rooms-action-status",
    "platform-meeting-rooms-total",
    "platform-meeting-rooms-open",
    "platform-meeting-rooms-terminated",
    "platform-meeting-rooms-closed",
    "platform-meeting-rooms-empty",
    "platform-meeting-rooms-list",
    "platform-meeting-room-detail",
    "platform-meeting-room-terminate-form",
    "platform-meeting-room-terminate-reason-input",
    "platform-meeting-room-terminate-submit",
    "platform-work-items-status",
    "platform-work-items-total",
    "platform-work-items-waiting-human",
    "platform-work-items-waiting-agent",
    "platform-work-items-queued",
    "platform-work-items-empty",
    "platform-work-items-list",
    "platform-work-item-detail",
    "platform-work-item-action-status",
    "platform-dispatch-form",
    "platform-dispatch-agent-input",
    "platform-dispatch-goal-input",
    "platform-dispatch-source-select",
    "platform-dispatch-priority-select",
    "platform-dispatch-submit",
    "platform-mailbox-form",
    "platform-mailbox-agent-input",
    "platform-mailbox-submit",
    "platform-mailbox-status",
    "platform-mailbox-total",
    "platform-mailbox-pending",
    "platform-mailbox-acked",
    "platform-mailbox-empty",
    "platform-mailbox-list",
    "platform-mailbox-action-status",
    "platform-agents-status",
    "platform-agents-total",
    "platform-projects-total",
    "platform-agents-empty",
    "platform-projects-empty",
    "platform-agents-list",
    "platform-agent-detail",
    "platform-projects-list",
    "platform-agents-action-status",
    "platform-agent-create-form",
    "platform-agent-create-role-input",
    "platform-agent-create-name-input",
    "platform-agent-create-mission-input",
    "platform-agent-create-submit",
    "platform-project-binding-form",
    "platform-project-binding-project-input",
    "platform-project-binding-organization-input",
    "platform-project-binding-display-input",
    "platform-project-binding-workspace-input",
    "platform-project-binding-node-input",
    "platform-project-binding-mode-select",
    "platform-project-binding-submit",
  ];

  for (const id of ids) {
    elements.set(id, createElement());
  }

  return {
    getElementById(id) {
      return elements.get(id) ?? null;
    },
  };
}
