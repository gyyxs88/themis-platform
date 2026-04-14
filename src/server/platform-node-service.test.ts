import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryPlatformNodeService } from "./platform-node-service.js";

test("createInMemoryPlatformNodeService 会支持 register、heartbeat、list 与 detail", () => {
  const service = createInMemoryPlatformNodeService({
    now: () => "2026-04-14T09:00:00.000Z",
    generateNodeId: () => "node-fixed",
  });

  const registered = service.registerNode({
    ownerPrincipalId: "principal-platform-owner",
    node: {
      displayName: "Worker A",
      slotCapacity: 4,
      slotAvailable: 3,
      labels: ["linux", "linux", "build"],
      workspaceCapabilities: ["/srv/workspace", "/srv/workspace"],
      credentialCapabilities: ["default"],
      providerCapabilities: ["gateway-a"],
      heartbeatTtlSeconds: 45,
    },
  });

  assert.equal(registered.organization.ownerPrincipalId, "principal-platform-owner");
  assert.equal(registered.node.nodeId, "node-fixed");
  assert.equal(registered.node.status, "online");
  assert.deepEqual(registered.node.labels, ["linux", "build"]);

  const listed = service.listNodes({
    ownerPrincipalId: "principal-platform-owner",
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.nodeId, "node-fixed");

  const heartbeat = service.heartbeatNode({
    ownerPrincipalId: "principal-platform-owner",
    node: {
      nodeId: "node-fixed",
      status: "draining",
      slotAvailable: 1,
      labels: ["linux", "gpu"],
      credentialCapabilities: ["default", "backup"],
      providerCapabilities: ["gateway-a", "gateway-b"],
      heartbeatTtlSeconds: 90,
    },
  });

  assert.equal(heartbeat?.node.status, "draining");
  assert.equal(heartbeat?.node.slotAvailable, 1);
  assert.deepEqual(heartbeat?.node.labels, ["linux", "gpu"]);
  assert.deepEqual(heartbeat?.node.credentialCapabilities, ["default", "backup"]);
  assert.deepEqual(heartbeat?.node.providerCapabilities, ["gateway-a", "gateway-b"]);
  assert.equal(heartbeat?.node.heartbeatTtlSeconds, 90);

  const detail = service.getNodeDetail({
    ownerPrincipalId: "principal-platform-owner",
    nodeId: "node-fixed",
  });
  assert.equal(detail?.organization.ownerPrincipalId, "principal-platform-owner");
  assert.equal(detail?.node.nodeId, "node-fixed");
  assert.deepEqual(detail?.leaseSummary, {
    activeLeaseCount: 0,
    activeRunCount: 0,
  });
  assert.deepEqual(detail?.leases, []);

  const denied = service.getNodeDetail({
    ownerPrincipalId: "principal-other-owner",
    nodeId: "node-fixed",
  });
  assert.equal(denied, null);
});
