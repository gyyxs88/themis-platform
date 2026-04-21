import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlatformApp } from "./platform-app.js";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";
import {
  createLocalPlatformExecutionRuntimeStore,
  loadPlatformExecutionRuntimeEvents,
  loadPlatformExecutionRuntimeState,
} from "./platform-execution-runtime-store.js";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";
import { createInMemoryPlatformWorkerRunService } from "./platform-worker-run-service.js";
import { createInMemoryPlatformWorkflowService } from "./platform-workflow-service.js";

test("PlatformExecutionRuntimeStore 会持久化 assigned/status/completed 轨迹", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-runtime-store-"));
  const runtimeRoot = join(workingDirectory, "infra/platform/runtime-runs");
  const timestamps = [
    "2026-04-14T13:00:00.000Z",
    "2026-04-14T13:01:00.000Z",
    "2026-04-14T13:02:00.000Z",
  ];
  const store = createLocalPlatformExecutionRuntimeStore({
    rootDirectory: runtimeRoot,
    now: () => timestamps.shift() ?? "2026-04-14T13:03:00.000Z",
  });
  const assignedRun = {
    organization: {
      organizationId: "org-platform",
      ownerPrincipalId: "principal-runtime",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    },
    node: {
      nodeId: "node-runtime",
      organizationId: "org-platform",
      displayName: "Worker Runtime",
      status: "online" as const,
      slotCapacity: 2,
      slotAvailable: 1,
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    },
    targetAgent: {
      agentId: "agent-runtime",
      organizationId: "org-platform",
      displayName: "Runtime Agent",
      departmentRole: "Platform",
      status: "active" as const,
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    },
    workItem: {
      workItemId: "work-item-runtime",
      organizationId: "org-platform",
      targetAgentId: "agent-runtime",
      sourceType: "human" as const,
      goal: "Persist runtime state",
      status: "queued" as const,
      priority: "high" as const,
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    },
    run: {
      runId: "run-runtime",
      organizationId: "org-platform",
      workItemId: "work-item-runtime",
      nodeId: "node-runtime",
      status: "created" as const,
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    },
    executionLease: {
      leaseId: "lease-runtime",
      runId: "run-runtime",
      nodeId: "node-runtime",
      workItemId: "work-item-runtime",
      leaseToken: "lease-token-runtime",
      status: "active" as const,
      createdAt: "2026-04-14T12:00:00.000Z",
      updatedAt: "2026-04-14T12:00:00.000Z",
    },
    executionContract: {
      workspacePath: "/srv/runtime-project",
      credentialId: "credential-runtime",
    },
  };

  try {
    store.recordAssignedRun({
      assignedRun,
      source: "scheduled",
    });
    store.recordRunStatus({
      assignedRun: {
        ...assignedRun,
        workItem: {
          ...assignedRun.workItem,
          status: "waiting_human",
          updatedAt: "2026-04-14T13:01:00.000Z",
        },
        run: {
          ...assignedRun.run,
          status: "waiting_action",
          updatedAt: "2026-04-14T13:01:00.000Z",
        },
      },
      payload: {
        ownerPrincipalId: "principal-runtime",
        nodeId: "node-runtime",
        runId: "run-runtime",
        leaseToken: "lease-token-runtime",
        status: "waiting_human",
        waitingAction: {
          actionType: "human_confirmation",
          prompt: "请确认是否继续执行",
        },
      },
    });
    store.recordRunCompletion({
      assignedRun: {
        ...assignedRun,
        workItem: {
          ...assignedRun.workItem,
          status: "completed",
          updatedAt: "2026-04-14T13:02:00.000Z",
        },
        run: {
          ...assignedRun.run,
          status: "completed",
          updatedAt: "2026-04-14T13:02:00.000Z",
        },
        executionLease: {
          ...assignedRun.executionLease,
          status: "released",
          updatedAt: "2026-04-14T13:02:00.000Z",
        },
      },
      completionResult: {
        summary: "独立平台仓已写入 completion artifact",
        output: {
          reportFile: "/srv/runtime-project/report.json",
        },
        completedAt: "2026-04-14T13:02:00.000Z",
      },
    });

    const state = loadPlatformExecutionRuntimeState(runtimeRoot, "principal-runtime", "run-runtime");
    assert(state);
    assert.equal(state.lastEventKind, "completed");
    assert.equal(state.runStatus, "completed");
    assert.equal(state.workItemStatus, "completed");
    assert.equal(state.leaseStatus, "released");
    assert.equal(state.executionContract.workspacePath, "/srv/runtime-project");
    assert.equal(state.completionResult?.summary, "独立平台仓已写入 completion artifact");
    assert.equal(state.waitingAction, null);

    const events = loadPlatformExecutionRuntimeEvents(runtimeRoot, "principal-runtime", "run-runtime");
    assert.deepEqual(events.map((event) => event.kind), ["assigned", "status", "completed"]);
    assert.equal(events[0]?.source, "scheduled");
    assert.equal(events[1]?.latestReportedStatus, "waiting_human");
    assert.equal(events[1]?.waitingAction?.prompt, "请确认是否继续执行");
    assert.equal(
      (events[2]?.completionResult?.output as { reportFile?: string } | undefined)?.reportFile,
      "/srv/runtime-project/report.json",
    );
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("createPlatformApp 会把 worker run 轨迹写入 execution runtime store", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-runtime-app-"));
  const runtimeRoot = join(workingDirectory, "infra/platform/runtime-runs");
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
    generateRunId: () => "run-platform-app",
    generateLeaseId: () => "lease-platform-app",
    generateLeaseToken: () => "lease-token-platform-app",
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
  const executionRuntimeStore = createLocalPlatformExecutionRuntimeStore({
    rootDirectory: runtimeRoot,
    now: () => "2026-04-14T12:06:00.000Z",
  });
  const server = createPlatformApp({
    nodeService,
    workerRunService,
    workflowService,
    controlPlaneService,
    executionRuntimeStore,
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
          goal: "让 execution runtime store 跟着 worker run 一起落盘",
          priority: "high",
          projectId: "project-runtime",
        },
      }),
    });
    assert.equal(dispatch.status, 200);
    const dispatchPayload = await dispatch.json() as {
      workItem?: { workItemId?: string };
    };
    assert.equal(dispatchPayload.workItem?.workItemId, "work-item-platform-1");

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
      run?: { runId?: string };
      executionLease?: { leaseToken?: string };
    };
    assert.equal(pullPayload.run?.runId, "run-platform-app");

    const update = await fetch(`${baseUrl}/api/platform/worker/runs/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-runtime",
        runId: "run-platform-app",
        leaseToken: pullPayload.executionLease?.leaseToken,
        status: "running",
      }),
    });
    assert.equal(update.status, 200);

    const complete = await fetch(`${baseUrl}/api/platform/worker/runs/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-runtime",
        runId: "run-platform-app",
        leaseToken: pullPayload.executionLease?.leaseToken,
        result: {
          summary: "平台仓已记录 completion 结果",
          structuredOutput: {
            reportFile: "/srv/runtime-project/report.json",
          },
          completedAt: "2026-04-14T12:07:00.000Z",
        },
      }),
    });
    assert.equal(complete.status, 200);

    const workItemDetail = await fetch(`${baseUrl}/api/platform/work-items/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        workItemId: dispatchPayload.workItem?.workItemId,
      }),
    });
    assert.equal(workItemDetail.status, 200);
    const workItemDetailPayload = await workItemDetail.json() as {
      latestCompletion?: {
        summary?: string;
        structuredOutput?: {
          reportFile?: string;
        };
      };
    };
    assert.equal(workItemDetailPayload.latestCompletion?.summary, "平台仓已记录 completion 结果");
    assert.equal(
      workItemDetailPayload.latestCompletion?.structuredOutput?.reportFile,
      "/srv/runtime-project/report.json",
    );

    const runDetail = await fetch(`${baseUrl}/api/platform/runs/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        runId: "run-platform-app",
      }),
    });
    assert.equal(runDetail.status, 200);
    const runDetailPayload = await runDetail.json() as {
      completionResult?: {
        summary?: string;
        structuredOutput?: {
          reportFile?: string;
        };
      };
    };
    assert.equal(runDetailPayload.completionResult?.summary, "平台仓已记录 completion 结果");
    assert.equal(
      runDetailPayload.completionResult?.structuredOutput?.reportFile,
      "/srv/runtime-project/report.json",
    );

    const state = loadPlatformExecutionRuntimeState(
      runtimeRoot,
      "principal-platform-owner",
      "run-platform-app",
    );
    assert(state);
    assert.equal(state.executionContract.workspacePath, "/srv/runtime-project");
    assert.equal(state.runStatus, "completed");
    assert.equal(state.completionResult?.summary, "平台仓已记录 completion 结果");

    const events = loadPlatformExecutionRuntimeEvents(
      runtimeRoot,
      "principal-platform-owner",
      "run-platform-app",
    );
    assert.deepEqual(events.map((event) => event.kind), ["assigned", "status", "completed"]);
    assert.equal(events[0]?.source, "scheduled");
    assert.equal(events[1]?.latestReportedStatus, "running");
    assert.equal(
      (events[2]?.completionResult?.structuredOutput as { reportFile?: string } | undefined)?.reportFile,
      "/srv/runtime-project/report.json",
    );
  } finally {
    server.close();
    await once(server, "close");
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
