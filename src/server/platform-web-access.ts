import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildPlatformServiceAuthDeniedErrorResponse,
  buildPlatformServiceForbiddenErrorResponse,
  buildPlatformServiceOwnerMismatchErrorResponse,
  readPlatformServiceAuthorizationHeader,
} from "themis-contracts/managed-agent-platform-access";
import { type PlatformServiceRole, PlatformTokenStore } from "../cli/platform-token-store.js";
import { clearSessionCookie, readCookie, setSessionCookie, WEB_SESSION_COOKIE } from "./platform-cookies.js";

const DEFAULT_APP_DISPLAY_NAME = "Themis Platform";
const DEFAULT_WEB_LOGIN_TOKEN_LABEL = "platform-web";
const PLATFORM_SERVICE_AUTH_CONTEXT = Symbol("themis.platform-service-auth-context");
const DEFAULT_WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface WebAccessLoginPayload {
  token?: unknown;
}

interface PlatformWebSessionRecord {
  sessionId: string;
  tokenLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface PlatformServiceAuthContext {
  tokenId: string;
  tokenLabel: string;
  ownerPrincipalId: string;
  serviceRole: PlatformServiceRole;
}

export interface PlatformWebSessionSummary {
  sessionId: string;
  tokenLabel: string;
  expiresAt: string;
}

export interface PlatformWebAccessServiceOptions {
  workingDirectory?: string;
  webLoginSecret?: string;
  webLoginTokenLabel?: string;
  tokenStore?: PlatformTokenStore;
  now?: () => string;
  sessionTtlMs?: number;
}

export interface PlatformWebAccessRouteOptions {
  appDisplayName?: string;
}

export class PlatformWebAccessService {
  private readonly tokenStore: PlatformTokenStore;
  private readonly now: () => string;
  private readonly sessionTtlMs: number;
  private readonly webLoginSecret: string | null;
  private readonly webLoginTokenLabel: string;
  private readonly sessions = new Map<string, PlatformWebSessionRecord>();

  constructor(options: PlatformWebAccessServiceOptions = {}) {
    this.tokenStore = options.tokenStore ?? new PlatformTokenStore({
      workingDirectory: options.workingDirectory,
      now: options.now,
    });
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionTtlMs = Number.isFinite(options.sessionTtlMs)
      ? Math.max(60_000, Number(options.sessionTtlMs))
      : DEFAULT_WEB_SESSION_TTL_MS;
    this.webLoginSecret = normalizeOptionalText(options.webLoginSecret);
    this.webLoginTokenLabel = normalizeOptionalText(options.webLoginTokenLabel) ?? DEFAULT_WEB_LOGIN_TOKEN_LABEL;
  }

  hasConfiguredWebToken(): boolean {
    return Boolean(this.webLoginSecret);
  }

  authenticateWebLogin(input: { secret: string }): { ok: true; session: PlatformWebSessionSummary } | { ok: false } {
    if (!this.webLoginSecret || input.secret.trim() !== this.webLoginSecret) {
      return { ok: false };
    }

    const createdAt = this.now();
    const expiresAt = new Date(Date.parse(createdAt) + this.sessionTtlMs).toISOString();
    const session: PlatformWebSessionRecord = {
      sessionId: randomUUID(),
      tokenLabel: this.webLoginTokenLabel,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt,
    };
    this.sessions.set(session.sessionId, session);

    return {
      ok: true,
      session: {
        sessionId: session.sessionId,
        tokenLabel: session.tokenLabel,
        expiresAt: session.expiresAt,
      },
    };
  }

