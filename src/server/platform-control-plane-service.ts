import type {
  ManagedAgentPlatformAgentCreatePayload,
  ManagedAgentPlatformAgentCreateResult,
  ManagedAgentPlatformAgentDetailPayload,
  ManagedAgentPlatformAgentDetailResult,
  ManagedAgentPlatformAgentExecutionBoundaryUpdatePayload,
  ManagedAgentPlatformAgentExecutionBoundaryUpdateResult,
  ManagedAgentPlatformAgentLifecyclePayload,
  ManagedAgentPlatformAgentLifecycleResult,
  ManagedAgentPlatformAgentListResult,
  ManagedAgentPlatformAgentSpawnPolicyUpdatePayload,
  ManagedAgentPlatformAgentSpawnPolicyUpdateResult,
} from "themis-contracts/managed-agent-platform-agents";
import type {
  ManagedAgentPlatformAgentRecord,
  ManagedAgentPlatformAuthAccountRecord,
  ManagedAgentPlatformOrganizationRecord,
  ManagedAgentPlatformPrincipalRecord,
  ManagedAgentPlatformProjectWorkspaceBindingRecord,
  ManagedAgentPlatformRuntimeProfileRecord,
  ManagedAgentPlatformSpawnPolicyRecord,
  ManagedAgentPlatformThirdPartyProviderRecord,
  ManagedAgentPlatformWorkspacePolicyRecord,
} from "themis-contracts/managed-agent-platform-shared";
import type {
  ManagedAgentPlatformProjectWorkspaceBindingDetailPayload,
  ManagedAgentPlatformProjectWorkspaceBindingDetailResult,
  ManagedAgentPlatformProjectWorkspaceBindingListPayload,
  ManagedAgentPlatformProjectWorkspaceBindingListResult,
  ManagedAgentPlatformProjectWorkspaceBindingUpsertPayload,
  ManagedAgentPlatformProjectWorkspaceBindingUpsertResult,
} from "themis-contracts/managed-agent-platform-projects";

interface OwnerControlPlaneState {
  organizations: Map<string, ManagedAgentPlatformOrganizationRecord>;
  principals: Map<string, ManagedAgentPlatformPrincipalRecord>;
  agents: Map<string, ManagedAgentPlatformAgentRecord>;
  workspacePolicies: Map<string, ManagedAgentPlatformWorkspacePolicyRecord>;
  runtimeProfiles: Map<string, ManagedAgentPlatformRuntimeProfileRecord>;
  authAccounts: Map<string, ManagedAgentPlatformAuthAccountRecord[]>;
  thirdPartyProviders: Map<string, ManagedAgentPlatformThirdPartyProviderRecord[]>;
  projectBindings: Map<string, ManagedAgentPlatformProjectWorkspaceBindingRecord>;
  spawnPolicy: ManagedAgentPlatformSpawnPolicyRecord | null;
}

export interface PlatformControlPlaneService {
  listAgents(input: { ownerPrincipalId: string }): ManagedAgentPlatformAgentListResult;
  getAgentDetail(input: ManagedAgentPlatformAgentDetailPayload): ManagedAgentPlatformAgentDetailResult | null;
  createAgent(input: ManagedAgentPlatformAgentCreatePayload): ManagedAgentPlatformAgentCreateResult;
  updateExecutionBoundary(
    input: ManagedAgentPlatformAgentExecutionBoundaryUpdatePayload,
  ): ManagedAgentPlatformAgentExecutionBoundaryUpdateResult | null;
  updateSpawnPolicy(
    input: ManagedAgentPlatformAgentSpawnPolicyUpdatePayload,
  ): ManagedAgentPlatformAgentSpawnPolicyUpdateResult;
  pauseAgent(input: ManagedAgentPlatformAgentLifecyclePayload): ManagedAgentPlatformAgentLifecycleResult | null;
  resumeAgent(input: ManagedAgentPlatformAgentLifecyclePayload): ManagedAgentPlatformAgentLifecycleResult | null;
  archiveAgent(input: ManagedAgentPlatformAgentLifecyclePayload): ManagedAgentPlatformAgentLifecycleResult | null;
  listProjectWorkspaceBindings(
    input: ManagedAgentPlatformProjectWorkspaceBindingListPayload,
  ): ManagedAgentPlatformProjectWorkspaceBindingListResult;
  getProjectWorkspaceBinding(
    input: ManagedAgentPlatformProjectWorkspaceBindingDetailPayload,
  ): ManagedAgentPlatformProjectWorkspaceBindingDetailResult | null;
  upsertProjectWorkspaceBinding(
    input: ManagedAgentPlatformProjectWorkspaceBindingUpsertPayload,
  ): ManagedAgentPlatformProjectWorkspaceBindingUpsertResult;
}

