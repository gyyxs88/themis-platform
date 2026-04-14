const OWNER_PRINCIPAL_STORAGE_KEY = "themis.platform.ownerPrincipalId";

const EMPTY_GOVERNANCE_SUMMARY = {
  total: 0,
  waitingHuman: 0,
  waitingAgent: 0,
  attentionCount: 0,
};

export function normalizeOwnerPrincipalId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveInitialOwnerPrincipalId(search = "", storedValue = "") {
  const searchParams = new URLSearchParams(typeof search === "string" ? search : "");
  return normalizeOwnerPrincipalId(searchParams.get("ownerPrincipalId"))
    || normalizeOwnerPrincipalId(storedValue);
}

export function summarizeNodes(nodes) {
  const summary = {
    total: 0,
    online: 0,
    draining: 0,
    offline: 0,
  };

  for (const node of Array.isArray(nodes) ? nodes : []) {
    summary.total += 1;

    if (node?.status === "online") {
      summary.online += 1;
      continue;
    }

    if (node?.status === "draining") {
      summary.draining += 1;
      continue;
    }

    if (node?.status === "offline") {
      summary.offline += 1;
    }
  }

  return summary;
}

export function summarizeReclaimResult(result) {
  const summary = result?.summary ?? {};
  return {
    activeLeaseCount: Number(summary.activeLeaseCount ?? 0),
    reclaimedRunCount: Number(summary.reclaimedRunCount ?? 0),
    requeuedWorkItemCount: Number(summary.requeuedWorkItemCount ?? 0),
  };
}

