import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadProjectEnv } from "../config/project-env.js";
import {
  bootstrapMessage,
  resolvePlatformExecutionRuntimeRoot,
  resolvePlatformMainConfig,
  resolvePlatformRuntimeSnapshotFile,
} from "./platform-main.js";

test("resolvePlatformMainConfig 会给平台服务使用生产监听默认值", () => {
  const config = resolvePlatformMainConfig({});

  assert.deepEqual(config, {
    host: "0.0.0.0",
    port: 3100,
    serviceName: "themis-platform",
    schedulerIntervalMs: 5000,
  });
});

test("resolvePlatformMainConfig 会读取 THEMIS_HOST 和 THEMIS_PORT", () => {
  const config = resolvePlatformMainConfig({
    THEMIS_HOST: "192.168.31.212",
    THEMIS_PORT: "3201",
  });

  assert.equal(config.host, "192.168.31.212");
  assert.equal(config.port, 3201);
  assert.equal(config.schedulerIntervalMs, 5000);
  assert.match(
    bootstrapMessage(config),
    /Themis Platform server listening on http:\/\/192\.168\.31\.212:3201/,
  );
});

test("resolvePlatformMainConfig 会读取 THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS", () => {
  const config = resolvePlatformMainConfig({
    THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS: "15000",
  });

  assert.equal(config.schedulerIntervalMs, 15000);
});

test("resolvePlatformRuntimeSnapshotFile 会读取 THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE", () => {
  const filePath = resolvePlatformRuntimeSnapshotFile("/srv/themis-platform", {
    THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE: "infra/custom/runtime.json",
  });

  assert.equal(filePath, "/srv/themis-platform/infra/custom/runtime.json");
});

test("resolvePlatformExecutionRuntimeRoot 会读取 THEMIS_PLATFORM_EXECUTION_RUNTIME_ROOT", () => {
  const rootDirectory = resolvePlatformExecutionRuntimeRoot("/srv/themis-platform", {
    THEMIS_PLATFORM_EXECUTION_RUNTIME_ROOT: "infra/custom/runtime-runs",
  });

  assert.equal(rootDirectory, "/srv/themis-platform/infra/custom/runtime-runs");
});

test("loadProjectEnv 后 resolvePlatformMainConfig 会读取 .env.local", () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), "themis-platform-main-"));
  const previousHost = process.env.THEMIS_HOST;
  const previousPort = process.env.THEMIS_PORT;

  delete process.env.THEMIS_HOST;
  delete process.env.THEMIS_PORT;

  try {
    writeFileSync(
      join(workingDirectory, ".env.local"),
      "THEMIS_HOST=10.0.0.12\nTHEMIS_PORT=4123\n",
      "utf8",
    );

    loadProjectEnv(workingDirectory);
    const config = resolvePlatformMainConfig(process.env);

    assert.equal(config.host, "10.0.0.12");
    assert.equal(config.port, 4123);
    assert.equal(config.schedulerIntervalMs, 5000);
  } finally {
    if (typeof previousHost === "string") {
      process.env.THEMIS_HOST = previousHost;
    } else {
      delete process.env.THEMIS_HOST;
    }

    if (typeof previousPort === "string") {
      process.env.THEMIS_PORT = previousPort;
    } else {
      delete process.env.THEMIS_PORT;
    }

    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
