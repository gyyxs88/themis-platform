import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { buildPlatformRouteNotFoundErrorResponse } from "themis-contracts/managed-agent-platform-access";

export interface PlatformAppOptions {
  serviceName?: string;
}

export function createPlatformApp(options: PlatformAppOptions = {}): Server {
  const serviceName = options.serviceName ?? "themis-platform";

  return createServer((request, response) => {
    handlePlatformRequest(request, response, serviceName);
  });
}

function handlePlatformRequest(
  request: IncomingMessage,
  response: ServerResponse,
  serviceName: string,
): void {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (method === "GET" && url.pathname === "/") {
    return writeJson(response, 200, {
      ok: true,
      service: serviceName,
      message: "Themis Platform bootstrap server is running.",
    });
  }

  if (method === "GET" && url.pathname === "/api/health") {
    return writeJson(response, 200, {
      ok: true,
      service: serviceName,
    });
  }

  if (url.pathname.startsWith("/api/")) {
    return writeJson(response, 404, buildPlatformRouteNotFoundErrorResponse(url.pathname));
  }

  writeJson(response, 404, {
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${url.pathname}`,
    },
  });
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
