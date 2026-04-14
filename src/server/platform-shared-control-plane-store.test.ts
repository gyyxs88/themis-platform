import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createEmptyPlatformRuntimeSnapshot,
  hasPlatformRuntimeSnapshotData,
} from "./platform-runtime-snapshot.js";
import { SqlitePlatformSharedControlPlaneSnapshotStore } from "./platform-shared-control-plane-store.js";

test("SqlitePlatformSharedControlPlaneSnapshotStore 会完成 snapshot round-trip", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-shared-cache-"));
  const databaseFile = join(workingDirectory, "infra/platform/control-plane.db");
  const store = new SqlitePlatformSharedControlPlaneSnapshotStore({
    databaseFile,
  });
  const snapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-04-14T14:00:00.000Z");
  snapshot.controlPlaneService.owners.push({
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

  try {
    await store.ensureSchema();
    const empty = await store.exportSharedSnapshot();
    assert.equal(hasPlatformRuntimeSnapshotData(empty), false);

    await store.replaceSharedSnapshot(snapshot);
    const restored = await store.exportSharedSnapshot();
    assert.equal(hasPlatformRuntimeSnapshotData(restored), true);
    assert.equal(restored.savedAt, "2026-04-14T14:00:00.000Z");
    assert.equal(restored.controlPlaneService.owners[0]?.ownerPrincipalId, "principal-owner");
    assert.equal(restored.controlPlaneService.owners[0]?.organizations[0]?.organizationId, "org-platform");
  } finally {
    await store.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
