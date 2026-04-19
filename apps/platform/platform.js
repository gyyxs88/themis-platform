const OWNER_PRINCIPAL_STORAGE_KEY = "themis.platform.ownerPrincipalId";

const EMPTY_GOVERNANCE_SUMMARY = {
  total: 0,
  waitingHuman: 0,
  waitingAgent: 0,
  attentionCount: 0,
};

const EMPTY_WORK_ITEM_SUMMARY = {
  total: 0,
  waitingHuman: 0,
  waitingAgent: 0,
  queued: 0,
};

const DEFAULT_ACTIVE_VIEW = "nodes-oncall";
const DEFAULT_NODE_STATUS_FILTER = "all";
const DEFAULT_NODE_SORT_BY = "attention";
const PLATFORM_VIEWS = [
  "nodes-oncall",
  "governance",
  "work-items",
  "mailbox",
  "agents-projects",
  "collaboration-runs",
  "meeting-rooms",
  "overview",
];

function createEmptyOncallSummary() {
  return {
    generatedAt: "",
    ownerPrincipalId: "",
    organizationId: null,
    counts: {
      nodeTotal: 0,
      nodeErrorCount: 0,
      nodeWarningCount: 0,
      waitingAttentionCount: 0,
      waitingHumanCount: 0,
      runWaitingActionCount: 0,
      runFailedCount: 0,
      pausedAgentCount: 0,
    },
    primaryDiagnosis: {
      id: "",
      severity: "info",
      title: "",
      summary: "",
    },
    recommendedNextSteps: [],
    recommendations: [],
  };
}

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

function summarizeMeetingRooms(rooms) {
  const summary = {
    total: 0,
    open: 0,
    terminated: 0,
    closed: 0,
  };

  for (const room of Array.isArray(rooms) ? rooms : []) {
    summary.total += 1;

    if (room?.status === "open" || room?.status === "closing") {
      summary.open += 1;
      continue;
    }

    if (room?.status === "terminated") {
      summary.terminated += 1;
      continue;
    }

    if (room?.status === "closed") {
      summary.closed += 1;
    }
  }

  return summary;
}

export function buildNodeAttentionById(oncallSummary) {
  const recommendations = Array.isArray(oncallSummary?.recommendations)
    ? oncallSummary.recommendations
    : [];
  const attentionByNodeId = {};

  for (const recommendation of recommendations) {
    if (recommendation?.category !== "worker_fleet") {
      continue;
    }

    const nodeId = normalizeOwnerPrincipalId(recommendation?.subjectId);

    if (!nodeId) {
      continue;
    }

    const severity = resolveOncallSeverity(recommendation?.severity);
    const current = attentionByNodeId[nodeId] ?? {
      severity: "info",
      recommendationCount: 0,
      titles: [],
    };

    attentionByNodeId[nodeId] = {
      severity: rankAttentionSeverity(severity) > rankAttentionSeverity(current.severity)
        ? severity
        : current.severity,
      recommendationCount: current.recommendationCount + 1,
      titles: recommendation?.title
        ? [...current.titles, recommendation.title]
        : current.titles,
    };
  }

  return attentionByNodeId;
}

export function filterAndSortNodes(nodes, options = {}, attentionByNodeId = {}) {
  const statusFilter = normalizeNodeStatusFilter(options?.statusFilter);
  const sortBy = normalizeNodeSortBy(options?.sortBy);
  const searchTerm = normalizeNodeSearchTerm(options?.searchTerm);
  const searchNeedle = searchTerm.toLowerCase();

  return (Array.isArray(nodes) ? nodes : [])
    .filter((node) => {
      const normalizedNodeStatus = normalizeNodeStatus(node?.status);

      if (statusFilter === "attention" && !attentionByNodeId[node?.nodeId ?? ""]) {
        return false;
      }

      if (statusFilter !== "all" && statusFilter !== "attention" && normalizedNodeStatus !== statusFilter) {
        return false;
      }

      if (!searchNeedle) {
        return true;
      }

      const searchHaystack = [
        node?.displayName,
        node?.nodeId,
        node?.nodeIp,
        node?.organizationId,
      ].filter(Boolean).join(" ").toLowerCase();

      return searchHaystack.includes(searchNeedle);
    })
    .slice()
    .sort((left, right) => compareNodesBySort(left, right, sortBy, attentionByNodeId));
}

function normalizePlatformView(value) {
  return PLATFORM_VIEWS.includes(value) ? value : "";
}

