import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformControlPlaneService } from "./platform-control-plane-service.js";

test("PlatformControlPlaneService 会提供 agents 与 projects 最小控制面闭环", () => {
  const service = createInMemoryPlatformControlPlaneService({
    now: () => "2026-04-14T14:10:00.000Z",
    generateOrganizationId: () => "org-platform",
    generatePrincipalId: () => "principal-agent-alpha",
    generateAgentId: () => "agent-alpha",
  });

  const created = service.createAgent({
    ownerPrincipalId: "principal-platform-owner",
    agent: {
      departmentRole: "Platform",
      displayName: "平台值班员",
      mission: "负责平台控制面最小治理。",
    },
  });
  assert.equal(created.organization.organizationId, "org-platform");
  assert.equal(created.agent.agentId, "agent-alpha");
  assert.equal(created.principal.principalId, "principal-agent-alpha");

  const listed = service.listAgents({
    ownerPrincipalId: "principal-platform-owner",
  });
  assert.equal(listed.organizations[0]?.organizationId, "org-platform");
  assert.equal(listed.agents[0]?.agentId, "agent-alpha");

  const detail = service.getAgentDetail({
    ownerPrincipalId: "principal-platform-owner",
    agentId: "agent-alpha",
  });
  assert.equal(detail?.agent.agentId, "agent-alpha");
  assert.equal(detail?.workspacePolicy.agentId, "agent-alpha");
  assert.equal(detail?.runtimeProfile.agentId, "agent-alpha");

  const boundary = service.updateExecutionBoundary({
    ownerPrincipalId: "principal-platform-owner",
    agentId: "agent-alpha",
    boundary: {
      workspacePolicy: {
        canonicalWorkspacePath: "/srv/platform-alpha",
        additionalWorkspacePaths: ["/srv/platform-shared"],
      },
      runtimeProfile: {
        provider: "openai",
        model: "gpt-5.4-mini",
      },
    },
  });
  assert.equal(boundary?.workspacePolicy.canonicalWorkspacePath, "/srv/platform-alpha");
  assert.deepEqual(boundary?.workspacePolicy.additionalWorkspacePaths, ["/srv/platform-shared"]);
  assert.equal(boundary?.runtimeProfile.provider, "openai");
  assert.equal(boundary?.runtimeProfile.model, "gpt-5.4-mini");

  const spawnPolicy = service.updateSpawnPolicy({
    ownerPrincipalId: "principal-platform-owner",
    policy: {
      enabled: true,
      maxAgentsPerRole: 2,
    },
  });
  assert.equal(spawnPolicy.policy.enabled, true);
  assert.equal(spawnPolicy.policy.maxAgentsPerRole, 2);

  assert.equal(service.pauseAgent({
    ownerPrincipalId: "principal-platform-owner",
    agentId: "agent-alpha",
  })?.agent.status, "paused");
  assert.equal(service.resumeAgent({
    ownerPrincipalId: "principal-platform-owner",
    agentId: "agent-alpha",
  })?.agent.status, "active");
  assert.equal(service.archiveAgent({
    ownerPrincipalId: "principal-platform-owner",
    agentId: "agent-alpha",
  })?.agent.status, "archived");

  const binding = service.upsertProjectWorkspaceBinding({
    ownerPrincipalId: "principal-platform-owner",
    binding: {
      projectId: "project-site-foo",
      organizationId: "org-platform",
      displayName: "官网 site-foo",
      canonicalWorkspacePath: "/srv/platform-alpha",
      preferredNodeId: "node-alpha",
      continuityMode: "sticky",
    },
  });
  assert.equal(binding.binding.projectId, "project-site-foo");
  assert.equal(binding.binding.preferredNodeId, "node-alpha");

  const bindings = service.listProjectWorkspaceBindings({
    ownerPrincipalId: "principal-platform-owner",
  });
  assert.equal(bindings.bindings?.[0]?.projectId, "project-site-foo");

  const bindingDetail = service.getProjectWorkspaceBinding({
    ownerPrincipalId: "principal-platform-owner",
    projectId: "project-site-foo",
  });
  assert.equal(bindingDetail?.binding?.displayName, "官网 site-foo");
});
