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

test("initializePlatformSurface 会读取治理摘要与 waiting queue", async () => {
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