function resolveInitialPlatformView(locationHash = "") {
  return normalizePlatformView(
    typeof locationHash === "string" ? locationHash.replace(/^#/, "").trim() : "",
  ) || DEFAULT_ACTIVE_VIEW;
}

function safeSetLocationHash(nextHash) {
  if (typeof globalThis.location === "undefined") {
    return;
  }

  globalThis.location.hash = nextHash;
}

function applyActiveView(dom, state) {
  const viewMap = {
    "nodes-oncall": [dom.navNodesOncall, dom.viewNodesOncall],
    governance: [dom.navGovernance, dom.viewGovernance],
    "work-items": [dom.navWorkItems, dom.viewWorkItems],
    mailbox: [dom.navMailbox, dom.viewMailbox],
    "agents-projects": [dom.navAgentsProjects, dom.viewAgentsProjects],
    "collaboration-runs": [dom.navCollaborationRuns, dom.viewCollaborationRuns],
    "meeting-rooms": [dom.navMeetingRooms, dom.viewMeetingRooms],
    overview: [dom.navOverview, dom.viewOverview],
  };

  for (const [viewId, [button, panel]] of Object.entries(viewMap)) {
    const isActive = state.activeView === viewId;

    if (panel) {
      panel.hidden = !isActive;
    }

    if (button) {
      button.dataset.selected = isActive ? "true" : "false";
      button.setAttribute("aria-current", isActive ? "page" : "false");
    }
  }
}

export function initializePlatformSurface(options = {}) {
  const documentRef = options.document ?? globalThis.document;

  if (!documentRef) {
    return null;
  }

  const fetchFn = options.fetch ?? globalThis.fetch;
  const storage = options.storage ?? safeStorage();
  const locationSearch = options.locationSearch ?? globalThis.location?.search ?? "";
  const locationHash = options.locationHash ?? globalThis.location?.hash ?? "";
  const setLocationHash = options.setLocationHash ?? safeSetLocationHash;
  const dom = {
    sidebar: documentRef.getElementById("platform-sidebar"),
    navToggle: documentRef.getElementById("platform-nav-toggle"),
    navNodesOncall: documentRef.getElementById("platform-nav-nodes-oncall"),
    navGovernance: documentRef.getElementById("platform-nav-governance"),
    navWorkItems: documentRef.getElementById("platform-nav-work-items"),
    navMailbox: documentRef.getElementById("platform-nav-mailbox"),
    navAgentsProjects: documentRef.getElementById("platform-nav-agents-projects"),
    navCollaborationRuns: documentRef.getElementById("platform-nav-collaboration-runs"),
    navMeetingRooms: documentRef.getElementById("platform-nav-meeting-rooms"),
    navOverview: documentRef.getElementById("platform-nav-overview"),
    viewNodesOncall: documentRef.getElementById("platform-view-nodes-oncall"),
    viewGovernance: documentRef.getElementById("platform-view-governance"),
    viewWorkItems: documentRef.getElementById("platform-view-work-items"),
    viewMailbox: documentRef.getElementById("platform-view-mailbox"),
    viewAgentsProjects: documentRef.getElementById("platform-view-agents-projects"),
    viewCollaborationRuns: documentRef.getElementById("platform-view-collaboration-runs"),
    viewMeetingRooms: documentRef.getElementById("platform-view-meeting-rooms"),
    viewOverview: documentRef.getElementById("platform-view-overview"),
    sessionTitle: documentRef.getElementById("platform-session-title"),
    sessionNote: documentRef.getElementById("platform-session-note"),
    ownerForm: documentRef.getElementById("platform-owner-form"),
    ownerInput: documentRef.getElementById("platform-owner-input"),
    ownerSubmitButton: documentRef.getElementById("platform-owner-submit"),
    ownerNote: documentRef.getElementById("platform-owner-note"),
    refreshButton: documentRef.getElementById("platform-refresh-button"),
    nodesStatus: documentRef.getElementById("platform-nodes-status"),
    actionStatus: documentRef.getElementById("platform-action-status"),
    nodeSearchInput: documentRef.getElementById("platform-node-search-input"),
    nodeStatusFilter: documentRef.getElementById("platform-node-status-filter"),
    nodeSortSelect: documentRef.getElementById("platform-node-sort-select"),
    nodesEmpty: documentRef.getElementById("platform-nodes-empty"),
    nodesList: documentRef.getElementById("platform-nodes-list"),
    nodeDetailStatus: documentRef.getElementById("platform-node-detail-status"),
    nodeDetail: documentRef.getElementById("platform-node-detail"),
    summaryTotal: documentRef.getElementById("platform-summary-total"),
    summaryOnline: documentRef.getElementById("platform-summary-online"),
    summaryDraining: documentRef.getElementById("platform-summary-draining"),
    summaryOffline: documentRef.getElementById("platform-summary-offline"),
    oncallStatus: documentRef.getElementById("platform-oncall-status"),
    oncallErrors: documentRef.getElementById("platform-oncall-errors"),
    oncallWarnings: documentRef.getElementById("platform-oncall-warnings"),
    oncallWaiting: documentRef.getElementById("platform-oncall-waiting"),
    oncallRuns: documentRef.getElementById("platform-oncall-runs"),
    oncallDiagnosis: documentRef.getElementById("platform-oncall-diagnosis"),
    oncallNextSteps: documentRef.getElementById("platform-oncall-next-steps"),
    oncallEmpty: documentRef.getElementById("platform-oncall-empty"),
    oncallList: documentRef.getElementById("platform-oncall-list"),
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
    workItemsStatus: documentRef.getElementById("platform-work-items-status"),
    workItemsTotal: documentRef.getElementById("platform-work-items-total"),
    workItemsWaitingHuman: documentRef.getElementById("platform-work-items-waiting-human"),
    workItemsWaitingAgent: documentRef.getElementById("platform-work-items-waiting-agent"),
    workItemsQueued: documentRef.getElementById("platform-work-items-queued"),
    workItemsEmpty: documentRef.getElementById("platform-work-items-empty"),
    workItemsList: documentRef.getElementById("platform-work-items-list"),
    workItemDetail: documentRef.getElementById("platform-work-item-detail"),
    workItemActionStatus: documentRef.getElementById("platform-work-item-action-status"),
    dispatchForm: documentRef.getElementById("platform-dispatch-form"),
    dispatchAgentInput: documentRef.getElementById("platform-dispatch-agent-input"),
    dispatchGoalInput: documentRef.getElementById("platform-dispatch-goal-input"),
    dispatchSourceSelect: documentRef.getElementById("platform-dispatch-source-select"),
    dispatchPrioritySelect: documentRef.getElementById("platform-dispatch-priority-select"),
    dispatchSubmit: documentRef.getElementById("platform-dispatch-submit"),
    workItemResponseForm: documentRef.getElementById("platform-work-item-response-form"),
    workItemResponseDecision: documentRef.getElementById("platform-work-item-response-decision"),
    workItemResponseInput: documentRef.getElementById("platform-work-item-response-input"),
    workItemResponseSubmit: documentRef.getElementById("platform-work-item-response-submit"),
    workItemEscalateForm: documentRef.getElementById("platform-work-item-escalate-form"),
    workItemEscalateInput: documentRef.getElementById("platform-work-item-escalate-input"),
    workItemEscalateSubmit: documentRef.getElementById("platform-work-item-escalate-submit"),
    workItemCancelButton: documentRef.getElementById("platform-work-item-cancel-button"),
    mailboxForm: documentRef.getElementById("platform-mailbox-form"),
    mailboxAgentInput: documentRef.getElementById("platform-mailbox-agent-input"),
    mailboxSubmit: documentRef.getElementById("platform-mailbox-submit"),
    mailboxStatus: documentRef.getElementById("platform-mailbox-status"),
    mailboxTotal: documentRef.getElementById("platform-mailbox-total"),
    mailboxPending: documentRef.getElementById("platform-mailbox-pending"),
    mailboxAcked: documentRef.getElementById("platform-mailbox-acked"),
    mailboxEmpty: documentRef.getElementById("platform-mailbox-empty"),
    mailboxList: documentRef.getElementById("platform-mailbox-list"),
    mailboxDetail: documentRef.getElementById("platform-mailbox-detail"),
    mailboxActionStatus: documentRef.getElementById("platform-mailbox-action-status"),
    mailboxPullButton: documentRef.getElementById("platform-mailbox-pull-button"),
    mailboxAckButton: documentRef.getElementById("platform-mailbox-ack-button"),
    mailboxResponseForm: documentRef.getElementById("platform-mailbox-response-form"),
    mailboxResponseDecision: documentRef.getElementById("platform-mailbox-response-decision"),
    mailboxResponseInput: documentRef.getElementById("platform-mailbox-response-input"),
    mailboxResponseSubmit: documentRef.getElementById("platform-mailbox-response-submit"),
    agentsStatus: documentRef.getElementById("platform-agents-status"),
    agentsTotal: documentRef.getElementById("platform-agents-total"),
    projectsTotal: documentRef.getElementById("platform-projects-total"),
    agentsEmpty: documentRef.getElementById("platform-agents-empty"),
    projectsEmpty: documentRef.getElementById("platform-projects-empty"),
    agentsList: documentRef.getElementById("platform-agents-list"),
    agentDetail: documentRef.getElementById("platform-agent-detail"),
    projectsList: documentRef.getElementById("platform-projects-list"),
    agentsActionStatus: documentRef.getElementById("platform-agents-action-status"),
    agentCreateForm: documentRef.getElementById("platform-agent-create-form"),
    agentCreateRoleInput: documentRef.getElementById("platform-agent-create-role-input"),
    agentCreateNameInput: documentRef.getElementById("platform-agent-create-name-input"),
    agentCreateMissionInput: documentRef.getElementById("platform-agent-create-mission-input"),
    agentCreateSubmit: documentRef.getElementById("platform-agent-create-submit"),
    projectBindingForm: documentRef.getElementById("platform-project-binding-form"),
    projectBindingProjectInput: documentRef.getElementById("platform-project-binding-project-input"),
    projectBindingOrganizationInput: documentRef.getElementById("platform-project-binding-organization-input"),
    projectBindingDisplayInput: documentRef.getElementById("platform-project-binding-display-input"),
    projectBindingWorkspaceInput: documentRef.getElementById("platform-project-binding-workspace-input"),
    projectBindingNodeInput: documentRef.getElementById("platform-project-binding-node-input"),
    projectBindingModeSelect: documentRef.getElementById("platform-project-binding-mode-select"),
    projectBindingSubmit: documentRef.getElementById("platform-project-binding-submit"),
    runsStatus: documentRef.getElementById("platform-runs-status"),
    runsTotal: documentRef.getElementById("platform-runs-total"),
    runsEmpty: documentRef.getElementById("platform-runs-empty"),
    runsList: documentRef.getElementById("platform-runs-list"),
    runDetail: documentRef.getElementById("platform-run-detail"),
    meetingRoomsStatus: documentRef.getElementById("platform-meeting-rooms-status"),
    meetingRoomsActionStatus: documentRef.getElementById("platform-meeting-rooms-action-status"),
    meetingRoomsTotal: documentRef.getElementById("platform-meeting-rooms-total"),
    meetingRoomsOpen: documentRef.getElementById("platform-meeting-rooms-open"),
    meetingRoomsTerminated: documentRef.getElementById("platform-meeting-rooms-terminated"),
    meetingRoomsClosed: documentRef.getElementById("platform-meeting-rooms-closed"),
    meetingRoomsEmpty: documentRef.getElementById("platform-meeting-rooms-empty"),
    meetingRoomsList: documentRef.getElementById("platform-meeting-rooms-list"),
    meetingRoomDetail: documentRef.getElementById("platform-meeting-room-detail"),
    meetingRoomTerminateForm: documentRef.getElementById("platform-meeting-room-terminate-form"),
    meetingRoomTerminateReasonInput: documentRef.getElementById("platform-meeting-room-terminate-reason-input"),
    meetingRoomTerminateSubmit: documentRef.getElementById("platform-meeting-room-terminate-submit"),
  };
  const state = {
    loading: false,
    activeView: resolveInitialPlatformView(locationHash),
    navExpanded: false,
    actionNodeId: "",
    loadErrorMessage: "",
    actionMessage: "",
    tokenLabel: "",
    ownerPrincipalId: resolveInitialOwnerPrincipalId(
      locationSearch,
      storage?.getItem?.(OWNER_PRINCIPAL_STORAGE_KEY) ?? "",
    ),
    nodeSearchTerm: "",
    nodeStatusFilter: DEFAULT_NODE_STATUS_FILTER,
    nodeSortBy: DEFAULT_NODE_SORT_BY,
    nodes: [],
    selectedNodeId: "",
    selectedNodeDetail: null,
    nodeActionResult: null,
    oncallSummary: createEmptyOncallSummary(),
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
    workItems: [],
    selectedWorkItemId: "",
    selectedWorkItemDetail: null,
    workItemActionMessage: "",
    workItemActionPending: "",
    mailboxAgentId: "",
    mailboxAgent: null,
    mailboxItems: [],
    selectedMailboxEntryId: "",
    mailboxActionMessage: "",
    mailboxActionPending: "",
    organizations: [],
    agents: [],
    selectedAgentId: "",
    selectedAgentDetail: null,
    projectBindings: [],
    agentsActionMessage: "",
    agentsActionPending: "",
    runs: [],
    selectedRunId: "",
    selectedRunDetail: null,
    meetingRooms: [],
    selectedMeetingRoomId: "",
    selectedMeetingRoomDetail: null,
    meetingRoomActionMessage: "",
    meetingRoomActionPending: "",
  };

  if (dom.ownerInput) {
    dom.ownerInput.value = state.ownerPrincipalId;
  }

  if (dom.nodeSearchInput) {
    dom.nodeSearchInput.value = state.nodeSearchTerm;
  }

  if (dom.nodeStatusFilter && !dom.nodeStatusFilter.value) {
    dom.nodeStatusFilter.value = state.nodeStatusFilter;
  }

  if (dom.nodeSortSelect && !dom.nodeSortSelect.value) {
    dom.nodeSortSelect.value = state.nodeSortBy;
  }

  if (dom.dispatchSourceSelect && !dom.dispatchSourceSelect.value) {
    dom.dispatchSourceSelect.value = "human";
  }

  if (dom.dispatchPrioritySelect && !dom.dispatchPrioritySelect.value) {
    dom.dispatchPrioritySelect.value = "normal";
  }

  if (dom.mailboxResponseDecision && !dom.mailboxResponseDecision.value) {
    dom.mailboxResponseDecision.value = "approve";
  }

  if (dom.workItemResponseDecision && !dom.workItemResponseDecision.value) {
    dom.workItemResponseDecision.value = "approve";
  }

  if (dom.projectBindingModeSelect && !dom.projectBindingModeSelect.value) {
    dom.projectBindingModeSelect.value = "sticky";
  }

  function setActiveView(nextView) {
    const normalized = normalizePlatformView(nextView) || DEFAULT_ACTIVE_VIEW;
    state.activeView = normalized;
    state.navExpanded = false;
    setLocationHash(`#${normalized}`);
    render();
  }

  function toggleNavigation() {
    state.navExpanded = !state.navExpanded;
    render();
  }

  const getNodeAttentionById = () => buildNodeAttentionById(state.oncallSummary);

  const getVisibleNodes = () => filterAndSortNodes(state.nodes, {
    searchTerm: state.nodeSearchTerm,
    statusFilter: state.nodeStatusFilter,
    sortBy: state.nodeSortBy,
  }, getNodeAttentionById());

  const syncSelectedNodeWithVisibleNodes = async () => {
    const visibleNodes = getVisibleNodes();
    const previousSelectedNodeId = state.selectedNodeId;

    if (!visibleNodes.some((node) => node?.nodeId === state.selectedNodeId)) {
      state.selectedNodeId = typeof visibleNodes[0]?.nodeId === "string"
        ? visibleNodes[0].nodeId
        : "";
      state.selectedNodeDetail = null;
    }

    if (!state.selectedNodeId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      render();
      return;
    }

    if (
      previousSelectedNodeId === state.selectedNodeId
      && state.selectedNodeDetail?.node?.nodeId === state.selectedNodeId
    ) {
      render();
      return;
    }

    try {
      state.selectedNodeDetail = await requestPlatformJson(fetchFn, "/api/platform/nodes/detail", {
        ownerPrincipalId: state.ownerPrincipalId,
        nodeId: state.selectedNodeId,
      }, "读取节点详情失败。");
      state.loadErrorMessage = "";
    } catch (error) {
      state.selectedNodeDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取节点详情失败。";
    } finally {
      render();
    }
  };

  const setNodeListControls = async (nextControls = {}) => {
    state.nodeSearchTerm = normalizeNodeSearchTerm(nextControls.searchTerm ?? state.nodeSearchTerm);
    state.nodeStatusFilter = normalizeNodeStatusFilter(nextControls.statusFilter ?? state.nodeStatusFilter);
    state.nodeSortBy = normalizeNodeSortBy(nextControls.sortBy ?? state.nodeSortBy);

    if (dom.nodeSearchInput && dom.nodeSearchInput.value !== state.nodeSearchTerm) {
      dom.nodeSearchInput.value = state.nodeSearchTerm;
    }

    if (dom.nodeStatusFilter && dom.nodeStatusFilter.value !== state.nodeStatusFilter) {
      dom.nodeStatusFilter.value = state.nodeStatusFilter;
    }

    if (dom.nodeSortSelect && dom.nodeSortSelect.value !== state.nodeSortBy) {
      dom.nodeSortSelect.value = state.nodeSortBy;
    }

    await syncSelectedNodeWithVisibleNodes();
  };

  const render = () => {
    applyActiveView(dom, state);

    if (dom.sidebar) {
      dom.sidebar.dataset.expanded = state.navExpanded ? "true" : "false";
    }

    if (dom.navToggle) {
      dom.navToggle.textContent = state.navExpanded ? "收起导航" : "展开导航";
    }

    const nodeSummary = summarizeNodes(state.nodes);
    const oncallSummary = normalizeOncallSummary(state.oncallSummary);
    const nodeAttentionById = buildNodeAttentionById(oncallSummary);
    const visibleNodes = filterAndSortNodes(state.nodes, {
      searchTerm: state.nodeSearchTerm,
      statusFilter: state.nodeStatusFilter,
      sortBy: state.nodeSortBy,
    }, nodeAttentionById);
    const governanceSummary = normalizeGovernanceSummary(state.governanceOverview?.summary);
    const managerHotspots = Array.isArray(state.governanceOverview?.managerHotspots)
      ? state.governanceOverview.managerHotspots
      : [];
    const oncallRecommendations = Array.isArray(oncallSummary.recommendations)
      ? oncallSummary.recommendations
      : [];
    const blockedRunCount = oncallSummary.counts.runWaitingActionCount + oncallSummary.counts.runFailedCount;
    const collaborationParents = Array.isArray(state.collaborationDashboard?.parents)
      ? state.collaborationDashboard.parents
      : [];
    const handoffItems = Array.isArray(state.handoffView?.handoffs)
      ? state.handoffView.handoffs
      : [];
    const workItemSummary = summarizeWorkItems(state.workItems);
    const mailboxSummary = summarizeMailboxItems(state.mailboxItems);
    const agentSummary = {
      total: state.agents.length,
      projects: state.projectBindings.length,
    };
    const meetingRoomSummary = summarizeMeetingRooms(state.meetingRooms);
    const selectedNodeLabel = state.selectedNodeDetail?.node?.displayName
      || state.selectedNodeDetail?.node?.nodeId
      || state.selectedNodeId;
    const selectedNodeAttention = selectedNodeLabel
      ? nodeAttentionById[state.selectedNodeId] ?? null
      : null;
    const selectedNodeActionResult = state.nodeActionResult?.nodeId === state.selectedNodeId
      ? state.nodeActionResult
      : null;
    const selectedMailboxItem = state.mailboxItems.find(
      (item) => item?.entry?.mailboxEntryId === state.selectedMailboxEntryId,
    ) ?? null;
    const hasNodes = state.nodes.length > 0;
    const hasVisibleNodes = visibleNodes.length > 0;
    const hasSelectedNodeDetail = Boolean(state.selectedNodeDetail?.node?.nodeId);
    const hasOncallRecommendations = oncallRecommendations.length > 0;
    const hasWaitingItems = state.waitingItems.length > 0;
    const hasCollaborationParents = collaborationParents.length > 0;
    const hasHandoffs = handoffItems.length > 0;
    const hasWorkItems = state.workItems.length > 0;
    const hasMailboxItems = state.mailboxItems.length > 0;
    const hasAgents = state.agents.length > 0;
    const hasProjects = state.projectBindings.length > 0;
    const hasRuns = state.runs.length > 0;
    const hasMeetingRooms = state.meetingRooms.length > 0;
    const selectedMeetingRoomLabel = state.selectedMeetingRoomDetail?.room?.title
      || state.selectedMeetingRoomId;
    const meetingRoomReadonly = isMeetingRoomReadOnly(state.selectedMeetingRoomDetail?.room?.status);
    const nodesStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在从平台控制面读取节点与治理摘要。"
        : state.ownerPrincipalId
          ? `已显示 ${visibleNodes.length} / ${state.nodes.length} 台节点；筛选：${resolveNodeStatusFilterLabel(state.nodeStatusFilter)}；排序：${resolveNodeSortByLabel(state.nodeSortBy)}。`
          : "请先填写 ownerPrincipalId，再读取当前平台控制面。";
    const governanceStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在整理 governance overview 与 waiting queue。"
        : state.ownerPrincipalId
          ? `当前共有 ${governanceSummary.total} 条待治理项，其中等人 ${governanceSummary.waitingHuman} 条、等 agent ${governanceSummary.waitingAgent} 条。`
          : "先填写 ownerPrincipalId，再查看当前平台下的治理摘要。";
    const oncallStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在汇总节点 attention、waiting 风险和 runs 卡点。"
        : state.ownerPrincipalId
          ? `当前主诊断：${resolveOncallSeverityLabel(oncallSummary.primaryDiagnosis.severity)}。`
          : "先填写 ownerPrincipalId，再查看当前平台值班建议。";
    const runsStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取最近 runs 列表。"
        : state.ownerPrincipalId
          ? `当前已接入 ${state.runs.length} 条 recent runs。`
          : "先填写 ownerPrincipalId，再查看当前平台 runs。";
    const meetingRoomsStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取平台会议室列表与详情。"
        : state.ownerPrincipalId
          ? `当前共有 ${meetingRoomSummary.total} 个会议室，其中进行中 ${meetingRoomSummary.open} 个。`
          : "先填写 ownerPrincipalId，再查看当前平台会议室。";
    const meetingRoomActionStatusMessage = state.meetingRoomActionPending
      ? "平台正在终止当前会议。"
      : state.meetingRoomActionMessage
        ? state.meetingRoomActionMessage
        : selectedMeetingRoomLabel
          ? (meetingRoomReadonly
              ? `当前选中：${selectedMeetingRoomLabel}（只读）`
              : `当前选中：${selectedMeetingRoomLabel}。平台页可强制终止，但不直接主持。`)
          : "选择一个会议室后，这里会显示完整讨论过程，并可在必要时终止会议。";
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
    const workItemsStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取当前平台 work-items。"
        : state.ownerPrincipalId
          ? `当前共有 ${workItemSummary.total} 条 work-item，其中排队中 ${workItemSummary.queued} 条。`
          : "先填写 ownerPrincipalId，再查看当前平台 work-items。";
    const selectedWorkItemLabel = state.selectedWorkItemDetail?.workItem?.goal
      || state.selectedWorkItemDetail?.workItem?.workItemId
      || state.selectedWorkItemId;
    const workItemActionStatusMessage = state.workItemActionPending
      ? `正在处理 work-item 动作：${state.workItemActionPending}`
      : state.workItemActionMessage
        ? state.workItemActionMessage
        : selectedWorkItemLabel
          ? `当前选中：${selectedWorkItemLabel}`
          : "选择一条 work-item 后，可执行 respond / escalate / cancel。";
    const mailboxAgentLabel = state.mailboxAgent?.displayName || state.mailboxAgentId;
    const mailboxStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取当前 agent mailbox。"
        : mailboxAgentLabel
          ? `当前正在查看 ${mailboxAgentLabel} 的 ${mailboxSummary.total} 条消息。`
          : state.ownerPrincipalId
            ? "可手动填写 agentId，或先选中一个 work-item 自动带出 agent。"
            : "先填写 ownerPrincipalId，再查看当前 mailbox。";
    const mailboxActionStatusMessage = state.mailboxActionPending
      ? `正在处理 mailbox 动作：${state.mailboxActionPending}`
      : state.mailboxActionMessage
        ? state.mailboxActionMessage
        : selectedMailboxItem?.entry?.mailboxEntryId
          ? `当前选中消息：${selectedMailboxItem.entry.mailboxEntryId}`
          : "选择一条消息后，可执行 pull / ack / respond。";
    const selectedAgentLabel = state.selectedAgentDetail?.agent?.displayName || state.selectedAgentId;
    const agentsStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取当前平台 agents 与 projects。"
        : state.ownerPrincipalId
          ? `当前共有 ${agentSummary.total} 个 agents、${agentSummary.projects} 条项目绑定。`
          : "先填写 ownerPrincipalId，再查看当前平台 agents 与 projects。";
    const agentsActionStatusMessage = state.agentsActionPending
      ? `正在处理 agents/projects 动作：${state.agentsActionPending}`
      : state.agentsActionMessage
        ? state.agentsActionMessage
        : selectedAgentLabel
          ? `当前选中 agent：${selectedAgentLabel}`
          : "可直接在这里创建 agent，并维护项目工作区绑定。";
    const nodeDetailStatusMessage = state.loadErrorMessage
      ? state.loadErrorMessage
      : state.loading
        ? "正在读取节点详情。"
        : selectedNodeLabel
          ? `当前选中：${selectedNodeLabel}`
          : hasNodes
            ? "点击左侧节点卡片，查看当前 lease、能力与心跳详情。"
            : "选择左侧节点后，这里会显示 lease、能力与心跳详情。";

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

    if (dom.mailboxAgentInput) {
      dom.mailboxAgentInput.value = state.mailboxAgentId;
    }

    if (dom.ownerSubmitButton) {
      dom.ownerSubmitButton.disabled = state.loading || Boolean(state.actionNodeId);
    }

    if (dom.refreshButton) {
      dom.refreshButton.disabled = state.loading || Boolean(state.actionNodeId);
      dom.refreshButton.textContent = state.loading ? "刷新中..." : "刷新控制面";
    }

    if (dom.dispatchSubmit) {
      dom.dispatchSubmit.disabled = state.loading || Boolean(state.workItemActionPending);
      dom.dispatchSubmit.textContent = state.workItemActionPending === "dispatch" ? "派发中..." : "派发 work-item";
    }

    if (dom.workItemResponseSubmit) {
      dom.workItemResponseSubmit.disabled = state.loading
        || Boolean(state.workItemActionPending)
        || !state.selectedWorkItemId;
      dom.workItemResponseSubmit.textContent = state.workItemActionPending === "respond"
        ? "处理中..."
        : "Respond 当前项";
    }

    if (dom.workItemEscalateSubmit) {
      dom.workItemEscalateSubmit.disabled = state.loading
        || Boolean(state.workItemActionPending)
        || !state.selectedWorkItemId;
      dom.workItemEscalateSubmit.textContent = state.workItemActionPending === "escalate"
        ? "升级中..."
        : "Escalate 当前项";
    }

    if (dom.workItemCancelButton) {
      dom.workItemCancelButton.disabled = state.loading
        || Boolean(state.workItemActionPending)
        || !state.selectedWorkItemId;
      dom.workItemCancelButton.textContent = state.workItemActionPending === "cancel"
        ? "取消中..."
        : "Cancel 当前项";
    }

    if (dom.mailboxSubmit) {
      dom.mailboxSubmit.disabled = state.loading || Boolean(state.mailboxActionPending);
      dom.mailboxSubmit.textContent = state.mailboxActionPending === "load" ? "读取中..." : "加载 mailbox";
    }

    if (dom.mailboxPullButton) {
      dom.mailboxPullButton.disabled = state.loading || Boolean(state.mailboxActionPending);
      dom.mailboxPullButton.textContent = state.mailboxActionPending === "pull" ? "Pull 中..." : "Pull 下一条";
    }

    if (dom.mailboxAckButton) {
      dom.mailboxAckButton.disabled = state.loading
        || Boolean(state.mailboxActionPending)
        || !state.selectedMailboxEntryId;
    }

    if (dom.mailboxResponseSubmit) {
      dom.mailboxResponseSubmit.disabled = state.loading
        || Boolean(state.mailboxActionPending)
        || !state.selectedMailboxEntryId;
      dom.mailboxResponseSubmit.textContent = state.mailboxActionPending === "respond"
        ? "回复中..."
        : "回复 mailbox";
    }

    if (dom.agentCreateSubmit) {
      dom.agentCreateSubmit.disabled = state.loading || Boolean(state.agentsActionPending);
      dom.agentCreateSubmit.textContent = state.agentsActionPending === "create-agent"
        ? "创建中..."
        : "创建 agent";
    }

    if (dom.projectBindingSubmit) {
      dom.projectBindingSubmit.disabled = state.loading || Boolean(state.agentsActionPending);
      dom.projectBindingSubmit.textContent = state.agentsActionPending === "upsert-project"
        ? "保存中..."
        : "保存项目绑定";
    }

    if (dom.nodesStatus) {
      dom.nodesStatus.textContent = nodesStatusMessage;
    }

    if (dom.actionStatus) {
      dom.actionStatus.textContent = state.actionNodeId
        ? `正在治理节点 ${state.actionNodeId}。`
        : state.actionMessage
          ? state.actionMessage
          : "可直接在节点卡片上执行 drain / offline / reclaim / delete。";
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
      dom.nodesEmpty.hidden = hasVisibleNodes;
      dom.nodesEmpty.textContent = state.loadErrorMessage
        ? "读取失败，请检查 ownerPrincipalId 或当前平台进程状态。"
        : hasNodes
          ? "当前筛选条件下没有匹配节点。"
          : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有注册节点。"
          : "先填写 ownerPrincipalId，再从平台控制面读取节点列表。";
    }

    if (dom.nodesList) {
      dom.nodesList.innerHTML = hasVisibleNodes
        ? visibleNodes.map((node) => renderNodeCard(node, state.selectedNodeId, nodeAttentionById[node?.nodeId ?? ""])).join("")
        : "";
    }

    if (dom.nodeDetailStatus) {
      dom.nodeDetailStatus.textContent = nodeDetailStatusMessage;
    }

    if (dom.nodeDetail) {
      dom.nodeDetail.innerHTML = hasSelectedNodeDetail
        ? renderNodeDetail(state.selectedNodeDetail, {
          referenceNow: state.oncallSummary?.generatedAt,
          attention: selectedNodeAttention,
          actionResult: selectedNodeActionResult,
        })
        : hasVisibleNodes
          ? '<p class="platform-inline-note">点击任意节点卡片，查看当前 detail。</p>'
          : "";
    }

    if (dom.oncallStatus) {
      dom.oncallStatus.textContent = oncallStatusMessage;
    }

    if (dom.oncallErrors) {
      dom.oncallErrors.textContent = String(oncallSummary.counts.nodeErrorCount);
    }

    if (dom.oncallWarnings) {
      dom.oncallWarnings.textContent = String(oncallSummary.counts.nodeWarningCount);
    }

    if (dom.oncallWaiting) {
      dom.oncallWaiting.textContent = String(oncallSummary.counts.waitingAttentionCount);
    }

    if (dom.oncallRuns) {
      dom.oncallRuns.textContent = String(blockedRunCount);
    }

    if (dom.oncallDiagnosis) {
      dom.oncallDiagnosis.innerHTML = state.ownerPrincipalId
        ? renderOncallDiagnosisCard(oncallSummary.primaryDiagnosis)
        : "";
    }

    if (dom.oncallNextSteps) {
      dom.oncallNextSteps.innerHTML = state.ownerPrincipalId
        ? renderOncallNextSteps(oncallSummary.recommendedNextSteps)
        : "";
    }

    if (dom.oncallEmpty) {
      dom.oncallEmpty.hidden = hasOncallRecommendations;
      dom.oncallEmpty.textContent = state.loadErrorMessage
        ? "值班建议读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前没有需要立即处理的值班建议。"
          : "先填写 ownerPrincipalId，再读取当前平台的值班建议。";
    }

    if (dom.oncallList) {
      dom.oncallList.innerHTML = hasOncallRecommendations
        ? oncallRecommendations.map((item) => renderOncallRecommendationCard(item)).join("")
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

    if (dom.workItemsStatus) {
      dom.workItemsStatus.textContent = workItemsStatusMessage;
    }

    if (dom.workItemsTotal) {
      dom.workItemsTotal.textContent = String(workItemSummary.total);
    }

    if (dom.workItemsWaitingHuman) {
      dom.workItemsWaitingHuman.textContent = String(workItemSummary.waitingHuman);
    }

    if (dom.workItemsWaitingAgent) {
      dom.workItemsWaitingAgent.textContent = String(workItemSummary.waitingAgent);
    }

    if (dom.workItemsQueued) {
      dom.workItemsQueued.textContent = String(workItemSummary.queued);
    }

    if (dom.workItemsEmpty) {
      dom.workItemsEmpty.hidden = hasWorkItems;
      dom.workItemsEmpty.textContent = state.loadErrorMessage
        ? "work-items 读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有 work-items。"
          : "先填写 ownerPrincipalId，再读取当前平台 work-items。";
    }

    if (dom.workItemsList) {
      dom.workItemsList.innerHTML = hasWorkItems
        ? state.workItems.map((item) => renderWorkItemCard(item, state.selectedWorkItemId)).join("")
        : "";
    }

    if (dom.workItemDetail) {
      dom.workItemDetail.innerHTML = state.selectedWorkItemDetail
        ? renderWorkItemDetail(state.selectedWorkItemDetail)
        : hasWorkItems
          ? '<p class="platform-inline-note">点击任意 work-item 卡片，查看当前 detail。</p>'
          : "";
    }

    if (dom.workItemActionStatus) {
      dom.workItemActionStatus.textContent = workItemActionStatusMessage;
    }

    if (dom.mailboxStatus) {
      dom.mailboxStatus.textContent = mailboxStatusMessage;
    }

    if (dom.mailboxTotal) {
      dom.mailboxTotal.textContent = String(mailboxSummary.total);
    }

    if (dom.mailboxPending) {
      dom.mailboxPending.textContent = String(mailboxSummary.pending);
    }

    if (dom.mailboxAcked) {
      dom.mailboxAcked.textContent = String(mailboxSummary.acked);
    }

    if (dom.mailboxEmpty) {
      dom.mailboxEmpty.hidden = hasMailboxItems;
      dom.mailboxEmpty.textContent = state.loadErrorMessage
        ? "mailbox 读取失败，请先排查平台控制面。"
        : state.mailboxAgentId
          ? `${state.mailboxAgentId} 当前还没有 mailbox 消息。`
          : "先填写 agentId，再读取当前 mailbox。";
    }

    if (dom.mailboxList) {
      dom.mailboxList.innerHTML = hasMailboxItems
        ? state.mailboxItems.map((item) => renderMailboxItemCard(item, state.selectedMailboxEntryId)).join("")
        : "";
    }

    if (dom.mailboxDetail) {
      dom.mailboxDetail.innerHTML = selectedMailboxItem
        ? renderMailboxDetail(selectedMailboxItem, state.mailboxAgent)
        : hasMailboxItems
          ? '<p class="platform-inline-note">点击任意消息卡片，查看当前 detail。</p>'
          : "";
    }

    if (dom.mailboxActionStatus) {
      dom.mailboxActionStatus.textContent = mailboxActionStatusMessage;
    }

    if (dom.agentsStatus) {
      dom.agentsStatus.textContent = agentsStatusMessage;
    }

    if (dom.agentsTotal) {
      dom.agentsTotal.textContent = String(agentSummary.total);
    }

    if (dom.projectsTotal) {
      dom.projectsTotal.textContent = String(agentSummary.projects);
    }

    if (dom.agentsEmpty) {
      dom.agentsEmpty.hidden = hasAgents;
      dom.agentsEmpty.textContent = state.loadErrorMessage
        ? "agents 读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有 agents。"
          : "先填写 ownerPrincipalId，再读取当前平台 agents。";
    }

    if (dom.projectsEmpty) {
      dom.projectsEmpty.hidden = hasProjects;
      dom.projectsEmpty.textContent = state.loadErrorMessage
        ? "projects 读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有项目工作区绑定。"
          : "先填写 ownerPrincipalId，再读取当前平台项目工作区绑定。";
    }

    if (dom.agentsList) {
      dom.agentsList.innerHTML = hasAgents
        ? state.agents.map((agent) => renderAgentCard(agent, state.selectedAgentId)).join("")
        : "";
    }

    if (dom.agentDetail) {
      dom.agentDetail.innerHTML = state.selectedAgentDetail
        ? renderAgentDetail(state.selectedAgentDetail)
        : hasAgents
          ? '<p class="platform-inline-note">点击任意 agent 卡片，查看当前 detail。</p>'
          : "";
    }

    if (dom.projectsList) {
      dom.projectsList.innerHTML = hasProjects
        ? state.projectBindings.map((binding) => renderProjectBindingCard(binding)).join("")
        : "";
    }

    if (dom.agentsActionStatus) {
      dom.agentsActionStatus.textContent = agentsActionStatusMessage;
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

    if (dom.meetingRoomsStatus) {
      dom.meetingRoomsStatus.textContent = meetingRoomsStatusMessage;
    }

    if (dom.meetingRoomsActionStatus) {
      dom.meetingRoomsActionStatus.textContent = meetingRoomActionStatusMessage;
    }

    if (dom.meetingRoomsTotal) {
      dom.meetingRoomsTotal.textContent = String(meetingRoomSummary.total);
    }

    if (dom.meetingRoomsOpen) {
      dom.meetingRoomsOpen.textContent = String(meetingRoomSummary.open);
    }

    if (dom.meetingRoomsTerminated) {
      dom.meetingRoomsTerminated.textContent = String(meetingRoomSummary.terminated);
    }

    if (dom.meetingRoomsClosed) {
      dom.meetingRoomsClosed.textContent = String(meetingRoomSummary.closed);
    }

    if (dom.meetingRoomsEmpty) {
      dom.meetingRoomsEmpty.hidden = hasMeetingRooms;
      dom.meetingRoomsEmpty.textContent = state.loadErrorMessage
        ? "会议室读取失败，请先排查平台控制面。"
        : state.ownerPrincipalId
          ? "当前 ownerPrincipalId 下还没有会议室。"
          : "先填写 ownerPrincipalId，再读取当前平台会议室。";
    }

    if (dom.meetingRoomsList) {
      dom.meetingRoomsList.innerHTML = hasMeetingRooms
        ? state.meetingRooms.map((room) => renderMeetingRoomCard(room, state.selectedMeetingRoomId)).join("")
        : "";
    }

    if (dom.meetingRoomDetail) {
      dom.meetingRoomDetail.innerHTML = state.selectedMeetingRoomDetail
        ? renderMeetingRoomDetail(state.selectedMeetingRoomDetail)
        : hasMeetingRooms
          ? '<p class="platform-inline-note">点击任意会议室卡片，查看当前讨论过程。</p>'
          : "";
    }

    if (dom.meetingRoomTerminateSubmit) {
      dom.meetingRoomTerminateSubmit.disabled = state.loading
        || Boolean(state.meetingRoomActionPending)
        || !state.selectedMeetingRoomId
        || meetingRoomReadonly;
      dom.meetingRoomTerminateSubmit.textContent = state.meetingRoomActionPending === "terminate"
        ? "终止中..."
        : "终止当前会议";
    }

    if (dom.meetingRoomTerminateReasonInput) {
      dom.meetingRoomTerminateReasonInput.disabled = state.loading
        || Boolean(state.meetingRoomActionPending)
        || !state.selectedMeetingRoomId
        || meetingRoomReadonly;
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
      state.selectedNodeId = "";
      state.selectedNodeDetail = null;
      state.nodeActionResult = null;
      state.oncallSummary = createEmptyOncallSummary();
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
      state.workItems = [];
      state.selectedWorkItemId = "";
      state.selectedWorkItemDetail = null;
      state.mailboxAgentId = "";
      state.mailboxAgent = null;
      state.mailboxItems = [];
      state.selectedMailboxEntryId = "";
      state.organizations = [];
      state.agents = [];
      state.selectedAgentId = "";
      state.selectedAgentDetail = null;
      state.projectBindings = [];
      state.runs = [];
      state.selectedRunId = "";
      state.selectedRunDetail = null;
      state.meetingRooms = [];
      state.selectedMeetingRoomId = "";
      state.selectedMeetingRoomDetail = null;
      render();
      return;
    }

    storage?.setItem?.(OWNER_PRINCIPAL_STORAGE_KEY, state.ownerPrincipalId);
    state.loading = true;
    state.loadErrorMessage = "";
    render();

    try {
      const [
        nodesPayload,
        oncallPayload,
        governancePayload,
        waitingPayload,
        collaborationPayload,
        runsPayload,
        workItemsPayload,
        agentsPayload,
        projectBindingsPayload,
        meetingRoomsPayload,
      ] = await Promise.all([
        requestPlatformJson(fetchFn, "/api/platform/nodes/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取节点列表失败。"),
        requestPlatformJson(fetchFn, "/api/platform/oncall/summary", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取值班建议失败。"),
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
        requestPlatformJson(fetchFn, "/api/platform/work-items/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取 work-items 失败。"),
        requestPlatformJson(fetchFn, "/api/platform/agents/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取 agents 失败。"),
        requestPlatformJson(fetchFn, "/api/platform/projects/workspace-binding/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取项目工作区绑定失败。"),
        requestPlatformJson(fetchFn, "/api/platform/meeting-rooms/list", {
          ownerPrincipalId: state.ownerPrincipalId,
        }, "读取会议室列表失败。"),
      ]);

      state.nodes = Array.isArray(nodesPayload?.nodes) ? nodesPayload.nodes : [];
      state.oncallSummary = normalizeOncallSummary(oncallPayload);
      state.nodeActionResult = null;
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
      state.workItems = Array.isArray(workItemsPayload?.workItems) ? workItemsPayload.workItems : [];
      state.organizations = Array.isArray(agentsPayload?.organizations) ? agentsPayload.organizations : [];
      state.agents = Array.isArray(agentsPayload?.agents) ? agentsPayload.agents : [];
      state.projectBindings = Array.isArray(projectBindingsPayload?.bindings) ? projectBindingsPayload.bindings : [];
      state.meetingRooms = Array.isArray(meetingRoomsPayload?.rooms) ? meetingRoomsPayload.rooms : [];

      const visibleNodes = filterAndSortNodes(state.nodes, {
        searchTerm: state.nodeSearchTerm,
        statusFilter: state.nodeStatusFilter,
        sortBy: state.nodeSortBy,
      }, buildNodeAttentionById(state.oncallSummary));

      if (!visibleNodes.some((node) => node?.nodeId === state.selectedNodeId)) {
        state.selectedNodeId = typeof visibleNodes[0]?.nodeId === "string"
          ? visibleNodes[0].nodeId
          : "";
      }

      state.selectedNodeDetail = state.selectedNodeId
        ? await requestPlatformJson(fetchFn, "/api/platform/nodes/detail", {
          ownerPrincipalId: state.ownerPrincipalId,
          nodeId: state.selectedNodeId,
        }, "读取节点详情失败。")
        : null;

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

      if (!state.workItems.some((item) => item?.workItemId === state.selectedWorkItemId)) {
        state.selectedWorkItemId = typeof state.workItems[0]?.workItemId === "string"
          ? state.workItems[0].workItemId
          : "";
      }

      state.selectedWorkItemDetail = state.selectedWorkItemId
        ? await requestPlatformJson(fetchFn, "/api/platform/work-items/detail", {
          ownerPrincipalId: state.ownerPrincipalId,
          workItemId: state.selectedWorkItemId,
        }, "读取 work-item detail 失败。")
        : null;

      if (!state.agents.some((agent) => agent?.agentId === state.selectedAgentId)) {
        state.selectedAgentId = typeof state.agents[0]?.agentId === "string"
          ? state.agents[0].agentId
          : "";
      }

      state.selectedAgentDetail = state.selectedAgentId
        ? await requestPlatformJson(fetchFn, "/api/platform/agents/detail", {
          ownerPrincipalId: state.ownerPrincipalId,
          agentId: state.selectedAgentId,
        }, "读取 agent detail 失败。")
        : null;

      const nextMailboxAgentId = resolvePreferredMailboxAgentId(
        state.mailboxAgentId,
        state.selectedWorkItemDetail,
        state.workItems,
      );
      state.mailboxAgentId = nextMailboxAgentId;
      state.mailboxAgent = null;
      state.mailboxItems = [];
      state.selectedMailboxEntryId = "";

      if (dom.mailboxAgentInput) {
        dom.mailboxAgentInput.value = state.mailboxAgentId;
      }

      if (state.mailboxAgentId) {
        const mailboxPayload = await requestPlatformJson(fetchFn, "/api/platform/agents/mailbox/list", {
          ownerPrincipalId: state.ownerPrincipalId,
          agentId: state.mailboxAgentId,
        }, "读取 mailbox 失败。");
        state.mailboxAgent = mailboxPayload?.agent ?? null;
        state.mailboxItems = Array.isArray(mailboxPayload?.items) ? mailboxPayload.items : [];
        state.selectedMailboxEntryId = typeof state.mailboxItems[0]?.entry?.mailboxEntryId === "string"
          ? state.mailboxItems[0].entry.mailboxEntryId
          : "";
      }

      if (!state.runs.some((run) => run?.runId === state.selectedRunId)) {
        state.selectedRunId = typeof state.runs[0]?.runId === "string" ? state.runs[0].runId : "";
      }

      state.selectedRunDetail = state.selectedRunId
        ? await requestPlatformJson(fetchFn, "/api/platform/runs/detail", {
          ownerPrincipalId: state.ownerPrincipalId,
          runId: state.selectedRunId,
        }, "读取 run detail 失败。")
        : null;

      if (!state.meetingRooms.some((room) => room?.roomId === state.selectedMeetingRoomId)) {
        state.selectedMeetingRoomId = typeof state.meetingRooms[0]?.roomId === "string"
          ? state.meetingRooms[0].roomId
          : "";
      }

      state.selectedMeetingRoomDetail = state.selectedMeetingRoomId
        ? await requestPlatformJson(fetchFn, "/api/platform/meeting-rooms/detail", {
          ownerPrincipalId: state.ownerPrincipalId,
          roomId: state.selectedMeetingRoomId,
        }, "读取会议室详情失败。")
        : null;
    } catch (error) {
      state.nodes = [];
      state.selectedNodeId = "";
      state.selectedNodeDetail = null;
      state.nodeActionResult = null;
      state.oncallSummary = createEmptyOncallSummary();
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
      state.workItems = [];
      state.selectedWorkItemId = "";
      state.selectedWorkItemDetail = null;
      state.mailboxAgentId = "";
      state.mailboxAgent = null;
      state.mailboxItems = [];
      state.selectedMailboxEntryId = "";
      state.organizations = [];
      state.agents = [];
      state.selectedAgentId = "";
      state.selectedAgentDetail = null;
      state.projectBindings = [];
      state.runs = [];
      state.selectedRunId = "";
      state.selectedRunDetail = null;
      state.meetingRooms = [];
      state.selectedMeetingRoomId = "";
      state.selectedMeetingRoomDetail = null;
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

  const loadMeetingRoomDetail = async (roomId) => {
    const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";

    if (!normalizedRoomId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.selectedMeetingRoomId = normalizedRoomId;
    render();

    try {
      state.selectedMeetingRoomDetail = await requestPlatformJson(fetchFn, "/api/platform/meeting-rooms/detail", {
        ownerPrincipalId: state.ownerPrincipalId,
        roomId: normalizedRoomId,
      }, "读取会议室详情失败。");
      state.loadErrorMessage = "";
    } catch (error) {
      state.selectedMeetingRoomDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取会议室详情失败。";
    } finally {
      render();
    }
  };

  const loadNodeDetail = async (nodeId) => {
    const normalizedNodeId = typeof nodeId === "string" ? nodeId.trim() : "";

    if (!normalizedNodeId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.selectedNodeId = normalizedNodeId;
    render();

    try {
      state.selectedNodeDetail = await requestPlatformJson(fetchFn, "/api/platform/nodes/detail", {
        ownerPrincipalId: state.ownerPrincipalId,
        nodeId: normalizedNodeId,
      }, "读取节点详情失败。");
      state.loadErrorMessage = "";
    } catch (error) {
      state.selectedNodeDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取节点详情失败。";
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

  const loadWorkItemDetail = async (workItemId) => {
    const normalizedWorkItemId = typeof workItemId === "string" ? workItemId.trim() : "";

    if (!normalizedWorkItemId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.selectedWorkItemId = normalizedWorkItemId;
    render();

    try {
      state.selectedWorkItemDetail = await requestPlatformJson(fetchFn, "/api/platform/work-items/detail", {
        ownerPrincipalId: state.ownerPrincipalId,
        workItemId: normalizedWorkItemId,
      }, "读取 work-item detail 失败。");
      state.loadErrorMessage = "";

      if (!state.mailboxAgentId) {
        const preferredMailboxAgentId = resolvePreferredMailboxAgentId(
          "",
          state.selectedWorkItemDetail,
          state.workItems,
        );

        if (preferredMailboxAgentId) {
          await loadMailbox(preferredMailboxAgentId);
          return;
        }
      }
    } catch (error) {
      state.selectedWorkItemDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取 work-item detail 失败。";
    } finally {
      render();
    }
  };

  const loadMailbox = async (agentId) => {
    const normalizedAgentId = normalizeOwnerPrincipalId(agentId ?? dom.mailboxAgentInput?.value ?? state.mailboxAgentId);

    if (!normalizedAgentId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.mailboxAgentId = normalizedAgentId;
    state.mailboxActionPending = "load";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/agents/mailbox/list", {
        ownerPrincipalId: state.ownerPrincipalId,
        agentId: normalizedAgentId,
      }, "读取 mailbox 失败。");
      state.mailboxAgent = payload?.agent ?? null;
      state.mailboxItems = Array.isArray(payload?.items) ? payload.items : [];
      state.selectedMailboxEntryId = state.mailboxItems.some(
        (item) => item?.entry?.mailboxEntryId === state.selectedMailboxEntryId,
      )
        ? state.selectedMailboxEntryId
        : (typeof state.mailboxItems[0]?.entry?.mailboxEntryId === "string"
            ? state.mailboxItems[0].entry.mailboxEntryId
            : "");
      state.mailboxActionMessage = `已读取 ${normalizedAgentId} 的 mailbox。`;
      state.loadErrorMessage = "";
    } catch (error) {
      state.mailboxAgent = null;
      state.mailboxItems = [];
      state.selectedMailboxEntryId = "";
      state.mailboxActionMessage = error instanceof Error ? error.message : "读取 mailbox 失败。";
    } finally {
      state.mailboxActionPending = "";
      render();
    }
  };

  const loadAgentDetail = async (agentId) => {
    const normalizedAgentId = normalizeOwnerPrincipalId(agentId);

    if (!normalizedAgentId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.selectedAgentId = normalizedAgentId;
    render();

    try {
      state.selectedAgentDetail = await requestPlatformJson(fetchFn, "/api/platform/agents/detail", {
        ownerPrincipalId: state.ownerPrincipalId,
        agentId: normalizedAgentId,
      }, "读取 agent detail 失败。");
      state.loadErrorMessage = "";
    } catch (error) {
      state.selectedAgentDetail = null;
      state.loadErrorMessage = error instanceof Error ? error.message : "读取 agent detail 失败。";
    } finally {
      render();
    }
  };

  const createAgent = async (agent) => {
    if (!state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    const departmentRole = typeof agent?.departmentRole === "string" ? agent.departmentRole.trim() : "";

    if (!departmentRole) {
      state.agentsActionMessage = "创建 agent 需要 departmentRole。";
      render();
      return;
    }

    state.agentsActionPending = "create-agent";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/agents/create", {
        ownerPrincipalId: state.ownerPrincipalId,
        agent: {
          departmentRole,
          displayName: normalizeOptionalText(agent?.displayName),
          mission: normalizeOptionalText(agent?.mission),
        },
      }, "创建 agent 失败。");
      const organization = payload?.organization;
      const principal = payload?.principal;
      const createdAgent = payload?.agent;

      if (organization?.organizationId) {
        state.organizations = upsertById(state.organizations, organization, "organizationId");
      }

      if (createdAgent?.agentId) {
        state.agents = upsertById(state.agents, createdAgent, "agentId");
        state.selectedAgentId = createdAgent.agentId;
        state.selectedAgentDetail = {
          organization: organization ?? { organizationId: "", displayName: "", slug: "", ownerPrincipalId: state.ownerPrincipalId },
          principal: principal ?? { principalId: "", organizationId: organization?.organizationId ?? "", displayName: "" },
          agent: createdAgent,
          workspacePolicy: {
            agentId: createdAgent.agentId,
            canonicalWorkspacePath: null,
            additionalWorkspacePaths: [],
          },
          runtimeProfile: {
            agentId: createdAgent.agentId,
            provider: null,
            model: null,
          },
          authAccounts: [],
          thirdPartyProviders: [],
        };
      }

      state.agentsActionMessage = createdAgent?.agentId
        ? `已创建 ${createdAgent.agentId}。`
        : "已创建 agent。";
      state.loadErrorMessage = "";
    } catch (error) {
      state.agentsActionMessage = error instanceof Error ? error.message : "创建 agent 失败。";
    } finally {
      state.agentsActionPending = "";
      render();
    }
  };

  const upsertProjectBinding = async (binding) => {
    if (!state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    const projectId = typeof binding?.projectId === "string" ? binding.projectId.trim() : "";
    const organizationId = typeof binding?.organizationId === "string" ? binding.organizationId.trim() : "";

    if (!projectId || !organizationId) {
      state.agentsActionMessage = "保存项目绑定需要 projectId 和 organizationId。";
      render();
      return;
    }

    state.agentsActionPending = "upsert-project";
    render();

    try {
      const preferredNodeId = normalizeOptionalText(binding?.preferredNodeId);
      const bindingPayload = {
        projectId,
        organizationId,
        displayName: normalizeOptionalText(binding?.displayName),
        canonicalWorkspacePath: normalizeOptionalText(binding?.canonicalWorkspacePath),
        continuityMode: binding?.continuityMode === "replicated" ? "replicated" : "sticky",
      };

      if (preferredNodeId) {
        bindingPayload.preferredNodeId = preferredNodeId;
      }

      const payload = await requestPlatformJson(fetchFn, "/api/platform/projects/workspace-binding/upsert", {
        ownerPrincipalId: state.ownerPrincipalId,
        binding: bindingPayload,
      }, "保存项目绑定失败。");
      const nextBinding = payload?.binding;

      if (nextBinding?.projectId) {
        state.projectBindings = upsertById(state.projectBindings, nextBinding, "projectId");
      }

      state.agentsActionMessage = nextBinding?.projectId
        ? `已保存 ${nextBinding.projectId}。`
        : "已保存项目绑定。";
      state.loadErrorMessage = "";
    } catch (error) {
      state.agentsActionMessage = error instanceof Error ? error.message : "保存项目绑定失败。";
    } finally {
      state.agentsActionPending = "";
      render();
    }
  };

  const dispatchWorkItem = async (workItem) => {
    if (!state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    const normalizedGoal = typeof workItem?.goal === "string" ? workItem.goal.trim() : "";
    const normalizedTargetAgentId = normalizeOwnerPrincipalId(workItem?.targetAgentId);
    const normalizedSourceType = typeof workItem?.sourceType === "string" ? workItem.sourceType.trim() : "human";
    const normalizedPriority = typeof workItem?.priority === "string" ? workItem.priority.trim() : "normal";

    if (!normalizedGoal || !normalizedTargetAgentId) {
      state.workItemActionMessage = "派发 work-item 需要 targetAgentId 和 goal。";
      render();
      return;
    }

    state.workItemActionPending = "dispatch";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/work-items/dispatch", {
        ownerPrincipalId: state.ownerPrincipalId,
        workItem: {
          targetAgentId: normalizedTargetAgentId,
          sourceType: normalizedSourceType,
          goal: normalizedGoal,
          priority: normalizedPriority,
        },
      }, "派发 work-item 失败。");
      const createdWorkItem = payload?.workItem;

      if (createdWorkItem?.workItemId) {
        state.workItems = [createdWorkItem, ...state.workItems.filter(
          (item) => item?.workItemId !== createdWorkItem.workItemId,
        )];
        state.selectedWorkItemId = createdWorkItem.workItemId;
        state.selectedWorkItemDetail = {
          ...(state.selectedWorkItemDetail ?? {}),
          workItem: createdWorkItem,
          targetAgent: {
            agentId: normalizedTargetAgentId,
            displayName: normalizedTargetAgentId,
          },
        };
      }

      if (!state.mailboxAgentId) {
        state.mailboxAgentId = normalizedTargetAgentId;
      }

      state.workItemActionMessage = createdWorkItem?.workItemId
        ? `已派发 ${createdWorkItem.workItemId}。`
        : "已派发 work-item。";
      state.loadErrorMessage = "";
    } catch (error) {
      state.workItemActionMessage = error instanceof Error ? error.message : "派发 work-item 失败。";
    } finally {
      state.workItemActionPending = "";
      render();
    }
  };

  const respondWorkItem = async (workItemId, response) => {
    const normalizedWorkItemId = typeof workItemId === "string" ? workItemId.trim() : "";

    if (!normalizedWorkItemId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.workItemActionPending = "respond";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/work-items/respond", {
        ownerPrincipalId: state.ownerPrincipalId,
        workItemId: normalizedWorkItemId,
        response,
      }, "响应 work-item 失败。");
      mergeWorkItemIntoState(payload?.workItem, state);
      state.workItemActionMessage = `已响应 ${normalizedWorkItemId}。`;
      state.loadErrorMessage = "";
    } catch (error) {
      state.workItemActionMessage = error instanceof Error ? error.message : "响应 work-item 失败。";
    } finally {
      state.workItemActionPending = "";
      render();
    }
  };

  const escalateWorkItem = async (workItemId, escalation) => {
    const normalizedWorkItemId = typeof workItemId === "string" ? workItemId.trim() : "";

    if (!normalizedWorkItemId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.workItemActionPending = "escalate";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/work-items/escalate", {
        ownerPrincipalId: state.ownerPrincipalId,
        workItemId: normalizedWorkItemId,
        escalation,
      }, "升级 work-item 失败。");
      mergeWorkItemIntoState(payload?.workItem, state);
      state.workItemActionMessage = `已升级 ${normalizedWorkItemId}。`;
      state.loadErrorMessage = "";
    } catch (error) {
      state.workItemActionMessage = error instanceof Error ? error.message : "升级 work-item 失败。";
    } finally {
      state.workItemActionPending = "";
      render();
    }
  };

  const cancelWorkItem = async (workItemId) => {
    const normalizedWorkItemId = typeof workItemId === "string" ? workItemId.trim() : "";

    if (!normalizedWorkItemId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.workItemActionPending = "cancel";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/work-items/cancel", {
        ownerPrincipalId: state.ownerPrincipalId,
        workItemId: normalizedWorkItemId,
      }, "取消 work-item 失败。");
      mergeWorkItemIntoState(payload?.workItem, state);
      state.workItemActionMessage = `已取消 ${normalizedWorkItemId}。`;
      state.loadErrorMessage = "";
    } catch (error) {
      state.workItemActionMessage = error instanceof Error ? error.message : "取消 work-item 失败。";
    } finally {
      state.workItemActionPending = "";
      render();
    }
  };

  const pullMailbox = async (agentId) => {
    const normalizedAgentId = normalizeOwnerPrincipalId(agentId ?? state.mailboxAgentId);

    if (!normalizedAgentId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.mailboxActionPending = "pull";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/agents/mailbox/pull", {
        ownerPrincipalId: state.ownerPrincipalId,
        agentId: normalizedAgentId,
      }, "pull mailbox 失败。");
      const pulledItem = payload?.item ?? null;

      if (pulledItem?.entry?.mailboxEntryId) {
        upsertMailboxItem(state, pulledItem);
        state.selectedMailboxEntryId = pulledItem.entry.mailboxEntryId;
        state.mailboxActionMessage = `已 pull ${pulledItem.entry.mailboxEntryId}。`;
      } else {
        state.mailboxActionMessage = `当前没有可 pull 的 mailbox 消息。`;
      }

      state.loadErrorMessage = "";
    } catch (error) {
      state.mailboxActionMessage = error instanceof Error ? error.message : "pull mailbox 失败。";
    } finally {
      state.mailboxActionPending = "";
      render();
    }
  };

  const ackMailbox = async (agentId, mailboxEntryId) => {
    const normalizedAgentId = normalizeOwnerPrincipalId(agentId ?? state.mailboxAgentId);
    const normalizedMailboxEntryId = typeof mailboxEntryId === "string"
      ? mailboxEntryId.trim()
      : state.selectedMailboxEntryId;

    if (!normalizedAgentId || !normalizedMailboxEntryId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.mailboxActionPending = "ack";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/agents/mailbox/ack", {
        ownerPrincipalId: state.ownerPrincipalId,
        agentId: normalizedAgentId,
        mailboxEntryId: normalizedMailboxEntryId,
      }, "ack mailbox 失败。");
      mergeMailboxEntryIntoState(state, payload?.mailboxEntry);
      state.mailboxActionMessage = `已确认 ${normalizedMailboxEntryId}。`;
      state.loadErrorMessage = "";
    } catch (error) {
      state.mailboxActionMessage = error instanceof Error ? error.message : "ack mailbox 失败。";
    } finally {
      state.mailboxActionPending = "";
      render();
    }
  };

  const respondMailbox = async (agentId, mailboxEntryId, response) => {
    const normalizedAgentId = normalizeOwnerPrincipalId(agentId ?? state.mailboxAgentId);
    const normalizedMailboxEntryId = typeof mailboxEntryId === "string"
      ? mailboxEntryId.trim()
      : state.selectedMailboxEntryId;

    if (!normalizedAgentId || !normalizedMailboxEntryId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    state.mailboxActionPending = "respond";
    render();

    try {
      const payload = await requestPlatformJson(fetchFn, "/api/platform/agents/mailbox/respond", {
        ownerPrincipalId: state.ownerPrincipalId,
        agentId: normalizedAgentId,
        mailboxEntryId: normalizedMailboxEntryId,
        response,
      }, "回复 mailbox 失败。");
      mergeMailboxEntryIntoState(state, payload?.sourceMailboxEntry);
      upsertMailboxItem(state, {
        entry: payload?.responseMailboxEntry,
        message: payload?.responseMessage,
      });
      mergeWorkItemIntoState(payload?.resumedWorkItem, state);
      state.mailboxActionMessage = `已回复 ${normalizedMailboxEntryId}。`;
      state.loadErrorMessage = "";
    } catch (error) {
      state.mailboxActionMessage = error instanceof Error ? error.message : "回复 mailbox 失败。";
    } finally {
      state.mailboxActionPending = "";
      render();
    }
  };

  const selectMailboxEntry = (mailboxEntryId) => {
    const normalizedMailboxEntryId = typeof mailboxEntryId === "string" ? mailboxEntryId.trim() : "";

    if (!normalizedMailboxEntryId) {
      return;
    }

    state.selectedMailboxEntryId = normalizedMailboxEntryId;
    render();
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

      if (action === "delete" && updatedNode?.nodeId) {
        state.nodes = state.nodes.filter((node) => node?.nodeId !== updatedNode.nodeId);
      } else if (updatedNode?.nodeId) {
        state.nodes = state.nodes.map((node) => node?.nodeId === updatedNode.nodeId ? updatedNode : node);
      }

      state.nodeActionResult = action === "delete"
        ? null
        : buildNodeActionResult(action, normalizedNodeId, payload);

      if (action === "reclaim") {
        const summary = summarizeReclaimResult(payload);
        state.actionMessage = [
          `节点 ${normalizedNodeId} reclaim 完成`,
          `activeLease=${summary.activeLeaseCount}`,
          `reclaimedRun=${summary.reclaimedRunCount}`,
          `requeuedWorkItem=${summary.requeuedWorkItemCount}`,
        ].join(" | ");
      } else if (action === "delete") {
        state.actionMessage = `节点 ${normalizedNodeId} 已删除。`;
      } else if (updatedNode?.status) {
        state.actionMessage = `节点 ${normalizedNodeId} 已更新为 ${resolveNodeStatusLabel(updatedNode.status)}。`;
      } else {
        state.actionMessage = `节点 ${normalizedNodeId} 的 ${action} 已完成。`;
      }

      if (action === "delete" && state.selectedNodeId === normalizedNodeId) {
        const visibleNodes = filterAndSortNodes(state.nodes, {
          searchTerm: state.nodeSearchTerm,
          statusFilter: state.nodeStatusFilter,
          sortBy: state.nodeSortBy,
        }, buildNodeAttentionById(state.oncallSummary));
        state.selectedNodeId = typeof visibleNodes[0]?.nodeId === "string" ? visibleNodes[0].nodeId : "";
        state.selectedNodeDetail = null;

        if (state.selectedNodeId) {
          try {
            state.selectedNodeDetail = await requestPlatformJson(fetchFn, "/api/platform/nodes/detail", {
              ownerPrincipalId: state.ownerPrincipalId,
              nodeId: state.selectedNodeId,
            }, "读取节点详情失败。");
            state.loadErrorMessage = "";
          } catch (error) {
            state.loadErrorMessage = error instanceof Error ? error.message : "读取节点详情失败。";
          }
        }
      } else if (state.selectedNodeId === normalizedNodeId) {
        try {
          state.selectedNodeDetail = await requestPlatformJson(fetchFn, "/api/platform/nodes/detail", {
            ownerPrincipalId: state.ownerPrincipalId,
            nodeId: normalizedNodeId,
          }, "读取节点详情失败。");
          state.loadErrorMessage = "";
        } catch (error) {
          state.loadErrorMessage = error instanceof Error ? error.message : "读取节点详情失败。";
        }
      }
    } catch (error) {
      state.actionMessage = error instanceof Error ? error.message : `节点 ${action} 失败。`;
    } finally {
      state.actionNodeId = "";
      render();
    }
  };

  const terminateMeetingRoom = async (roomId, terminationReason) => {
    const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";
    const normalizedTerminationReason = typeof terminationReason === "string" ? terminationReason.trim() : "";

    if (!normalizedRoomId || !state.ownerPrincipalId || typeof fetchFn !== "function") {
      return;
    }

    if (!normalizedTerminationReason) {
      state.meetingRoomActionMessage = "终止会议前，请先填写终止原因。";
      render();
      return;
    }

    state.meetingRoomActionPending = "terminate";
    render();

    try {
      const detail = await requestPlatformJson(fetchFn, "/api/platform/meeting-rooms/terminate", {
        ownerPrincipalId: state.ownerPrincipalId,
        termination: {
          roomId: normalizedRoomId,
          operatorPrincipalId: state.ownerPrincipalId,
          terminationReason: normalizedTerminationReason,
        },
      }, "终止会议室失败。");
      state.selectedMeetingRoomDetail = detail;
      state.selectedMeetingRoomId = detail?.room?.roomId ?? normalizedRoomId;
      state.meetingRooms = upsertById(state.meetingRooms, detail?.room, "roomId");
      state.meetingRoomActionMessage = detail?.room?.title
        ? `已终止会议室 ${detail.room.title}。`
        : "已终止当前会议室。";
      state.loadErrorMessage = "";
    } catch (error) {
      state.meetingRoomActionMessage = error instanceof Error ? error.message : "终止会议室失败。";
    } finally {
      state.meetingRoomActionPending = "";
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

  dom.nodeSearchInput?.addEventListener("input", () => {
    void setNodeListControls({
      searchTerm: dom.nodeSearchInput?.value ?? "",
    });
  });

  dom.nodeStatusFilter?.addEventListener("change", () => {
    void setNodeListControls({
      statusFilter: dom.nodeStatusFilter?.value ?? DEFAULT_NODE_STATUS_FILTER,
    });
  });

  dom.nodeSortSelect?.addEventListener("change", () => {
    void setNodeListControls({
      sortBy: dom.nodeSortSelect?.value ?? DEFAULT_NODE_SORT_BY,
    });
  });

  dom.navToggle?.addEventListener("click", () => {
    toggleNavigation();
  });

  dom.navNodesOncall?.addEventListener("click", () => {
    setActiveView("nodes-oncall");
  });

  dom.navGovernance?.addEventListener("click", () => {
    setActiveView("governance");
  });

  dom.navWorkItems?.addEventListener("click", () => {
    setActiveView("work-items");
  });

  dom.navMailbox?.addEventListener("click", () => {
    setActiveView("mailbox");
  });

  dom.navAgentsProjects?.addEventListener("click", () => {
    setActiveView("agents-projects");
  });

  dom.navCollaborationRuns?.addEventListener("click", () => {
    setActiveView("collaboration-runs");
  });

  dom.navMeetingRooms?.addEventListener("click", () => {
    setActiveView("meeting-rooms");
  });

  dom.navOverview?.addEventListener("click", () => {
    setActiveView("overview");
  });

  dom.nodesList?.addEventListener("click", (event) => {
    const actionButton = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-node-action]")
      : null;

    if (actionButton) {
      const action = actionButton.getAttribute("data-platform-node-action");
      const nodeId = actionButton.getAttribute("data-platform-node-id");

      if (action === "drain" || action === "offline" || action === "reclaim" || action === "delete") {
        void updateNodeStatus(nodeId, action);
      }

      return;
    }

    const nodeCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-node-card-id]")
      : null;
    const nodeId = nodeCard?.getAttribute("data-platform-node-card-id");

    if (nodeId) {
      void loadNodeDetail(nodeId);
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

  dom.dispatchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void dispatchWorkItem({
      targetAgentId: dom.dispatchAgentInput?.value ?? "",
      goal: dom.dispatchGoalInput?.value ?? "",
      sourceType: dom.dispatchSourceSelect?.value ?? "human",
      priority: dom.dispatchPrioritySelect?.value ?? "normal",
    });
  });

  dom.workItemsList?.addEventListener("click", (event) => {
    const workItemCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-work-item-id]")
      : null;

    if (!workItemCard) {
      return;
    }

    const workItemId = workItemCard.getAttribute("data-platform-work-item-id");

    if (workItemId) {
      void loadWorkItemDetail(workItemId);
    }
  });

  dom.workItemResponseForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void respondWorkItem(state.selectedWorkItemId, {
      decision: dom.workItemResponseDecision?.value ?? "approve",
      inputText: dom.workItemResponseInput?.value ?? "",
    });
  });

  dom.workItemEscalateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void escalateWorkItem(state.selectedWorkItemId, {
      inputText: dom.workItemEscalateInput?.value ?? "",
    });
  });

  dom.workItemCancelButton?.addEventListener("click", () => {
    void cancelWorkItem(state.selectedWorkItemId);
  });

  dom.mailboxForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadMailbox(dom.mailboxAgentInput?.value ?? "");
  });

  dom.mailboxList?.addEventListener("click", (event) => {
    const mailboxCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-mailbox-entry-id]")
      : null;

    if (!mailboxCard) {
      return;
    }

    const mailboxEntryId = mailboxCard.getAttribute("data-platform-mailbox-entry-id");

    if (mailboxEntryId) {
      selectMailboxEntry(mailboxEntryId);
    }
  });

  dom.mailboxPullButton?.addEventListener("click", () => {
    void pullMailbox(state.mailboxAgentId);
  });

  dom.mailboxAckButton?.addEventListener("click", () => {
    void ackMailbox(state.mailboxAgentId, state.selectedMailboxEntryId);
  });

  dom.mailboxResponseForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void respondMailbox(state.mailboxAgentId, state.selectedMailboxEntryId, {
      decision: dom.mailboxResponseDecision?.value ?? "approve",
      inputText: dom.mailboxResponseInput?.value ?? "",
    });
  });

  dom.agentCreateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void createAgent({
      departmentRole: dom.agentCreateRoleInput?.value ?? "",
      displayName: dom.agentCreateNameInput?.value ?? "",
      mission: dom.agentCreateMissionInput?.value ?? "",
    });
  });

  dom.agentsList?.addEventListener("click", (event) => {
    const agentCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-agent-id]")
      : null;

    if (!agentCard) {
      return;
    }

    const agentId = agentCard.getAttribute("data-platform-agent-id");

    if (agentId) {
      void loadAgentDetail(agentId);
    }
  });

  dom.projectBindingForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void upsertProjectBinding({
      projectId: dom.projectBindingProjectInput?.value ?? "",
      organizationId: dom.projectBindingOrganizationInput?.value ?? "",
      displayName: dom.projectBindingDisplayInput?.value ?? "",
      canonicalWorkspacePath: dom.projectBindingWorkspaceInput?.value ?? "",
      preferredNodeId: dom.projectBindingNodeInput?.value ?? "",
      continuityMode: dom.projectBindingModeSelect?.value ?? "sticky",
    });
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

  dom.meetingRoomsList?.addEventListener("click", (event) => {
    const roomCard = event.target instanceof HTMLElement
      ? event.target.closest("[data-platform-meeting-room-id]")
      : null;

    if (!roomCard) {
      return;
    }

    const roomId = roomCard.getAttribute("data-platform-meeting-room-id");

    if (roomId) {
      void loadMeetingRoomDetail(roomId);
    }
  });

  dom.meetingRoomTerminateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void terminateMeetingRoom(state.selectedMeetingRoomId, dom.meetingRoomTerminateReasonInput?.value ?? "");
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
    loadNodeDetail,
    loadAgentHandoffs,
    loadAgentDetail,
    createAgent,
    upsertProjectBinding,
    loadWorkItemDetail,
    loadMailbox,
    loadRunDetail,
    loadMeetingRoomDetail,
    dispatchWorkItem,
    respondWorkItem,
    escalateWorkItem,
    cancelWorkItem,
    pullMailbox,
    ackMailbox,
    respondMailbox,
    selectMailboxEntry,
    updateNodeStatus,
    terminateMeetingRoom,
    setNodeListControls,
    setActiveView,
    toggleNavigation,
    render,
  };
}

