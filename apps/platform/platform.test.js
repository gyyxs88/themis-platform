import assert from "node:assert/strict";
import test from "node:test";
import {
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
            { nodeId: "node-a", status: "online" },
            { nodeId: "node-b", status: "draining" },
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

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function createDocumentStub() {
  const elements = new Map();

  const createElement = () => ({
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    innerHTML: "",
    addEventListener() {},
  });

  const ids = [
    "platform-session-title",
    "platform-session-note",
    "platform-owner-form",
    "platform-owner-input",
    "platform-owner-submit",
    "platform-owner-note",
    "platform-refresh-button",
    "platform-nodes-status",
    "platform-action-status",
    "platform-nodes-empty",
    "platform-nodes-list",
    "platform-summary-total",
    "platform-summary-online",
    "platform-summary-draining",
    "platform-summary-offline",
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
