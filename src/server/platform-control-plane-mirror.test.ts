import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PlatformControlPlaneMirror,
  PlatformControlPlaneMirrorFlushError,
} from "./platform-control-plane-mirror.js";
import {
  createEmptyPlatformRuntimeSnapshot,
  hasPlatformRuntimeSnapshotData,
  type PlatformRuntimeSnapshot,
} from "./platform-runtime-snapshot.js";
import {
  type PlatformSharedControlPlaneSnapshotStore,
  SqlitePlatformSharedControlPlaneSnapshotStore,
} from "./platform-shared-control-plane-store.js";

test("PlatformControlPlaneMirror 会在 shared/local 都为空时用 runtime snapshot fallback bootstrap", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-mirror-"));
  const localStore = new SqlitePlatformSharedControlPlaneSnapshotStore({
    databaseFile: join(workingDirectory, "infra/platform/control-plane.db"),
  });
  const fallbackSnapshot = createFixtureSnapshot();
  let sharedSnapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-04-14T14:05:00.000Z");
  const sharedStore = createMemorySnapshotStore({
    getSnapshot: () => sharedSnapshot,
    replaceSnapshot: (snapshot) => {
      sharedSnapshot = snapshot;
    },
  });
  const mirror = new PlatformControlPlaneMirror({
    localSnapshotStore: localStore,
    sharedSnapshotStore: sharedStore,
  });

  try {
    const { result, snapshot } = await mirror.bootstrapFromSharedStore({
      runtimeSnapshotFallback: fallbackSnapshot,
    });

    assert.equal(result.source, "runtime_snapshot");
    assert.equal(snapshot?.controlPlaneService.owners[0]?.ownerPrincipalId, "principal-owner");

    const localSnapshot = await localStore.exportSharedSnapshot();
    assert.equal(hasPlatformRuntimeSnapshotData(localSnapshot), true);
    assert.equal(localSnapshot.controlPlaneService.owners[0]?.ownerPrincipalId, "principal-owner");
    assert.equal(sharedSnapshot.controlPlaneService.owners[0]?.ownerPrincipalId, "principal-owner");
  } finally {
    await mirror.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("PlatformControlPlaneMirror flush 失败时会恢复本地 shared cache", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-mirror-rollback-"));
  const localStore = new SqlitePlatformSharedControlPlaneSnapshotStore({
    databaseFile: join(workingDirectory, "infra/platform/control-plane.db"),
  });
  const sharedSnapshot = createFixtureSnapshot();
  const sharedStore = createMemorySnapshotStore({
    getSnapshot: () => sharedSnapshot,
    replaceSnapshot: () => {
      throw new Error("mysql unavailable");
    },
  });
  const mirror = new PlatformControlPlaneMirror({
    localSnapshotStore: localStore,
    sharedSnapshotStore: sharedStore,
  });
  const nextSnapshot = createFixtureSnapshot();
  nextSnapshot.controlPlaneService.owners[0]!.organizations[0]!.displayName = "Changed Team";

  try {
    await localStore.ensureSchema();
    await localStore.replaceSharedSnapshot(sharedSnapshot);

    await assert.rejects(
      mirror.flushSnapshot(nextSnapshot),
      (error: unknown) => {
        assert(error instanceof PlatformControlPlaneMirrorFlushError);
        assert.equal(error.message, "Platform control plane mirror failed to flush local cache to shared store.");
        assert.equal(error.restoredSnapshot?.controlPlaneService.owners[0]?.organizations[0]?.displayName, "Platform Team");
        return true;
      },
    );

    const restored = await localStore.exportSharedSnapshot();
    assert.equal(restored.controlPlaneService.owners[0]?.organizations[0]?.displayName, "Platform Team");
  } finally {
    await mirror.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

function createMemorySnapshotStore(input: {
  getSnapshot: () => PlatformRuntimeSnapshot;
  replaceSnapshot: (snapshot: PlatformRuntimeSnapshot) => void;
}): PlatformSharedControlPlaneSnapshotStore {
  return {
    async ensureSchema() {
      return;
    },
    async exportSharedSnapshot() {
      return input.getSnapshot();
    },
    async replaceSharedSnapshot(snapshot) {
      input.replaceSnapshot(snapshot);
    },
  };
}

function createFixtureSnapshot(): PlatformRuntimeSnapshot {
  const snapshot = createEmptyPlatformRuntimeSnapshot(() => "2026-04-14T14:00:00.000Z");
  snapshot.nodeService.organizations.push({
    organizationId: "org-platform",
    ownerPrincipalId: "principal-owner",
    displayName: "Platform Team",
    slug: "platform-team",
    createdAt: "2026-04-14T13:00:00.000Z",
    updatedAt: "2026-04-14T13:00:00.000Z",
  });
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
  return snapshot;
}