function renderNodeCard(node, selectedNodeId = "", attention = null) {
  const status = normalizeNodeStatus(node?.status);
  const statusLabel = resolveNodeStatusLabel(status);
  const labels = Array.isArray(node?.labels) ? node.labels : [];
  const workspaceCapabilities = Array.isArray(node?.workspaceCapabilities) ? node.workspaceCapabilities : [];
  const credentialCapabilities = Array.isArray(node?.credentialCapabilities) ? node.credentialCapabilities : [];
  const providerCapabilities = Array.isArray(node?.providerCapabilities) ? node.providerCapabilities : [];
  const isSelected = Boolean(node?.nodeId) && node.nodeId === selectedNodeId;
  const metaChips = [
    `槽位 ${normalizeNumber(node?.slotAvailable, 0)}/${normalizeNumber(node?.slotCapacity, 0)}`,
    node?.nodeIp ? `IP ${node.nodeIp}` : "",
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
  const attentionChip = attention?.recommendationCount
    ? `<span class="platform-chip severity-${escapeHtml(attention.severity)}">${escapeHtml(resolveNodeAttentionLabel(attention))}</span>`
    : "";

  return `<article
    class="platform-node-card"
    data-platform-node-card-id="${escapeHtml(node?.nodeId || "")}"
    data-selected="${isSelected ? "true" : "false"}"
  >
    <div class="platform-node-head">
      <div>
        <h3 class="platform-node-title">${escapeHtml(node?.displayName || node?.nodeId || "未命名节点")}</h3>
        <div class="platform-node-meta">
          ${attentionChip}
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

function renderNodeDetail(detail, options = {}) {
  const node = detail?.node ?? {};
  const status = normalizeNodeStatus(node?.status);
  const statusLabel = resolveNodeStatusLabel(status);
  const heartbeat = summarizeNodeHeartbeat(node, options?.referenceNow);
  const leaseSummary = detail?.leaseSummary ?? {};
  const activeExecutionLeases = Array.isArray(detail?.activeExecutionLeases) ? detail.activeExecutionLeases : [];
  const recentExecutionLeases = Array.isArray(detail?.recentExecutionLeases) ? detail.recentExecutionLeases : [];
  const attention = options?.attention ?? null;
  const actionResult = options?.actionResult ?? null;
  const capabilitySections = [
    {
      label: "工作区能力",
      values: Array.isArray(node?.workspaceCapabilities) ? node.workspaceCapabilities : [],
      emptyText: "当前没有声明工作区能力。",
    },
    {
      label: "凭据能力",
      values: Array.isArray(node?.credentialCapabilities) ? node.credentialCapabilities : [],
      emptyText: "当前没有声明凭据能力。",
    },
    {
      label: "Provider 能力",
      values: Array.isArray(node?.providerCapabilities) ? node.providerCapabilities : [],
      emptyText: "当前没有声明 Provider 能力。",
    },
    {
      label: "节点标签",
      values: Array.isArray(node?.labels) ? node.labels : [],
      emptyText: "当前没有节点标签。",
    },
  ];

  return `<div class="platform-node-detail">
    <section class="platform-node-detail-section">
      <div class="platform-node-detail-head">
        <div>
          <h3>${escapeHtml(node?.displayName || node?.nodeId || "未命名节点")}</h3>
          <p class="platform-inline-note">这里优先回答三件事：这台节点是谁、现在能不能接单、手上还挂着什么 lease。</p>
        </div>
        <div class="platform-node-detail-meta">
          ${attention?.recommendationCount
            ? `<span class="platform-chip severity-${escapeHtml(attention.severity)}">${escapeHtml(resolveNodeAttentionLabel(attention))}</span>`
            : ""}
          <span class="platform-chip status-${status}">${escapeHtml(statusLabel)}</span>
          <span class="platform-chip">${escapeHtml(node?.nodeId || "未知 nodeId")}</span>
        </div>
      </div>

      <div class="platform-node-detail-grid">
        <article class="platform-node-detail-card">
          <span>节点 IP</span>
          <strong>${escapeHtml(node?.nodeIp || "未记录")}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>槽位占用</span>
          <strong>${escapeHtml(`${normalizeNumber(node?.slotAvailable, 0)}/${normalizeNumber(node?.slotCapacity, 0)}`)}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>心跳新鲜度</span>
          <strong>${escapeHtml(heartbeat.freshnessLabel)}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>心跳年龄</span>
          <strong>${escapeHtml(heartbeat.ageLabel)}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>剩余 TTL</span>
          <strong>${escapeHtml(heartbeat.remainingLabel)}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>最近心跳</span>
          <strong>${escapeHtml(node?.lastHeartbeatAt ? formatTimestamp(node.lastHeartbeatAt) : "未上报")}</strong>
        </article>
      </div>
    </section>

    ${actionResult ? renderNodeActionResult(actionResult) : ""}

    <section class="platform-node-detail-section">
      <div>
        <h3>Lease 汇总</h3>
        <p class="platform-inline-note">这里直接看这台节点当前到底挂了多少 active / released / revoked lease。</p>
      </div>
      <div class="platform-node-detail-grid">
        <article class="platform-node-detail-card">
          <span>总 lease</span>
          <strong>${escapeHtml(String(normalizeNumber(leaseSummary?.totalCount, 0)))}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>活动中</span>
          <strong>${escapeHtml(String(normalizeNumber(leaseSummary?.activeCount, 0)))}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>已释放</span>
          <strong>${escapeHtml(String(normalizeNumber(leaseSummary?.releasedCount, 0)))}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>已回收</span>
          <strong>${escapeHtml(String(normalizeNumber(leaseSummary?.revokedCount, 0)))}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>已过期</span>
          <strong>${escapeHtml(String(normalizeNumber(leaseSummary?.expiredCount, 0)))}</strong>
        </article>
        <article class="platform-node-detail-card">
          <span>组织</span>
          <strong>${escapeHtml(node?.organizationId || "未知组织")}</strong>
        </article>
      </div>
    </section>

    <section class="platform-node-detail-section">
      <div>
        <h3>能力明细</h3>
        <p class="platform-inline-note">不再只看数量，直接把真实 workspace / credential / provider / label 列出来。</p>
      </div>
      <div class="platform-node-detail-capability-list">
        ${capabilitySections.map((section) => renderNodeCapabilitySection(section)).join("")}
      </div>
    </section>

    <section class="platform-node-detail-section">
      <div>
        <h3>活动 Lease</h3>
        <p class="platform-inline-note">最值钱的是它挂着哪个 run、对应哪个 work-item、属于哪个 agent。</p>
      </div>
      <div class="platform-node-detail-list">
        ${renderNodeExecutionLeaseList(activeExecutionLeases, "当前没有活动 lease。")}
      </div>
    </section>

    <section class="platform-node-detail-section">
      <div>
        <h3>最近 Lease 轨迹</h3>
        <p class="platform-inline-note">这里保留最近 lease 视图，便于快速回答“刚才这台节点做过什么”。</p>
      </div>
      <div class="platform-node-detail-list">
        ${renderNodeExecutionLeaseList(recentExecutionLeases, "当前还没有最近 lease 记录。")}
      </div>
    </section>
  </div>`;
}

function renderNodeCapabilitySection(section) {
  const values = Array.isArray(section?.values) ? section.values.filter(Boolean) : [];

  return `<article class="platform-node-detail-capability">
    <strong>${escapeHtml(section?.label || "能力")}</strong>
    ${values.length > 0
      ? values.map((value) => `<code>${escapeHtml(String(value))}</code>`).join("")
      : `<p class="platform-inline-note">${escapeHtml(section?.emptyText || "暂无数据。")}</p>`}
  </article>`;
}

function renderNodeExecutionLeaseList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="platform-inline-note">${escapeHtml(emptyText)}</p>`;
  }

  return items.map((item) => renderNodeExecutionLeaseCard(item)).join("");
}

