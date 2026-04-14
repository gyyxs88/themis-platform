import { WorkerFleetDiagnosticsService, type WorkerFleetDiagnosticsSummary } from "../diagnostics/worker-fleet-diagnostics.js";
import { WorkerFleetGovernanceService } from "../diagnostics/worker-fleet-governance.js";
import { PlatformTokenStore } from "./platform-token-store.js";
import { readHiddenLinePair } from "./platform-secret-input.js";

const DEFAULT_PLATFORM_LAUNCHER_NAME = "themis-platform";
type PlatformServiceRole = "gateway" | "worker";

export interface PlatformCliOptions {
  launcherName?: string;
  workingDirectory?: string;
}

export async function runCli(args: string[], options: PlatformCliOptions = {}): Promise<void> {
  const launcherName = options.launcherName ?? DEFAULT_PLATFORM_LAUNCHER_NAME;
  const [command = "help", subcommand, ...rest] = args;

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp(launcherName);
      return;
    case "auth":
      if (subcommand?.trim().toLowerCase() !== "platform") {
        throw new Error(`${launcherName} 当前只承载 auth platform。`);
      }

      await handleAuthPlatform(rest, options);
      return;
    case "doctor":
      if (subcommand?.trim().toLowerCase() !== "worker-fleet") {
        throw new Error(`${launcherName} 当前只承载 doctor worker-fleet。`);
      }

      await handleDoctorWorkerFleet(rest);
      return;
    case "worker-fleet":
      await handleWorkerFleet(subcommand, rest);
      return;
    default:
      throw new Error(`${launcherName} 当前仅支持 auth platform / doctor worker-fleet / worker-fleet / help。`);
  }
}

export function reportCliFailure(error: unknown): void {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Themis Platform CLI 执行失败。";
  console.error(message);
  process.exitCode = 1;
}

async function handleAuthPlatform(args: string[], options: PlatformCliOptions): Promise<void> {
  const [action, ...rest] = args;
  const valueOptions = ["--role", "--owner-principal"];
  const unknownOptions = collectUnknownOptions(rest, valueOptions, []).filter((arg) => arg.startsWith("-"));

  if (unknownOptions.length > 0) {
    throw new Error(`未知参数：${unknownOptions.join(", ")}`);
  }

  switch (action) {
    case "list": {
      const positionals = collectPositionalArgs(rest, valueOptions, []);

      if (positionals.length > 0 || readOptionValue(rest, "--role") || readOptionValue(rest, "--owner-principal")) {
        throw new Error("用法：themis-platform auth platform list");
      }

      handleAuthPlatformList(options);
      return;
    }
    case "add": {
      const positionals = collectPositionalArgs(rest, valueOptions, []);
      const role = normalizePlatformServiceRole(readOptionValue(rest, "--role"));
      const ownerPrincipalId = readOptionValue(rest, "--owner-principal");

      if (positionals.length !== 1 || !role || !ownerPrincipalId) {
        throw new Error("用法：themis-platform auth platform add <label> --role <gateway|worker> --owner-principal <principalId>");
      }

      await handleAuthPlatformAdd(positionals[0]!, role, ownerPrincipalId, options);
      return;
    }
    case "remove": {
      const positionals = collectPositionalArgs(rest, valueOptions, []);

      if (positionals.length !== 1 || readOptionValue(rest, "--role") || readOptionValue(rest, "--owner-principal")) {
        throw new Error("用法：themis-platform auth platform remove <label>");
      }

      handleAuthPlatformRemove(positionals[0]!, options);
      return;
    }
    case "rename": {
      const positionals = collectPositionalArgs(rest, valueOptions, []);

      if (positionals.length !== 2 || readOptionValue(rest, "--role") || readOptionValue(rest, "--owner-principal")) {
        throw new Error("用法：themis-platform auth platform rename <old-label> <new-label>");
      }

      handleAuthPlatformRename(positionals[0]!, positionals[1]!, options);
      return;
    }
    default:
      throw new Error("auth platform 子命令仅支持 list / add / remove / rename。");
  }
}

