import type {
  ManagedAgentPlatformMailboxAckPayload,
  ManagedAgentPlatformMailboxAckResult,
  ManagedAgentPlatformMailboxListPayload,
  ManagedAgentPlatformMailboxListResult,
  ManagedAgentPlatformMailboxPullPayload,
  ManagedAgentPlatformMailboxPullResult,
  ManagedAgentPlatformMailboxRespondPayload,
  ManagedAgentPlatformMailboxRespondResult,
} from "themis-contracts/managed-agent-platform-collaboration";
import type {
  ManagedAgentPlatformMailboxEntryRecord,
  ManagedAgentPlatformMailboxItem,
  ManagedAgentPlatformMessageRecord,
  ManagedAgentPlatformOrganizationRecord,
  ManagedAgentPlatformRunRecord,
  ManagedAgentPlatformWorkItemDetailView,
  ManagedAgentPlatformWorkItemRecord,
  ManagedAgentPlatformAgentRecord,
} from "themis-contracts/managed-agent-platform-shared";
import type {
  ManagedAgentPlatformWorkItemCancelPayload,
  ManagedAgentPlatformWorkItemCancelResult,
  ManagedAgentPlatformWorkItemDetailPayload,
  ManagedAgentPlatformWorkItemDetailResult,
  ManagedAgentPlatformWorkItemDispatchPayload,
  ManagedAgentPlatformWorkItemDispatchResult,
  ManagedAgentPlatformWorkItemEscalatePayload,
  ManagedAgentPlatformWorkItemEscalateResult,
  ManagedAgentPlatformWorkItemListPayload,
  ManagedAgentPlatformWorkItemListResult,
  ManagedAgentPlatformWorkItemRespondPayload,
  ManagedAgentPlatformWorkItemRespondResult,
} from "themis-contracts/managed-agent-platform-work-items";
import type { PlatformAgentHandoffSeed, PlatformCollaborationParentSeed } from "./platform-collaboration-service.js";
import type { PlatformWorkerRunService } from "./platform-worker-run-service.js";

interface PlatformWorkItemContext {
  ownerPrincipalId: string;
  organization: ManagedAgentPlatformOrganizationRecord;
  targetAgent: ManagedAgentPlatformAgentRecord;
  workItem: ManagedAgentPlatformWorkItemRecord;
}

export interface PlatformQueuedWorkItemContext extends PlatformWorkItemContext {}

export interface PlatformAgentSeed {
  ownerPrincipalId: string;
  organization: ManagedAgentPlatformOrganizationRecord;
  agent: ManagedAgentPlatformAgentRecord;
}

export interface PlatformWorkItemSeed extends PlatformWorkItemContext {}

export interface PlatformMailboxSeed {
  ownerPrincipalId: string;
  organization: ManagedAgentPlatformOrganizationRecord;
  agent: ManagedAgentPlatformAgentRecord;
  entry: ManagedAgentPlatformMailboxEntryRecord;
  message: ManagedAgentPlatformMessageRecord;
}

export interface PlatformWorkflowServiceSnapshot {
  agentSeeds: PlatformAgentSeed[];
  workItemSeeds: PlatformWorkItemSeed[];
  mailboxSeeds: PlatformMailboxSeed[];
  parentSeeds: PlatformCollaborationParentSeed[];
  handoffSeeds: PlatformAgentHandoffSeed[];
}

export interface PlatformWorkflowService {
  listWorkItems(payload: ManagedAgentPlatformWorkItemListPayload): ManagedAgentPlatformWorkItemListResult;
  getWorkItemDetail(payload: ManagedAgentPlatformWorkItemDetailPayload): ManagedAgentPlatformWorkItemDetailResult | null;
  registerAgent(seed: PlatformAgentSeed): void;
  claimNextQueuedWorkItem(input: {
    ownerPrincipalId: string;
    organizationId?: string;
    excludeWorkItemIds?: string[];
  }): PlatformQueuedWorkItemContext | null;
  dispatchWorkItem(payload: ManagedAgentPlatformWorkItemDispatchPayload): ManagedAgentPlatformWorkItemDispatchResult;
  cancelWorkItem(payload: ManagedAgentPlatformWorkItemCancelPayload): ManagedAgentPlatformWorkItemCancelResult | null;
  respondToWorkItem(payload: ManagedAgentPlatformWorkItemRespondPayload): ManagedAgentPlatformWorkItemRespondResult | null;
  escalateWorkItem(payload: ManagedAgentPlatformWorkItemEscalatePayload): ManagedAgentPlatformWorkItemEscalateResult | null;
  listMailbox(payload: ManagedAgentPlatformMailboxListPayload): ManagedAgentPlatformMailboxListResult | null;
  pullMailbox(payload: ManagedAgentPlatformMailboxPullPayload): ManagedAgentPlatformMailboxPullResult | null;
  ackMailbox(payload: ManagedAgentPlatformMailboxAckPayload): ManagedAgentPlatformMailboxAckResult | null;
  respondMailbox(payload: ManagedAgentPlatformMailboxRespondPayload): ManagedAgentPlatformMailboxRespondResult | null;
}