function renderNodeExecutionLeaseCard(item) {
  const workItemGoal = item?.workItem?.goal || item?.workItem?.workItemId || item?.lease?.workItemId || "未知 work-item";
  const targetAgentLabel = item?.targetAgent?.displayName || item?.targetAgent?.agentId || item?.lease?.targetAgentId || "未绑定 agent";
  const metaChips = [
    item?.run?.status ? `Run ${item.run.status}` : "",
    item?.workItem?.status ? `Work-item ${item.workItem.status}` : "",
    item?.lease?.status ? `Lease ${item.lease.status}` : "",
    item?.run?.runId || item?.lease?.runId || "",
    item?.lease?.leaseId || "",
    item?.lease?.updatedAt ? `更新 ${formatTimestamp(item.lease.updatedAt)}` : "",
  ].filter(Boolean);

  return `<article class="platform-node-detail-item">
    <div>
      <strong>${escapeHtml(workItemGoal)}</strong>
      <p class="platform-inline-note">targetAgent：${escapeHtml(targetAgentLabel)}</p>
    </div>
    <div class="platform-node-detail-meta">
      ${metaChips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
  </article>`;
}

function renderNodeActionResult(actionResult) {
  const summaryChips = [
    actionResult?.action ? `动作 ${resolveNodeActionLabel(actionResult.action)}` : "",
    actionResult?.node?.status ? `状态 ${resolveNodeStatusLabel(actionResult.node.status)}` : "",
    actionResult?.summary?.activeLeaseCount != null ? `activeLease ${normalizeNumber(actionResult.summary.activeLeaseCount, 0)}` : "",
    actionResult?.summary?.reclaimedRunCount != null ? `reclaimedRun ${normalizeNumber(actionResult.summary.reclaimedRunCount, 0)}` : "",
    actionResult?.summary?.requeuedWorkItemCount != null ? `requeuedWorkItem ${normalizeNumber(actionResult.summary.requeuedWorkItemCount, 0)}` : "",
  ].filter(Boolean);
  const reclaimedLeases = Array.isArray(actionResult?.reclaimedLeases) ? actionResult.reclaimedLeases : [];
  const resultSummary = actionResult?.summaryText || "本次治理已经执行完成。";

  return `<section class="platform-node-detail-section">
    <div>
      <h3>最近治理结果</h3>
      <p class="platform-inline-note">Drain / Offline / Reclaim 的结果会直接落在这里，不再只停在一行提示文案。</p>
    </div>
    <article class="platform-node-detail-item platform-node-action-result">
      <div>
        <strong>${escapeHtml(resultSummary)}</strong>
        <p class="platform-inline-note">这块用于回答“刚才点完按钮到底影响了哪些 run / work-item”。</p>
      </div>
      <div class="platform-node-detail-meta">
        ${summaryChips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
    </article>
    ${reclaimedLeases.length > 0
      ? `<div class="platform-node-detail-list">${reclaimedLeases.map((item) => renderNodeRecoveredLeaseCard(item)).join("")}</div>`
      : ""}
  </section>`;
}

