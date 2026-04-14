import { resolve } from "node:path";
import { PlatformControlPlaneMirror, type PlatformControlPlaneMirrorBootstrapResult } from "./platform-control-plane-mirror.js";
import {
  MySqlPlatformSharedControlPlaneSnapshotStore,
  type MySqlPlatformSharedControlPlaneSnapshotStoreOptions,
  PlatformSharedControlPlaneSnapshotStore,
  SqlitePlatformSharedControlPlaneSnapshotStore,
} from "./platform-shared-control-plane-store.js";
import type { PlatformRuntimeSnapshot } from "./platform-runtime-snapshot.js";

export const THEMIS_MANAGED_AGENT_CONTROL_PLANE_DATABASE_FILE_ENV_KEY =
  "THEMIS_MANAGED_AGENT_CONTROL_PLANE_DATABASE_FILE";
export const THEMIS_PLATFORM_CONTROL_PLANE_DRIVER_ENV_KEY = "THEMIS_PLATFORM_CONTROL_PLANE_DRIVER";
export const THEMIS_PLATFORM_MYSQL_URI_ENV_KEY = "THEMIS_PLATFORM_MYSQL_URI";
export const THEMIS_PLATFORM_MYSQL_HOST_ENV_KEY = "THEMIS_PLATFORM_MYSQL_HOST";
export const THEMIS_PLATFORM_MYSQL_PORT_ENV_KEY = "THEMIS_PLATFORM_MYSQL_PORT";
export const THEMIS_PLATFORM_MYSQL_USER_ENV_KEY = "THEMIS_PLATFORM_MYSQL_USER";
export const THEMIS_PLATFORM_MYSQL_PASSWORD_ENV_KEY = "THEMIS_PLATFORM_MYSQL_PASSWORD";
export const THEMIS_PLATFORM_MYSQL_DATABASE_ENV_KEY = "THEMIS_PLATFORM_MYSQL_DATABASE";
export const THEMIS_PLATFORM_MYSQL_CONNECTION_LIMIT_ENV_KEY = "THEMIS_PLATFORM_MYSQL_CONNECTION_LIMIT";

const DEFAULT_PLATFORM_SHARED_CONTROL_PLANE_DATABASE_FILE = "infra/platform/control-plane.db";

export type PlatformControlPlaneDriver = "sqlite" | "mysql";

export interface CreatePlatformControlPlaneRuntimeFromEnvOptions {
  workingDirectory: string;
  env?: NodeJS.ProcessEnv;
  runtimeSnapshotFallback?: PlatformRuntimeSnapshot | null;
  createMySqlStore?: (options: MySqlPlatformSharedControlPlaneSnapshotStoreOptions) => PlatformSharedControlPlaneSnapshotStore;
}

export interface PlatformControlPlaneRuntimeFromEnvResult {
  driver: PlatformControlPlaneDriver;
  localSharedCacheFile: string | null;
  mirror: PlatformControlPlaneMirror | null;
  bootstrapResult: PlatformControlPlaneMirrorBootstrapResult | null;
  initialSnapshot: PlatformRuntimeSnapshot | null;
}

export async function createPlatformControlPlaneRuntimeFromEnv(
  options: CreatePlatformControlPlaneRuntimeFromEnvOptions,
): Promise<PlatformControlPlaneRuntimeFromEnvResult> {
  const env = options.env ?? process.env;
  const driver = resolvePlatformControlPlaneDriver(env);

  if (driver === "sqlite") {
    return {
      driver,
      localSharedCacheFile: null,
      mirror: null,
      bootstrapResult: null,
      initialSnapshot: options.runtimeSnapshotFallback ?? null,
    };
  }

  const localSharedCacheFile = resolvePlatformSharedControlPlaneDatabaseFile(options.workingDirectory, env);

  if (!localSharedCacheFile) {
    throw new Error("Platform MySQL control plane requires a local shared control plane cache path.");
  }

  const localStore = new SqlitePlatformSharedControlPlaneSnapshotStore({
    databaseFile: localSharedCacheFile,
  });
  const sharedStore = options.createMySqlStore?.(resolveMySqlPlatformSharedControlPlaneStoreOptions(env))
    ?? new MySqlPlatformSharedControlPlaneSnapshotStore(resolveMySqlPlatformSharedControlPlaneStoreOptions(env));
  const mirror = new PlatformControlPlaneMirror({
    localSnapshotStore: localStore,
    sharedSnapshotStore: sharedStore,
  });
  const { result: bootstrapResult, snapshot } = await mirror.bootstrapFromSharedStore({
    runtimeSnapshotFallback: options.runtimeSnapshotFallback,
  });

  return {
    driver,
    localSharedCacheFile,
    mirror,
    bootstrapResult,
    initialSnapshot: snapshot,
  };
}

export function resolvePlatformControlPlaneDriver(
  env: NodeJS.ProcessEnv = process.env,
): PlatformControlPlaneDriver {
  const configured = normalizeOptionalText(env[THEMIS_PLATFORM_CONTROL_PLANE_DRIVER_ENV_KEY])?.toLowerCase();

  if (!configured || configured === "sqlite") {
    return "sqlite";
  }

  if (configured === "mysql") {
    return "mysql";
  }

  throw new Error(
    `Unsupported ${THEMIS_PLATFORM_CONTROL_PLANE_DRIVER_ENV_KEY}: ${configured}. Expected sqlite or mysql.`,
  );
}

export function resolvePlatformSharedControlPlaneDatabaseFile(
  workingDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = normalizeOptionalText(env[THEMIS_MANAGED_AGENT_CONTROL_PLANE_DATABASE_FILE_ENV_KEY])
    ?? DEFAULT_PLATFORM_SHARED_CONTROL_PLANE_DATABASE_FILE;
  return configured ? resolve(workingDirectory, configured) : null;
}

export function resolveMySqlPlatformSharedControlPlaneStoreOptions(
  env: NodeJS.ProcessEnv = process.env,
): MySqlPlatformSharedControlPlaneSnapshotStoreOptions {
  const database = normalizeOptionalText(env[THEMIS_PLATFORM_MYSQL_DATABASE_ENV_KEY]);

  if (!database) {
    throw new Error(
      `Missing ${THEMIS_PLATFORM_MYSQL_DATABASE_ENV_KEY}. Platform MySQL control plane requires an explicit database name.`,
    );
  }

  const uri = normalizeOptionalText(env[THEMIS_PLATFORM_MYSQL_URI_ENV_KEY]);
  const host = normalizeOptionalText(env[THEMIS_PLATFORM_MYSQL_HOST_ENV_KEY]);
  const user = normalizeOptionalText(env[THEMIS_PLATFORM_MYSQL_USER_ENV_KEY]);
  const password = normalizeOptionalText(env[THEMIS_PLATFORM_MYSQL_PASSWORD_ENV_KEY]);
  const port = normalizeOptionalInteger(env[THEMIS_PLATFORM_MYSQL_PORT_ENV_KEY]);
  const connectionLimit = normalizeOptionalInteger(env[THEMIS_PLATFORM_MYSQL_CONNECTION_LIMIT_ENV_KEY]);

  return {
    ...(uri ? { uri } : {}),
    ...(host ? { host } : {}),
    ...(typeof port === "number" ? { port } : {}),
    ...(user ? { user } : {}),
    ...(password ? { password } : {}),
    database,
    ...(typeof connectionLimit === "number" ? { connectionLimit } : {}),
  };
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeOptionalInteger(value: string | undefined): number | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected integer value, received: ${normalized}`);
  }

  return parsed;
}