export interface SnapshotCapablePlatformWorkflowService extends PlatformWorkflowService {
  exportSnapshot(): PlatformWorkflowServiceSnapshot;
  replaceSnapshot(snapshot: PlatformWorkflowServiceSnapshot): void;
}

export interface InMemoryPlatformWorkflowServiceOptions {
  workerRunService: PlatformWorkerRunService;
  agentSeeds?: PlatformAgentSeed[];
  workItemSeeds?: PlatformWorkItemSeed[];
  mailboxSeeds?: PlatformMailboxSeed[];
  parentSeeds?: PlatformCollaborationParentSeed[];
  handoffSeeds?: PlatformAgentHandoffSeed[];
  now?: () => string;
  generateWorkItemId?: () => string;
  generateMessageId?: () => string;
  generateMailboxEntryId?: () => string;
}

export function createInMemoryPlatformWorkflowService(
  options: InMemoryPlatformWorkflowServiceOptions,
): SnapshotCapablePlatformWorkflowService {
  const now = options.now ?? (() => new Date().toISOString());
  const workItemContexts = new Map<string, PlatformWorkItemContext>();
  const mailboxContexts = new Map<string, PlatformMailboxSeed>();
  const agentSeeds = Array.isArray(options.agentSeeds) ? options.agentSeeds.map(cloneAgentSeed) : [];
  const parentSeeds = Array.isArray(options.parentSeeds) ? options.parentSeeds.map(cloneParentSeed) : [];
  const handoffSeeds = Array.isArray(options.handoffSeeds) ? options.handoffSeeds.map(cloneHandoffSeed) : [];
  let generatedWorkItemCount = 0;
  let generatedMessageCount = 0;
  let generatedMailboxEntryCount = 0;

  for (const seed of options.workItemSeeds ?? []) {
    workItemContexts.set(seed.workItem.workItemId, cloneWorkItemContext(seed));
  }

  for (const seed of options.mailboxSeeds ?? []) {
    mailboxContexts.set(seed.entry.mailboxEntryId, cloneMailboxSeed(seed));
  }

  const resetGeneratedCounters = () => {
    generatedWorkItemCount = resolveMaxSequentialId(
      Array.from(workItemContexts.values()).map((context) => context.workItem.workItemId),
      "work-item-platform-",
    );
    generatedMessageCount = resolveMaxSequentialId(
      Array.from(mailboxContexts.values()).map((context) => context.message.messageId),
      "message-platform-",
    );
    generatedMailboxEntryCount = resolveMaxSequentialId(
      Array.from(mailboxContexts.values()).map((context) => context.entry.mailboxEntryId),
      "mailbox-entry-platform-",
    );
  };

  resetGeneratedCounters();

  const replaceSnapshot = (snapshot: PlatformWorkflowServiceSnapshot) => {
    workItemContexts.clear();
    mailboxContexts.clear();
    agentSeeds.splice(0, agentSeeds.length, ...snapshot.agentSeeds.map(cloneAgentSeed));
    parentSeeds.splice(0, parentSeeds.length, ...snapshot.parentSeeds.map(cloneParentSeed));
    handoffSeeds.splice(0, handoffSeeds.length, ...snapshot.handoffSeeds.map(cloneHandoffSeed));

    for (const seed of snapshot.workItemSeeds) {
      workItemContexts.set(seed.workItem.workItemId, cloneWorkItemContext(seed));
    }

    for (const seed of snapshot.mailboxSeeds) {
      mailboxContexts.set(seed.entry.mailboxEntryId, cloneMailboxSeed(seed));
    }

    resetGeneratedCounters();
  };

  return {
    exportSnapshot() {
      return {
        agentSeeds: agentSeeds.map(cloneAgentSeed),
        workItemSeeds: Array.from(workItemContexts.values()).map((context) => cloneWorkItemContext(context)),
        mailboxSeeds: Array.from(mailboxContexts.values()).map((context) => cloneMailboxSeed(context)),
        parentSeeds: parentSeeds.map(cloneParentSeed),
        handoffSeeds: handoffSeeds.map(cloneHandoffSeed),
      };
    },

    replaceSnapshot,

    listWorkItems(payload) {
      const items = listAllWorkItemContexts(payload.ownerPrincipalId)
        .filter((context) => !payload.agentId || context.targetAgent.agentId === payload.agentId)
        .sort((left, right) => compareWorkItems(left.workItem, right.workItem))
        .map((context) => ({ ...context.workItem }));

      return { workItems: items };
    },

    getWorkItemDetail(payload) {
      const context = getWorkItemContext(payload.ownerPrincipalId, payload.workItemId);

      if (!context) {
        return null;
      }

      const runs = options.workerRunService.listRuns({
        ownerPrincipalId: payload.ownerPrincipalId,
        workItemId: payload.workItemId,
      }).runs ?? [];
      const parentWorkItemId = parentSeeds.find((seed) => (
        seed.ownerPrincipalId === payload.ownerPrincipalId
        && seed.childWorkItemIds.includes(payload.workItemId)
      ))?.parentWorkItemId;
      const parentWorkItem = parentWorkItemId
        ? resolveSeedParentWorkItem(payload.ownerPrincipalId, parentWorkItemId)
          ?? getWorkItemContext(payload.ownerPrincipalId, parentWorkItemId)?.workItem
          ?? null
        : null;
      const childSeed = parentSeeds.find((seed) => (
        seed.ownerPrincipalId === payload.ownerPrincipalId
        && seed.parentWorkItemId === payload.workItemId
      ));
      const latestHandoff = handoffSeeds
        .filter((seed) => seed.ownerPrincipalId === payload.ownerPrincipalId)
        .flatMap((seed) => seed.handoffs)
        .filter((handoff) => handoff.workItemId === payload.workItemId)
        .sort(compareTimestampedDesc)[0] ?? null;

      return {
        organization: { ...context.organization },
        workItem: { ...context.workItem },
        targetAgent: { ...context.targetAgent },
        runs: runs.map((run) => ({ ...run })),
        parentWorkItem: parentWorkItem ? { ...parentWorkItem } : null,
        childWorkItems: childSeed
          ? childSeed.childWorkItemIds
            .map((workItemId) => getWorkItemContext(payload.ownerPrincipalId, workItemId)?.workItem)
            .filter((workItem): workItem is ManagedAgentPlatformWorkItemRecord => Boolean(workItem))
            .map((workItem) => ({ ...workItem }))
          : [],
        ...(latestHandoff ? { latestHandoff: { ...latestHandoff } } : { latestHandoff: null }),
      } satisfies ManagedAgentPlatformWorkItemDetailView;
    },

    registerAgent(seed) {
      const normalizedOwnerPrincipalId = normalizeText(seed.ownerPrincipalId);
      const normalizedAgentId = normalizeText(seed.agent.agentId);
      const existingIndex = agentSeeds.findIndex((candidate) => (
        candidate.ownerPrincipalId === normalizedOwnerPrincipalId
        && candidate.agent.agentId === normalizedAgentId
      ));
      const nextSeed = cloneAgentSeed({
        ownerPrincipalId: normalizedOwnerPrincipalId,
        organization: seed.organization,
        agent: seed.agent,
      });

      if (existingIndex >= 0) {
        agentSeeds.splice(existingIndex, 1, nextSeed);
        return;
      }

      agentSeeds.push(nextSeed);
    },

    claimNextQueuedWorkItem(input) {
      const excludedWorkItemIds = new Set(
        (input.excludeWorkItemIds ?? [])
          .map((value) => normalizeOptionalText(value))
          .filter((value): value is string => Boolean(value)),
      );
      const context = listAllWorkItemContexts(input.ownerPrincipalId)
        .filter((candidate) => candidate.workItem.status === "queued")
        .filter((candidate) => !input.organizationId || candidate.organization.organizationId === input.organizationId)
        .filter((candidate) => !excludedWorkItemIds.has(candidate.workItem.workItemId))
        .sort((left, right) => compareWorkItems(left.workItem, right.workItem))[0];

      return context ? cloneWorkItemContext(context) : null;
    },

    dispatchWorkItem(payload) {
      const targetAgent = requireOwnedAgent(payload.ownerPrincipalId, payload.workItem.targetAgentId);
      const organization = requireOwnedOrganization(payload.ownerPrincipalId, targetAgent.organizationId);
      const timestamp = now();
      const workItemId = options.generateWorkItemId?.() ?? `work-item-platform-${++generatedWorkItemCount}`;
      const workItem: ManagedAgentPlatformWorkItemRecord = {
        workItemId,
        organizationId: organization.organizationId,
        targetAgentId: targetAgent.agentId,
        sourceType: payload.workItem.sourceType ?? "human",
        ...(payload.workItem.sourcePrincipalId ? { sourcePrincipalId: payload.workItem.sourcePrincipalId } : {}),
        ...(payload.workItem.sourceAgentId ? { sourceAgentId: payload.workItem.sourceAgentId } : {}),
        ...(payload.workItem.parentWorkItemId ? { parentWorkItemId: payload.workItem.parentWorkItemId } : {}),
        ...(payload.workItem.dispatchReason ? { dispatchReason: payload.workItem.dispatchReason } : {}),
        goal: payload.workItem.goal,
        ...(Object.prototype.hasOwnProperty.call(payload.workItem, "contextPacket")
          ? { contextPacket: payload.workItem.contextPacket }
          : {}),
        status: "queued",
        priority: payload.workItem.priority ?? "normal",
        ...(Object.prototype.hasOwnProperty.call(payload.workItem, "projectId") ? { projectId: payload.workItem.projectId ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload.workItem, "workspacePolicySnapshot")
          ? { workspacePolicySnapshot: payload.workItem.workspacePolicySnapshot }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload.workItem, "runtimeProfileSnapshot")
          ? { runtimeProfileSnapshot: payload.workItem.runtimeProfileSnapshot }
          : {}),
        ...(payload.workItem.scheduledAt ? { scheduledAt: payload.workItem.scheduledAt } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      workItemContexts.set(workItemId, {
        ownerPrincipalId: payload.ownerPrincipalId,
        organization: { ...organization },
        targetAgent: { ...targetAgent },
        workItem: { ...workItem },
      });

      return {
        organization: { ...organization },
        targetAgent: { ...targetAgent },
        workItem: { ...workItem },
      };
    },

    cancelWorkItem(payload) {
      const context = getWorkItemContext(payload.ownerPrincipalId, payload.workItemId);

      if (!context) {
        return null;
      }

      const timestamp = now();
      const updatedWorkItem = updateWorkItemRecord(payload.ownerPrincipalId, payload.workItemId, {
        status: "cancelled",
        waitingFor: null,
        updatedAt: timestamp,
      });
      const assignedRun = options.workerRunService.updateAssignedRunByWorkItem({
        ownerPrincipalId: payload.ownerPrincipalId,
        workItemId: payload.workItemId,
        runPatch: {
          status: "cancelled",
          updatedAt: timestamp,
        },
      });

      return {
        organization: { ...context.organization },
        workItem: updatedWorkItem,
        cancelledRunIds: assignedRun ? [assignedRun.run.runId] : [],
      };
    },

    respondToWorkItem(payload) {
      const context = getWorkItemContext(payload.ownerPrincipalId, payload.workItemId);

      if (!context) {
        return null;
      }

      const timestamp = now();
      const updatedWorkItem = updateWorkItemRecord(payload.ownerPrincipalId, payload.workItemId, {
        status: "queued",
        waitingFor: null,
        updatedAt: timestamp,
      });
      const assignedRun = options.workerRunService.updateAssignedRunByWorkItem({
        ownerPrincipalId: payload.ownerPrincipalId,
        workItemId: payload.workItemId,
        runPatch: {
          status: "interrupted",
          updatedAt: timestamp,
        },
      });
      const message = createMessageRecord({
        organizationId: context.organization.organizationId,
        fromAgentId: "platform-owner",
        toAgentId: context.targetAgent.agentId,
        workItemId: payload.workItemId,
        messageType: "approval_result",
        payload: {
          decision: payload.response.decision ?? "approve",
          inputText: payload.response.inputText ?? "",
          ...(Object.prototype.hasOwnProperty.call(payload.response, "payload") ? { payload: payload.response.payload } : {}),
        },
        artifactRefs: payload.response.artifactRefs ?? [],
        priority: updatedWorkItem.priority,
        requiresAck: false,
        createdAt: timestamp,
      });

      return {
        organization: { ...context.organization },
        workItem: updatedWorkItem,
        ...(message ? { message } : {}),
        ...(assignedRun ? { resumedRuns: [{ ...assignedRun.run }] } : {}),
      } as ManagedAgentPlatformWorkItemRespondResult;
    },

    escalateWorkItem(payload) {
      const context = getWorkItemContext(payload.ownerPrincipalId, payload.workItemId);

      if (!context) {
        return null;
      }

      const timestamp = now();
      const updatedWorkItem = updateWorkItemRecord(payload.ownerPrincipalId, payload.workItemId, {
        status: "waiting_human",
        waitingFor: "human",
        updatedAt: timestamp,
      });
      const message = createMessageRecord({
        organizationId: context.organization.organizationId,
        fromAgentId: context.targetAgent.agentId,
        toAgentId: "platform-owner",
        workItemId: payload.workItemId,
        messageType: "waiting_escalation",
        payload: {
          inputText: payload.escalation?.inputText ?? "",
        },
        artifactRefs: [],
        priority: updatedWorkItem.priority,
        requiresAck: false,
        createdAt: timestamp,
      });

      return {
        organization: { ...context.organization },
        workItem: updatedWorkItem,
        ...(message ? { message } : {}),
      } as ManagedAgentPlatformWorkItemEscalateResult;
    },

    listMailbox(payload) {
      const agent = findOwnedAgent(payload.ownerPrincipalId, payload.agentId);

      if (!agent) {
        return null;
      }

      const items = Array.from(mailboxContexts.values())
        .filter((context) => (
          context.ownerPrincipalId === payload.ownerPrincipalId
          && context.agent.agentId === payload.agentId
        ))
        .sort((left, right) => compareMailboxItems(left.entry, right.entry))
        .map((context) => ({
          entry: { ...context.entry },
          message: { ...context.message },
        }));

      return {
        agent: { ...agent },
        items,
      };
    },

    pullMailbox(payload) {
      const agent = findOwnedAgent(payload.ownerPrincipalId, payload.agentId);

      if (!agent) {
        return null;
      }

      const context = Array.from(mailboxContexts.values())
        .filter((candidate) => (
          candidate.ownerPrincipalId === payload.ownerPrincipalId
          && candidate.agent.agentId === payload.agentId
          && candidate.entry.status === "pending"
        ))
        .sort((left, right) => compareMailboxItems(left.entry, right.entry))[0];

      if (!context) {
        return {
          agent: { ...agent },
          item: null,
        };
      }

      const timestamp = now();
      context.entry = {
        ...context.entry,
        status: "leased",
        leaseToken: context.entry.leaseToken ?? `mailbox-lease-${context.entry.mailboxEntryId}`,
        leasedAt: timestamp,
        updatedAt: timestamp,
      };

      return {
        agent: { ...agent },
        item: {
          entry: { ...context.entry },
          message: { ...context.message },
        },
      };
    },

    ackMailbox(payload) {
      const context = mailboxContexts.get(payload.mailboxEntryId);

      if (!context || context.ownerPrincipalId !== payload.ownerPrincipalId || context.agent.agentId !== payload.agentId) {
        return null;
      }

      const timestamp = now();
      context.entry = {
        ...context.entry,
        status: "acked",
        ackedAt: timestamp,
        updatedAt: timestamp,
      };

      return {
        agent: { ...context.agent },
        mailboxEntry: { ...context.entry },
        message: { ...context.message },
      };
    },

    respondMailbox(payload) {
      const sourceContext = mailboxContexts.get(payload.mailboxEntryId);

      if (!sourceContext || sourceContext.ownerPrincipalId !== payload.ownerPrincipalId || sourceContext.agent.agentId !== payload.agentId) {
        return null;
      }

      const timestamp = now();
      sourceContext.entry = {
        ...sourceContext.entry,
        status: "acked",
        ackedAt: timestamp,
        updatedAt: timestamp,
      };

      const responseAgentId = normalizeText(sourceContext.message.fromAgentId);
      const responseAgent = responseAgentId
        ? requireOwnedAgent(payload.ownerPrincipalId, responseAgentId)
        : { ...sourceContext.agent };
      const responseMessage = createMessageRecord({
        organizationId: sourceContext.organization.organizationId,
        fromAgentId: sourceContext.agent.agentId,
        toAgentId: responseAgent.agentId,
        workItemId: sourceContext.entry.workItemId ?? sourceContext.message.workItemId ?? null,
        parentMessageId: sourceContext.message.messageId,
        messageType: "approval_result",
        payload: {
          decision: payload.response.decision ?? "approve",
          inputText: payload.response.inputText ?? "",
          ...(Object.prototype.hasOwnProperty.call(payload.response, "payload") ? { payload: payload.response.payload } : {}),
        },
        artifactRefs: payload.response.artifactRefs ?? [],
        priority: payload.response.priority ?? sourceContext.entry.priority ?? "normal",
        requiresAck: false,
        createdAt: timestamp,
      });
      const responseMailboxEntry: ManagedAgentPlatformMailboxEntryRecord = {
        mailboxEntryId: options.generateMailboxEntryId?.() ?? `mailbox-entry-platform-${++generatedMailboxEntryCount}`,
        organizationId: sourceContext.organization.organizationId,
        ownerAgentId: responseAgent.agentId,
        agentId: responseAgent.agentId,
        messageId: responseMessage.messageId,
        workItemId: sourceContext.entry.workItemId ?? sourceContext.message.workItemId ?? null,
        priority: payload.response.priority ?? sourceContext.entry.priority ?? "normal",
        status: "acked",
        requiresAck: false,
        availableAt: timestamp,
        ackedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mailboxContexts.set(responseMailboxEntry.mailboxEntryId, {
        ownerPrincipalId: payload.ownerPrincipalId,
        organization: { ...sourceContext.organization },
        agent: { ...responseAgent },
        entry: { ...responseMailboxEntry },
        message: { ...responseMessage },
      });

      let resumedWorkItem: ManagedAgentPlatformWorkItemRecord | undefined;
      let resumedRuns: ManagedAgentPlatformRunRecord[] = [];
      const relatedWorkItemId = sourceContext.entry.workItemId ?? sourceContext.message.workItemId ?? null;

      if (relatedWorkItemId) {
        resumedWorkItem = updateWorkItemRecord(payload.ownerPrincipalId, relatedWorkItemId, {
          status: "queued",
          waitingFor: null,
          updatedAt: timestamp,
        });
        const resumedRun = options.workerRunService.updateAssignedRunByWorkItem({
          ownerPrincipalId: payload.ownerPrincipalId,
          workItemId: relatedWorkItemId,
          runPatch: {
            status: "interrupted",
            updatedAt: timestamp,
          },
        });
        resumedRuns = resumedRun ? [{ ...resumedRun.run }] : [];
      }

      return {
        organization: { ...sourceContext.organization },
        agent: { ...sourceContext.agent },
        sourceMailboxEntry: { ...sourceContext.entry },
        sourceMessage: { ...sourceContext.message },
        responseMessage: { ...responseMessage },
        responseMailboxEntry: { ...responseMailboxEntry },
        ...(resumedWorkItem ? { resumedWorkItem } : {}),
        resumedRuns,
      };
    },
  };

  function listAllWorkItemContexts(ownerPrincipalId: string): PlatformWorkItemContext[] {
    const results = new Map<string, PlatformWorkItemContext>();

    for (const context of workItemContexts.values()) {
      if (context.ownerPrincipalId === ownerPrincipalId) {
        results.set(context.workItem.workItemId, cloneWorkItemContext(context));
      }
    }

    // Assigned runs carry the freshest execution status and must override any stale
    // seed/snapshot work-item context that still reflects the pre-execution state.
    for (const assignedRun of options.workerRunService.listAssignedRuns({ ownerPrincipalId })) {
      results.set(assignedRun.workItem.workItemId, {
        ownerPrincipalId,
        organization: { ...assignedRun.organization },
        targetAgent: { ...assignedRun.targetAgent },
        workItem: { ...assignedRun.workItem },
      });
    }

    return Array.from(results.values());
  }

  function getWorkItemContext(ownerPrincipalId: string, workItemId: string): PlatformWorkItemContext | null {
    const assignedRun = options.workerRunService.getAssignedRunByWorkItem({
      ownerPrincipalId,
      workItemId,
    });

    if (assignedRun) {
      return {
        ownerPrincipalId,
        organization: { ...assignedRun.organization },
        targetAgent: { ...assignedRun.targetAgent },
        workItem: { ...assignedRun.workItem },
      };
    }

    const context = workItemContexts.get(workItemId);
    return context && context.ownerPrincipalId === ownerPrincipalId ? cloneWorkItemContext(context) : null;
  }

  function updateWorkItemRecord(
    ownerPrincipalId: string,
    workItemId: string,
    patch: Partial<ManagedAgentPlatformWorkItemRecord>,
  ): ManagedAgentPlatformWorkItemRecord {
    const assignedRun = options.workerRunService.updateAssignedRunByWorkItem({
      ownerPrincipalId,
      workItemId,
      workItemPatch: patch,
    });

    if (assignedRun) {
      return { ...assignedRun.workItem };
    }

    const context = workItemContexts.get(workItemId);

    if (!context || context.ownerPrincipalId !== ownerPrincipalId) {
      throw new Error("Work item not found.");
    }

    context.workItem = {
      ...context.workItem,
      ...patch,
    };

    return { ...context.workItem };
  }

  function findOwnedAgent(ownerPrincipalId: string, agentId: string): ManagedAgentPlatformAgentRecord | null {
    return findAgentContext(ownerPrincipalId, agentId)?.agent ?? null;
  }

  function requireOwnedAgent(ownerPrincipalId: string, agentId: string): ManagedAgentPlatformAgentRecord {
    const context = findAgentContext(ownerPrincipalId, agentId);

    if (!context) {
      throw new Error(`Agent ${agentId} not found.`);
    }

    return { ...context.agent };
  }

  function requireOwnedOrganization(ownerPrincipalId: string, organizationId: string): ManagedAgentPlatformOrganizationRecord {
    const context = findOrganizationContext(ownerPrincipalId, organizationId);

    if (!context) {
      throw new Error(`Organization ${organizationId} not found.`);
    }

    return { ...context.organization };
  }

  function findAgentContext(ownerPrincipalId: string, agentId: string): { organization: ManagedAgentPlatformOrganizationRecord; agent: ManagedAgentPlatformAgentRecord } | null {
    for (const assignedRun of options.workerRunService.listAssignedRuns({ ownerPrincipalId })) {
      if (assignedRun.targetAgent.agentId === agentId) {
        return {
          organization: { ...assignedRun.organization },
          agent: { ...assignedRun.targetAgent },
        };
      }
    }

    for (const seed of agentSeeds) {
      if (seed.ownerPrincipalId === ownerPrincipalId && seed.agent.agentId === agentId) {
        return {
          organization: { ...seed.organization },
          agent: { ...seed.agent },
        };
      }
    }

    for (const context of workItemContexts.values()) {
      if (context.ownerPrincipalId === ownerPrincipalId && context.targetAgent.agentId === agentId) {
        return {
          organization: { ...context.organization },
          agent: { ...context.targetAgent },
        };
      }
    }

    for (const mailboxContext of mailboxContexts.values()) {
      if (mailboxContext.ownerPrincipalId === ownerPrincipalId && mailboxContext.agent.agentId === agentId) {
        return {
          organization: { ...mailboxContext.organization },
          agent: { ...mailboxContext.agent },
        };
      }
    }

    for (const handoffSeed of handoffSeeds) {
      if (handoffSeed.ownerPrincipalId === ownerPrincipalId && handoffSeed.agent?.agentId === agentId) {
        const organization = handoffSeed.organizationId
          ? findOrganizationContext(ownerPrincipalId, handoffSeed.organizationId)?.organization
          : null;

        if (organization) {
          return {
            organization: { ...organization },
            agent: { ...handoffSeed.agent },
          };
        }
      }
    }

    return null;
  }

  function findOrganizationContext(
    ownerPrincipalId: string,
    organizationId: string,
  ): { organization: ManagedAgentPlatformOrganizationRecord } | null {
    for (const assignedRun of options.workerRunService.listAssignedRuns({ ownerPrincipalId })) {
      if (assignedRun.organization.organizationId === organizationId) {
        return {
          organization: { ...assignedRun.organization },
        };
      }
    }

    for (const seed of agentSeeds) {
      if (seed.ownerPrincipalId === ownerPrincipalId && seed.organization.organizationId === organizationId) {
        return {
          organization: { ...seed.organization },
        };
      }
    }

    for (const context of workItemContexts.values()) {
      if (context.ownerPrincipalId === ownerPrincipalId && context.organization.organizationId === organizationId) {
        return {
          organization: { ...context.organization },
        };
      }
    }

    for (const context of mailboxContexts.values()) {
      if (context.ownerPrincipalId === ownerPrincipalId && context.organization.organizationId === organizationId) {
        return {
          organization: { ...context.organization },
        };
      }
    }

    return null;
  }

  function createMessageRecord(input: {
    organizationId: string;
    fromAgentId?: string | null;
    toAgentId?: string | null;
    workItemId?: string | null;
    parentMessageId?: string | null;
    messageType?: string;
    payload?: unknown;
    artifactRefs?: string[];
    priority?: ManagedAgentPlatformWorkItemRecord["priority"];
    requiresAck?: boolean;
    createdAt: string;
  }): ManagedAgentPlatformMessageRecord {
    const messageId = options.generateMessageId?.() ?? `message-platform-${++generatedMessageCount}`;
    return {
      messageId,
      organizationId: input.organizationId,
      ...(input.fromAgentId ? { fromAgentId: input.fromAgentId } : {}),
      ...(input.toAgentId ? { toAgentId: input.toAgentId } : {}),
      ...(input.workItemId ? { workItemId: input.workItemId } : {}),
      ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
      ...(input.messageType ? { messageType: input.messageType } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "payload") ? { payload: input.payload } : {}),
      artifactRefs: input.artifactRefs ?? [],
      priority: input.priority ?? "normal",
      requiresAck: input.requiresAck ?? false,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }

  function resolveSeedParentWorkItem(
    ownerPrincipalId: string,
    parentWorkItemId: string,
  ): ManagedAgentPlatformWorkItemRecord | null {
    const seed = parentSeeds.find((candidate) => (
      candidate.ownerPrincipalId === ownerPrincipalId
      && candidate.parentWorkItemId === parentWorkItemId
    ));

    if (!seed) {
      return null;
    }

    const firstChild = seed.childWorkItemIds
      .map((workItemId) => getWorkItemContext(ownerPrincipalId, workItemId)?.workItem)
      .filter((workItem): workItem is ManagedAgentPlatformWorkItemRecord => Boolean(workItem))[0];

    if (!firstChild) {
      return null;
    }

    return {
      workItemId: seed.parentWorkItemId,
      organizationId: firstChild.organizationId,
      targetAgentId: firstChild.targetAgentId,
      sourceType: "agent",
      goal: seed.displayName ?? seed.parentWorkItemId,
      status: "queued",
      priority: "normal",
      createdAt: firstChild.createdAt,
      updatedAt: firstChild.updatedAt,
    };
  }
}

function compareWorkItems(left: ManagedAgentPlatformWorkItemRecord, right: ManagedAgentPlatformWorkItemRecord) {
  const priorityDelta = resolvePriorityWeight(right.priority) - resolvePriorityWeight(left.priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return compareTimestampedDesc(left, right);
}

function compareMailboxItems(
  left: ManagedAgentPlatformMailboxEntryRecord,
  right: ManagedAgentPlatformMailboxEntryRecord,
) {
  const priorityDelta = resolvePriorityWeight(right.priority ?? "normal") - resolvePriorityWeight(left.priority ?? "normal");

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return compareTimestampedDesc(left, right);
}

function resolvePriorityWeight(priority: ManagedAgentPlatformWorkItemRecord["priority"]) {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function compareTimestampedDesc(
  left: { updatedAt?: string; createdAt?: string },
  right: { updatedAt?: string; createdAt?: string },
) {
  const leftTimestamp = Date.parse(String(left.updatedAt ?? left.createdAt ?? ""));
  const rightTimestamp = Date.parse(String(right.updatedAt ?? right.createdAt ?? ""));

  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? ""), "en");
}

function cloneAgentSeed(seed: PlatformAgentSeed): PlatformAgentSeed {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    organization: { ...seed.organization },
    agent: { ...seed.agent },
  };
}

function cloneWorkItemContext(seed: PlatformWorkItemSeed | PlatformWorkItemContext): PlatformWorkItemContext {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    organization: { ...seed.organization },
    targetAgent: { ...seed.targetAgent },
    workItem: { ...seed.workItem },
  };
}