function renderNodeRecoveredLeaseCard(item) {
  const workItemGoal = item?.workItem?.goal || item?.workItem?.workItemId || item?.lease?.workItemId || "未知 work-item";
  const targetAgentLabel = item?.targetAgent?.displayName || item?.targetAgent?.agentId || item?.lease?.targetAgentId || "未绑定 agent";
  const metaChips = [
    item?.recoveryAction ? resolveRecoveryActionLabel(item.recoveryAction) : "",
    item?.run?.status ? `Run ${item.run.status}` : "",
    item?.workItem?.status ? `Work-item ${item.workItem.status}` : "",
    item?.lease?.status ? `Lease ${item.lease.status}` : "",
    item?.run?.runId || item?.lease?.runId || "",
    item?.lease?.leaseId || "",
  ].filter(Boolean);

  return `<article class="platform-node-detail-item">
    <div>
      <strong>${escapeHtml(workItemGoal)}</strong>
      <p class="platform-inline-note">targetAgent：${escapeHtml(targetAgentLabel)}</p>
    </div>
    <div class="platform-node-detail-meta">
      ${metaChips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
  </article>`;
}

function summarizeNodeHeartbeat(node, referenceNow = "") {
  const lastHeartbeatAt = typeof node?.lastHeartbeatAt === "string" ? node.lastHeartbeatAt : "";
  const heartbeatTtlSeconds = normalizeNumber(node?.heartbeatTtlSeconds, 0);
  const lastHeartbeatTs = Date.parse(lastHeartbeatAt);
  const referenceTs = Date.parse(typeof referenceNow === "string" ? referenceNow : "");
  const nowTs = Number.isFinite(referenceTs) ? referenceTs : Date.now();

  if (!Number.isFinite(lastHeartbeatTs)) {
    return {
      freshnessLabel: "未知",
      ageLabel: "未上报",
      remainingLabel: heartbeatTtlSeconds > 0 ? `${heartbeatTtlSeconds}s` : "未配置",
    };
  }

  if (heartbeatTtlSeconds <= 0) {
    return {
      freshnessLabel: "TTL 未配置",
      ageLabel: formatDurationSeconds(Math.max(0, Math.floor((nowTs - lastHeartbeatTs) / 1000))),
      remainingLabel: "未配置",
    };
  }

  const ageSeconds = Math.max(0, Math.floor((nowTs - lastHeartbeatTs) / 1000));
  const remainingSeconds = heartbeatTtlSeconds - ageSeconds;

  return {
    freshnessLabel: remainingSeconds > heartbeatTtlSeconds / 2
      ? "新鲜"
      : remainingSeconds >= 0
        ? "临近过期"
        : "已过期",
    ageLabel: formatDurationSeconds(ageSeconds),
    remainingLabel: remainingSeconds >= 0
      ? formatDurationSeconds(remainingSeconds)
      : `超时 ${formatDurationSeconds(Math.abs(remainingSeconds))}`,
  };
}

