import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PlatformTokenStore } from "../cli/platform-token-store.js";
import { createPlatformApp } from "./platform-app.js";
import { createPlatformWebAccessService } from "./platform-web-access.js";

test("protected platform app 会拦截未登录 API，并允许 Web 口令登录后访问", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-auth-"));
  const authService = createPlatformWebAccessService({
    workingDirectory,
    webLoginSecret: "platform-web-secret",
    webLoginTokenLabel: "platform-web",
    now: () => "2026-04-14T10:00:00.000Z",
  });
  const server = createPlatformApp({
    accessMode: "protected",
    authService,
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const denied = await fetch(`${baseUrl}/api/platform/nodes/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), {
      error: {
        code: "WEB_ACCESS_REQUIRED",
        message: "请先登录 Themis Platform。",
      },
    });

    const loginPage = await fetch(`${baseUrl}/login`);
    assert.equal(loginPage.status, 200);
    const loginPageHtml = await loginPage.text();
    assert.match(loginPageHtml, /<form id="platform-web-login-form">/);
    assert.match(loginPageHtml, /type="password"/);
    assert.match(loginPageHtml, /请输入平台 Web 访问口令/);

    const login = await fetch(`${baseUrl}/api/web-auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: "platform-web-secret",
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert(cookie);

    const status = await fetch(`${baseUrl}/api/web-auth/status`, {
      headers: {
        Cookie: cookie,
      },
    });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      authenticated: true,
      tokenLabel: "platform-web",
      expiresAt: "2026-05-14T10:00:00.000Z",
    });

    const allowed = await fetch(`${baseUrl}/api/platform/nodes/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), {
      nodes: [],
    });
  } finally {
    server.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("protected platform app 会对 Worker Bearer token 做路由权限和 owner 校验", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-auth-"));
  const tokenStore = new PlatformTokenStore({
    workingDirectory,
    now: () => "2026-04-14T10:10:00.000Z",
  });
  tokenStore.createToken({
    label: "worker-alpha",
    secret: "worker-alpha-secret",
    ownerPrincipalId: "principal-platform-owner",
    serviceRole: "worker",
  });
  const authService = createPlatformWebAccessService({
    workingDirectory,
    now: () => "2026-04-14T10:10:00.000Z",
  });
  const server = createPlatformApp({
    accessMode: "protected",
    authService,
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const allowed = await fetch(`${baseUrl}/api/platform/nodes/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer worker-alpha-secret",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), {
      nodes: [],
    });

    const ownerMismatch = await fetch(`${baseUrl}/api/platform/nodes/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer worker-alpha-secret",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-other-owner",
      }),
    });
    assert.equal(ownerMismatch.status, 403);
    assert.deepEqual(await ownerMismatch.json(), {
      error: {
        code: "PLATFORM_SERVICE_OWNER_MISMATCH",
        message: "平台服务令牌与 ownerPrincipalId 不匹配。",
      },
    });

    const forbidden = await fetch(`${baseUrl}/api/platform/agents/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer worker-alpha-secret",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(forbidden.status, 403);
    assert.deepEqual(await forbidden.json(), {
      error: {
        code: "PLATFORM_SERVICE_FORBIDDEN",
        message: "当前平台服务令牌无权访问该接口。",
      },
    });
  } finally {
    server.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test("protected platform app 会允许 gateway Bearer token 访问节点观察治理，但拒绝节点运行态接口", async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-auth-"));
  const tokenStore = new PlatformTokenStore({
    workingDirectory,
    now: () => "2026-04-21T12:30:00.000Z",
  });
  tokenStore.createToken({
    label: "gateway-main",
    secret: "gateway-main-secret",
    ownerPrincipalId: "principal-platform-owner",
    serviceRole: "gateway",
  });
  const authService = createPlatformWebAccessService({
    workingDirectory,
    now: () => "2026-04-21T12:30:00.000Z",
  });
  const server = createPlatformApp({
    accessMode: "protected",
    authService,
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const allowed = await fetch(`${baseUrl}/api/platform/nodes/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gateway-main-secret",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
      }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), {
      nodes: [],
    });

    const registerForbidden = await fetch(`${baseUrl}/api/platform/nodes/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gateway-main-secret",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        node: {
          displayName: "gateway-should-not-register",
          slotCapacity: 1,
        },
      }),
    });
    assert.equal(registerForbidden.status, 403);
    assert.deepEqual(await registerForbidden.json(), {
      error: {
        code: "PLATFORM_SERVICE_FORBIDDEN",
        message: "当前平台服务令牌无权访问该接口。",
      },
    });

    const workerRunForbidden = await fetch(`${baseUrl}/api/platform/worker/runs/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gateway-main-secret",
      },
      body: JSON.stringify({
        ownerPrincipalId: "principal-platform-owner",
        nodeId: "node-alpha",
      }),
    });
    assert.equal(workerRunForbidden.status, 403);
    assert.deepEqual(await workerRunForbidden.json(), {
      error: {
        code: "PLATFORM_SERVICE_FORBIDDEN",
        message: "当前平台服务令牌无权访问该接口。",
      },
    });
  } finally {
    server.close();
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