  readSession(sessionId: string | null | undefined): { ok: true; session: PlatformWebSessionSummary } | { ok: false } {
    const normalizedSessionId = normalizeOptionalText(sessionId);

    if (!normalizedSessionId) {
      return { ok: false };
    }

    const session = this.sessions.get(normalizedSessionId);

    if (!session) {
      return { ok: false };
    }

    const now = this.now();
    const nowTimestamp = Date.parse(now);
    const expiresAtTimestamp = Date.parse(session.expiresAt);

    if (Number.isFinite(nowTimestamp) && Number.isFinite(expiresAtTimestamp) && nowTimestamp >= expiresAtTimestamp) {
      this.sessions.delete(normalizedSessionId);
      return { ok: false };
    }

    session.lastSeenAt = now;
    this.sessions.set(session.sessionId, session);

    return {
      ok: true,
      session: {
        sessionId: session.sessionId,
        tokenLabel: session.tokenLabel,
        expiresAt: session.expiresAt,
      },
    };
  }

  revokeSession(sessionId: string | null | undefined): void {
    const normalizedSessionId = normalizeOptionalText(sessionId);
    if (!normalizedSessionId) {
      return;
    }

    this.sessions.delete(normalizedSessionId);
  }

  authenticatePlatformServiceToken(input: { secret: string }): { ok: true; token: PlatformServiceAuthContext } | { ok: false } {
    const token = this.tokenStore.authenticateToken({
      secret: input.secret,
    });

    if (!token) {
      return { ok: false };
    }

    return {
      ok: true,
      token: {
        tokenId: token.tokenId,
        tokenLabel: token.label,
        ownerPrincipalId: token.ownerPrincipalId,
        serviceRole: token.serviceRole,
      },
    };
  }
}

export function createPlatformWebAccessService(options: PlatformWebAccessServiceOptions = {}): PlatformWebAccessService {
  return new PlatformWebAccessService(options);
}

export async function maybeHandlePlatformWebAccessRoute(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlatformWebAccessService,
  options: PlatformWebAccessRouteOptions = {},
): Promise<boolean> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const method = request.method ?? "GET";
  const ui = resolveWebAccessRouteOptions(options);

  if ((method === "GET" || method === "HEAD") && url.pathname === "/login") {
    const html = service.hasConfiguredWebToken()
      ? createLoginPageHtml(ui.appDisplayName)
      : createBootstrapHintHtml(ui.appDisplayName);
    writeHtml(response, 200, html, method === "HEAD");
    return true;
  }

