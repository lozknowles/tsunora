import assert from "node:assert/strict";
import test from "node:test";
import { projectEstateMap } from "./estate-map.js";
import type { DiscoveryItem, DiscoveryScan } from "./environment-discovery.js";

const at = "2026-09-12T12:00:00.000Z";
function item(
  input: Partial<DiscoveryItem> & Pick<DiscoveryItem, "id" | "kind" | "label">,
): DiscoveryItem {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    nodeId: input.nodeId ?? "controller",
    health: input.health ?? "HEALTHY",
    lifecycle: input.lifecycle ?? "QUALIFIED",
    resourceClasses: input.resourceClasses ?? [],
    operationalState: input.operationalState ?? "QUALIFIED",
    change: input.change ?? "NEW",
    fingerprint: input.fingerprint ?? input.id.padEnd(64, "0").slice(0, 64),
    attributes: input.attributes ?? {},
    provenance: input.provenance ?? [
      {
        adapter: "fixture",
        method: "bounded-probe",
        observedAt: at,
        authority: "AUTHORITATIVE",
      },
    ],
    ...(input.configuredId ? { configuredId: input.configuredId } : {}),
    ...(input.relatedIds ? { relatedIds: input.relatedIds } : {}),
    ...(input.containment ? { containment: input.containment } : {}),
  };
}
function scan(items: DiscoveryItem[]): DiscoveryScan {
  return {
    schema: "agent-control.environment-discovery/v1",
    id: "scan-1",
    mode: "FULL_DISCOVERY",
    testing: "QUICK_TEST",
    startedAt: at,
    completedAt: at,
    includeRemote: true,
    includeMemory: false,
    status: "COMPLETED",
    items,
    failures: [],
    summary: {
      machines: 1,
      gpus: 0,
      localModels: 1,
      providers: 0,
      agents: 0,
      tools: 0,
      memorySources: 0,
      healthy: items.length,
      needsQualification: 0,
      unavailable: 0,
      new: items.length,
    },
    recommendations: [],
  };
}

test("estate graph reuses runtime graph schema and creates only evidenced hierarchy", () => {
  const machine = item({
      id: "machine:controller",
      kind: "MACHINE",
      label: "Controller",
      nodeId: "controller",
      configuredId: "controller",
      attributes: {
        platform: "linux",
        transport: "ssh",
        address: "100.64.0.2",
        port: 2222,
        username: "loz",
        authenticationMethod: "ssh-identity-reference",
        credentialStatus: "CONFIGURED",
      },
    }),
    runtime = item({
      id: "runtime:controller:llama",
      kind: "RUNTIME",
      label: "llama.cpp",
      configuredId: "llama.cpp",
      nodeId: "controller",
    }),
    model = item({
      id: "model:controller:qwen",
      kind: "MODEL",
      label: "Qwen",
      nodeId: "controller",
      attributes: { runtime: "llama.cpp" },
    }),
    projection = projectEstateMap(
      scan([machine, runtime, model]),
      "2026-09-12T12:01:00.000Z",
    );
  assert.equal(projection.mapKind, "ESTATE");
  assert.equal(
    projection.authority,
    "Agent Control governed discovery inventory",
  );
  assert.ok(projection.nodes.some((node) => node.type === "transport"));
  assert.ok(
    projection.edges.some(
      (edge) => edge.from === runtime.id && edge.to === model.id,
    ),
  );
  const transport = projection.nodes.find((node) => node.type === "transport")!;
  assert.equal(transport.detail.port, 2222);
  assert.equal(transport.detail.authentication, "••••••••••••");
  assert.doesNotMatch(
    JSON.stringify(projection),
    /identityFile|PRIVATE KEY|Bearer /i,
  );
});

test("discovered is not alive after resource-specific evidence expires", () => {
  const machine = item({
      id: "machine:controller",
      kind: "MACHINE",
      label: "Controller",
      configuredId: "controller",
    }),
    projection = projectEstateMap(scan([machine]), "2026-09-12T12:03:00.001Z"),
    node = projection.nodes.find((value) => value.id === machine.id)!;
  assert.equal(node.detail.availability, "NOT_CURRENTLY_VERIFIED");
  assert.equal(node.state, "WAITING");
  assert.equal(projection.freshness.state, "STALE");
});

test("active capability lifecycle is not presented as active runtime work", () => {
  const job = item({
      id: "job:observation",
      kind: "JOB",
      label: "Observation",
      lifecycle: "ACTIVE",
      operationalState: "ACTIVE",
      attributes: { source: "job-catalog" },
    }),
    tool = item({
      id: "tool:observation",
      kind: "TOOL",
      label: "Observation tool",
      lifecycle: "ACTIVE",
      operationalState: "ACTIVE",
      attributes: { source: "action-registry" },
    }),
    runtime = item({
      id: "runtime:local",
      kind: "RUNTIME",
      label: "Local runtime",
      lifecycle: "ACTIVE",
      operationalState: "ACTIVE",
      attributes: { running: true },
    }),
    projection = projectEstateMap(
      scan([item({id:"machine:controller",kind:"MACHINE",label:"Controller"}), job, tool, runtime]),
      "2026-09-12T12:00:30.000Z",
    );
  assert.equal(
    projection.nodes.find((node) => node.id === job.id)?.state,
    "SUCCEEDED",
  );
  assert.equal(
    projection.nodes.find((node) => node.id === tool.id)?.state,
    "SUCCEEDED",
  );
  assert.equal(
    projection.nodes.find((node) => node.id === runtime.id)?.state,
    "RUNNING",
  );
  assert.equal(projection.summary.running, 1);
});