async function handleDoctorWorkerFleet(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "用法：themis-platform doctor worker-fleet --platform <baseUrl> --owner-principal <principalId> --token <platformToken> [--organization <organizationId>] [--json] [--fail-on <error|warning>]",
    );
    console.log("说明：批量读取平台节点列表与 detail，输出当前 Worker Node 集群的值守摘要与建议动作。");
    return;
  }

  const valueOptions = ["--platform", "--owner-principal", "--token", "--organization", "--fail-on"];
  const flagOptions = ["--json"];
  const unknownArgs = collectUnknownOptions(args, valueOptions, flagOptions);

  if (unknownArgs.length > 0) {
    throw new Error(`doctor worker-fleet 不支持这些参数：${unknownArgs.join(", ")}`);
  }

  const platformBaseUrl = readOptionValue(args, "--platform");
  const ownerPrincipalId = readOptionValue(args, "--owner-principal");
  const webAccessToken = readOptionValue(args, "--token");

  if (!platformBaseUrl || !ownerPrincipalId || !webAccessToken) {
    throw new Error(
      "用法：themis-platform doctor worker-fleet --platform <baseUrl> --owner-principal <principalId> --token <platformToken> [--organization <organizationId>] [--json] [--fail-on <error|warning>]",
    );
  }

  const failOnRaw = readOptionValue(args, "--fail-on");
  const failOn = normalizeDoctorFailOn(failOnRaw);

  if (failOnRaw && !failOn) {
    throw new Error("doctor worker-fleet --fail-on 仅支持 error / warning。");
  }

  const diagnostics = new WorkerFleetDiagnosticsService();
  const summary = await diagnostics.readSummary({
    platformBaseUrl,
    ownerPrincipalId,
    webAccessToken,
    organizationId: readOptionValue(args, "--organization"),
  });

  if (args.includes("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printWorkerFleetSummary(summary);
  }

  if (shouldFailWorkerFleetDoctor(summary, failOn)) {
    process.exitCode = 1;
  }
}

async function handleWorkerFleet(subcommand: string | undefined, args: string[]): Promise<void> {
  const action = subcommand?.trim().toLowerCase();

  if (action !== "drain" && action !== "offline" && action !== "reclaim") {
    throw new Error(
      "用法：themis-platform worker-fleet <drain|offline|reclaim> --platform <baseUrl> --owner-principal <principalId> --token <platformToken> --node <nodeId> [--node <nodeId> ...] [--failure-code <code>] [--failure-message <message>] --yes",
    );
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "用法：themis-platform worker-fleet <drain|offline|reclaim> --platform <baseUrl> --owner-principal <principalId> --token <platformToken> --node <nodeId> [--node <nodeId> ...] [--failure-code <code>] [--failure-message <message>] --yes",
    );
    console.log("说明：面向值班的 Worker Node 平台治理入口；支持对多个 nodeId 顺序执行 drain / offline / reclaim。");
    return;
  }

  const valueOptions = ["--platform", "--owner-principal", "--token", "--node", "--failure-code", "--failure-message"];
  const flagOptions = ["--yes"];
  const unknownArgs = collectUnknownOptions(args, valueOptions, flagOptions);

  if (unknownArgs.length > 0) {
    throw new Error(`worker-fleet ${action} 不支持这些参数：${unknownArgs.join(", ")}`);
  }

  const platformBaseUrl = readOptionValue(args, "--platform");
  const ownerPrincipalId = readOptionValue(args, "--owner-principal");
  const webAccessToken = readOptionValue(args, "--token");
  const nodeIds = readOptionValues(args, "--node");

  if (!platformBaseUrl || !ownerPrincipalId || !webAccessToken || nodeIds.length === 0) {
    throw new Error(
      "用法：themis-platform worker-fleet <drain|offline|reclaim> --platform <baseUrl> --owner-principal <principalId> --token <platformToken> --node <nodeId> [--node <nodeId> ...] [--failure-code <code>] [--failure-message <message>] --yes",
    );
  }

  if (!args.includes("--yes")) {
    throw new Error(`worker-fleet ${action} 是治理动作，必须显式追加 --yes。`);
  }

  if ((action === "drain" || action === "offline")
    && (readOptionValue(args, "--failure-code") || readOptionValue(args, "--failure-message"))) {
    throw new Error(`worker-fleet ${action} 不支持 --failure-code / --failure-message；它们只适用于 reclaim。`);
  }

  const service = new WorkerFleetGovernanceService();
  const summary = await service.execute({
    platformBaseUrl,
    ownerPrincipalId,
    webAccessToken,
    action,
    nodeIds,
    ...(action === "reclaim" && readOptionValue(args, "--failure-code")
      ? { failureCode: readOptionValue(args, "--failure-code") }
      : {}),
    ...(action === "reclaim" && readOptionValue(args, "--failure-message")
      ? { failureMessage: readOptionValue(args, "--failure-message") }
      : {}),
  });

  console.log(`Themis Worker Fleet 治理 - ${summary.action}`);
  console.log(`platform.baseUrl：${summary.platformBaseUrl}`);
  console.log(`requestedNodeCount：${summary.requestedNodeIds.length}`);
  console.log(`requestedNodeIds：${summary.requestedNodeIds.join(", ")}`);
  console.log(`result.successCount：${summary.successCount}`);
  console.log(`result.failureCount：${summary.failureCount}`);

  for (const result of summary.results) {
    console.log(`node[${result.nodeId}]：${result.outcome}`);
    if (result.node) {
      console.log(`  status：${result.node.status}`);
      console.log(`  slots：${result.node.slotAvailable}/${result.node.slotCapacity}`);
    }
    if (result.reclaim) {
      console.log(`  reclaimed.activeLeaseCount：${result.reclaim.summary.activeLeaseCount}`);
      console.log(`  reclaimed.reclaimedRunCount：${result.reclaim.summary.reclaimedRunCount}`);
      console.log(`  reclaimed.requeuedWorkItemCount：${result.reclaim.summary.requeuedWorkItemCount}`);
    }
    if (result.errorMessage) {
      console.log(`  error：${result.errorMessage}`);
    }
  }

  if (summary.failureCount > 0) {
    process.exitCode = 1;
  }
}