export function initializePlatformSurface(options = {}) {
  const documentRef = options.document ?? globalThis.document;

  if (!documentRef) {
    return null;
  }

  const fetchFn = options.fetch ?? globalThis.fetch;
  const storage = options.storage ?? safeStorage();
  const locationSearch = options.locationSearch ?? globalThis.location?.search ?? "";
  const dom = {
    sessionTitle: documentRef.getElementById("platform-session-title"),
    sessionNote: documentRef.getElementById("platform-session-note"),
    ownerForm: documentRef.getElementById("platform-owner-form"),
    ownerInput: documentRef.getElementById("platform-owner-input"),
    ownerSubmitButton: documentRef.getElementById("platform-owner-submit"),
    ownerNote: documentRef.getElementById("platform-owner-note"),
    refreshButton: documentRef.getElementById("platform-refresh-button"),
    nodesStatus: documentRef.getElementById("platform-nodes-status"),
    actionStatus: documentRef.getElementById("platform-action-status"),
    nodesEmpty: documentRef.getElementById("platform-nodes-empty"),
    nodesList: documentRef.getElementById("platform-nodes-list"),
    summaryTotal: documentRef.getElementById("platform-summary-total"),
    summaryOnline: documentRef.getElementById("platform-summary-online"),
    summaryDraining: documentRef.getElementById("platform-summary-draining"),
    summaryOffline: documentRef.getElementById("platform-summary-offline"),
    governanceStatus: documentRef.getElementById("platform-governance-status"),
    governanceTotal: documentRef.getElementById("platform-governance-total"),
    governanceWaitingHuman: documentRef.getElementById("platform-governance-waiting-human"),
    governanceWaitingAgent: documentRef.getElementById("platform-governance-waiting-agent"),
    governanceAttention: documentRef.getElementById("platform-governance-attention"),
    hotspotsSummary: documentRef.getElementById("platform-hotspots-summary"),
    hotspotsList: documentRef.getElementById("platform-hotspots-list"),
    waitingEmpty: documentRef.getElementById("platform-waiting-empty"),
    waitingList: documentRef.getElementById("platform-waiting-list"),
    collaborationStatus: documentRef.getElementById("platform-collaboration-status"),
    collaborationTotal: documentRef.getElementById("platform-collaboration-total"),
    collaborationHandoffsTotal: documentRef.getElementById("platform-collaboration-handoffs-total"),
    collaborationEmpty: documentRef.getElementById("platform-collaboration-empty"),
    collaborationList: documentRef.getElementById("platform-collaboration-list"),
    handoffsStatus: documentRef.getElementById("platform-handoffs-status"),
    handoffsEmpty: documentRef.getElementById("platform-handoffs-empty"),
    handoffsList: documentRef.getElementById("platform-handoffs-list"),
    runsStatus: documentRef.getElementById("platform-runs-status"),
    runsTotal: documentRef.getElementById("platform-runs-total"),
    runsEmpty: documentRef.getElementById("platform-runs-empty"),
    runsList: documentRef.getElementById("platform-runs-list"),
    runDetail: documentRef.getElementById("platform-run-detail"),
  };
  const state = {
    loading: false,
    actionNodeId: "",
    loadErrorMessage: "",
    actionMessage: "",
    tokenLabel: "",
    ownerPrincipalId: resolveInitialOwnerPrincipalId(
      locationSearch,
      storage?.getItem?.(OWNER_PRINCIPAL_STORAGE_KEY) ?? "",
    ),
    nodes: [],
    governanceOverview: {
      summary: { ...EMPTY_GOVERNANCE_SUMMARY },
      managerHotspots: [],
    },
    waitingItems: [],
    collaborationDashboard: {
      summary: { ...EMPTY_GOVERNANCE_SUMMARY },
      parents: [],
    },
    selectedHandoffAgentId: "",
    handoffView: null,
    runs: [],
    selectedRunId: "",
    selectedRunDetail: null,
  };

  if (dom.ownerInput) {
    dom.ownerInput.value = state.ownerPrincipalId;
  }

  const render = () => {
    const nodeSummary = summarizeNodes(state.nodes);
    const governanceSummary = normalizeGovernanceSummary(state.governanceOverview?.summary);
    const managerHotspots = Array.isArray(state.governanceOverview?.managerHotspots)
      ? state.governanceOverview.managerHotspots
      : [];
    const collaborationParents = Array.isArray(state.collaborationDashboard?.parents)
      ? state.collaborationDashboard.parents
      : [];
    const handoffItems = Array.isArray(state.handoffView?.handoffs)
      ? state.handoffView.handoffs
      : [];
    const hasNodes = state.nodes.length > 0;
    const hasWaitingItems = state.waitingItems.length > 0;
    const hasCollaborationParents = collaborationParents.length > 0;
    const hasHandoffs = handoffItems.length > 0;
    const hasRuns = state.runs.length > 0;
    const nodesStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在从平台控制面读取节点与治理摘要。"
        : state.ownerPrincipalId
          ? `当前 ownerPrincipalId：${state.ownerPrincipalId}`
          : "请先填写 ownerPrincipalId，再读取当前平台控制面。";
    const governanceStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在整理 governance overview 与 waiting queue。"
        : state.ownerPrincipalId
          ? `当前共有 ${governanceSummary.total} 条待治理项，其中等人 ${governanceSummary.waitingHuman} 条、等 agent ${governanceSummary.waitingAgent} 条。`
          : "先填写 ownerPrincipalId，再查看当前平台下的治理摘要。";
    const runsStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取最近 runs 列表。"
        : state.ownerPrincipalId
          ? `当前已接入 ${state.runs.length} 条 recent runs。`
          : "先填写 ownerPrincipalId，再查看当前平台 runs。";
    const handoffAgentLabel = state.handoffView?.agent?.displayName || state.selectedHandoffAgentId;
    const collaborationStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在整理父任务协作分组。"
        : state.ownerPrincipalId
          ? `当前共有 ${collaborationParents.length} 个父任务分组。`
          : "先填写 ownerPrincipalId，再查看当前平台父任务协作分组。";
    const handoffsStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取交接时间线。"
        : handoffAgentLabel
          ? `当前正在查看 ${handoffAgentLabel} 的 ${handoffItems.length} 条 handoff。`
          : state.ownerPrincipalId
            ? "当前还没有可查看的 handoff agent。"
            : "先填写 ownerPrincipalId，再查看当前平台 handoff 时间线。";

    if (dom.sessionTitle) {
      dom.sessionTitle.textContent = state.tokenLabel ? `已登录：${state.tokenLabel}` : "未启用平台 Web 鉴权";
    }

    if (dom.sessionNote) {
      dom.sessionNote.textContent = state.ownerPrincipalId
        ? "当前页面由 themis-platform 独立提供，节点治理与 waiting queue 都直接走 /api/platform/*。"
        : "当前页面由 themis-platform 独立提供；填入 ownerPrincipalId 后即可查看节点与治理摘要。";
    }

    if (dom.ownerNote) {
      dom.ownerNote.textContent = state.ownerPrincipalId
        ? `后续刷新会继续使用 ${state.ownerPrincipalId}。`
        : "如果你是从主 Themis 的兼容入口跳转过来的，这里通常会自动带上当前 ownerPrincipalId。";
    }

    if (dom.ownerSubmitButton) {
      dom.ownerSubmitButton.disabled = state.loading || Boolean(state.actionNodeId);
    }

    if (dom.refreshButton) {
      dom.refreshButton.disabled = state.loading || Boolean(state.actionNodeId);
      dom.refreshButton.textContent = state.loading ? "刷新中..." : "刷新控制面";
    }

    if (dom.nodesStatus) {
      dom.nodesStatus.textContent = nodesStatusMessage;
    }

    if (dom.actionStatus) {
      dom.actionStatus.textContent = state.actionNodeId
        ? `正在治理节点 ${state.actionNodeId}。`
        : state.actionMessage
          ? state.actionMessage
          : "可直接在节点卡片上执行 drain / offline / reclaim。";
    }

    if (dom.summaryTotal) {
      dom.summaryTotal.textContent = String(nodeSummary.total);
    }

    if (dom.summaryOnline) {
      dom.summaryOnline.textContent = String(nodeSummary.online);
    }

    if (dom.summaryDraining) {
      dom.summaryDraining.textContent = String(nodeSummary.draining);
    }

    if (dom.summaryOffline) {
      dom.summaryOffline.textContent = String(nodeSummary.offline);
    }

    if (dom.nodesEmpty) {
      dom.nodesEmpty.hidden = hasNodes;
      dom.nodesEmpty.textContent = state.loadErrorMessage
        ? "读取失败，请检查 ownerPrincipalId 或当前平台进程状态。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有注册节点。"
          : "先填写 ownerPrincipalId，再从平台控制面读取节点列表。";
    }

    if (dom.nodesList) {
      dom.nodesList.innerHTML = hasNodes
        ? state.nodes.map((node) => renderNodeCard(node)).join("")
        : "";
    }

    if (dom.governanceStatus) {
      dom.governanceStatus.textContent = governanceStatusMessage;
    }

    if (dom.governanceTotal) {
      dom.governanceTotal.textContent = String(governanceSummary.total);
    }

    if (dom.governanceWaitingHuman) {
      dom.governanceWaitingHuman.textContent = String(governanceSummary.waitingHuman);
    }

    if (dom.governanceWaitingAgent) {
      dom.governanceWaitingAgent.textContent = String(governanceSummary.waitingAgent);
    }

    if (dom.governanceAttention) {
      dom.governanceAttention.textContent = String(governanceSummary.attentionCount);
    }

    if (dom.hotspotsSummary) {
      dom.hotspotsSummary.textContent = managerHotspots.length > 0
        ? `当前有 ${managerHotspots.length} 个需关注的 manager 热点。`
        : "当前还没有 manager hotspot。";
    }

    if (dom.hotspotsList) {
      dom.hotspotsList.innerHTML = managerHotspots.length > 0
        ? managerHotspots.map((hotspot) => renderHotspotCard(hotspot)).join("")
        : "";
    }

    if (dom.waitingEmpty) {
      dom.waitingEmpty.hidden = hasWaitingItems;
      dom.waitingEmpty.textContent = state.loadErrorMessage
        ? "治理摘要读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有 waiting queue 项。"
          : "先填写 ownerPrincipalId，再读取当前平台 waiting queue。";
    }

    if (dom.waitingList) {
      dom.waitingList.innerHTML = hasWaitingItems
        ? state.waitingItems.map((item) => renderWaitingItemCard(item)).join("")
        : "";
    }

    if (dom.collaborationStatus) {
      dom.collaborationStatus.textContent = collaborationStatusMessage;
    }

    if (dom.collaborationTotal) {
      dom.collaborationTotal.textContent = String(collaborationParents.length);
    }

    if (dom.collaborationHandoffsTotal) {
      dom.collaborationHandoffsTotal.textContent = String(handoffItems.length);
    }

    if (dom.collaborationEmpty) {
      dom.collaborationEmpty.hidden = hasCollaborationParents;
      dom.collaborationEmpty.textContent = state.loadErrorMessage
        ? "父任务协作分组读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有协作分组。"
          : "先填写 ownerPrincipalId，再读取当前平台父任务协作分组。";
    }

    if (dom.collaborationList) {
      dom.collaborationList.innerHTML = hasCollaborationParents
        ? collaborationParents.map((parent) => renderCollaborationParentCard(parent, state.selectedHandoffAgentId)).join("")
        : "";
    }

    if (dom.handoffsStatus) {
      dom.handoffsStatus.textContent = handoffsStatusMessage;
    }

    if (dom.handoffsEmpty) {
      dom.handoffsEmpty.hidden = hasHandoffs;
      dom.handoffsEmpty.textContent = state.loadErrorMessage
        ? "handoff 时间线读取失败，请先排查平台控制面。"
        : handoffAgentLabel
          ? `${handoffAgentLabel} 当前还没有可显示的 handoff。`
          : "选择一个父任务分组后，这里会显示当前 agent 的 handoff 时间线。";
    }

    if (dom.handoffsList) {
      dom.handoffsList.innerHTML = hasHandoffs
        ? renderHandoffList(state.handoffView)
        : "";
    }

    if (dom.runsStatus) {
      dom.runsStatus.textContent = runsStatusMessage;
    }

    if (dom.runsTotal) {
      dom.runsTotal.textContent = String(state.runs.length);
    }

    if (dom.runsEmpty) {
      dom.runsEmpty.hidden = hasRuns;
      dom.runsEmpty.textContent = state.loadErrorMessage
        ? "runs 读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有 recent runs。"
          : "先填写 ownerPrincipalId，再读取当前平台 runs。";
    }

    if (dom.runsList) {
      dom.runsList.innerHTML = hasRuns
        ? state.runs.map((run) => renderRunCard(run, state.selectedRunId)).join("")
        : "";
    }

    if (dom.runDetail) {
      dom.runDetail.innerHTML = state.selectedRunDetail
        ? renderRunDetail(state.selectedRunDetail)
        : hasRuns
          ? '<p class="platform-inline-note">点击任意 run 卡片，查看当前 detail。</p>'
          : "";
    }
  };

  const loadSessionStatus = async () => {
    if (typeof fetchFn !== "function") {
      return;
    }

    try {
      const response = await fetchFn("/api/web-auth/status", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      const payload = await safeReadJson(response);
      state.tokenLabel = response.ok && payload?.authenticated && typeof payload?.tokenLabel === "string"
        ? payload.tokenLabel.trim()
        : "";
    } catch {
      state.tokenLabel = "";
    }
  };

  const loadPlatformData = async () => {
    state.ownerPrincipalId = normalizeOwnerPrincipalId(dom.ownerInput?.value ?? state.ownerPrincipalId);

    if (!state.ownerPrincipalId || typeof fetchFn !== "function") {
      state.loadErrorMessage = "";
      state.nodes = [];
      state.governanceOverview = {
        summary: { ...EMPTY_GOVERNANCE_SUMMARY },
        managerHotspots: [],
      };
      state.waitingItems = [];
      state.collaborationDashboard = {
        summary: { ...EMPTY_GOVERNANCE_SUMMARY },
        parents: [],
      };
      state.selectedHandoffAgentId = "";
      state.handoffView = null;
      state.runs = [];
      state.selectedRunId = "";
      state.selectedRunDetail = null;
      render();
      return;
    }

    storage?.setItem?.(OWNER_PRINCIPAL_STORAGE_KEY, state.ownerPrincipalId);
    state.loading = true;
    state.loadErrorMessage = "";
    render();

    try {
      const [nodesPayload, governancePayload, waitingPayload, collaborationPayload, runsPayload] = await Promise.all([
        requestPlatformJson(fetchFn, "/api/platform/nodes/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取节点列表失败。"),
        requestPlatformJson(fetchFn, "/api/platform/agents/governance-overview", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取治理摘要失败。"),
        requestPlatformJson(fetchFn, "/api/platform/agents/waiting/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取 waiting queue 失败。"),
        requestPlatformJson(fetchFn, "/api/platform/agents/collaboration-dashboard", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取父任务协作分组失败。"),
        requestPlatformJson(fetchFn, "/api/platform/runs/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取 recent runs 失败。"),
      ]);

      state.nodes = Array.isArray(nodesPayload?.nodes) ? nodesPayload.nodes : [];
      state.governanceOverview = {
        summary: normalizeGovernanceSummary(governancePayload?.summary),
        managerHotspots: Array.isArray(governancePayload?.managerHotspots) ? governancePayload.managerHotspots : [],
      };
      state.waitingItems = Array.isArray(waitingPayload?.items) ? waitingPayload.items : [];
      state.collaborationDashboard = {
        summary: normalizeGovernanceSummary(collaborationPayload?.summary),
        parents: Array.isArray(collaborationPayload?.parents) ? collaborationPayload.parents : [],
      };
      state.runs = Array.isArray(runsPayload?.runs) ? runsPayload.runs : [];

      const availableHandoffAgentIds = state.collaborationDashboard.parents
        .map((parent) => normalizeOwnerPrincipalId(parent?.items?.[0]?.targetAgentId))
        .filter(Boolean);

      if (!availableHandoffAgentIds.includes(state.selectedHandoffAgentId)) {
        state.selectedHandoffAgentId = availableHandoffAgentIds[0] ?? "";
      }

      state.handoffView = state.selectedHandoffAgentId
        ? await requestPlatformJson(fetchFn, "/api/platform/agents/handoffs/list", {
          ownerPrincipalId: state.ownerPrincipalId,
          agentId: state.selectedHandoffAgentId,
        }, "读取 handoff 时间线失败。")
        : null;

      if (!state.runs.some((run) => run?.runId === state.selectedRunId)) {
        state.selectedRunId = typeof state.runs[0]?.runId === "string" ? state.runs[0].runId : "";
      }

      state.selectedRunDetail = state.selectedRunId
        ? await requestPlatformJson(fetchFn, "/api/platform/runs/detail", {
          ownerPrincipalId: state.ownerPrincipalId,
          runId: state.selectedRunId,
        }, "读取 run detail 失败。")
        : null;
    } catch (error) {
      state.nodes = [];
      state.governanceOverview = {
        summary: { ...EMPTY_GOVERNANCE_SUMMARY },
        managerHotspots: [],
      };
      state.waitingItems = [];
      state.collaborationDashboard = {
        summary: { ...EMPTY_GOVERNANCE_SUMMARY },
        parents: [],
      };
      state.selectedHandoffAgentId = "";
      state.handoffView = null;
      state.runs = [];
      state.selectedRunId = "";
      state.selectedRunDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取平台控制面失败。";
    } finally {
      state.loading = false;
      render();
    }
  };

  const loadRunDetail = async (runId) => {
    const normalizedRunId = typeof runId === "string" ? runId.trim() : "";

    if (!normalizedRunId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.selectedRunId = normalizedRunId;
    render();

    try {
      state.selectedRunDetail = await requestPlatformJson(fetchFn, "/api/platform/runs/detail", {
        ownerPrincipalId: state.ownerPrincipalId,
        runId: normalizedRunId,
      }, "读取 run detail 失败。");
      state.loadErrorMessage = "";
    } catch (error) {
      state.selectedRunDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取 run detail 失败。";
    } finally {
      render();
    }
  };

  const loadAgentHandoffs = async (agentId) => {
    const normalizedAgentId = normalizeOwnerPrincipalId(agentId);

    if (!normalizedAgentId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.selectedHandoffAgentId = normalizedAgentId;
    render();

    try {
      state.handoffView = await requestPlatformJson(fetchFn, "/api/platform/agents/handoffs/list", {
        ownerPrincipalId: state.ownerPrincipalId,
        agentId: normalizedAgentId,
      }, "读取 handoff 时间线失败。");
      state.loadErrorMessage = "";
    } catch (error) {
      state.handoffView = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取 handoff 时间线失败。";
    } finally {
      render();
    }
  };

  const updateNodeStatus = async (nodeId, action) => {
    const normalizedNodeId = typeof nodeId === "string" ? nodeId.trim() : "";

    if (!normalizedNodeId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.actionNodeId = normalizedNodeId;
    state.actionMessage = "";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, `/api/platform/nodes/${action}`, {
        ownerPrincipalId: state.ownerPrincipalId,
        nodeId: normalizedNodeId,
      }, `节点 ${action} 失败。`);
      const updatedNode = payload?.node;

      if (updatedNode?.nodeId) {
        state.nodes = state.nodes.map((node) => node?.nodeId === updatedNode.nodeId ? updatedNode : node);
      }

      if (action === "reclaim") {
        const summary = summarizeReclaimResult(payload);
        state.actionMessage = [
          `节点 ${normalizedNodeId} reclaim 完成`,
          `activeLease=${summary.activeLeaseCount}`,
          `reclaimedRun=${summary.reclaimedRunCount}`,
          `requeuedWorkItem=${summary.requeuedWorkItemCount}`,
        ].join(" | ");
      } else if (updatedNode?.status) {
        state.actionMessage = `节点 ${normalizedNodeId} 已更新为 ${resolveNodeStatusLabel(updatedNode.status)}。`;
      } else {
        state.actionMessage = `节点 ${normalizedNodeId} 的 ${action} 已完成。`;
      }
    } catch (error) {
      state.actionMessage = error instanceof Error ? error.message : `节点 ${action} 失败。`;
    } finally {
      state.actionNodeId = "";
      render();
    }
  };

  dom.ownerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadPlatformData();
  });

  dom.refreshButton?.addEventListener("click", () => {
    void loadPlatformData();
  });

  dom.nodesList?.addEventListener("click", (event) => {
    const actionButton = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-node-action]")
      : null;

    if (!actionButton) {
      return;
    }

    const action = actionButton.getAttribute("data-platform-node-action");
    const nodeId = actionButton.getAttribute("data-platform-node-id");

    if (action === "drain" || action === "offline" || action === "reclaim") {
      void updateNodeStatus(nodeId, action);
    }
  });

  dom.collaborationList?.addEventListener("click", (event) => {
    const parentCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-handoff-agent-id]")
      : null;

    if (!parentCard) {
      return;
    }

    const agentId = parentCard.getAttribute("data-platform-handoff-agent-id");

    if (agentId) {
      void loadAgentHandoffs(agentId);
    }
  });

  dom.runsList?.addEventListener("click", (event) => {
    const runCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-run-id]")
      : null;

    if (!runCard) {
      return;
    }

    const runId = runCard.getAttribute("data-platform-run-id");

    if (runId) {
      void loadRunDetail(runId);
    }
  });

  void (async () => {
    await loadSessionStatus();
    render();
    if (state.ownerPrincipalId) {
      await loadPlatformData();
    }
  })();

  return {
    loadNodes: loadPlatformData,
    loadPlatformData,
    loadAgentHandoffs,
    loadRunDetail,
    updateNodeStatus,
    render,
  };
}

