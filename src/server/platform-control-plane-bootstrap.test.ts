import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPlatformControlPlaneRuntimeFromEnv,
  resolveMySqlPlatformSharedControlPlaneStoreOptions,
  resolvePlatformControlPlaneDriver,
  resolvePlatformSharedControlPlaneDatabaseFile,
} from "./platform-control-plane-bootstrap.js";
import { createEmptyPlatformRuntimeSnapshot } from "./platform-runtime-snapshot.js";

test("resolvePlatformControlPlaneDriver 默认 sqlite 并支持 mysql", () => {
  assert.equal(resolvePlatformControlPlaneDriver({}), "sqlite");
  assert.equal(resolvePlatformControlPlaneDriver({
    THEMIS_PLATFORM_CONTROL_PLANE_DRIVER: "mysql",
  }), "mysql");
});

test("resolvePlatformSharedControlPlaneDatabaseFile 会回到默认 shared cache 路径", () => {
  const filePath = resolvePlatformSharedControlPlaneDatabaseFile("/srv/themis-platform", {});
  assert.equal(filePath, "/srv/themis-platform/infra/platform/control-plane.db");
});

test("resolveMySqlPlatformSharedControlPlaneStoreOptions 会读取 mysql 连接配置", () => {
  const options = resolveMySqlPlatformSharedControlPlaneStoreOptions({
    THEMIS_PLATFORM_MYSQL_HOST: "127.0.0.1",
    THEMIS_PLATFORM_MYSQL_PORT: "3307",
    THEMIS_PLATFORM_MYSQL_USER: "themis",
    THEMIS_PLATFORM_MYSQL_PASSWORD: "secret",
    THEMIS_PLATFORM_MYSQL_DATABASE: "themis_platform",
    THEMIS_PLATFORM_MYSQL_CONNECTION_LIMIT: "8",
  });

  assert.deepEqual(options, {
    host: "127.0.0.1",
    port: 3307,
    user: "themis",
    password: "secret",
    database: "themis_platform",
    connectionLimit: 8,
  });
});

test("createPlatformControlPlaneRuntimeFromEnv 会在 mysql driver 下用 runtime snapshot fallback bootstrap", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-bootstrap-"));
  const runtimeSnapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-04-14T14:10:00.000Z");
  runtimeSnapshot.controlPlaneService.owners.push({
    ownerPrincipalId: "principal-owner",
    organizations: [{
      organizationId: "org-platform",
      ownerPrincipalId: "principal-owner",
      displayName: "Platform Team",
      slug: "platform-team",
      createdAt: "2026-04-14T13:00:00.000Z",
      updatedAt: "2026-04-14T13:00:00.000Z",
    }],
    principals: [],
    agents: [],
    workspacePolicies: [],
    runtimeProfiles: [],
    authAccounts: [],
    thirdPartyProviders: [],
    projectBindings: [],
    spawnPolicy: null,
  });
  let sharedSnapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-04-14T14:09:00.000Z");

  try {
    const runtime = await createPlatformControlPlaneRuntimeFromEnv({
      workingDirectory,
      env: {
        THEMIS_PLATFORM_CONTROL_PLANE_DRIVER: "mysql",
        THEMIS_PLATFORM_MYSQL_DATABASE: "themis_platform",
      },
      runtimeSnapshotFallback: runtimeSnapshot,
      createMySqlStore: () => ({
        async ensureSchema() {
          return;
        },
        async exportSharedSnapshot() {
          return sharedSnapshot;
        },
        async replaceSharedSnapshot(snapshot) {
          sharedSnapshot = snapshot;
        },
      }),
    });

    try {
      assert.equal(runtime.driver, "mysql");
      assert.equal(runtime.bootstrapResult?.source, "runtime_snapshot");
      assert.equal(runtime.localSharedCacheFile, join(workingDirectory, "infra/platform/control-plane.db"));
      assert.equal(runtime.initialSnapshot?.controlPlaneService.owners[0]?.ownerPrincipalId, "principal-owner");

      const nextSnapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-04-14T14:11:00.000Z");
      nextSnapshot.controlPlaneService.owners.push({
        ownerPrincipalId: "principal-next",
        organizations: [],
        principals: [],
        agents: [],
        workspacePolicies: [],
        runtimeProfiles: [],
        authAccounts: [],
        thirdPartyProviders: [],
        projectBindings: [],
        spawnPolicy: null,
      });
      await runtime.mirror?.flushSnapshot(nextSnapshot);
      assert.equal(sharedSnapshot.controlPlaneService.owners[0]?.ownerPrincipalId, "principal-next");
    } finally {
      await runtime.mirror?.close();
    }
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
