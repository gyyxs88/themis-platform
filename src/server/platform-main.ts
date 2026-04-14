import { networkInterfaces } from "node:os";
import { loadProjectEnv } from "../config/project-env.js";
import { createPlatformApp } from "./platform-app.js";
import { createPlatformWebAccessService } from "./platform-web-access.js";

const DEFAULT_PLATFORM_HOST = "0.0.0.0";
const DEFAULT_PLATFORM_PORT = 3100;
const DEFAULT_PLATFORM_SERVICE_NAME = "themis-platform";

export interface PlatformMainConfig {
  host: string;
  port: number;
  serviceName: string;
}

export function resolvePlatformMainConfig(env: NodeJS.ProcessEnv = process.env): PlatformMainConfig {
  const host = normalizeHost(env.THEMIS_HOST);
  const port = normalizePort(env.THEMIS_PORT ?? env.PORT, DEFAULT_PLATFORM_PORT);
  const serviceName = normalizeServiceName(env.THEMIS_PLATFORM_SERVICE_NAME);

  return {
    host,
    port,
    serviceName,
  };
}

export function bootstrapMessage(config: PlatformMainConfig): string {
  return `Themis Platform server listening on http://${config.host}:${config.port}`;
}

export function resolveListenAddresses(host: string, port: number): string[] {
  const addresses = new Set<string>();
  addresses.add(`http://localhost:${port}`);

  if (host !== "0.0.0.0") {
    addresses.add(`http://${host}:${port}`);
    return [...addresses];
  }

  const interfaces = networkInterfaces();

  for (const values of Object.values(interfaces)) {
    for (const entry of values ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(`http://${entry.address}:${port}`);
      }
    }
  }

  return [...addresses];
}

export function createPlatformServerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const config = resolvePlatformMainConfig(env);
  const server = createPlatformApp({
    serviceName: config.serviceName,
    appDisplayName: "Themis Platform",
    accessMode: "protected",
    authService: createPlatformWebAccessService({
      webLoginSecret: env.THEMIS_PLATFORM_WEB_ACCESS_TOKEN,
      webLoginTokenLabel: env.THEMIS_PLATFORM_WEB_ACCESS_TOKEN_LABEL,
    }),
  });

  return {
    config,
    server,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadProjectEnv();
  const { config, server } = createPlatformServerFromEnv(process.env);
  server.listen(config.port, config.host, () => {
    console.log(`[themis/platform] ${bootstrapMessage(config)}`);

    for (const address of resolveListenAddresses(config.host, config.port)) {
      console.log(`[themis/platform] Open ${address}`);
    }
  });
}

function normalizePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHost(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : DEFAULT_PLATFORM_HOST;
}

function normalizeServiceName(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : DEFAULT_PLATFORM_SERVICE_NAME;
}