function renderNodeCard(node) {
  const status = normalizeNodeStatus(node?.status);
  const statusLabel = resolveNodeStatusLabel(status);
  const labels = Array.isArray(node?.labels) ? node.labels : [];
  const workspaceCapabilities = Array.isArray(node?.workspaceCapabilities) ? node.workspaceCapabilities : [];
  const credentialCapabilities = Array.isArray(node?.credentialCapabilities) ? node.credentialCapabilities : [];
  const providerCapabilities = Array.isArray(node?.providerCapabilities) ? node.providerCapabilities : [];
  const metaChips = [
    `槽位 ${normalizeNumber(node?.slotAvailable, 0)}/${normalizeNumber(node?.slotCapacity, 0)}`,
    node?.heartbeatTtlSeconds ? `TTL ${normalizeNumber(node.heartbeatTtlSeconds, 0)}s` : "",
    node?.lastHeartbeatAt ? `最近心跳 ${formatTimestamp(node.lastHeartbeatAt)}` : "",
  ].filter(Boolean);
  const capabilityChips = [
    ...labels.map((label) => `标签 ${label}`),
    workspaceCapabilities.length ? `工作区 ${workspaceCapabilities.length}` : "",
    credentialCapabilities.length ? `凭据 ${credentialCapabilities.length}` : "",
    providerCapabilities.length ? `Provider ${providerCapabilities.length}` : "",
  ].filter(Boolean);
  const actions = resolveNodeActions(node);

  return `<article class="platform-node-card">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-node-title">${escapeHtml(node?.displayName || node?.nodeId || "未命名节点")}</h3>
        <div class="platform-node-meta">
          <span class="platform-chip status-${status}">${escapeHtml(statusLabel)}</span>
          <span class="platform-chip">${escapeHtml(node?.nodeId || "未知 nodeId")}</span>
          <span class="platform-chip">${escapeHtml(node?.organizationId || "未知组织")}</span>
        </div>
      </div>
    </div>
    <div class="platform-node-meta">
      ${metaChips.map((item) => `<span class="platform-chip">${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="platform-node-capabilities">
      ${capabilityChips.map((item) => `<span class="platform-chip">${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="platform-node-actions">
      ${actions.map((action) => `<button
        type="button"
        class="platform-button subtle"
        data-platform-node-action="${escapeHtml(action.id)}"
        data-platform-node-id="${escapeHtml(node?.nodeId || "")}"
      >${escapeHtml(action.label)}</button>`).join("")}
    </div>
  </article>`;
}

function renderHotspotCard(hotspot) {
  return `<article class="platform-hotspot-card">
    <div>
      <strong>${escapeHtml(hotspot?.displayName || hotspot?.managerAgentId || "未命名 manager")}</strong>
      <p class="platform-inline-note">managerAgentId：${escapeHtml(hotspot?.managerAgentId || "未知")}</p>
    </div>
    <span class="platform-chip">${escapeHtml(`待治理 ${normalizeNumber(hotspot?.itemCount, 0)} 条`)}</span>
  </article>`;
}

function renderWaitingItemCard(item) {
  const status = resolveWaitingStatusLabel(item?.status);
  const priority = resolvePriorityLabel(item?.priority);
  const chips = [
    status ? `状态 ${status}` : "",
    priority ? `优先级 ${priority}` : "",
    item?.targetAgentId ? `目标 ${item.targetAgentId}` : "",
    item?.sourceType ? `来源 ${item.sourceType}` : "",
  ].filter(Boolean);

  return `<article class="platform-waiting-card">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(item?.goal || item?.workItemId || "未命名待治理项")}</h3>
        <div class="platform-node-meta">
          <span class="platform-chip">${escapeHtml(item?.workItemId || "未知 workItemId")}</span>
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">
      最近更新时间：${escapeHtml(formatTimestamp(item?.updatedAt))}
    </p>
  </article>`;
}

function renderCollaborationParentCard(parent, selectedHandoffAgentId) {
  const items = Array.isArray(parent?.items) ? parent.items : [];
  const leadAgentId = normalizeOwnerPrincipalId(items[0]?.targetAgentId);
  const distinctAgents = new Set(items.map((item) => normalizeOwnerPrincipalId(item?.targetAgentId)).filter(Boolean));
  const waitingHumanCount = items.filter((item) => item?.status === "waiting_human").length;
  const waitingAgentCount = items.filter((item) => item?.status === "waiting_agent").length;
  const chips = [
    `子项 ${items.length}`,
    waitingHumanCount > 0 ? `等人 ${waitingHumanCount}` : "",
    waitingAgentCount > 0 ? `等 agent ${waitingAgentCount}` : "",
    distinctAgents.size > 0 ? `涉及 agent ${distinctAgents.size}` : "",
  ].filter(Boolean);
  const previewGoals = items
    .slice(0, 2)
    .map((item) => escapeHtml(item?.goal || item?.workItemId || "未命名子项"))
    .join(" / ");
  const selected = leadAgentId && leadAgentId === selectedHandoffAgentId;

  return `<article
    class="platform-collaboration-card"
    data-platform-handoff-agent-id="${escapeHtml(leadAgentId)}"
    data-selected="${selected ? "true" : "false"}"
  >
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(parent?.displayName || parent?.parentWorkItemId || "未命名父任务")}</h3>
        <div class="platform-node-meta">
          <span class="platform-chip">${escapeHtml(parent?.parentWorkItemId || "未知 parentWorkItemId")}</span>
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">子项预览：${previewGoals || "暂无子项"}</p>
  </article>`;
}

function renderHandoffList(view) {
  const handoffs = Array.isArray(view?.handoffs) ? view.handoffs : [];
  const timeline = Array.isArray(view?.timeline) ? view.timeline : [];
  const parts = [];

  if (handoffs.length > 0) {
    parts.push(handoffs.map((handoff) => renderHandoffCard(handoff)).join(""));
  }

  if (timeline.length > 0) {
    parts.push(timeline.map((entry) => renderTimelineEntryCard(entry)).join(""));
  }

  return parts.join("");
}

function renderHandoffCard(handoff) {
  const blockers = Array.isArray(handoff?.blockers) ? handoff.blockers : [];
  const nextActions = Array.isArray(handoff?.recommendedNextActions) ? handoff.recommendedNextActions : [];
  const chips = [
    handoff?.handoffId ? `handoff ${handoff.handoffId}` : "",
    handoff?.counterpartyDisplayName ? `对端 ${handoff.counterpartyDisplayName}` : "",
    handoff?.workItemId ? `工作项 ${handoff.workItemId}` : "",
  ].filter(Boolean);
  const blockerLine = blockers.length > 0 ? `阻塞：${blockers.join(" / ")}` : "阻塞：暂无";
  const nextActionLine = nextActions.length > 0 ? `建议动作：${nextActions.join(" / ")}` : "建议动作：暂无";

  return `<article class="platform-handoff-card">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(handoff?.summary || handoff?.handoffId || "未命名交接")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">${escapeHtml(blockerLine)}</p>
    <p class="platform-inline-note">${escapeHtml(nextActionLine)}</p>
  </article>`;
}

function renderTimelineEntryCard(entry) {
  const chips = [
    entry?.kind ? `类型 ${entry.kind}` : "",
    entry?.counterpartyDisplayName ? `对端 ${entry.counterpartyDisplayName}` : "",
    entry?.workItemId ? `工作项 ${entry.workItemId}` : "",
  ].filter(Boolean);

  return `<article class="platform-handoff-card">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(entry?.title || entry?.summary || entry?.entryId || "未命名时间线")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">${escapeHtml(entry?.summary || "暂无摘要")}</p>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(entry?.updatedAt))}</p>
  </article>`;
}

function renderRunCard(run, selectedRunId) {
  const chips = [
    run?.status ? `状态 ${resolveRunStatusLabel(run.status)}` : "",
    run?.nodeId ? `节点 ${run.nodeId}` : "",
    run?.workItemId ? `工作项 ${run.workItemId}` : "",
  ].filter(Boolean);
  const selected = typeof run?.runId === "string" && run.runId === selectedRunId;

  return `<article class="platform-run-card" data-platform-run-id="${escapeHtml(run?.runId || "")}" data-selected="${selected ? "true" : "false"}">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(run?.runId || "未命名 run")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(run?.updatedAt))}</p>
  </article>`;
}

function renderRunDetail(detail) {
  const chips = [
    detail?.run?.status ? `状态 ${resolveRunStatusLabel(detail.run.status)}` : "",
    detail?.run?.nodeId ? `节点 ${detail.run.nodeId}` : "",
    detail?.targetAgent?.displayName ? `目标 ${detail.targetAgent.displayName}` : "",
    detail?.workItem?.workItemId ? `工作项 ${detail.workItem.workItemId}` : "",
  ].filter(Boolean);

  return `<div>
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(detail?.run?.runId || "未命名 run")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">当前 goal：${escapeHtml(detail?.workItem?.goal || "暂无 goal")}</p>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(detail?.run?.updatedAt))}</p>
  </div>`;
}

function resolveNodeActions(node) {
  switch (node?.status) {
    case "online":
      return [
        { id: "drain", label: "Drain" },
        { id: "offline", label: "Offline" },
      ];
    case "draining":
      return [
        { id: "offline", label: "Offline" },
        { id: "reclaim", label: "Reclaim" },
      ];
    case "offline":
      return [
        { id: "reclaim", label: "Reclaim" },
      ];
    default:
      return [];
  }
}

function normalizeGovernanceSummary(summary) {
  return {
    total: normalizeNumber(summary?.total, 0),
    waitingHuman: normalizeNumber(summary?.waitingHuman, 0),
    waitingAgent: normalizeNumber(summary?.waitingAgent, 0),
    attentionCount: normalizeNumber(summary?.attentionCount, 0),
  };
}

function resolveNodeStatusLabel(status) {
  switch (status) {
    case "online":
      return "在线";
    case "draining":
      return "排水中";
    case "offline":
      return "离线";
    default:
      return "状态未知";
  }
}

function resolveWaitingStatusLabel(status) {
  switch (status) {
    case "waiting_human":
      return "等人处理";
    case "waiting_agent":
      return "等 agent";
    default:
      return typeof status === "string" ? status : "";
  }
}

function resolvePriorityLabel(priority) {
  switch (priority) {
    case "urgent":
      return "紧急";
    case "high":
      return "高";
    case "normal":
      return "普通";
    case "low":
      return "低";
    default:
      return "";
  }
}

function resolveRunStatusLabel(status) {
  switch (status) {
    case "created":
      return "已创建";
    case "starting":
      return "启动中";
    case "running":
      return "运行中";
    case "waiting_action":
      return "等待动作";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "interrupted":
      return "中断";
    default:
      return typeof status === "string" ? status : "";
  }
}

function normalizeNodeStatus(value) {
  return ["online", "draining", "offline"].includes(value)
    ? value
    : "unknown";
}

function normalizeNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function formatTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "未知";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function requestPlatformJson(fetchFn, url, payload, fallbackMessage) {
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responsePayload = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(readErrorMessage(responsePayload, fallbackMessage));
  }

  return responsePayload;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload, fallback) {
  return typeof payload?.error?.message === "string" && payload.error.message.trim()
    ? payload.error.message.trim()
    : fallback;
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

if (typeof document !== "undefined") {
  initializePlatformSurface();
}
