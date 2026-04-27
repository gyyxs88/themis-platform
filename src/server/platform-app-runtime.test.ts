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
  let mutationCount = 0;
  const server = createPlatformApp({
    nodeService,
    workerRunService,
    workflowService,
    controlPlaneService,
    onStateMutation: () => {
      mutationCount += 1;
    },
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
    assert.equal(mutationCount, 2);
  } finally {
    server.close();
  }
});

test("createPlatformApp 分配 queued work-item 时优先使用工单 snapshot，其次使用员工默认工作区", async () => {
  const controlPlaneService = createInMemoryPlatformControlPlaneService({
    now: () => "2026-04-24T14:20:00.000Z",
    generateOrganizationId: () => "org-platform",
    generatePrincipalId: () => "principal-agent-runtime",
    generateAgentId: () => "agent-runtime",
  });
  const created = controlPlaneService.createAgent({
    ownerPrincipalId: "principal-platform-owner",
    agent: {
      departmentRole: "Platform",
      displayName: "Runtime Agent",
      mission: "负责平台运行时。",
    },
  });
  controlPlaneService.updateExecutionBoundary({
    ownerPrincipalId: "principal-platform-owner",
    agentId: created.agent.agentId,
    boundary: {
      workspacePolicy: {
        canonicalWorkspacePath: "/srv/agent-default",
      },
      runtimeProfile: {
        provider: "openai",
        model: "gpt-5.5",
        reasoning: "xhigh",
        sandboxMode: "read-only",
        networkAccessEnabled: false,
        approvalPolicy: "never",
        authAccountId: "default-auth",
        thirdPartyProviderId: "openai-compatible",
      },
    },
  });
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-24T14:20:00.000Z",
    organizations: [created.organization],
    nodes: [{
      nodeId: "node-runtime",
      organizationId: created.organization.organizationId,
      displayName: "Worker Runtime",
      status: "online",
      slotCapacity: 2,
      slotAvailable: 2,
      secretCapabilities: ["cloudflare-readonly-token"],
      createdAt: "2026-04-24T14:20:00.000Z",
      updatedAt: "2026-04-24T14:20:00.000Z",
    }],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-24T14:21:00.000Z",
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    now: () => "2026-04-24T14:21:00.000Z",
    agentSeeds: [{
      ownerPrincipalId: "principal-platform-owner",
      organization: created.organization,
      agent: created.agent,
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

    const dispatchDefault = await fetch(`${baseUrl}/api/platform/work-items/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItem: {
          targetAgentId: created.agent.agentId,
          sourceType: "human",
          goal: "使用员工默认工作区。",
        },
      }),
    });
    assert.equal(dispatchDefault.status, 200);

    const pullDefault = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-runtime",
      }),
    });
    assert.equal(pullDefault.status, 200);
    const defaultPayload = await pullDefault.json() as {
      run?: { runId?: string };
      executionLease?: { leaseToken?: string };
      executionContract?: {
        workspacePath?: string;
        credentialId?: string;
        provider?: string;
        model?: string;
        reasoning?: string;
        sandboxMode?: string;
        networkAccessEnabled?: boolean;
        approvalPolicy?: string;
      };
    };
    assert.equal(defaultPayload.executionContract?.workspacePath, "/srv/agent-default");
    assert.equal(defaultPayload.executionContract?.credentialId, "default-auth");
    assert.equal(defaultPayload.executionContract?.provider, "openai-compatible");
    assert.equal(defaultPayload.executionContract?.model, "gpt-5.5");
    assert.equal(defaultPayload.executionContract?.reasoning, "xhigh");
    assert.equal(defaultPayload.executionContract?.sandboxMode, "read-only");
    assert.equal(defaultPayload.executionContract?.networkAccessEnabled, false);
    assert.equal(defaultPayload.executionContract?.approvalPolicy, "never");
    assert.ok(defaultPayload.run?.runId);
    assert.ok(defaultPayload.executionLease?.leaseToken);

    const updateDefault = await fetch(`${baseUrl}/api/platform/worker/runs/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-runtime",
        runId: defaultPayload.run?.runId,
        leaseToken: defaultPayload.executionLease?.leaseToken,
        status: "running",
      }),
    });
    assert.equal(updateDefault.status, 200);

    const dispatchSnapshot = await fetch(`${baseUrl}/api/platform/work-items/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItem: {
          targetAgentId: created.agent.agentId,
          sourceType: "human",
          goal: "使用工单快照工作区。",
          workspacePolicySnapshot: {
            workspacePath: "/srv/snapshot-workspace",
          },
          runtimeProfileSnapshot: {
            provider: "openai",
            model: "gpt-5.4-mini",
            sandboxMode: "workspace-write",
            approvalPolicy: "on-request",
            authAccountId: "snapshot-auth",
            thirdPartyProviderId: "snapshot-provider",
            secretEnvRefs: [{
              envName: "CLOUDFLARE_API_TOKEN",
              secretRef: "cloudflare-readonly-token",
              required: true,
            }],
          },
        },
      }),
    });
    assert.equal(dispatchSnapshot.status, 200);

    const pullSnapshot = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-runtime",
      }),
    });
    assert.equal(pullSnapshot.status, 200);
    const snapshotPayload = await pullSnapshot.json() as {
      executionContract?: {
        workspacePath?: string;
        credentialId?: string;
        provider?: string;
        model?: string;
        sandboxMode?: string;
        approvalPolicy?: string;
        secretEnvRefs?: Array<{
          envName?: string;
          secretRef?: string;
          required?: boolean;
          value?: string;
        }>;
      };
    };
    assert.equal(snapshotPayload.executionContract?.workspacePath, "/srv/snapshot-workspace");
    assert.equal(snapshotPayload.executionContract?.credentialId, "snapshot-auth");
    assert.equal(snapshotPayload.executionContract?.provider, "snapshot-provider");
    assert.equal(snapshotPayload.executionContract?.model, "gpt-5.4-mini");
    assert.equal(snapshotPayload.executionContract?.sandboxMode, "workspace-write");
    assert.equal(snapshotPayload.executionContract?.approvalPolicy, "on-request");
    assert.deepEqual(snapshotPayload.executionContract?.secretEnvRefs, [{
      envName: "CLOUDFLARE_API_TOKEN",
      secretRef: "cloudflare-readonly-token",
      required: true,
    }]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(snapshotPayload.executionContract?.secretEnvRefs?.[0] ?? {}, "value"),
      false,
    );
  } finally {
    server.close();
  }
});

test("createPlatformApp 会按 worker secret capability 过滤派工并支持平台 secret delivery", async () => {
  const organization = {
    organizationId: "org-platform",
    ownerPrincipalId: "principal-platform-owner",
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-04-27T12:00:00.000Z",
    updatedAt: "2026-04-27T12:00:00.000Z",
  };
  const targetAgent = {
    agentId: "agent-secret",
    organizationId: organization.organizationId,
    displayName: "Secret Agent",
    departmentRole: "Platform",
    status: "active" as const,
    createdAt: "2026-04-27T12:00:00.000Z",
    updatedAt: "2026-04-27T12:00:00.000Z",
  };
  const nodeService = createInMemoryPlatformNodeService({
    now: () => "2026-04-27T12:00:00.000Z",
    organizations: [organization],
    nodes: [{
      nodeId: "node-secret",
      organizationId: organization.organizationId,
      displayName: "Worker Secret",
      status: "online",
      slotCapacity: 1,
      slotAvailable: 1,
      createdAt: "2026-04-27T12:00:00.000Z",
      updatedAt: "2026-04-27T12:00:00.000Z",
    }],
  });
  const workerRunService = createInMemoryPlatformWorkerRunService({
    nodeService,
    now: () => "2026-04-27T12:01:00.000Z",
  });
  const workflowService = createInMemoryPlatformWorkflowService({
    workerRunService,
    now: () => "2026-04-27T12:01:00.000Z",
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
          targetAgentId: "agent-secret",
          sourceType: "human",
          goal: "验证 Cloudflare DNS。",
          runtimeProfileSnapshot: {
            secretEnvRefs: [{
              envName: "CLOUDFLARE_API_TOKEN",
              secretRef: "cloudflare-readonly-token",
              required: true,
            }],
          },
        },
      }),
    });
    assert.equal(dispatch.status, 200);

    const pullBeforeSecret = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-secret",
      }),
    });
    assert.equal(pullBeforeSecret.status, 200);
    assert.deepEqual(await pullBeforeSecret.json(), {});

    const pushSecret = await fetch(`${baseUrl}/api/platform/worker/secrets/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        delivery: {
          nodeId: "node-secret",
          secretRef: "cloudflare-readonly-token",
          value: "worker-secret-value",
        },
      }),
    });
    assert.equal(pushSecret.status, 200);
    const pushPayload = await pushSecret.json() as {
      delivery?: { deliveryId?: string; value?: string; status?: string };
    };
    assert.equal(pushPayload.delivery?.status, "pending");
    assert.equal(Object.prototype.hasOwnProperty.call(pushPayload.delivery ?? {}, "value"), false);

    const pullSecret = await fetch(`${baseUrl}/api/platform/worker/secrets/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-secret",
      }),
    });
    assert.equal(pullSecret.status, 200);
    const pullSecretPayload = await pullSecret.json() as {
      deliveries?: Array<{ deliveryId?: string; secretRef?: string; value?: string }>;
    };
    assert.equal(pullSecretPayload.deliveries?.[0]?.secretRef, "cloudflare-readonly-token");
    assert.equal(pullSecretPayload.deliveries?.[0]?.value, "worker-secret-value");

    const ackSecret = await fetch(`${baseUrl}/api/platform/worker/secrets/ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-secret",
        deliveryIds: [pullSecretPayload.deliveries?.[0]?.deliveryId],
        secretRefs: ["cloudflare-readonly-token"],
      }),
    });
    assert.equal(ackSecret.status, 200);
    const ackPayload = await ackSecret.json() as {
      deliveries?: Array<{ value?: string; status?: string }>;
      secretRefs?: string[];
    };
    assert.equal(ackPayload.deliveries?.[0]?.status, "delivered");
    assert.equal(Object.prototype.hasOwnProperty.call(ackPayload.deliveries?.[0] ?? {}, "value"), false);
    assert.deepEqual(ackPayload.secretRefs, ["cloudflare-readonly-token"]);

    const heartbeat = await fetch(`${baseUrl}/api/platform/nodes/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        node: {
          nodeId: "node-secret",
          slotAvailable: 1,
          secretCapabilities: ["cloudflare-readonly-token"],
        },
      }),
    });
    assert.equal(heartbeat.status, 200);

    const pullAfterSecret = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-secret",
      }),
    });
    assert.equal(pullAfterSecret.status, 200);
    const runPayload = await pullAfterSecret.json() as {
      run?: { nodeId?: string };
      executionContract?: { secretEnvRefs?: Array<{ secretRef?: string; value?: string }> };
    };
    assert.equal(runPayload.run?.nodeId, "node-secret");
    assert.equal(runPayload.executionContract?.secretEnvRefs?.[0]?.secretRef, "cloudflare-readonly-token");
    assert.equal(
      Object.prototype.hasOwnProperty.call(runPayload.executionContract?.secretEnvRefs?.[0] ?? {}, "value"),
      false,
    );
  } finally {
    server.close();
  }
});
