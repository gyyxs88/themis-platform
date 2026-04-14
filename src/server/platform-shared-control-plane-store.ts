import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import {
  createPool,
  type Pool,
  type PoolOptions,
  type RowDataPacket,
} from "mysql2/promise";
import {
  createEmptyPlatformRuntimeSnapshot,
  type PlatformRuntimeSnapshot,
} from "./platform-runtime-snapshot.js";

const DEFAULT_SNAPSHOT_KEY = "platform-control-plane";

export interface PlatformSharedControlPlaneSnapshotStore {
  ensureSchema(): Promise<void>;
  exportSharedSnapshot(): Promise<PlatformRuntimeSnapshot>;
  replaceSharedSnapshot(snapshot: PlatformRuntimeSnapshot): Promise<void>;
  close?(): Promise<void>;
}

export interface SqlitePlatformSharedControlPlaneSnapshotStoreOptions {
  databaseFile: string;
}

interface SqliteSnapshotRow {
  payload_json: string;
}

export class SqlitePlatformSharedControlPlaneSnapshotStore implements PlatformSharedControlPlaneSnapshotStore {
  private readonly database: DatabaseSync;

  constructor(options: SqlitePlatformSharedControlPlaneSnapshotStoreOptions) {
    const databaseFile = resolve(options.databaseFile);
    mkdirSync(dirname(databaseFile), { recursive: true });
    this.database = new DatabaseSync(databaseFile);
  }

  async ensureSchema(): Promise<void> {
    this.database.exec(
      `CREATE TABLE IF NOT EXISTS themis_platform_shared_snapshots (
        snapshot_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        saved_at TEXT NOT NULL
      )`,
    );
  }

  async exportSharedSnapshot(): Promise<PlatformRuntimeSnapshot> {
    const row = this.database.prepare(
      `SELECT payload_json
       FROM themis_platform_shared_snapshots
       WHERE snapshot_key = ?`,
    ).get(DEFAULT_SNAPSHOT_KEY) as SqliteSnapshotRow | undefined;

    if (!row) {
      return createEmptyPlatformRuntimeSnapshot();
    }

    return normalizePlatformRuntimeSnapshot(JSON.parse(row.payload_json));
  }

  async replaceSharedSnapshot(snapshot: PlatformRuntimeSnapshot): Promise<void> {
    this.database.prepare(
      `INSERT INTO themis_platform_shared_snapshots (
         snapshot_key, payload_json, saved_at
       ) VALUES (?, ?, ?)
       ON CONFLICT(snapshot_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         saved_at = excluded.saved_at`,
    ).run(
      DEFAULT_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
      snapshot.savedAt,
    );
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

export interface MySqlPlatformSharedControlPlaneSnapshotStoreOptions {
  pool?: Pool;
  uri?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
  connectionLimit?: number;
}

interface MySqlSnapshotRow extends RowDataPacket {
  payload_json: unknown;
}

export class MySqlPlatformSharedControlPlaneSnapshotStore implements PlatformSharedControlPlaneSnapshotStore {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(options: MySqlPlatformSharedControlPlaneSnapshotStoreOptions) {
    if (options.pool) {
      this.pool = options.pool;
      this.ownsPool = false;
      return;
    }

    this.pool = createPool(buildMySqlPoolOptions(options));
    this.ownsPool = true;
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS themis_platform_shared_snapshots (
         snapshot_key VARCHAR(64) PRIMARY KEY,
         payload_json JSON NOT NULL,
         saved_at DATETIME(3) NOT NULL
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  }

  async exportSharedSnapshot(): Promise<PlatformRuntimeSnapshot> {
    const [rows] = await this.pool.query<MySqlSnapshotRow[]>(
      `SELECT payload_json
       FROM themis_platform_shared_snapshots
       WHERE snapshot_key = ?
       LIMIT 1`,
      [DEFAULT_SNAPSHOT_KEY],
    );
    const row = rows[0];

    if (!row) {
      return createEmptyPlatformRuntimeSnapshot();
    }

    return normalizePlatformRuntimeSnapshot(normalizeJsonValue(row.payload_json));
  }

  async replaceSharedSnapshot(snapshot: PlatformRuntimeSnapshot): Promise<void> {
    await this.pool.execute(
      `INSERT INTO themis_platform_shared_snapshots (
         snapshot_key, payload_json, saved_at
       ) VALUES (?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE
         payload_json = VALUES(payload_json),
         saved_at = VALUES(saved_at)`,
      [
        DEFAULT_SNAPSHOT_KEY,
        JSON.stringify(snapshot),
        toMySqlDateTime(snapshot.savedAt),
      ],
    );
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }
}

function buildMySqlPoolOptions(options: MySqlPlatformSharedControlPlaneSnapshotStoreOptions): PoolOptions {
  if (options.uri) {
    return {
      uri: options.uri,
      connectionLimit: options.connectionLimit ?? 4,
      timezone: "Z",
      dateStrings: true,
    };
  }

  return {
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.user,
    password: options.password,
    database: options.database,
    connectionLimit: options.connectionLimit ?? 4,
    timezone: "Z",
    dateStrings: true,
  };
}

function normalizeJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function normalizePlatformRuntimeSnapshot(value: unknown): PlatformRuntimeSnapshot {
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1) {
    return createEmptyPlatformRuntimeSnapshot();
  }

  return value as PlatformRuntimeSnapshot;
}

function toMySqlDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime value: ${value}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}
