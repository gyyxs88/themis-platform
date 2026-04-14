import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cliEntryPath = resolve(repoRoot, "src/cli/platform-main.ts");
const tsxBinaryPath = resolve(repoRoot, "node_modules/.bin/tsx");

function createWorkspace(): string {
  const workspace = resolve(tmpdir(), `themis-platform-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workspace, { recursive: true });
  return workspace;
}

function runCli(args: string[], cwd: string, input?: string): {
  code: number;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(tsxBinaryPath, [cliEntryPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
    },
    input,
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("themis-platform help 会列出当前支持的独立平台命令", () => {
  const workspace = createWorkspace();

  try {
    const result = runCli(["help"], workspace);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Themis Platform CLI/);
    assert.match(result.stdout, /auth platform list/);
    assert.match(result.stdout, /doctor worker-fleet/);
    assert.match(result.stdout, /worker-fleet <drain\|offline\|reclaim>/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("themis-platform auth platform 最小闭环", () => {
  const workspace = createWorkspace();
  const storePath = resolve(workspace, "infra/local/platform-service-tokens.json");

  try {
    const addResult = runCli(
      ["auth", "platform", "add", "gateway-alpha", "--role", "gateway", "--owner-principal", "principal-owner"],
      workspace,
      "platform-secret\nplatform-secret\n",
    );

    assert.equal(addResult.code, 0);
    assert.match(addResult.stdout, /gateway-alpha/);
    assert.match(addResult.stdout, /role：gateway/);
    assert.match(addResult.stdout, /ownerPrincipalId：principal-owner/);
    assert.equal(existsSync(storePath), true);

    const stored = JSON.parse(readFileSync(storePath, "utf8")) as { tokens?: Array<{ tokenHash?: string; label?: string }> };
    assert.equal(stored.tokens?.[0]?.label, "gateway-alpha");
    assert.ok(stored.tokens?.[0]?.tokenHash);

    const listResult = runCli(["auth", "platform", "list"], workspace);
    assert.equal(listResult.code, 0);
    assert.match(listResult.stdout, /gateway-alpha/);
    assert.match(listResult.stdout, /状态：active/);

    const renameResult = runCli(["auth", "platform", "rename", "gateway-alpha", "gateway-beta"], workspace);
    assert.equal(renameResult.code, 0);
    assert.match(renameResult.stdout, /gateway-beta/);

    const removeResult = runCli(["auth", "platform", "remove", "gateway-beta"], workspace);
    assert.equal(removeResult.code, 0);
    assert.match(removeResult.stdout, /状态：revoked/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("themis-platform auth platform add 缺少 role 或 ownerPrincipalId 会报错", () => {
  const workspace = createWorkspace();

  try {
    const missingRole = runCli(
      ["auth", "platform", "add", "gateway-alpha", "--owner-principal", "principal-owner"],
      workspace,
      "platform-secret\nplatform-secret\n",
    );
    assert.equal(missingRole.code, 1);
    assert.match(missingRole.stderr, /auth platform add/);

    const missingOwner = runCli(
      ["auth", "platform", "add", "gateway-alpha", "--role", "gateway"],
      workspace,
      "platform-secret\nplatform-secret\n",
    );
    assert.equal(missingOwner.code, 1);
    assert.match(missingOwner.stderr, /auth platform add/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("themis-platform worker-fleet reclaim 缺少 --yes 会拒绝执行", () => {
  const workspace = createWorkspace();

  try {
    const result = runCli([
      "worker-fleet",
      "reclaim",
      "--platform",
      "http://127.0.0.1:3100",
      "--owner-principal",
      "principal-owner",
      "--token",
      "platform-token",
      "--node",
      "node-alpha",
    ], workspace);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /必须显式追加 --yes/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
