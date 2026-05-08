import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadProjectEnv } from "../config/project-env.js";
import {
  bootstrapMessage,
  createPlatformServerFromEnv,
  resolvePlatformExecutionRuntimeRoot,
  resolvePlatformMainConfig,
  resolvePlatformRuntimeSnapshotFile,
} from "./platform-main.js";
import {
  createEmptyPlatformRuntimeSnapshot,
  savePlatformRuntimeSnapshotFile,
  type PlatformRuntimeSnapshot,
} from "./platform-runtime-snapshot.js";
import type { PlatformSharedControlPlaneSnapshotStore } from "./platform-shared-control-plane-store.js";

class TrackingSharedSnapshotStore implements PlatformSharedControlPlaneSnapshotStore {
  replaceCount = 0;
  snapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-05-08T00:00:00.000Z");

  async ensureSchema(): Promise<void> {}

  async exportSharedSnapshot(): Promise<PlatformRuntimeSnapshot> {
    return this.snapshot;
  }

  async replaceSharedSnapshot(snapshot: PlatformRuntimeSnapshot): Promise<void> {
    this.replaceCount += 1;
    this.snapshot = snapshot;
  }
}

test("resolvePlatformMainConfig 会给平台服务使用生产监听默认值", () => {
  const config = resolvePlatformMainConfig({});

  assert.deepEqual(config, {
    host: "0.0.0.0",
    port: 3100,
    serviceName: "themis-platform",
    schedulerIntervalMs: 5000,
    controlPlaneDriver: "sqlite",
  });
});

test("resolvePlatformMainConfig 会读取 THEMIS_HOST 和 THEMIS_PORT", () => {
  const config = resolvePlatformMainConfig({
    THEMIS_HOST: "192.168.31.212",
    THEMIS_PORT: "3201",
  });

  assert.equal(config.host, "192.168.31.212");
  assert.equal(config.port, 3201);
  assert.equal(config.schedulerIntervalMs, 5000);
  assert.equal(config.controlPlaneDriver, "sqlite");
  assert.match(
    bootstrapMessage(config),
    /Themis Platform server listening on http:\/\/192\.168\.31\.212:3201/,
  );
});

test("resolvePlatformMainConfig 会读取 THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS", () => {
  const config = resolvePlatformMainConfig({
    THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS: "15000",
  });

  assert.equal(config.schedulerIntervalMs, 15000);
  assert.equal(config.controlPlaneDriver, "sqlite");
});

test("resolvePlatformRuntimeSnapshotFile 会读取 THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE", () => {
  const filePath = resolvePlatformRuntimeSnapshotFile("/srv/themis-platform", {
    THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE: "infra/custom/runtime.json",
  });

  assert.equal(filePath, "/srv/themis-platform/infra/custom/runtime.json");
});

test("resolvePlatformExecutionRuntimeRoot 会读取 THEMIS_PLATFORM_EXECUTION_RUNTIME_ROOT", () => {
  const rootDirectory = resolvePlatformExecutionRuntimeRoot("/srv/themis-platform", {
    THEMIS_PLATFORM_EXECUTION_RUNTIME_ROOT: "infra/custom/runtime-runs",
  });

  assert.equal(rootDirectory, "/srv/themis-platform/infra/custom/runtime-runs");
});

test("loadProjectEnv 后 resolvePlatformMainConfig 会读取 .env.local", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-main-"));
  const previousHost = process.env.THEMIS_HOST;
  const previousPort = process.env.THEMIS_PORT;

  delete process.env.THEMIS_HOST;
  delete process.env.THEMIS_PORT;

  try {
    writeFileSync(
      join(workingDirectory, ".env.local"),
      "THEMIS_HOST=10.0.0.12\nTHEMIS_PORT=4123\n",
      "utf8",
    );

    loadProjectEnv(workingDirectory);
    const config = resolvePlatformMainConfig(process.env);

    assert.equal(config.host, "10.0.0.12");
    assert.equal(config.port, 4123);
    assert.equal(config.schedulerIntervalMs, 5000);
    assert.equal(config.controlPlaneDriver, "sqlite");
  } finally {
    if (typeof previousHost === "string") {
      process.env.THEMIS_HOST = previousHost;
    } else {
      delete process.env.THEMIS_HOST;
    }

    if (typeof previousPort === "string") {
      process.env.THEMIS_PORT = previousPort;
    } else {
      delete process.env.THEMIS_PORT;
    }

    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("platform-main 会把 heartbeat 只落本地 runtime snapshot，不刷 MySQL shared snapshot", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-heartbeat-mirror-"));
  const runtimeSnapshotFile = join(workingDirectory, "runtime-state.json");
  const ownerPrincipalId = "principal-platform-owner";
  const webToken = "platform-test-secret";
  const organization = {
    organizationId: "org-platform",
    ownerPrincipalId,
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  };
  const initialSnapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-05-08T00:00:00.000Z");
  initialSnapshot.nodeService.organizations.push(organization);
  initialSnapshot.nodeService.nodes.push({
    nodeId: "node-runtime",
    organizationId: organization.organizationId,
    displayName: "Worker Runtime",
    status: "online",
    slotCapacity: 1,
    slotAvailable: 1,
    heartbeatTtlSeconds: 30,
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  });
  savePlatformRuntimeSnapshotFile(runtimeSnapshotFile, initialSnapshot);

  const sharedStore = new TrackingSharedSnapshotStore();
  const platform = await createPlatformServerFromEnv({
    THEMIS_PLATFORM_CONTROL_PLANE_DRIVER: "mysql",
    THEMIS_PLATFORM_MYSQL_DATABASE: "themis_platform_test",
    THEMIS_MANAGED_AGENT_CONTROL_PLANE_DATABASE_FILE: "control-plane.db",
    THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE: "runtime-state.json",
    THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS: "0",
    THEMIS_PLATFORM_WEB_ACCESS_TOKEN: webToken,
  } as NodeJS.ProcessEnv, workingDirectory, {
    createMySqlStore: () => sharedStore,
  });

  assert.equal(sharedStore.replaceCount, 1);

  try {
    platform.server.listen(0, "127.0.0.1");
    await once(platform.server, "listening");
    const address = platform.server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/web-auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: webToken,
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert(cookie);

    const repeatedRegister = await fetch(`${baseUrl}/api/platform/nodes/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        ownerPrincipalId,
        node: {
          nodeId: "node-runtime",
          displayName: "Worker Runtime",
          slotCapacity: 1,
          slotAvailable: 0,
        },
      }),
    });
    assert.equal(repeatedRegister.status, 200);
    assert.equal(sharedStore.replaceCount, 1);

    const heartbeat = await fetch(`${baseUrl}/api/platform/nodes/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        ownerPrincipalId,
        node: {
          nodeId: "node-runtime",
          slotAvailable: 0,
        },
      }),
    });
    assert.equal(heartbeat.status, 200);
    assert.equal(sharedStore.replaceCount, 1);

    const runtimeAfterHeartbeat = JSON.parse(readFileSync(runtimeSnapshotFile, "utf8")) as PlatformRuntimeSnapshot;
    assert.equal(runtimeAfterHeartbeat.nodeService.nodes[0]?.slotAvailable, 0);

    const drain = await fetch(`${baseUrl}/api/platform/nodes/drain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        ownerPrincipalId,
        nodeId: "node-runtime",
      }),
    });
    assert.equal(drain.status, 200);
    assert.equal(sharedStore.replaceCount, 2);
  } finally {
    platform.server.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
