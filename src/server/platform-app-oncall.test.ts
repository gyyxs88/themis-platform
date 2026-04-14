import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";

test("createPlatformApp 会暴露 oncall summary 路由", async () => {
  const server = createPlatformApp({
    oncallService: {
      getOncallSummary() {
        return {
          generatedAt: "2026-04-14T11:30:00.000Z",
          ownerPrincipalId: "principal-owner",
          organizationId: "org-platform",
          counts: {
            nodeTotal: 2,
            nodeErrorCount: 1,
            nodeWarningCount: 1,
            waitingAttentionCount: 2,
            waitingHumanCount: 1,
            runWaitingActionCount: 1,
            runFailedCount: 1,
            pausedAgentCount: 0,
          },
          primaryDiagnosis: {
            id: "oncall_error_attention",
            severity: "error",
            title: "当前存在需要立即处理的值班故障",
            summary: "节点 error 1 台，失败 run 1 条。",
          },
          recommendedNextSteps: ["优先处理节点 error attention。"],
          recommendations: [{
            recommendationId: "node:node-alpha:offline_active_lease",
            category: "worker_fleet",
            severity: "error",
            title: "Worker Alpha 需要值班处理",
            summary: "节点已 offline，但仍有 active lease 残留。",
            recommendedAction: "先确认节点状态。",
            subjectId: "node-alpha",
          }],
        };
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/platform/oncall/summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-owner",
      }),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as {
      primaryDiagnosis?: { title?: string };
      recommendations?: Array<{ recommendationId?: string }>;
    };
    assert.equal(result.primaryDiagnosis?.title, "当前存在需要立即处理的值班故障");
    assert.equal(result.recommendations?.[0]?.recommendationId, "node:node-alpha:offline_active_lease");
  } finally {
    server.close();
    await once(server, "close");
  }
});
