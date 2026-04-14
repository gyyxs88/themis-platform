import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface PlatformAsset {
  body: string;
  contentType: string;
}

const PLATFORM_ASSET_SPEC = {
  "/": {
    relativePath: "../../apps/platform/index.html",
    contentType: "text/html; charset=utf-8",
  },
  "/platform.js": {
    relativePath: "../../apps/platform/platform.js",
    contentType: "text/javascript; charset=utf-8",
  },
  "/platform.css": {
    relativePath: "../../apps/platform/platform.css",
    contentType: "text/css; charset=utf-8",
  },
} as const;

const platformAssetCache = new Map<string, PlatformAsset>();

export function readPlatformAsset(pathname: string): PlatformAsset | null {
  const spec = PLATFORM_ASSET_SPEC[pathname as keyof typeof PLATFORM_ASSET_SPEC];

  if (!spec) {
    return null;
  }

  const cached = platformAssetCache.get(pathname);

  if (cached) {
    return cached;
  }

  const body = readFileSync(fileURLToPath(new URL(spec.relativePath, import.meta.url)), "utf8");
  const asset = {
    body,
    contentType: spec.contentType,
  };
  platformAssetCache.set(pathname, asset);
  return asset;
}