function handleAuthPlatformList(options: PlatformCliOptions): void {
  const store = createPlatformTokenStore(options);
  const tokens = store.listTokens();

  console.log("Themis 平台服务令牌");
  console.log("");

  if (tokens.length === 0) {
    console.log("暂无平台服务令牌。");
    return;
  }

  for (const token of tokens) {
    console.log(`- label：${token.label}`);
    console.log(`  状态：${token.revokedAt ? "revoked" : "active"}`);
    console.log(`  role：${token.serviceRole}`);
    console.log(`  ownerPrincipalId：${token.ownerPrincipalId}`);
    console.log(`  最近使用：${token.lastUsedAt ?? "未使用"}`);
    console.log("");
  }
}

async function handleAuthPlatformAdd(
  label: string,
  role: PlatformServiceRole,
  ownerPrincipalId: string,
  options: PlatformCliOptions,
): Promise<void> {
  const store = createPlatformTokenStore(options);
  const secret = await readHiddenLinePair(`请输入 ${label} 的平台服务令牌：`, "请再次输入平台服务令牌：");
  const created = store.createToken({
    label,
    secret,
    ownerPrincipalId,
    serviceRole: role,
  });

  console.log(`已添加平台服务令牌：${created.label}`);
  console.log(`- tokenId：${created.tokenId}`);
  console.log(`- role：${created.serviceRole}`);
  console.log(`- ownerPrincipalId：${created.ownerPrincipalId}`);
}

function handleAuthPlatformRemove(label: string, options: PlatformCliOptions): void {
  const store = createPlatformTokenStore(options);
  const revoked = store.revokeTokenByLabel({ label });

  console.log(`已移除平台服务令牌：${revoked.label}`);
  console.log(`- tokenId：${revoked.tokenId}`);
  console.log(`- role：${revoked.serviceRole}`);
  console.log(`- ownerPrincipalId：${revoked.ownerPrincipalId}`);
  console.log(`- 状态：${revoked.revokedAt ? "revoked" : "active"}`);
}

function handleAuthPlatformRename(oldLabel: string, newLabel: string, options: PlatformCliOptions): void {
  const store = createPlatformTokenStore(options);
  const token = store.listTokens().find((item) => item.label === oldLabel && !item.revokedAt);

  if (!token) {
    throw new Error(`未找到处于 active 状态的平台服务令牌：${oldLabel}`);
  }

  const renamed = store.renameToken({
    tokenId: token.tokenId,
    label: newLabel,
  });

  console.log(`已重命名平台服务令牌：${oldLabel} -> ${renamed.label}`);
  console.log(`- tokenId：${renamed.tokenId}`);
  console.log(`- role：${renamed.serviceRole}`);
  console.log(`- ownerPrincipalId：${renamed.ownerPrincipalId}`);
}

function createPlatformTokenStore(options: PlatformCliOptions): PlatformTokenStore {
  return new PlatformTokenStore({
    workingDirectory: options.workingDirectory ?? process.cwd(),
  });
}

function printHelp(launcherName: string): void {
  console.log("Themis Platform CLI");
  console.log("");
  console.log("可用命令：");
  console.log(`- ./${launcherName} help`);
  console.log(`- ./${launcherName} auth platform list`);
  console.log(`- ./${launcherName} auth platform add <label> --role <gateway|worker> --owner-principal <principalId>`);
  console.log(`- ./${launcherName} auth platform remove <label>`);
  console.log(`- ./${launcherName} auth platform rename <old-label> <new-label>`);
  console.log(`- ./${launcherName} doctor worker-fleet --platform <baseUrl> --owner-principal <principalId> --token <platformToken>`);
  console.log(`- ./${launcherName} worker-fleet <drain|offline|reclaim> --platform <baseUrl> --owner-principal <principalId> --token <platformToken> --node <nodeId> [--node <nodeId> ...] --yes`);
}