export interface PlatformControlPlaneOwnerSnapshot {
  ownerPrincipalId: string;
  organizations: ManagedAgentPlatformOrganizationRecord[];
  principals: ManagedAgentPlatformPrincipalRecord[];
  agents: ManagedAgentPlatformAgentRecord[];
  workspacePolicies: ManagedAgentPlatformWorkspacePolicyRecord[];
  runtimeProfiles: ManagedAgentPlatformRuntimeProfileRecord[];
  authAccounts: ManagedAgentPlatformAuthAccountRecord[];
  thirdPartyProviders: ManagedAgentPlatformThirdPartyProviderRecord[];
  projectBindings: ManagedAgentPlatformProjectWorkspaceBindingRecord[];
  spawnPolicy: ManagedAgentPlatformSpawnPolicyRecord | null;
}

export interface PlatformControlPlaneServiceSnapshot {
  owners: PlatformControlPlaneOwnerSnapshot[];
}

export interface SnapshotCapablePlatformControlPlaneService extends PlatformControlPlaneService {
  exportSnapshot(): PlatformControlPlaneServiceSnapshot;
  replaceSnapshot(snapshot: PlatformControlPlaneServiceSnapshot): void;
}

export interface PlatformControlPlaneServiceOptions {
  now?: () => string;
  generateOrganizationId?: () => string;
  generatePrincipalId?: () => string;
  generateAgentId?: () => string;
  snapshot?: PlatformControlPlaneServiceSnapshot;
}