function cloneMailboxSeed(seed: PlatformMailboxSeed): PlatformMailboxSeed {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    organization: { ...seed.organization },
    agent: { ...seed.agent },
    entry: { ...seed.entry },
    message: { ...seed.message },
  };
}

function cloneParentSeed(seed: PlatformCollaborationParentSeed): PlatformCollaborationParentSeed {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    ...(seed.organizationId ? { organizationId: seed.organizationId } : {}),
    parentWorkItemId: seed.parentWorkItemId,
    ...(seed.displayName ? { displayName: seed.displayName } : {}),
    childWorkItemIds: [...seed.childWorkItemIds],
  };
}

function cloneHandoffSeed(seed: PlatformAgentHandoffSeed): PlatformAgentHandoffSeed {
  return {
    ownerPrincipalId: seed.ownerPrincipalId,
    ...(seed.organizationId ? { organizationId: seed.organizationId } : {}),
    agentId: seed.agentId,
    ...(seed.agent ? { agent: { ...seed.agent } } : {}),
    handoffs: seed.handoffs.map((handoff) => ({ ...handoff })),
    timeline: seed.timeline.map((entry) => ({ ...entry })),
  };
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function resolveMaxSequentialId(values: Array<string | undefined>, prefix: string): number {
  let maxValue = 0;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const match = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`).exec(value);
    const suffix = match?.[1];

    if (!suffix) {
      continue;
    }

    const parsed = Number.parseInt(suffix, 10);

    if (Number.isFinite(parsed) && parsed > maxValue) {
      maxValue = parsed;
    }
  }

  return maxValue;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