  if ((method === "GET" || method === "HEAD") && url.pathname === "/api/web-auth/status") {
    const sessionResult = service.readSession(readCookie(request, WEB_SESSION_COOKIE));

    if (sessionResult.ok) {
      writeJson(response, 200, {
        authenticated: true,
        tokenLabel: sessionResult.session.tokenLabel,
        expiresAt: sessionResult.session.expiresAt,
      });
      return true;
    }

    clearSessionCookie(response);
    writeJson(response, 200, {
      authenticated: false,
      tokenLabel: "",
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/api/web-auth/login") {
    const payload = await readJsonBody<WebAccessLoginPayload>(request);
    const secret = normalizeOptionalText(payload.token) ?? "";

    if (!service.hasConfiguredWebToken()) {
      writeJson(response, 409, {
        error: {
          code: "WEB_ACCESS_NOT_CONFIGURED",
          message: "当前还没有可用的 Web 访问口令，请先配置 THEMIS_PLATFORM_WEB_ACCESS_TOKEN。",
        },
      });
      return true;
    }

    const result = service.authenticateWebLogin({ secret });

    if (!result.ok) {
      clearSessionCookie(response);
      writeJson(response, 401, {
        error: {
          code: "WEB_ACCESS_DENIED",
          message: `口令错误，无法登录 ${ui.appDisplayName}。`,
        },
      });
      return true;
    }

    setSessionCookie(response, result.session.sessionId, result.session.expiresAt);
    writeJson(response, 200, {
      ok: true,
      tokenLabel: result.session.tokenLabel,
      expiresAt: result.session.expiresAt,
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/api/web-auth/logout") {
    service.revokeSession(readCookie(request, WEB_SESSION_COOKIE));
    clearSessionCookie(response);
    writeJson(response, 200, { ok: true });
    return true;
  }

  return false;
}

export function requirePlatformWebAccess(
  request: IncomingMessage,
  response: ServerResponse,
  service: PlatformWebAccessService,
  options: PlatformWebAccessRouteOptions = {},
): boolean {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const method = request.method ?? "GET";
  const ui = resolveWebAccessRouteOptions(options);

  if (isPublicWebAccessRoute(method, url.pathname)) {
    return true;
  }

  const platformAuth = authenticatePlatformServiceRequest(request, service, url.pathname);

  if (platformAuth.status === "authorized") {
    return true;
  }

  if (platformAuth.status === "denied") {
    clearSessionCookie(response);
    writeJson(response, platformAuth.httpStatus, platformAuth.body);
    return false;
  }

  const sessionResult = service.readSession(readCookie(request, WEB_SESSION_COOKIE));

  if (sessionResult.ok) {
    return true;
  }

  clearSessionCookie(response);

  if (url.pathname.startsWith("/api/")) {
    writeJson(response, 401, {
      error: {
        code: "WEB_ACCESS_REQUIRED",
        message: `请先登录 ${ui.appDisplayName}。`,
      },
    });
    return false;
  }

  writeRedirect(response, "/login");
  return false;
}

export function getPlatformServiceAuthContext(request: IncomingMessage): PlatformServiceAuthContext | null {
  const context = (request as IncomingMessage & {
    [PLATFORM_SERVICE_AUTH_CONTEXT]?: PlatformServiceAuthContext;
  })[PLATFORM_SERVICE_AUTH_CONTEXT];

  return context ?? null;
}

export function buildPlatformServiceOwnerMismatchBody() {
  return buildPlatformServiceOwnerMismatchErrorResponse();
}

function authenticatePlatformServiceRequest(
  request: IncomingMessage,
  service: PlatformWebAccessService,
  pathname: string,
): {
  status: "not_applicable" | "authorized" | "denied";
  httpStatus: number;
  body: unknown;
} {
  if (!pathname.startsWith("/api/platform/")) {
    return {
      status: "not_applicable",
      httpStatus: 0,
      body: null,
    };
  }

  const secret = readPlatformServiceAuthorizationHeader(request.headers.authorization);

  if (!secret) {
    return {
      status: "not_applicable",
      httpStatus: 0,
      body: null,
    };
  }

  const auth = service.authenticatePlatformServiceToken({ secret });

  if (!auth.ok) {
    return {
      status: "denied",
      httpStatus: 401,
      body: buildPlatformServiceAuthDeniedErrorResponse(),
    };
  }

  if (!isPlatformPathAllowedForRole(pathname, auth.token.serviceRole)) {
    return {
      status: "denied",
      httpStatus: 403,
      body: buildPlatformServiceForbiddenErrorResponse(),
    };
  }

  (request as IncomingMessage & {
    [PLATFORM_SERVICE_AUTH_CONTEXT]?: PlatformServiceAuthContext;
  })[PLATFORM_SERVICE_AUTH_CONTEXT] = auth.token;

  return {
    status: "authorized",
    httpStatus: 200,
    body: null,
  };
}

function isPublicWebAccessRoute(method: string, pathname: string): boolean {
  if ((method === "GET" || method === "HEAD") && (pathname === "/login" || pathname === "/api/web-auth/status")) {
    return true;
  }

  if (method === "POST" && (pathname === "/api/web-auth/login" || pathname === "/api/web-auth/logout")) {
    return true;
  }

  return false;
}

function isPlatformPathAllowedForRole(pathname: string, role: PlatformServiceRole): boolean {
  if (role === "gateway") {
    return pathname.startsWith("/api/platform/agents/")
      || pathname.startsWith("/api/platform/meeting-rooms/")
      || pathname.startsWith("/api/platform/work-items/")
      || pathname.startsWith("/api/platform/runs/")
      || pathname.startsWith("/api/platform/projects/")
      || isGatewayNodeManagementPath(pathname);
  }

  return pathname.startsWith("/api/platform/nodes/")
    || pathname.startsWith("/api/platform/worker/");
}

function isGatewayNodeManagementPath(pathname: string): boolean {
  return pathname === "/api/platform/nodes/list"
    || pathname === "/api/platform/nodes/detail"
    || pathname === "/api/platform/nodes/drain"
    || pathname === "/api/platform/nodes/offline"
    || pathname === "/api/platform/nodes/reclaim"
    || pathname === "/api/platform/nodes/delete";
}

function resolveWebAccessRouteOptions(options: PlatformWebAccessRouteOptions): { appDisplayName: string } {
  return {
    appDisplayName: options.appDisplayName?.trim() || DEFAULT_APP_DISPLAY_NAME,
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let body = "";

  for await (const chunk of request) {
    body += chunk.toString();
  }

  return JSON.parse(body || "{}") as T;
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function writeHtml(response: ServerResponse, statusCode: number, body: string, headOnly: boolean): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(headOnly ? undefined : body);
}

function writeRedirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader("Location", location);
  response.end();
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function createBootstrapHintHtml(appDisplayName: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appDisplayName} 初始化</title>
  </head>
  <body>
    <main>
      <h1>${appDisplayName} 还未初始化访问口令</h1>
      <p>当前还没有可用的 Web 访问口令。</p>
      <p>请先配置环境变量 <code>THEMIS_PLATFORM_WEB_ACCESS_TOKEN</code>，然后再回来登录。</p>
    </main>
  </body>
</html>`;
}

function createLoginPageHtml(appDisplayName: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appDisplayName} 登录</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f6f7fb;
        color: #111827;
      }

      main {
        width: min(100%, 420px);
        box-sizing: border-box;
        padding: 32px 24px;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 32px;
        line-height: 1.15;
      }

      p {
        margin: 0 0 20px;
        font-size: 16px;
        line-height: 1.6;
        color: #4b5563;
      }

      form {
        display: grid;
        gap: 12px;
      }

      label {
        font-size: 14px;
        font-weight: 600;
      }

      input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border: 1px solid #d1d5db;
        border-radius: 10px;
        font-size: 16px;
      }

      button {
        padding: 12px 14px;
        border: 0;
        border-radius: 10px;
        background: #111827;
        color: #ffffff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }

      button[disabled] {
        opacity: 0.7;
        cursor: wait;
      }

      .status {
        min-height: 24px;
        margin-top: 12px;
        font-size: 14px;
        line-height: 1.5;
      }

      .status[data-tone="error"] {
        color: #b91c1c;
      }

      .status[data-tone="success"] {
        color: #047857;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${appDisplayName} 登录</h1>
      <p>请通过平台 Web 访问口令登录。</p>
      <form id="platform-web-login-form">
        <label for="platform-web-token">访问口令</label>
        <input
          id="platform-web-token"
          name="token"
          type="password"
          autocomplete="current-password"
          placeholder="请输入平台 Web 访问口令"
          required
          autofocus
        />
        <button id="platform-web-submit" type="submit">登录</button>
      </form>
      <div id="platform-web-login-status" class="status" aria-live="polite"></div>
    </main>
    <script>
      const form = document.getElementById("platform-web-login-form");
      const input = document.getElementById("platform-web-token");
      const submit = document.getElementById("platform-web-submit");
      const status = document.getElementById("platform-web-login-status");

      const setStatus = (message, tone = "") => {
        status.textContent = message;
        if (tone) {
          status.dataset.tone = tone;
          return;
        }

        delete status.dataset.tone;
      };

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const token = input.value.trim();

        if (!token) {
          setStatus("请输入访问口令。", "error");
          input.focus();
          return;
        }

        submit.disabled = true;
        setStatus("正在登录...", "success");

        try {
          const response = await fetch("/api/web-auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
          });
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            const message = payload?.error?.message || "登录失败，请稍后重试。";
            setStatus(message, "error");
            submit.disabled = false;
            return;
          }

          setStatus("登录成功，正在进入平台...", "success");
          window.location.assign("/");
        } catch (error) {
          const message = error instanceof Error ? error.message : "登录失败，请检查网络后重试。";
          setStatus(message, "error");
          submit.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}