function printWorkerFleetSummary(summary: WorkerFleetDiagnosticsSummary): void {
  console.log("Themis 诊断 - worker-fleet");
  console.log(`platform.baseUrl：${summary.platformBaseUrl}`);
  console.log(`platform.organizationId：${summary.organizationId ?? "<none>"}`);
  console.log(`nodeCount：${summary.nodeCount}`);
  console.log(`status.online：${summary.counts.online}`);
  console.log(`status.draining：${summary.counts.draining}`);
  console.log(`status.offline：${summary.counts.offline}`);
  console.log(`heartbeat.stale：${summary.counts.stale}`);
  console.log(`heartbeat.expired：${summary.counts.expired}`);
  console.log(`attention.errorCount：${summary.counts.errorCount}`);
  console.log(`attention.warningCount：${summary.counts.warningCount}`);

  for (const node of summary.nodes) {
    console.log(`node[${node.node.displayName}|${node.node.nodeId}]：${node.node.status}`);
    console.log(`  slots：${node.node.slotAvailable}/${node.node.slotCapacity}`);
    console.log(
      `  heartbeat：${node.heartbeatFreshness} (age=${formatOptionalSeconds(node.heartbeatAgeSeconds)}, ttl=${node.node.heartbeatTtlSeconds ?? 0}s, remaining=${formatOptionalSeconds(node.heartbeatRemainingSeconds)})`,
    );
    console.log(
      `  leases：active=${node.leaseSummary?.activeCount ?? "<unknown>"}, revoked=${node.leaseSummary?.revokedCount ?? "<unknown>"}, total=${node.leaseSummary?.totalCount ?? "<unknown>"}`,
    );
    if (node.detailError) {
      console.log(`  detailError：${node.detailError}`);
    }
    if (node.attention) {
      console.log(`  attention：${node.attention.severity} - ${node.attention.summary}`);
      console.log(`  nextStep：${node.attention.recommendedAction}`);
    }
  }

  console.log("问题判断");
  console.log(`主诊断：${summary.primaryDiagnosis.title}`);
  console.log(`诊断摘要：${summary.primaryDiagnosis.summary}`);
  console.log("建议动作：");
  for (const [index, step] of summary.recommendedNextSteps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
}

function formatOptionalSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "<unknown>";
  }

  return `${value}s`;
}

function normalizeDoctorFailOn(value: string | null): "error" | "warning" | null {
  if (value === "error" || value === "warning") {
    return value;
  }

  return null;
}

function shouldFailWorkerFleetDoctor(
  summary: {
    counts: {
      errorCount: number;
      warningCount: number;
    };
  },
  failOn: "error" | "warning" | null,
): boolean {
  if (failOn === "error") {
    return summary.counts.errorCount > 0;
  }

  if (failOn === "warning") {
    return summary.counts.errorCount > 0 || summary.counts.warningCount > 0;
  }

  return false;
}

function normalizePlatformServiceRole(value: string | null): PlatformServiceRole | null {
  if (value === "gateway" || value === "worker") {
    return value;
  }

  return null;
}

function readOptionValue(args: string[], key: string): string | null {
  const index = args.indexOf(key);

  if (index < 0) {
    return null;
  }

  const value = args[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionValues(args: string[], key: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== key) {
      continue;
    }

    const value = args[index + 1];

    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    }
  }

  return [...new Set(values)];
}

function collectPositionalArgs(args: string[], valueOptions: string[], flagOptions: string[]): string[] {
  const valueOptionSet = new Set(valueOptions);
  const flagOptionSet = new Set(flagOptions);
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (!value) {
      continue;
    }

    if (valueOptionSet.has(value)) {
      index += 1;
      continue;
    }

    if (flagOptionSet.has(value)) {
      continue;
    }

    if (!value.startsWith("-")) {
      positionals.push(value);
    }
  }

  return positionals;
}

function collectUnknownOptions(args: string[], valueOptions: string[], flagOptions: string[]): string[] {
  const valueOptionSet = new Set(valueOptions);
  const flagOptionSet = new Set(flagOptions);
  const unknown: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (!value?.startsWith("-")) {
      unknown.push(value ?? "");
      continue;
    }

    if (flagOptionSet.has(value)) {
      continue;
    }

    if (valueOptionSet.has(value)) {
      index += 1;
      continue;
    }

    unknown.push(value);
  }

  return unknown.filter(Boolean);
}