function formatDurationSeconds(value) {
  const totalSeconds = Math.max(0, normalizeNumber(value, 0));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return seconds > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
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

function renderWorkItemCard(item, selectedWorkItemId) {
  const chips = [
    item?.workItemId ? item.workItemId : "",
    item?.status ? `状态 ${resolveWorkItemStatusLabel(item.status)}` : "",
    item?.priority ? `优先级 ${resolvePriorityLabel(item.priority)}` : "",
    item?.targetAgentId ? `目标 ${item.targetAgentId}` : "",
  ].filter(Boolean);
  const selected = typeof item?.workItemId === "string" && item.workItemId === selectedWorkItemId;

  return `<article
    class="platform-work-item-card"
    data-platform-work-item-id="${escapeHtml(item?.workItemId || "")}"
    data-selected="${selected ? "true" : "false"}"
  >
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(item?.goal || item?.workItemId || "未命名 work-item")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(item?.updatedAt))}</p>
  </article>`;
}

function renderWorkItemDetail(detail) {
  const chips = [
    detail?.workItem?.workItemId ? detail.workItem.workItemId : "",
    detail?.workItem?.status ? `状态 ${resolveWorkItemStatusLabel(detail.workItem.status)}` : "",
    detail?.workItem?.priority ? `优先级 ${resolvePriorityLabel(detail.workItem.priority)}` : "",
    detail?.workItem?.sourceType ? `来源 ${detail.workItem.sourceType}` : "",
    detail?.workItem?.waitingFor ? `等待 ${detail.workItem.waitingFor}` : "",
    detail?.targetAgent?.displayName ? `目标 ${detail.targetAgent.displayName}` : "",
  ].filter(Boolean);
  const parentDescriptor = [
    detail?.parentWorkItem?.goal || detail?.parentWorkItem?.displayName || "",
    detail?.parentWorkItem?.workItemId || "",
  ].filter(Boolean).join(" / ") || "无";
  const latestHandoffLabel = detail?.latestHandoff?.summary || detail?.latestHandoff?.handoffId || "暂无";

  return `<div>
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(detail?.workItem?.goal || detail?.workItem?.workItemId || "未命名 work-item")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">父任务：${escapeHtml(parentDescriptor)}</p>
    <p class="platform-inline-note">最近 handoff：${escapeHtml(latestHandoffLabel)}</p>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(detail?.workItem?.updatedAt))}</p>
  </div>`;
}

function renderMailboxItemCard(item, selectedMailboxEntryId) {
  const entry = item?.entry ?? {};
  const message = item?.message ?? {};
  const chips = [
    entry?.mailboxEntryId ? entry.mailboxEntryId : "",
    entry?.status ? `状态 ${resolveMailboxStatusLabel(entry.status)}` : "",
    entry?.priority ? `优先级 ${resolvePriorityLabel(entry.priority)}` : "",
    message?.messageType ? `类型 ${resolveMessageTypeLabel(message.messageType)}` : "",
  ].filter(Boolean);
  const selected = typeof entry?.mailboxEntryId === "string" && entry.mailboxEntryId === selectedMailboxEntryId;

  return `<article
    class="platform-mailbox-card"
    data-platform-mailbox-entry-id="${escapeHtml(entry?.mailboxEntryId || "")}"
    data-selected="${selected ? "true" : "false"}"
  >
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(message?.summary || entry?.mailboxEntryId || "未命名消息")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(entry?.updatedAt || message?.updatedAt))}</p>
  </article>`;
}

function renderMailboxDetail(item, agent) {
  const entry = item?.entry ?? {};
  const message = item?.message ?? {};
  const chips = [
    entry?.mailboxEntryId ? entry.mailboxEntryId : "",
    entry?.status ? `状态 ${resolveMailboxStatusLabel(entry.status)}` : "",
    agent?.displayName ? `Agent ${agent.displayName}` : "",
    message?.fromAgentId ? `来自 ${message.fromAgentId}` : "",
  ].filter(Boolean);
  const summary = readMessageSummary(message);

  return `<div>
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(summary || entry?.mailboxEntryId || "未命名消息")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">消息类型：${escapeHtml(resolveMessageTypeLabel(message?.messageType))}</p>
    <p class="platform-inline-note">关联 work-item：${escapeHtml(message?.workItemId || entry?.workItemId || "暂无")}</p>
    <p class="platform-inline-note">最近更新时间：${escapeHtml(formatTimestamp(entry?.updatedAt || message?.updatedAt))}</p>
  </div>`;
}

function renderAgentCard(agent, selectedAgentId) {
  const chips = [
    agent?.agentId ? agent.agentId : "",
    agent?.departmentRole ? `角色 ${agent.departmentRole}` : "",
    agent?.status ? `状态 ${agent.status}` : "",
    agent?.organizationId ? `组织 ${agent.organizationId}` : "",
  ].filter(Boolean);
  const selected = typeof agent?.agentId === "string" && agent.agentId === selectedAgentId;

  return `<article
    class="platform-agent-card"
    data-platform-agent-id="${escapeHtml(agent?.agentId || "")}"
    data-selected="${selected ? "true" : "false"}"
  >
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(agent?.displayName || agent?.agentId || "未命名 agent")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">${escapeHtml(agent?.mission || "当前未配置 mission。")}</p>
  </article>`;
}

function renderAgentDetail(detail) {
  const chips = [
    detail?.agent?.agentId ? detail.agent.agentId : "",
    detail?.agent?.departmentRole ? `角色 ${detail.agent.departmentRole}` : "",
    detail?.agent?.status ? `状态 ${detail.agent.status}` : "",
    detail?.organization?.organizationId ? `组织 ${detail.organization.organizationId}` : "",
  ].filter(Boolean);

  return `<div>
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(detail?.agent?.displayName || detail?.agent?.agentId || "未命名 agent")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">workspace：${escapeHtml(detail?.workspacePolicy?.canonicalWorkspacePath || "未配置")}</p>
    <p class="platform-inline-note">provider/model：${escapeHtml(detail?.runtimeProfile?.provider || "未配置")} / ${escapeHtml(detail?.runtimeProfile?.model || "未配置")}</p>
  </div>`;
}

function renderProjectBindingCard(binding) {
  const chips = [
    binding?.projectId ? binding.projectId : "",
    binding?.organizationId ? `组织 ${binding.organizationId}` : "",
    binding?.continuityMode ? `连续性 ${binding.continuityMode}` : "",
    binding?.preferredNodeId ? `首选节点 ${binding.preferredNodeId}` : "",
  ].filter(Boolean);

  return `<article class="platform-project-card">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(binding?.displayName || binding?.projectId || "未命名项目")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">workspace：${escapeHtml(binding?.canonicalWorkspacePath || "未配置")}</p>
  </article>`;
}

function renderOncallDiagnosisCard(diagnosis) {
  const severity = resolveOncallSeverity(diagnosis?.severity);
  const title = diagnosis?.title || "当前还没有值班诊断";
  const summary = diagnosis?.summary || "填入 ownerPrincipalId 后，这里会显示当前平台值班主诊断。";

  return `<div>
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(title)}</h3>
        <div class="platform-node-meta">
          <span class="platform-chip severity-${escapeHtml(severity)}">${escapeHtml(resolveOncallSeverityLabel(severity))}</span>
          ${diagnosis?.id ? `<span class="platform-chip">${escapeHtml(diagnosis.id)}</span>` : ""}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">${escapeHtml(summary)}</p>
  </div>`;
}

function renderOncallNextSteps(steps) {
  const items = Array.isArray(steps)
    ? steps.filter((item) => typeof item === "string" && item.trim())
    : [];

  if (items.length === 0) {
    return '<p class="platform-inline-note">当前没有额外建议动作，继续按 nodes -> waiting queue -> recent runs 的顺序巡检即可。</p>';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderOncallRecommendationCard(recommendation) {
  const severity = resolveOncallSeverity(recommendation?.severity);
  const category = resolveOncallCategoryLabel(recommendation?.category);
  const chips = [
    category ? `分类 ${category}` : "",
    recommendation?.subjectId ? `对象 ${recommendation.subjectId}` : "",
  ].filter(Boolean);

  return `<article class="platform-oncall-card">
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(recommendation?.title || recommendation?.recommendationId || "未命名建议")}</h3>
        <div class="platform-node-meta">
          <span class="platform-chip severity-${escapeHtml(severity)}">${escapeHtml(resolveOncallSeverityLabel(severity))}</span>
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">${escapeHtml(recommendation?.summary || "暂无摘要")}</p>
    <p class="platform-inline-note">建议动作：${escapeHtml(recommendation?.recommendedAction || "暂无")}</p>
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

function renderMeetingRoomCard(room, selectedMeetingRoomId) {
  const chips = [
    room?.roomId ? room.roomId : "",
    room?.status ? `状态 ${resolveMeetingRoomStatusLabel(room.status)}` : "",
    room?.discussionMode ? `模式 ${resolveMeetingRoomDiscussionModeLabel(room.discussionMode)}` : "",
    room?.organizationId ? `组织 ${room.organizationId}` : "",
  ].filter(Boolean);
  const selected = typeof room?.roomId === "string" && room.roomId === selectedMeetingRoomId;

  return `<article
    class="platform-work-item-card"
    data-platform-meeting-room-id="${escapeHtml(room?.roomId || "")}"
    data-selected="${selected ? "true" : "false"}"
  >
    <div class="platform-node-head">
      <div>
        <h3 class="platform-waiting-goal">${escapeHtml(room?.title || room?.roomId || "未命名会议室")}</h3>
        <div class="platform-node-meta">
          ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      </div>
    </div>
    <p class="platform-inline-note">${escapeHtml(room?.goal || "当前未补充会议目标。")}</p>
  </article>`;
}

function renderMeetingRoomDetail(detail) {
  const room = detail?.room ?? {};
  const participants = Array.isArray(detail?.participants) ? detail.participants : [];
  const rounds = Array.isArray(detail?.rounds) ? [...detail.rounds] : [];
  const messages = Array.isArray(detail?.messages) ? [...detail.messages] : [];
  const resolutions = Array.isArray(detail?.resolutions) ? [...detail.resolutions] : [];
  const participantsByAgentId = new Map(
    participants
      .filter((participant) => typeof participant?.agentId === "string" && participant.agentId.trim())
      .map((participant) => [participant.agentId, participant.displayName || participant.agentId]),
  );
  const chips = [
    room?.roomId ? room.roomId : "",
    room?.status ? `状态 ${resolveMeetingRoomStatusLabel(room.status)}` : "",
    room?.discussionMode ? `模式 ${resolveMeetingRoomDiscussionModeLabel(room.discussionMode)}` : "",
    room?.organizationId ? `组织 ${room.organizationId}` : "",
  ].filter(Boolean);
  const metaCards = [
    {
      label: "创建者",
      value: room?.createdByOperatorPrincipalId || "未记录",
    },
    {
      label: "更新时间",
      value: formatTimestamp(room?.updatedAt),
    },
    {
      label: "参与者",
      value: `${participants.length} 位`,
    },
    {
      label: "轮次",
      value: `${rounds.length} 轮`,
    },
  ];
  if (room?.status === "closed" && room?.closingSummary) {
    metaCards.push({
      label: "收口说明",
      value: room.closingSummary,
    });
  }
  if (room?.status === "terminated") {
    metaCards.push({
      label: "终止原因",
      value: room?.terminationReason || "未记录",
    });
    metaCards.push({
      label: "终止人",
      value: room?.terminatedByOperatorPrincipalId || "未记录",
    });
  }

  return `<div class="platform-node-detail">
    <section class="platform-node-detail-section">
      <div class="platform-node-head">
        <div>
          <h3 class="platform-waiting-goal">${escapeHtml(room?.title || room?.roomId || "未命名会议室")}</h3>
          <div class="platform-node-meta">
            ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
          </div>
        </div>
      </div>
      <p class="platform-inline-note">会议目标：${escapeHtml(room?.goal || "当前未补充会议目标。")}</p>
    </section>
    <section class="platform-node-detail-section">
      <h3>房间元信息</h3>
      <div class="platform-node-detail-grid">
        ${metaCards.map((item) => `
          <article class="platform-node-detail-card">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="platform-node-detail-section">
      <h3>参与者</h3>
      ${participants.length > 0
        ? participants.map((participant) => renderMeetingRoomParticipantCard(participant)).join("")
        : '<p class="platform-inline-note">当前房间还没有参与者。</p>'}
    </section>
    <section class="platform-node-detail-section">
      <h3>轮次</h3>
      ${rounds.length > 0
        ? rounds
            .sort((left, right) => compareTimestampDesc(left?.createdAt, right?.createdAt))
            .map((round) => renderMeetingRoomRoundCard(round))
            .join("")
        : '<p class="platform-inline-note">当前还没有会议轮次。</p>'}
    </section>
    <section class="platform-node-detail-section">
      <h3>消息流</h3>
      ${messages.length > 0
        ? messages
            .sort((left, right) => compareTimestampAsc(left?.createdAt, right?.createdAt))
            .map((message) => renderMeetingRoomMessageCard(message, participantsByAgentId))
            .join("")
        : '<p class="platform-inline-note">当前还没有会议消息。</p>'}
    </section>
    <section class="platform-node-detail-section">
      <h3>结论</h3>
      ${resolutions.length > 0
        ? resolutions
            .sort((left, right) => compareTimestampDesc(left?.createdAt, right?.createdAt))
            .map((resolution) => renderMeetingRoomResolutionCard(resolution))
            .join("")
        : '<p class="platform-inline-note">当前还没有会议结论。</p>'}
    </section>
  </div>`;
}

function renderMeetingRoomParticipantCard(participant) {
  const chips = [
    participant?.participantKind === "themis"
      ? "Themis"
      : (participant?.agentId || "managed-agent"),
    `角色 ${participant?.roomRole === "host" ? "主持人" : "参与者"}`,
    participant?.entryMode ? `入场 ${resolveMeetingRoomEntryModeLabel(participant.entryMode)}` : "",
  ].filter(Boolean);

  return `<article class="platform-node-detail-card">
    <strong>${escapeHtml(participant?.displayName || participant?.agentId || "未命名参与者")}</strong>
    <div class="platform-node-meta">
      ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
  </article>`;
}

function renderMeetingRoomRoundCard(round) {
  const chips = [
    round?.roundId ? round.roundId : "",
    round?.status ? `状态 ${resolveMeetingRoomRoundStatusLabel(round.status)}` : "",
    `响应 ${Array.isArray(round?.respondedParticipantIds) ? round.respondedParticipantIds.length : 0}/${Array.isArray(round?.targetParticipantIds) ? round.targetParticipantIds.length : 0}`,
  ].filter(Boolean);

  return `<article class="platform-node-detail-card">
    <strong>${escapeHtml(round?.roundId || "未命名轮次")}</strong>
    <div class="platform-node-meta">
      ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
    <span>${escapeHtml(round?.failureMessage || formatTimestamp(round?.updatedAt))}</span>
  </article>`;
}

function renderMeetingRoomMessageCard(message, participantsByAgentId) {
  const chips = [
    message?.messageKind ? `类型 ${resolveMeetingRoomMessageKindLabel(message.messageKind)}` : "",
    message?.audience ? `可见性 ${resolveMeetingRoomAudienceLabel(message.audience)}` : "",
    formatTimestamp(message?.createdAt),
  ].filter(Boolean);

  return `<article class="platform-node-detail-card">
    <strong>${escapeHtml(resolveMeetingRoomSpeakerLabel(message, participantsByAgentId))}</strong>
    <div class="platform-node-meta">
      ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
    <span>${renderMultilineText(message?.content)}</span>
  </article>`;
}

function renderMeetingRoomResolutionCard(resolution) {
  const chips = [
    resolution?.resolutionId ? resolution.resolutionId : "",
    resolution?.status ? `状态 ${resolveMeetingRoomResolutionStatusLabel(resolution.status)}` : "",
    resolution?.promotedWorkItemId ? `工作项 ${resolution.promotedWorkItemId}` : "",
  ].filter(Boolean);

  return `<article class="platform-node-detail-card">
    <strong>${escapeHtml(resolution?.title || resolution?.resolutionId || "未命名结论")}</strong>
    <div class="platform-node-meta">
      ${chips.map((chip) => `<span class="platform-chip">${escapeHtml(chip)}</span>`).join("")}
    </div>
    <span>${renderMultilineText(resolution?.summary)}</span>
  </article>`;
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
        { id: "delete", label: "Delete" },
      ];
    default:
      return [];
  }
}

function buildNodeActionResult(action, nodeId, payload) {
  return {
    nodeId,
    action,
    node: payload?.node ?? null,
    summary: action === "reclaim" ? summarizeReclaimResult(payload) : null,
    summaryText: action === "reclaim"
      ? `节点 ${nodeId} reclaim 完成，影响项已展开。`
      : `节点 ${nodeId} 已执行 ${resolveNodeActionLabel(action)}。`,
    reclaimedLeases: Array.isArray(payload?.reclaimedLeases) ? payload.reclaimedLeases : [],
  };
}

function normalizeNodeStatusFilter(value) {
  return ["all", "attention", "online", "draining", "offline"].includes(value)
    ? value
    : DEFAULT_NODE_STATUS_FILTER;
}

function normalizeNodeSortBy(value) {
  return ["attention", "displayName", "nodeId"].includes(value)
    ? value
    : DEFAULT_NODE_SORT_BY;
}

function normalizeNodeSearchTerm(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveNodeStatusFilterLabel(value) {
  switch (normalizeNodeStatusFilter(value)) {
    case "attention":
      return "仅值班关注";
    case "online":
      return "仅在线";
    case "draining":
      return "仅排水中";
    case "offline":
      return "仅离线";
    default:
      return "全部节点";
  }
}

function resolveNodeSortByLabel(value) {
  switch (normalizeNodeSortBy(value)) {
    case "displayName":
      return "按名称";
    case "nodeId":
      return "按 nodeId";
    default:
      return "值班优先";
  }
}

function resolveNodeActionLabel(action) {
  switch (action) {
    case "drain":
      return "Drain";
    case "offline":
      return "Offline";
    case "reclaim":
      return "Reclaim";
    case "delete":
      return "Delete";
    default:
      return typeof action === "string" ? action : "治理动作";
  }
}

function resolveRecoveryActionLabel(action) {
  switch (action) {
    case "requeued":
      return "已重新排队";
    case "waiting_preserved":
      return "等待态保留";
    case "lease_revoked":
      return "仅撤销 lease";
    default:
      return typeof action === "string" ? action : "已处理";
  }
}

function isMeetingRoomReadOnly(status) {
  return status === "closed" || status === "terminated";
}

function resolveMeetingRoomStatusLabel(status) {
  switch (status) {
    case "closing":
      return "收口中";
    case "closed":
      return "已关闭";
    case "terminated":
      return "已终止";
    default:
      return "进行中";
  }
}

function resolveMeetingRoomDiscussionModeLabel(mode) {
  return mode === "collaborative" ? "协作模式" : "主持模式";
}

function resolveMeetingRoomEntryModeLabel(mode) {
  switch (mode) {
    case "active_work_context":
      return "当前工作上下文";
    case "selected_context":
      return "指定上下文";
    default:
      return "空白入场";
  }
}

function resolveMeetingRoomRoundStatusLabel(status) {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "进行中";
    case "failed":
      return "失败";
    default:
      return "已完成";
  }
}

function resolveMeetingRoomMessageKindLabel(kind) {
  switch (kind) {
    case "status":
      return "状态";
    case "summary":
      return "摘要";
    case "error":
      return "异常";
    default:
      return "消息";
  }
}

function resolveMeetingRoomResolutionStatusLabel(status) {
  switch (status) {
    case "accepted":
      return "已采纳";
    case "promoted":
      return "已提升";
    default:
      return "草稿";
  }
}

function resolveMeetingRoomAudienceLabel(audience) {
  switch (audience) {
    case "themis_only":
      return "仅 Themis";
    case "selected_participants":
      return "定向参与者";
    default:
      return "全员可见";
  }
}

function resolveMeetingRoomSpeakerLabel(message, participantsByAgentId = new Map()) {
  if (message?.speakerType === "themis") {
    return "Themis";
  }

  if (message?.speakerType === "managed_agent") {
    return participantsByAgentId.get(message?.speakerAgentId) || message?.speakerAgentId || "数字员工";
  }

  return "平台系统";
}

function compareTimestampAsc(left, right) {
  const leftTime = typeof left === "string" ? new Date(left).getTime() : 0;
  const rightTime = typeof right === "string" ? new Date(right).getTime() : 0;
  return leftTime - rightTime;
}

function compareTimestampDesc(left, right) {
  return compareTimestampAsc(right, left);
}

function renderMultilineText(value) {
  const normalized = typeof value === "string" && value.trim() ? value : "暂无内容";
  return escapeHtml(normalized).replace(/\n/g, "<br />");
}

function resolveNodeAttentionLabel(attention) {
  const severity = resolveOncallSeverity(attention?.severity);
  const count = normalizeNumber(attention?.recommendationCount, 0);
  return count > 1
    ? `${resolveOncallSeverityLabel(severity)} ${count} 条`
    : resolveOncallSeverityLabel(severity);
}

function rankAttentionSeverity(value) {
  switch (resolveOncallSeverity(value)) {
    case "error":
      return 3;
    case "warning":
      return 2;
    default:
      return 1;
  }
}

function rankNodeStatusForOps(value) {
  switch (normalizeNodeStatus(value)) {
    case "offline":
      return 3;
    case "draining":
      return 2;
    case "online":
      return 1;
    default:
      return 0;
  }
}

function compareNodesBySort(left, right, sortBy, attentionByNodeId) {
  if (normalizeNodeSortBy(sortBy) === "displayName") {
    return compareNodeDisplayName(left, right) || compareNodeId(left, right);
  }

  if (normalizeNodeSortBy(sortBy) === "nodeId") {
    return compareNodeId(left, right) || compareNodeDisplayName(left, right);
  }

  const leftAttention = attentionByNodeId[left?.nodeId ?? ""] ?? null;
  const rightAttention = attentionByNodeId[right?.nodeId ?? ""] ?? null;
  const severityDiff = rankAttentionSeverity(rightAttention?.severity) - rankAttentionSeverity(leftAttention?.severity);

  if (severityDiff !== 0) {
    return severityDiff;
  }

  const recommendationDiff = normalizeNumber(rightAttention?.recommendationCount, 0)
    - normalizeNumber(leftAttention?.recommendationCount, 0);

  if (recommendationDiff !== 0) {
    return recommendationDiff;
  }

  const statusDiff = rankNodeStatusForOps(right?.status) - rankNodeStatusForOps(left?.status);

  if (statusDiff !== 0) {
    return statusDiff;
  }

  return compareNodeDisplayName(left, right) || compareNodeId(left, right);
}

function compareNodeDisplayName(left, right) {
  return String(left?.displayName || left?.nodeId || "")
    .localeCompare(String(right?.displayName || right?.nodeId || ""), "zh-CN");
}

function compareNodeId(left, right) {
  return String(left?.nodeId || "").localeCompare(String(right?.nodeId || ""), "en");
}

function normalizeOncallSummary(summary) {
  const counts = summary?.counts ?? {};
  const primaryDiagnosis = summary?.primaryDiagnosis ?? {};
  return {
    generatedAt: typeof summary?.generatedAt === "string" ? summary.generatedAt : "",
    ownerPrincipalId: typeof summary?.ownerPrincipalId === "string" ? summary.ownerPrincipalId : "",
    organizationId: normalizeOptionalText(summary?.organizationId),
    counts: {
      nodeTotal: normalizeNumber(counts?.nodeTotal, 0),
      nodeErrorCount: normalizeNumber(counts?.nodeErrorCount, 0),
      nodeWarningCount: normalizeNumber(counts?.nodeWarningCount, 0),
      waitingAttentionCount: normalizeNumber(counts?.waitingAttentionCount, 0),
      waitingHumanCount: normalizeNumber(counts?.waitingHumanCount, 0),
      runWaitingActionCount: normalizeNumber(counts?.runWaitingActionCount, 0),
      runFailedCount: normalizeNumber(counts?.runFailedCount, 0),
      pausedAgentCount: normalizeNumber(counts?.pausedAgentCount, 0),
    },
    primaryDiagnosis: {
      id: typeof primaryDiagnosis?.id === "string" ? primaryDiagnosis.id : "",
      severity: resolveOncallSeverity(primaryDiagnosis?.severity),
      title: typeof primaryDiagnosis?.title === "string" ? primaryDiagnosis.title : "",
      summary: typeof primaryDiagnosis?.summary === "string" ? primaryDiagnosis.summary : "",
    },
    recommendedNextSteps: Array.isArray(summary?.recommendedNextSteps)
      ? summary.recommendedNextSteps.filter((item) => typeof item === "string" && item.trim())
      : [],
    recommendations: Array.isArray(summary?.recommendations)
      ? summary.recommendations.filter((item) => item && typeof item === "object")
      : [],
  };
}

function normalizeGovernanceSummary(summary) {
  return {
    total: normalizeNumber(summary?.total, 0),
    waitingHuman: normalizeNumber(summary?.waitingHuman, 0),
    waitingAgent: normalizeNumber(summary?.waitingAgent, 0),
    attentionCount: normalizeNumber(summary?.attentionCount, 0),
  };
}

function summarizeWorkItems(items) {
  const summary = { ...EMPTY_WORK_ITEM_SUMMARY };

  for (const item of Array.isArray(items) ? items : []) {
    summary.total += 1;

    if (item?.status === "waiting_human") {
      summary.waitingHuman += 1;
      continue;
    }

    if (item?.status === "waiting_agent") {
      summary.waitingAgent += 1;
      continue;
    }

    if (item?.status === "queued") {
      summary.queued += 1;
    }
  }

  return summary;
}

function summarizeMailboxItems(items) {
  const summary = {
    total: 0,
    pending: 0,
    acked: 0,
  };

  for (const item of Array.isArray(items) ? items : []) {
    summary.total += 1;

    if (item?.entry?.status === "acked") {
      summary.acked += 1;
      continue;
    }

    summary.pending += 1;
  }

  return summary;
}

function resolvePreferredMailboxAgentId(currentMailboxAgentId, selectedWorkItemDetail, workItems) {
  const normalizedCurrent = normalizeOwnerPrincipalId(currentMailboxAgentId);

  if (normalizedCurrent) {
    return normalizedCurrent;
  }

  const detailTargetAgentId = normalizeOwnerPrincipalId(
    selectedWorkItemDetail?.targetAgent?.agentId || selectedWorkItemDetail?.workItem?.targetAgentId,
  );

  if (detailTargetAgentId) {
    return detailTargetAgentId;
  }

  return normalizeOwnerPrincipalId(workItems?.[0]?.targetAgentId);
}

function mergeWorkItemIntoState(workItem, state) {
  if (!workItem?.workItemId) {
    return;
  }

  state.workItems = state.workItems.some((item) => item?.workItemId === workItem.workItemId)
    ? state.workItems.map((item) => item?.workItemId === workItem.workItemId ? { ...item, ...workItem } : item)
    : [workItem, ...state.workItems];

  if (state.selectedWorkItemId === workItem.workItemId) {
    state.selectedWorkItemDetail = {
      ...(state.selectedWorkItemDetail ?? {}),
      workItem: {
        ...(state.selectedWorkItemDetail?.workItem ?? {}),
        ...workItem,
      },
    };
  }
}

function mergeMailboxEntryIntoState(state, mailboxEntry) {
  if (!mailboxEntry?.mailboxEntryId) {
    return;
  }

  state.mailboxItems = state.mailboxItems.map((item) => item?.entry?.mailboxEntryId === mailboxEntry.mailboxEntryId
    ? {
      ...item,
      entry: {
        ...(item.entry ?? {}),
        ...mailboxEntry,
      },
    }
    : item);
}

function upsertMailboxItem(state, mailboxItem) {
  if (!mailboxItem?.entry?.mailboxEntryId) {
    return;
  }

  const nextItem = {
    entry: mailboxItem.entry,
    message: mailboxItem.message ?? {},
  };

  state.mailboxItems = state.mailboxItems.some(
    (item) => item?.entry?.mailboxEntryId === mailboxItem.entry.mailboxEntryId,
  )
    ? state.mailboxItems.map((item) => item?.entry?.mailboxEntryId === mailboxItem.entry.mailboxEntryId
      ? {
        entry: {
          ...(item.entry ?? {}),
          ...(mailboxItem.entry ?? {}),
        },
        message: {
          ...(item.message ?? {}),
          ...(mailboxItem.message ?? {}),
        },
      }
      : item)
    : [nextItem, ...state.mailboxItems];
}

function upsertById(items, nextItem, key) {
  if (!nextItem?.[key]) {
    return Array.isArray(items) ? items : [];
  }

  const list = Array.isArray(items) ? items : [];
  return list.some((item) => item?.[key] === nextItem[key])
    ? list.map((item) => item?.[key] === nextItem[key] ? { ...item, ...nextItem } : item)
    : [nextItem, ...list];
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

function resolveWorkItemStatusLabel(status) {
  switch (status) {
    case "queued":
      return "排队中";
    case "waiting_human":
      return "等人处理";
    case "waiting_agent":
      return "等 agent";
    case "cancelled":
      return "已取消";
    case "completed":
      return "已完成";
    default:
      return typeof status === "string" ? status : "";
  }
}

function resolveMailboxStatusLabel(status) {
  switch (status) {
    case "pending":
      return "待处理";
    case "leased":
      return "已领取";
    case "acked":
      return "已确认";
    case "expired":
      return "已过期";
    default:
      return typeof status === "string" ? status : "";
  }
}

function resolveMessageTypeLabel(messageType) {
  switch (messageType) {
    case "approval_request":
      return "审批请求";
    case "approval_result":
      return "审批结果";
    case "handoff":
      return "交接";
    default:
      return typeof messageType === "string" && messageType.trim()
        ? messageType.trim()
        : "未标注";
  }
}

function readMessageSummary(message) {
  if (typeof message?.summary === "string" && message.summary.trim()) {
    return message.summary.trim();
  }

  if (typeof message?.payload?.summary === "string" && message.payload.summary.trim()) {
    return message.payload.summary.trim();
  }

  if (typeof message?.payload?.inputText === "string" && message.payload.inputText.trim()) {
    return message.payload.inputText.trim();
  }

  return "";
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

function resolveOncallSeverity(value) {
  return ["error", "warning", "info"].includes(value)
    ? value
    : "info";
}

function resolveOncallSeverityLabel(severity) {
  switch (severity) {
    case "error":
      return "立即处理";
    case "warning":
      return "持续关注";
    default:
      return "状态正常";
  }
}

function resolveOncallCategoryLabel(category) {
  switch (category) {
    case "worker_fleet":
      return "节点";
    case "waiting_queue":
      return "待治理";
    case "runs":
      return "执行链路";
    case "agents":
      return "agent 容量";
    default:
      return "";
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

function normalizeOptionalText(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
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
