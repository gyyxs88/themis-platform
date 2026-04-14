import {
  hasPlatformRuntimeSnapshotData,
  type PlatformRuntimeSnapshot,
} from "./platform-runtime-snapshot.js";
import type { PlatformSharedControlPlaneSnapshotStore } from "./platform-shared-control-plane-store.js";

export interface PlatformControlPlaneMirrorOptions {
  localSnapshotStore: PlatformSharedControlPlaneSnapshotStore;
  sharedSnapshotStore: PlatformSharedControlPlaneSnapshotStore;
}

export interface PlatformControlPlaneMirrorBootstrapResult {
  source: "shared_store" | "local_cache" | "runtime_snapshot" | "empty";
  localHasData: boolean;
  sharedHasData: boolean;
}

export class PlatformControlPlaneMirrorFlushError extends Error {
  readonly restoredSnapshot: PlatformRuntimeSnapshot | null;
  readonly flushError: unknown;
  readonly restoreError: unknown;

  constructor(input: {
    message: string;
    restoredSnapshot: PlatformRuntimeSnapshot | null;
    flushError: unknown;
    restoreError?: unknown;
  }) {
    super(input.message);
    this.name = "PlatformControlPlaneMirrorFlushError";
    this.restoredSnapshot = input.restoredSnapshot;
    this.flushError = input.flushError;
    this.restoreError = input.restoreError ?? null;
  }
}

export class PlatformControlPlaneMirror {
  private readonly localSnapshotStore: PlatformSharedControlPlaneSnapshotStore;
  private readonly sharedSnapshotStore: PlatformSharedControlPlaneSnapshotStore;

  constructor(options: PlatformControlPlaneMirrorOptions) {
    this.localSnapshotStore = options.localSnapshotStore;
    this.sharedSnapshotStore = options.sharedSnapshotStore;
  }

  async bootstrapFromSharedStore(input: {
    runtimeSnapshotFallback?: PlatformRuntimeSnapshot | null;
  } = {}): Promise<{
    result: PlatformControlPlaneMirrorBootstrapResult;
    snapshot: PlatformRuntimeSnapshot | null;
  }> {
    await this.localSnapshotStore.ensureSchema();
    await this.sharedSnapshotStore.ensureSchema();

    const sharedSnapshot = await this.sharedSnapshotStore.exportSharedSnapshot();
    const sharedHasData = hasPlatformRuntimeSnapshotData(sharedSnapshot);
    const localSnapshot = await this.localSnapshotStore.exportSharedSnapshot();
    const localHasData = hasPlatformRuntimeSnapshotData(localSnapshot);
    const fallbackHasData = hasPlatformRuntimeSnapshotData(input.runtimeSnapshotFallback);

    if (sharedHasData) {
      await this.localSnapshotStore.replaceSharedSnapshot(sharedSnapshot);
      return {
        result: {
          source: "shared_store",
          localHasData,
          sharedHasData,
        },
        snapshot: sharedSnapshot,
      };
    }

    if (localHasData) {
      await this.sharedSnapshotStore.replaceSharedSnapshot(localSnapshot);
      return {
        result: {
          source: "local_cache",
          localHasData,
          sharedHasData,
        },
        snapshot: localSnapshot,
      };
    }

    if (fallbackHasData) {
      await this.localSnapshotStore.replaceSharedSnapshot(input.runtimeSnapshotFallback!);
      await this.sharedSnapshotStore.replaceSharedSnapshot(input.runtimeSnapshotFallback!);
      return {
        result: {
          source: "runtime_snapshot",
          localHasData,
          sharedHasData,
        },
        snapshot: input.runtimeSnapshotFallback!,
      };
    }

    return {
      result: {
        source: "empty",
        localHasData,
        sharedHasData,
      },
      snapshot: null,
    };
  }

  async flushSnapshot(snapshot: PlatformRuntimeSnapshot): Promise<void> {
    await this.localSnapshotStore.ensureSchema();
    await this.sharedSnapshotStore.ensureSchema();
    await this.localSnapshotStore.replaceSharedSnapshot(snapshot);

    try {
      await this.sharedSnapshotStore.replaceSharedSnapshot(snapshot);
    } catch (flushError) {
      try {
        const restoredSnapshot = await this.sharedSnapshotStore.exportSharedSnapshot();
        await this.localSnapshotStore.replaceSharedSnapshot(restoredSnapshot);
        throw new PlatformControlPlaneMirrorFlushError({
          message: "Platform control plane mirror failed to flush local cache to shared store.",
          restoredSnapshot,
          flushError,
        });
      } catch (restoreError) {
        if (restoreError instanceof PlatformControlPlaneMirrorFlushError) {
          throw restoreError;
        }

        throw new PlatformControlPlaneMirrorFlushError({
          message: "Platform control plane mirror failed to flush local cache and failed to restore local cache.",
          restoredSnapshot: null,
          flushError,
          restoreError,
        });
      }
    }
  }

  async close(): Promise<void> {
    await this.localSnapshotStore.close?.();
    await this.sharedSnapshotStore.close?.();
  }
}