test("unknown relationships are never inferred from similar labels", () => {
  const machine = item({
      id: "machine:a",
      kind: "MACHINE",
      label: "A",
      nodeId: "a",
    }),
    runtime = item({
      id: "runtime:b:ollama",
      kind: "RUNTIME",
      label: "Ollama",
      nodeId: "b",
    }),
    model = item({
      id: "model:a:ollama-like",
      kind: "MODEL",
      label: "Ollama Model",
      nodeId: "a",
      attributes: { runtime: "not-ollama" },
    }),
    projection = projectEstateMap(
      scan([machine, runtime, model]),
      "2026-09-12T12:00:30.000Z",
    );
  assert.equal(
    projection.edges.some(
      (edge) => edge.from === runtime.id && edge.to === model.id,
    ),
    false,
  );
});

test("estate projection remains bounded for fifty-plus resources", () => {
  const items = [
      item({
        id: "machine:controller",
        kind: "MACHINE",
        label: "Controller",
        nodeId: "controller",
      }),
      ...Array.from({ length: 60 }, (_, index) =>
        item({
          id: `model:controller:m${index}`,
          kind: "MODEL",
          label: `Model ${index}`,
          nodeId: "controller",
        }),
      ),
    ],
    started = performance.now(),
    projection = projectEstateMap(scan(items), "2026-09-12T12:00:30.000Z");
  assert.equal(projection.nodes.length, 63);
  assert.equal(projection.summary.nodes, 61);
  assert.ok(performance.now() - started < 250);
  assert.equal(projection.summary.groups, 1);
  const group = projection.nodes.find(
      (node) => node.detail.projectionGroup === true,
    ),
    groupedModels = projection.nodes.filter(
      (node) => node.type === "model" && node.parentId === group?.id,
    );
  assert.equal(group?.label, "Models · 60");
  assert.equal(group?.detail.resourceCount, 60);
  assert.equal(group?.detail.authority, "Derived only from this discovery scan");
  assert.equal(groupedModels.length, 60);
  assert.ok(
    projection.edges.some(
      (edge) => edge.from === "machine:controller" && edge.to === group?.id,
    ),
  );
});


test('observed execution environments nest without creating extra physical machines', () => {
  const host=item({id:'physical',kind:'MACHINE',label:'Physical device',nodeId:'device'});
  const child=(id:string,parent:string,kind:DiscoveryItem['kind']='RUNTIME')=>item({id,kind,label:id,nodeId:'device',attributes:{executionParentId:parent},provenance:[{adapter:'generic-execution-observer',method:'execution-environment-containment',authority:'AUTHORITATIVE',observedAt:at}]});
  const vm=child('guest','physical'),worker=child('worker','guest','AGENT'),container=child('container','guest');
  const projected=projectEstateMap(scan([host,vm,worker,container]),at);
  assert.equal(projected.nodes.find(n=>n.id==='guest')?.parentId,'physical');
  assert.equal(projected.nodes.find(n=>n.id==='worker')?.parentId,'guest');
  assert.equal(projected.nodes.find(n=>n.id==='container')?.parentId,'guest');
  assert.equal(projected.nodes.filter(n=>n.type==='machine'||n.type==='device').length,1);
  for(const invalid of [child('guest','missing'),{...vm,provenance:[]},child('guest','guest'),{...vm,nodeId:'other'}]) {
    const graph=projectEstateMap(scan([host,invalid]),at);
    assert.equal(graph.nodes.find(n=>n.id==='guest')?.parentId,invalid.nodeId==='device'?'physical':'estate:agent-control');
  }
  const cycle=projectEstateMap(scan([host,child('guest','worker'),child('worker','guest','AGENT')]),at);
  assert.equal(cycle.nodes.find(n=>n.id==='guest')?.parentId,'physical');
});

test('estate projection accepts the typed containment contract', () => {
  const host=item({id:'machine:device',kind:'MACHINE',label:'Device',nodeId:'device'});
  const guest=item({id:'runtime:guest',kind:'RUNTIME',label:'Guest',nodeId:'device',attributes:{executionEnvironmentKind:'GUEST_OS'},containment:{parentId:host.id,relation:'HOSTS',observedAt:at,authority:'AUTHORITATIVE',method:'execution-environment-containment'}});
  const runtime=item({id:'runtime:containers',kind:'RUNTIME',label:'Containers',nodeId:'device',attributes:{executionEnvironmentKind:'RUNTIME'},containment:{parentId:guest.id,relation:'CONTAINS',observedAt:at,authority:'CONFIGURED',method:'execution-environment-containment'}});
  const projection=projectEstateMap(scan([host,guest,runtime]),at);
  assert.equal(projection.nodes.find(node=>node.id===guest.id)?.parentId,host.id);
  assert.equal(projection.nodes.find(node=>node.id===runtime.id)?.parentId,guest.id);
  assert.equal(projection.nodes.find(node=>node.id===host.id)?.detail.nestedEnvironmentCount,2);
  assert.equal(projection.nodes.find(node=>node.id===guest.id)?.detail.executionEnvironmentKind,'GUEST_OS');
  assert.equal((projection.nodes.find(node=>node.id===guest.id)?.detail.executionContainment as {parentId:string}).parentId,host.id);
});
