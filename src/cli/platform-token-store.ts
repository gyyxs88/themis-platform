import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type PlatformServiceRole = "gateway" | "worker";

export interface PlatformServiceTokenSummary {
  tokenId: string;
  label: string;
  serviceRole: PlatformServiceRole;
  ownerPrincipalId: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface StoredPlatformServiceToken extends PlatformServiceTokenSummary {
  tokenSalt: string;
  tokenHash: string;
}

interface StoredPlatformTokenFile {
  tokens: StoredPlatformServiceToken[];
}

export interface PlatformTokenStoreOptions {
  workingDirectory?: string;
  now?: () => string;
}

export class PlatformTokenStore {
  private readonly workingDirectory: string;
  private readonly now: () => string;

  constructor(options: PlatformTokenStoreOptions = {}) {
    this.workingDirectory = resolve(options.workingDirectory ?? process.cwd());
    this.now = options.now ?? (() => new Date().toISOString());
  }

  listTokens(): PlatformServiceTokenSummary[] {
    return this.readStore().tokens
      .map(toSummary)
      .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
  }

  createToken(input: {
    label: string;
    secret: string;
    ownerPrincipalId: string;
    serviceRole: PlatformServiceRole;
  }): PlatformServiceTokenSummary {
    const label = normalizeRequiredText(input.label, "平台服务令牌标签不能为空。");
    const secret = normalizeRequiredText(input.secret, "平台服务令牌不能为空。");
    const ownerPrincipalId = normalizeRequiredText(input.ownerPrincipalId, "ownerPrincipalId 不能为空。");
    const store = this.readStore();

    if (store.tokens.some((token) => token.label === label && !token.revokedAt)) {
      throw new Error(`平台服务令牌标签已存在：${label}`);
    }

    const now = this.now();
    const tokenSalt = randomBytes(16).toString("hex");
    const created: StoredPlatformServiceToken = {
      tokenId: randomUUID(),
      label,
      serviceRole: input.serviceRole,
      ownerPrincipalId,
      tokenSalt,
      tokenHash: hashSecret(secret, tokenSalt),
      createdAt: now,
      updatedAt: now,
    };
    store.tokens.push(created);
    this.writeStore(store);
    return toSummary(created);
  }

  revokeTokenByLabel(input: { label: string }): PlatformServiceTokenSummary {
    const label = normalizeRequiredText(input.label, "平台服务令牌标签不能为空。");
    const store = this.readStore();
    const token = store.tokens.find((item) => item.label === label && !item.revokedAt);

    if (!token) {
      throw new Error(`未找到处于 active 状态的平台服务令牌：${label}`);
    }

    token.revokedAt = this.now();
    token.updatedAt = token.revokedAt;
    this.writeStore(store);
    return toSummary(token);
  }

  renameToken(input: { tokenId: string; label: string }): PlatformServiceTokenSummary {
    const tokenId = normalizeRequiredText(input.tokenId, "tokenId 不能为空。");
    const nextLabel = normalizeRequiredText(input.label, "新标签不能为空。");
    const store = this.readStore();
    const token = store.tokens.find((item) => item.tokenId === tokenId && !item.revokedAt);

    if (!token) {
      throw new Error(`未找到处于 active 状态的平台服务令牌：${tokenId}`);
    }

    if (store.tokens.some((item) => item.label === nextLabel && item.tokenId !== tokenId && !item.revokedAt)) {
      throw new Error(`平台服务令牌标签已存在：${nextLabel}`);
    }

    token.label = nextLabel;
    token.updatedAt = this.now();
    this.writeStore(store);
    return toSummary(token);
  }

  authenticateToken(input: { secret: string }): PlatformServiceTokenSummary | null {
    const secret = normalizeRequiredText(input.secret, "平台服务令牌不能为空。");
    const store = this.readStore();

    for (const token of store.tokens) {
      if (token.revokedAt) {
        continue;
      }

      if (!isSecretMatch(secret, token)) {
        continue;
      }

      const now = this.now();
      token.lastUsedAt = now;
      token.updatedAt = now;
      this.writeStore(store);
      return toSummary(token);
    }

    return null;
  }

  private readStore(): StoredPlatformTokenFile {
    const storePath = resolvePlatformTokenStorePath(this.workingDirectory);
    if (!existsSync(storePath)) {
      return { tokens: [] };
    }

    const content = readFileSync(storePath, "utf8");
    if (!content.trim()) {
      return { tokens: [] };
    }

    let parsed: Partial<StoredPlatformTokenFile>;
    try {
      parsed = JSON.parse(content) as Partial<StoredPlatformTokenFile>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`平台服务令牌文件无法解析：${storePath}：${message}`);
    }

    return {
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens as StoredPlatformServiceToken[] : [],
    };
  }

  private writeStore(store: StoredPlatformTokenFile): void {
    const storePath = resolvePlatformTokenStorePath(this.workingDirectory);
    mkdirSync(dirname(storePath), { recursive: true });
    const temporaryStorePath = `${storePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      writeFileSync(temporaryStorePath, JSON.stringify(store, null, 2));
      renameSync(temporaryStorePath, storePath);
    } catch (error) {
      if (existsSync(temporaryStorePath)) {
        unlinkSync(temporaryStorePath);
      }
      throw error;
    }
  }
}

export function resolvePlatformTokenStorePath(workingDirectory: string): string {
  return resolve(workingDirectory, "infra/local/platform-service-tokens.json");
}

function toSummary(token: StoredPlatformServiceToken): PlatformServiceTokenSummary {
  return {
    tokenId: token.tokenId,
    label: token.label,
    serviceRole: token.serviceRole,
    ownerPrincipalId: token.ownerPrincipalId,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt } : {}),
    ...(token.revokedAt ? { revokedAt: token.revokedAt } : {}),
  };
}

function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 64).toString("base64");
}

function isSecretMatch(secret: string, token: StoredPlatformServiceToken): boolean {
  const expected = Buffer.from(token.tokenHash, "base64");
  const actual = Buffer.from(hashSecret(secret, token.tokenSalt), "base64");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function normalizeRequiredText(value: string | null | undefined, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}
