import assert from "node:assert/strict";
import test from "node:test";
import { initializePlatformSurface, resolveInitialOwnerPrincipalId, summarizeNodes } from "./platform.js";

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
    "platform-nodes-empty",
    "platform-nodes-list",
    "platform-summary-total",
    "platform-summary-online",
    "platform-summary-draining",
    "platform-summary-offline",
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