export function createInMemoryPlatformControlPlaneService(
  options: PlatformControlPlaneServiceOptions = {},
): SnapshotCapablePlatformControlPlaneService {
  const now = options.now ?? (() => new Date().toISOString());
  const generateOrganizationId = options.generateOrganizationId ?? createIdFactory("org");
  const generatePrincipalId = options.generatePrincipalId ?? createIdFactory("principal");
  const generateAgentId = options.generateAgentId ?? createIdFactory("agent");
  const ownerStates = new Map<string, OwnerControlPlaneState>();

  for (const owner of options.snapshot?.owners ?? []) {
    ownerStates.set(normalizeText(owner.ownerPrincipalId), {
      organizations: new Map(owner.organizations.map((organization) => [organization.organizationId, { ...organization }])),
      principals: new Map(owner.principals.map((principal) => [principal.principalId, { ...principal }])),
      agents: new Map(owner.agents.map((agent) => [agent.agentId, { ...agent }])),
      workspacePolicies: new Map(owner.workspacePolicies.map((policy) => [policy.agentId, cloneWorkspacePolicy(policy)])),
      runtimeProfiles: new Map(owner.runtimeProfiles.map((profile) => [profile.agentId, { ...profile }])),
      authAccounts: new Map(groupByAgentId(owner.authAccounts).map(([agentId, accounts]) => [agentId, accounts.map((account) => ({ ...account }))])),
      thirdPartyProviders: new Map(groupByAgentId(owner.thirdPartyProviders).map(([agentId, providers]) => [agentId, providers.map((provider) => ({ ...provider }))])),
      projectBindings: new Map(owner.projectBindings.map((binding) => [binding.projectId, cloneProjectBinding(binding)])),
      spawnPolicy: owner.spawnPolicy ? { ...owner.spawnPolicy } : null,
    });
  }

  const replaceSnapshot = (snapshot: PlatformControlPlaneServiceSnapshot) => {
    ownerStates.clear();

    for (const owner of snapshot.owners) {
      ownerStates.set(normalizeText(owner.ownerPrincipalId), {
        organizations: new Map(owner.organizations.map((organization) => [organization.organizationId, { ...organization }])),
        principals: new Map(owner.principals.map((principal) => [principal.principalId, { ...principal }])),
        agents: new Map(owner.agents.map((agent) => [agent.agentId, { ...agent }])),
        workspacePolicies: new Map(owner.workspacePolicies.map((policy) => [policy.agentId, cloneWorkspacePolicy(policy)])),
        runtimeProfiles: new Map(owner.runtimeProfiles.map((profile) => [profile.agentId, { ...profile }])),
        authAccounts: new Map(groupByAgentId(owner.authAccounts).map(([agentId, accounts]) => [agentId, accounts.map((account) => ({ ...account }))])),
        thirdPartyProviders: new Map(groupByAgentId(owner.thirdPartyProviders).map(([agentId, providers]) => [agentId, providers.map((provider) => ({ ...provider }))])),
        projectBindings: new Map(owner.projectBindings.map((binding) => [binding.projectId, cloneProjectBinding(binding)])),
        spawnPolicy: owner.spawnPolicy ? { ...owner.spawnPolicy } : null,
      });
    }
  };

  const ensureOwnerState = (ownerPrincipalId: string): OwnerControlPlaneState => {
    const normalizedOwnerPrincipalId = normalizeText(ownerPrincipalId);
    const existing = ownerStates.get(normalizedOwnerPrincipalId);

    if (existing) {
      return existing;
    }

    const state: OwnerControlPlaneState = {
      organizations: new Map(),
      principals: new Map(),
      agents: new Map(),
      workspacePolicies: new Map(),
      runtimeProfiles: new Map(),
      authAccounts: new Map(),
      thirdPartyProviders: new Map(),
      projectBindings: new Map(),
      spawnPolicy: null,
    };
    ownerStates.set(normalizedOwnerPrincipalId, state);
    return state;
  };

  const ensureOrganization = (
    ownerPrincipalId: string,
    state: OwnerControlPlaneState,
    organizationId?: string,
  ): ManagedAgentPlatformOrganizationRecord => {
    const normalizedOrganizationId = normalizeOptionalText(organizationId) ?? generateOrganizationId();
    const existing = state.organizations.get(normalizedOrganizationId);

    if (existing) {
      return existing;
    }

    const timestamp = now();
    const organization: ManagedAgentPlatformOrganizationRecord = {
      organizationId: normalizedOrganizationId,
      ownerPrincipalId: normalizeText(ownerPrincipalId),
      displayName: `Organization ${normalizedOrganizationId}`,
      slug: slugify(normalizedOrganizationId),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.organizations.set(normalizedOrganizationId, organization);
    return organization;
  };

  const getAgentContext = (
    ownerPrincipalId: string,
    agentId: string,
  ): {
    organization: ManagedAgentPlatformOrganizationRecord;
    principal: ManagedAgentPlatformPrincipalRecord;
    agent: ManagedAgentPlatformAgentRecord;
    workspacePolicy: ManagedAgentPlatformWorkspacePolicyRecord;
    runtimeProfile: ManagedAgentPlatformRuntimeProfileRecord;
    authAccounts: ManagedAgentPlatformAuthAccountRecord[];
    thirdPartyProviders: ManagedAgentPlatformThirdPartyProviderRecord[];
  } | null => {
    const state = ownerStates.get(normalizeText(ownerPrincipalId));

    if (!state) {
      return null;
    }

    const normalizedAgentId = normalizeText(agentId);
    const agent = state.agents.get(normalizedAgentId);

    if (!agent) {
      return null;
    }

    const organization = state.organizations.get(agent.organizationId);
    const principal = agent.principalId ? state.principals.get(agent.principalId) : null;
    const workspacePolicy = state.workspacePolicies.get(normalizedAgentId);
    const runtimeProfile = state.runtimeProfiles.get(normalizedAgentId);

    if (!organization || !principal || !workspacePolicy || !runtimeProfile) {
      return null;
    }

    return {
      organization,
      principal,
      agent,
      workspacePolicy,
      runtimeProfile,
      authAccounts: state.authAccounts.get(normalizedAgentId) ?? [],
      thirdPartyProviders: state.thirdPartyProviders.get(normalizedAgentId) ?? [],
    };
  };

  return {
    exportSnapshot() {
      return {
        owners: Array.from(ownerStates.entries()).map(([ownerPrincipalId, state]) => ({
          ownerPrincipalId,
          organizations: Array.from(state.organizations.values()).map((organization) => ({ ...organization })),
          principals: Array.from(state.principals.values()).map((principal) => ({ ...principal })),
          agents: Array.from(state.agents.values()).map((agent) => ({ ...agent })),
          workspacePolicies: Array.from(state.workspacePolicies.values()).map((policy) => cloneWorkspacePolicy(policy)),
          runtimeProfiles: Array.from(state.runtimeProfiles.values()).map((profile) => ({ ...profile })),
          authAccounts: Array.from(state.authAccounts.values()).flatMap((accounts) => accounts.map((account) => ({ ...account }))),
          thirdPartyProviders: Array.from(state.thirdPartyProviders.values()).flatMap((providers) => providers.map((provider) => ({ ...provider }))),
          projectBindings: Array.from(state.projectBindings.values()).map((binding) => cloneProjectBinding(binding)),
          spawnPolicy: state.spawnPolicy ? { ...state.spawnPolicy } : null,
        })),
      };
    },

    replaceSnapshot,

    listAgents(input) {
      const state = ensureOwnerState(input.ownerPrincipalId);
      return {
        organizations: Array.from(state.organizations.values()),
        agents: Array.from(state.agents.values()),
      };
    },

    getAgentDetail(input) {
      const context = getAgentContext(input.ownerPrincipalId, input.agentId);

      if (!context) {
        return null;
      }

      return {
        organization: context.organization,
        principal: context.principal,
        agent: context.agent,
        workspacePolicy: context.workspacePolicy,
        runtimeProfile: context.runtimeProfile,
        authAccounts: context.authAccounts,
        thirdPartyProviders: context.thirdPartyProviders,
      };
    },

    createAgent(input) {
      const state = ensureOwnerState(input.ownerPrincipalId);
      const organization = ensureOrganization(input.ownerPrincipalId, state, input.agent.organizationId);
      const timestamp = now();
      const principalId = generatePrincipalId();
      const agentId = generateAgentId();
      const principal: ManagedAgentPlatformPrincipalRecord = {
        principalId,
        organizationId: organization.organizationId,
        displayName: input.agent.displayName?.trim() || agentId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const agent: ManagedAgentPlatformAgentRecord = {
        agentId,
        organizationId: organization.organizationId,
        principalId,
        displayName: input.agent.displayName?.trim() || agentId,
        departmentRole: normalizeText(input.agent.departmentRole),
        mission: normalizeOptionalText(input.agent.mission),
        status: "active",
        supervisorAgentId: normalizeOptionalText(input.agent.supervisorAgentId),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const workspacePolicy: ManagedAgentPlatformWorkspacePolicyRecord = {
        agentId,
        canonicalWorkspacePath: null,
        additionalWorkspacePaths: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const runtimeProfile: ManagedAgentPlatformRuntimeProfileRecord = {
        agentId,
        provider: null,
        model: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      state.principals.set(principalId, principal);
      state.agents.set(agentId, agent);
      state.workspacePolicies.set(agentId, workspacePolicy);
      state.runtimeProfiles.set(agentId, runtimeProfile);
      state.authAccounts.set(agentId, []);
      state.thirdPartyProviders.set(agentId, []);

      return {
        organization,
        principal,
        agent,
      };
    },

    updateExecutionBoundary(input) {
      const context = getAgentContext(input.ownerPrincipalId, input.agentId);

      if (!context) {
        return null;
      }

      const timestamp = now();
      const workspacePolicy: ManagedAgentPlatformWorkspacePolicyRecord = {
        ...context.workspacePolicy,
        canonicalWorkspacePath: input.boundary.workspacePolicy?.canonicalWorkspacePath ?? context.workspacePolicy.canonicalWorkspacePath ?? null,
        additionalWorkspacePaths: input.boundary.workspacePolicy?.additionalWorkspacePaths
          ?? context.workspacePolicy.additionalWorkspacePaths
          ?? [],
        updatedAt: timestamp,
      };
      const runtimeProfile: ManagedAgentPlatformRuntimeProfileRecord = {
        ...context.runtimeProfile,
        provider: input.boundary.runtimeProfile?.provider ?? context.runtimeProfile.provider ?? null,
        model: input.boundary.runtimeProfile?.model ?? context.runtimeProfile.model ?? null,
        updatedAt: timestamp,
      };

      const state = ensureOwnerState(input.ownerPrincipalId);
      state.workspacePolicies.set(context.agent.agentId, workspacePolicy);
      state.runtimeProfiles.set(context.agent.agentId, runtimeProfile);

      return {
        agent: context.agent,
        workspacePolicy,
        runtimeProfile,
      };
    },

    updateSpawnPolicy(input) {
      const state = ensureOwnerState(input.ownerPrincipalId);
      const timestamp = now();
      const policy: ManagedAgentPlatformSpawnPolicyRecord = {
        ownerPrincipalId: normalizeText(input.ownerPrincipalId),
        enabled: Boolean(input.policy.enabled),
        maxAgentsPerRole: input.policy.maxAgentsPerRole ?? null,
        createdAt: state.spawnPolicy?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      state.spawnPolicy = policy;
      return { policy };
    },

    pauseAgent(input) {
      return updateLifecycleState(input.ownerPrincipalId, input.agentId, "paused", ensureOwnerState);
    },

    resumeAgent(input) {
      return updateLifecycleState(input.ownerPrincipalId, input.agentId, "active", ensureOwnerState);
    },

    archiveAgent(input) {
      return updateLifecycleState(input.ownerPrincipalId, input.agentId, "archived", ensureOwnerState);
    },

    listProjectWorkspaceBindings(input) {
      const state = ensureOwnerState(input.ownerPrincipalId);
      const bindings = Array.from(state.projectBindings.values()).filter((binding) => !input.organizationId
        || binding.organizationId === input.organizationId);
      return { bindings };
    },

    getProjectWorkspaceBinding(input) {
      const state = ensureOwnerState(input.ownerPrincipalId);
      const binding = state.projectBindings.get(normalizeText(input.projectId));
      return binding ? { binding } : null;
    },

    upsertProjectWorkspaceBinding(input) {
      const state = ensureOwnerState(input.ownerPrincipalId);
      const timestamp = now();
      ensureOrganization(input.ownerPrincipalId, state, input.binding.organizationId);

      const existing = state.projectBindings.get(normalizeText(input.binding.projectId));
      const binding: ManagedAgentPlatformProjectWorkspaceBindingRecord = {
        projectId: normalizeText(input.binding.projectId),
        organizationId: normalizeText(input.binding.organizationId),
        displayName: normalizeOptionalText(input.binding.displayName),
        canonicalWorkspacePath: input.binding.canonicalWorkspacePath ?? existing?.canonicalWorkspacePath ?? null,
        preferredNodeId: input.binding.preferredNodeId ?? existing?.preferredNodeId ?? null,
        lastActiveWorkspacePath: input.binding.lastActiveWorkspacePath ?? existing?.lastActiveWorkspacePath ?? null,
        continuityMode: input.binding.continuityMode,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      state.projectBindings.set(binding.projectId, binding);
      return { binding };
    },
  };
}

function updateLifecycleState(
  ownerPrincipalId: string,
  agentId: string,
  status: ManagedAgentPlatformAgentRecord["status"],
  ensureOwnerState: (ownerPrincipalId: string) => OwnerControlPlaneState,
): ManagedAgentPlatformAgentLifecycleResult | null {
  const state = ensureOwnerState(ownerPrincipalId);
  const normalizedAgentId = normalizeText(agentId);
  const existingAgent = state.agents.get(normalizedAgentId);

  if (!existingAgent) {
    return null;
  }

  const updatedAgent: ManagedAgentPlatformAgentRecord = {
    ...existingAgent,
    status,
    updatedAt: new Date().toISOString(),
  };
  state.agents.set(normalizedAgentId, updatedAgent);
  return {
    organization: state.organizations.get(updatedAgent.organizationId)!,
    agent: updatedAgent,
  };
}

function createIdFactory(prefix: string) {
  let counter = 0;

  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

function normalizeText(value: string) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error("Expected non-empty text.");
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function cloneWorkspacePolicy(
  policy: ManagedAgentPlatformWorkspacePolicyRecord,
): ManagedAgentPlatformWorkspacePolicyRecord {
  return {
    ...policy,
    additionalWorkspacePaths: Array.isArray(policy.additionalWorkspacePaths)
      ? [...policy.additionalWorkspacePaths]
      : [],
  };
}

function cloneProjectBinding(
  binding: ManagedAgentPlatformProjectWorkspaceBindingRecord,
): ManagedAgentPlatformProjectWorkspaceBindingRecord {
  return {
    ...binding,
  };
}

function groupByAgentId<T extends { agentId: string }>(records: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();

  for (const record of records) {
    const agentId = normalizeText(record.agentId);
    const existing = groups.get(agentId);

    if (existing) {
      existing.push(record);
      continue;
    }

    groups.set(agentId, [record]);
  }

  return Array.from(groups.entries());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "platform";
}
