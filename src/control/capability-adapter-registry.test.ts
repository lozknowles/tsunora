import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CapabilityAdapterRegistry,
  RegisteredCapabilityDiscoveryAdapter,
  capabilityDefinition,
  type CapabilityAdapterRecord,
} from "./capability-adapter-registry.js";
import { emptyConfig } from "./config.js";
import type {
  DiscoveryAdapterContext,
  DiscoveryProbe,
} from "./environment-discovery.js";
const probe: DiscoveryProbe = {
  command: async () => ({
    ok: true,
    stdout: "custom-agent 1.2.3\n",
    stderr: "",
  }),
  json: async () => ({ ok: true, status: 200, body: {} }),
};
test("user executable follows review validate isolated test approve enable lifecycle", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capability-adapter-"));
  try {
    const registry = new CapabilityAdapterRegistry(
      path.join(root, "registry.json"),
      () => "2026-09-12T12:00:00Z",
    );
    let record: CapabilityAdapterRecord = registry.add(
      capabilityDefinition({
        id: "custom-agent",
        label: "Custom Agent",
        type: "CLI_AGENT",
        detection: "EXECUTABLE",
      }),
      {
        nodeId: "controller",
        executable: path.join(root, "custom-agent"),
        owner: "operator",
      },
    );
    for (const state of ["REVIEWED", "VALIDATED"] as const)
      record = registry.transition(record.id, record.sha256, state);
    record = await registry.test(record.id, record.sha256, probe);
    assert.equal(record.lastResult?.version, "custom-agent 1.2.3");
    record = registry.transition(record.id, record.sha256, "APPROVED");
    record = registry.transition(record.id, record.sha256, "ENABLED");
    assert.equal(record.state, "ENABLED");
    assert.equal(registry.exportDefinition(record.id).id, "custom-agent");
    assert.doesNotMatch(
      JSON.stringify(registry.exportDefinition(record.id)),
      new RegExp(root),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("untrusted imported definitions cannot carry execution contracts or arbitrary qualification commands", () => {
  const registry = new CapabilityAdapterRegistry();
  const definition = capabilityDefinition({
    id: "community",
    label: "Community",
    type: "TOOL_SERVER",
    source: "COMMUNITY_UNTRUSTED",
    detection: "ENDPOINT",
  });
  assert.throws(
    () =>
      registry.add(
        { ...definition, executionContract: "shell:anything" },
        {
          nodeId: "controller",
          endpoint: "http://127.0.0.1:9999",
          owner: "operator",
        },
      ),
    /untrusted_capability/,
  );
});
test("portable import strips execution contracts and keeps machine binding out of export", () => {
  const registry = new CapabilityAdapterRegistry(),
    definition = {
      ...capabilityDefinition({
        id: "portable",
        label: "Portable runtime",
        type: "MODEL_RUNTIME",
        detection: "ENDPOINT",
      }),
      source: "USER" as const,
      executionContract: "provider-specific-contract",
      qualificationTests: ["paid-call"],
    },
    record = registry.importDefinition(definition, {
      nodeId: "edge-a",
      endpoint: "http://127.0.0.1:11434",
      owner: "operator",
    }),
    exported = registry.exportDefinition(record.id);
  assert.equal(record.trust, "UNTRUSTED");
  assert.equal(record.definition.executionContract, null);
  assert.deepEqual(record.definition.qualificationTests, []);
  assert.doesNotMatch(JSON.stringify(exported), /edge-a|11434/);
});
test("adapter emits only enabled tested definitions and does not expose machine path", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capability-adapter-"));
  try {
    const registry = new CapabilityAdapterRegistry();
    let record: CapabilityAdapterRecord = registry.add(
      capabilityDefinition({
        id: "runtime",
        label: "Runtime",
        type: "MODEL_RUNTIME",
        detection: "EXECUTABLE",
      }),
      {
        nodeId: "controller",
        executable: path.join(root, "runtime"),
        owner: "operator",
      },
    );
    const adapter = new RegisteredCapabilityDiscoveryAdapter(registry),
      context: DiscoveryAdapterContext = {
        mode: "QUICK_RESCAN",
        testing: "QUICK_TEST",
        includeRemote: false,
        includeMemory: false,
        observedAt: "2026-09-12T12:00:00Z",
        config: emptyConfig(),
        environment: {},
        managedNodes: [],
        edgeNodes: [],
        probe,
        runtimeInventory: {
          jobs: [],
          agents: [],
          tools: [],
          skills: [],
          mcpServers: [],
          plugins: [],
        },
      };
    assert.equal((await adapter.discover(context)).length, 0);
    record = registry.transition(record.id, record.sha256, "REVIEWED");
    record = registry.transition(record.id, record.sha256, "VALIDATED");
    record = await registry.test(record.id, record.sha256, probe);
    record = registry.transition(record.id, record.sha256, "APPROVED");
    registry.transition(record.id, record.sha256, "ENABLED");
    const found = await adapter.discover(context);
    assert.equal(found.length, 1);
    assert.equal(JSON.stringify(found).includes(root), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
