import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

test("createPlatformApp 会把 queued work-item 在 worker pull 时分配成新 run", async () => {
  const organization = {
    organizationId: "org-platform",
    ownerPrincipalId: "principal-platform-owner",
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-04-14T12:00:00.000Z",
    updatedAt: "2026-04-14T12:00:00.000Z",
  };
  const targetAgent = {
    agentId: "agent-runtime",
    organizationId: organization.organizationId,
    displayName: "Runtime Agent",
    departmentRole: "Platform",
    status: "active" as const,
    createdAt: "2026-04-14T12:00:00.000Z",
    updatedAt: "2026-04-14T12:00:00.000Z",
  };
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T12:00:00.000Z",
    organizations: [organization],
    nodes: [{
      nodeId: "node-runtime",
      organizationId: organization.organizationId,
      displayName: "Worker Runtime",
      status: "online",
      slotCapacity: 2,
      slotAvailable: 2,
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    }],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-14T12:05:00.000Z",
  });
  const controlPlaneService = createInMemoryPlatformControlPlaneService({
    now: () => "2026-04-14T12:00:00.000Z",
  });
  controlPlaneService.upsertProjectWorkspaceBinding({
    ownerPrincipalId: "principal-platform-owner",
    binding: {
      projectId: "project-runtime",
      organizationId: organization.organizationId,
      displayName: "Runtime Project",
      canonicalWorkspacePath: "/srv/runtime-project",
      continuityMode: "sticky",
    },
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    now: () => "2026-04-14T12:05:00.000Z",
    agentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organization,
      agent: targetAgent,
    }],
  });
  const server = createPlatformApp({
    nodeService,
    workerRunService,
    workflowService,
    controlPlaneService,
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const dispatch = await fetch(`${baseUrl}/api/platform/work-items/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItem: {
          targetAgentId: "agent-runtime",
          sourceType: "human",
          goal: "让独立平台仓自己派一条 run",
          priority: "high",
          projectId: "project-runtime",
        },
      }),
    });
    assert.equal(dispatch.status, 200);
    const dispatchPayload = await dispatch.json() as {
      workItem?: { workItemId?: string; status?: string };
    };
    assert.equal(dispatchPayload.workItem?.status, "queued");

    const pull = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-runtime",
      }),
    });
    assert.equal(pull.status, 200);
    const pullPayload = await pull.json() as {
      workItem?: { workItemId?: string; status?: string };
      run?: { status?: string; nodeId?: string };
      executionLease?: { status?: string };
      executionContract?: { workspacePath?: string };
    };
    assert.equal(pullPayload.workItem?.workItemId, dispatchPayload.workItem?.workItemId);
    assert.equal(pullPayload.workItem?.status, "queued");
    assert.equal(pullPayload.run?.status, "created");
    assert.equal(pullPayload.run?.nodeId, "node-runtime");
    assert.equal(pullPayload.executionLease?.status, "active");
    assert.equal(pullPayload.executionContract?.workspacePath, "/srv/runtime-project");
  } finally {
    server.close();
  }
});
