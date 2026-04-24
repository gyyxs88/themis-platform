import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";

test("createPlatformApp 会暴露 agents 与 projects 最小控制面路由", async () => {
  const controlPlaneService = createInMemoryPlatformControlPlaneService({
    now: () => "2026-04-14T14:10:00.000Z",
    generateOrganizationId: () => "org-platform",
    generatePrincipalId: () => "principal-agent-alpha",
    generateAgentId: () => "agent-alpha",
  });
  const server = createPlatformApp({
    controlPlaneService,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const createResponse = await fetch(`${baseUrl}/api/platform/agents/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agent: {
          departmentRole: "Platform",
          displayName: "平台值班员",
          mission: "负责平台控制面最小治理。",
        },
      }),
    });
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as {
      agent?: { agentId?: string };
    };
    assert.equal(created.agent?.agentId, "agent-alpha");

    const dispatchResponse = await fetch(`${baseUrl}/api/platform/work-items/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItem: {
          targetAgentId: "agent-alpha",
          sourceType: "human",
          goal: "验证新建 agent 会同步到 workflow。",
          priority: "normal",
        },
      }),
    });
    assert.equal(dispatchResponse.status, 200);
    const dispatched = await dispatchResponse.json() as {
      targetAgent?: { agentId?: string };
      workItem?: { targetAgentId?: string };
    };
    assert.equal(dispatched.targetAgent?.agentId, "agent-alpha");
    assert.equal(dispatched.workItem?.targetAgentId, "agent-alpha");

    const listResponse = await fetch(`${baseUrl}/api/platform/agents/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json() as {
      agents?: Array<{ agentId?: string }>;
    };
    assert.equal(listed.agents?.[0]?.agentId, "agent-alpha");

    const detailResponse = await fetch(`${baseUrl}/api/platform/agents/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-alpha",
      }),
    });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as {
      agent?: {
        agentId?: string;
        agentCard?: {
          title?: string;
          responsibilitySummary?: string;
        };
      };
    };
    assert.equal(detail.agent?.agentId, "agent-alpha");
    assert.equal(detail.agent?.agentCard?.title, "Platform");
    assert.equal(detail.agent?.agentCard?.responsibilitySummary, "负责平台控制面最小治理。");

    const cardResponse = await fetch(`${baseUrl}/api/platform/agents/card/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-alpha",
        card: {
          domainTags: ["平台", "值班"],
          currentFocus: "收口平台值班链路。",
        },
      }),
    });
    assert.equal(cardResponse.status, 200);
    const card = await cardResponse.json() as {
      agent?: {
        agentCard?: {
          currentFocus?: string;
        };
      };
    };
    assert.equal(card.agent?.agentCard?.currentFocus, "收口平台值班链路。");

    const boundaryResponse = await fetch(`${baseUrl}/api/platform/agents/execution-boundary/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-alpha",
        boundary: {
          workspacePolicy: {
            canonicalWorkspacePath: "/srv/platform-alpha",
          },
          runtimeProfile: {
            provider: "openai",
            model: "gpt-5.4-mini",
            reasoning: "high",
          },
        },
      }),
    });
    assert.equal(boundaryResponse.status, 200);
    const boundary = await boundaryResponse.json() as {
      runtimeProfile?: {
        model?: string;
        reasoning?: string;
      };
    };
    assert.equal(boundary.runtimeProfile?.model, "gpt-5.4-mini");
    assert.equal(boundary.runtimeProfile?.reasoning, "high");

    const aliasBoundaryResponse = await fetch(`${baseUrl}/api/platform/agents/execution-boundary/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-alpha",
        boundary: {
          workspacePolicy: {
            workspacePath: "/srv/platform-beta",
            additionalDirectories: ["/srv/platform-shared"],
          },
        },
      }),
    });
    assert.equal(aliasBoundaryResponse.status, 200);
    const aliasBoundary = await aliasBoundaryResponse.json() as {
      workspacePolicy?: {
        canonicalWorkspacePath?: string;
        additionalWorkspacePaths?: string[];
      };
    };
    assert.equal(aliasBoundary.workspacePolicy?.canonicalWorkspacePath, "/srv/platform-beta");
    assert.deepEqual(aliasBoundary.workspacePolicy?.additionalWorkspacePaths, ["/srv/platform-shared"]);

    const spawnPolicyResponse = await fetch(`${baseUrl}/api/platform/agents/spawn-policy/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        policy: {
          enabled: true,
          maxAgentsPerRole: 2,
        },
      }),
    });
    assert.equal(spawnPolicyResponse.status, 200);

    const pauseResponse = await fetch(`${baseUrl}/api/platform/agents/pause`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        agentId: "agent-alpha",
      }),
    });
    assert.equal(pauseResponse.status, 200);
    const paused = await pauseResponse.json() as {
      agent?: { status?: string };
    };
    assert.equal(paused.agent?.status, "paused");

    const bindingResponse = await fetch(`${baseUrl}/api/platform/projects/workspace-binding/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        binding: {
          projectId: "project-site-foo",
          organizationId: "org-platform",
          displayName: "官网 site-foo",
          canonicalWorkspacePath: "/srv/platform-alpha",
          preferredNodeId: "node-alpha",
          continuityMode: "sticky",
        },
      }),
    });
    assert.equal(bindingResponse.status, 200);

    const bindingListResponse = await fetch(`${baseUrl}/api/platform/projects/workspace-binding/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(bindingListResponse.status, 200);
    const bindings = await bindingListResponse.json() as {
      bindings?: Array<{ projectId?: string }>;
    };
    assert.equal(bindings.bindings?.[0]?.projectId, "project-site-foo");
  } finally {
    server.close();
    await once(server, "close");
  }
});
