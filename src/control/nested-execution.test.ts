import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyManagedNodeProbeFailure, discoverContainerRuntimes, projectNestedResourceAccounting, resolveNestedExecutionRoute, validateContainment, type ExecutionEnvironmentRecord} from './nested-execution.js';

const at = '2026-09-14T12:00:00.000Z';
test('nested capacity views do not double-count physical resources', () => {
  const projection = projectNestedResourceAccounting([
    {subjectId:'phone',physicalDeviceId:'phone',metric:'MEMORY_BYTES',scope:'PHYSICAL_CAPACITY',value:12_000,observedAt:at,source:'host',authority:'MEASURED'},
    {subjectId:'guest',physicalDeviceId:'phone',metric:'MEMORY_BYTES',scope:'GUEST_VISIBLE_CAPACITY',value:6_000,observedAt:at,source:'guest',authority:'REPORTED'},
    {subjectId:'container',physicalDeviceId:'phone',metric:'MEMORY_BYTES',scope:'RUNTIME_LIMIT',value:4_000,observedAt:at,source:'runtime',authority:'CONFIGURED'},
  ]);
  assert.equal(projection.physicalTotals.MEMORY_BYTES, 12_000);
  assert.equal(projection.excludedFromEstateTotals.length, 2);
  assert.equal(projectNestedResourceAccounting([{subjectId:'guest',physicalDeviceId:'unknown',metric:'CPU_LOGICAL',scope:'GUEST_VISIBLE_CAPACITY',value:4,observedAt:at,source:'guest',authority:'REPORTED'}]).physicalTotals.CPU_LOGICAL, null);
  const conflict = projectNestedResourceAccounting([
    {subjectId:'host-a',physicalDeviceId:'device',metric:'MEMORY_BYTES',scope:'PHYSICAL_CAPACITY',value:12_000,observedAt:at,source:'a',authority:'MEASURED'},
    {subjectId:'host-b',physicalDeviceId:'device',metric:'MEMORY_BYTES',scope:'PHYSICAL_CAPACITY',value:10_000,observedAt:at,source:'b',authority:'REPORTED'},
  ]);
  assert.equal(conflict.physicalTotals.MEMORY_BYTES,null); assert.deepEqual(conflict.conflicts,['device:MEMORY_BYTES']);
});

test('container discovery records executable presence without claiming runtime readiness', () => {
  const found = discoverContainerRuntimes('guest-a', ['sh','podman','docker','podman'], at);
  assert.deepEqual(found.map(item => [item.kind,item.state,item.containers.length]), [['PODMAN','DETECTED_ONLY',0],['DOCKER','DETECTED_ONLY',0]]);
});

test('capability routing remains device runtime and transport neutral', () => {
  const environments: ExecutionEnvironmentRecord[] = [
    {id:'linux-a',kind:'GUEST_OS',physicalDeviceId:'device-a',transport:'ssh',capabilities:['container.execute'],availability:'AVAILABLE',observedAt:at,evidence:['fixture:a']},
    {id:'linux-b',kind:'GUEST_OS',physicalDeviceId:'device-b',transport:'local',capabilities:['container.execute'],availability:'AVAILABLE',observedAt:at,evidence:['fixture:b']},
  ];
  const runtimes = [
    {...discoverContainerRuntimes('linux-a',['podman'],at)[0],state:'AVAILABLE' as const},
    {...discoverContainerRuntimes('linux-b',['docker'],at)[0],state:'AVAILABLE' as const},
  ];
  const workers = [
    {id:'worker-a',environmentId:'linux-a',capabilities:['container.execute'],health:'healthy' as const,transport:'ssh'},
    {id:'worker-b',environmentId:'linux-b',capabilities:['container.execute'],health:'healthy' as const,transport:'local'},
  ];
  assert.equal(resolveNestedExecutionRoute({requiredCapabilities:['container.execute'],physicalDeviceId:'device-a'},environments,runtimes,workers).selected?.runtimeId, runtimes[0].id);
  assert.equal(resolveNestedExecutionRoute({requiredCapabilities:['container.execute'],physicalDeviceId:'device-b'},environments,runtimes,workers).selected?.runtimeId, runtimes[1].id);
});

test('containment requires an evidence-backed same-node acyclic chain to a machine', () => {
  const items = [
    {id:'machine',nodeId:'physical',kind:'MACHINE'},
    {id:'guest',nodeId:'physical',kind:'RUNTIME',containment:{parentId:'machine',relation:'HOSTS' as const,observedAt:at,authority:'AUTHORITATIVE' as const,method:'execution-environment-containment' as const}},
    {id:'runtime',nodeId:'physical',kind:'RUNTIME',containment:{parentId:'guest',relation:'CONTAINS' as const,observedAt:at,authority:'CONFIGURED' as const,method:'execution-environment-containment' as const}},
  ];
  assert.equal(validateContainment(items,'runtime'),'guest');
  assert.equal(validateContainment([...items,{id:'foreign',nodeId:'other',kind:'RUNTIME',containment:{parentId:'guest',relation:'CONTAINS' as const,observedAt:at,authority:'AUTHORITATIVE' as const,method:'execution-environment-containment' as const}}],'foreign'),undefined);
  assert.equal(validateContainment([...items,{id:'stale',nodeId:'physical',kind:'RUNTIME',containment:{parentId:'guest',relation:'CONTAINS' as const,observedAt:'invalid',authority:'AUTHORITATIVE' as const,method:'execution-environment-containment' as const}}],'stale'),undefined);
});

test('probe failure classification redacts credential material before projection', () => {
  const secret='sk-example-release-secret-1234567890';
  const failure=classifyManagedNodeProbeFailure(new Error(`Permission denied for token ${secret}`));
  assert.equal(failure.classification,'AUTHENTICATION');
  assert.doesNotMatch(failure.detail,new RegExp(secret));
  assert.match(failure.detail,/REDACTED/);
});
