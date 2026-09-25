import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCoordinatorBatonExperiment, buildFrozenRoutingSuite, evaluateFrozenRoutingBenchmark, routeCapabilityTask, type RoutingObservation} from './capability-routing-benchmark.js';

test('frozen routing corpus contains sixty representative tasks and a twelve-task holdout', () => {
  const suite=buildFrozenRoutingSuite();
  assert.equal(suite.tasks.length,60);
  assert.equal(suite.tasks.filter(task=>task.split==='holdout').length,12);
  assert.equal(new Set(suite.tasks.map(task=>task.category)).size,12);
  assert.deepEqual([...new Set(suite.tasks.map(task=>task.expectedClass))].sort(),['FRONTIER','LOCAL','SPARK','STANDARD']);
});

test('classifier has no unsafe false-positive route on development or holdout', () => {
  const report=evaluateFrozenRoutingBenchmark({generatedAt:'2026-09-01T23:00:00.000Z'});
  assert.equal(report.classificationMetrics.overall.accuracy,1);
  assert.equal(report.classificationMetrics.holdout.accuracy,1);
  assert.equal(report.classificationMetrics.unsafeFalsePositiveRoutes,0);
  assert.equal(report.suiteSha256,'fb1460cbea46ca3af70049a8be26a369519c3a14ae0959f362b5895146d0fe15');
  assert.equal(report.gates.classifierPassed,true);
});

test('route hierarchy escalates conservatively when a lower execution class is unavailable', () => {
  const suite=buildFrozenRoutingSuite(), task=(category:string)=>suite.tasks.find(value=>value.category===category)!;
  assert.equal(routeCapabilityTask(task('documentation'),{local:false,spark:true,standard:true,frontier:true}),'SPARK');
  assert.equal(routeCapabilityTask(task('one-file-edit'),{local:false,spark:false,standard:true,frontier:true}),'STANDARD');
  assert.equal(routeCapabilityTask(task('ambiguity'),{local:true,spark:true,standard:false,frontier:true}),'FRONTIER');
  assert.throws(()=>routeCapabilityTask(task('architecture'),{local:true,spark:true,standard:true,frontier:false}),/no_qualified_frontier_route/);
});

test('offline benchmark preserves unknown physical metrics and keeps automatic production routing disabled', () => {
  const report=evaluateFrozenRoutingBenchmark({generatedAt:'2026-09-01T23:00:00.000Z'});
  assert.equal(report.physicalMetrics.attempts,0);
  assert.equal(report.physicalMetrics.verifiedSuccessRate,null);
  assert.equal(report.physicalMetrics.reportedInputTokens,null);
  assert.equal(report.physicalMetrics.monetaryCost,null);
  assert.equal(report.physicalMetrics.incorrectChanges,null);
  assert.equal(report.gates.physicalPassed,false);
  assert.equal(report.recommendation,'KEEP_AUTOMATIC_PRODUCTION_ROUTING_DISABLED');
});

test('physical observations retain exact provider/model evidence and require the predeclared sample', () => {
  const suite=buildFrozenRoutingSuite();
  const rows:RoutingObservation[]=suite.tasks.slice(0,50).map(task=>({taskId:task.id,strategy:'coordinator-delegation',selectedClass:task.expectedClass,providerId:`provider:${task.expectedClass.toLowerCase()}`,modelId:`model:${task.expectedClass.toLowerCase()}`,verified:true,latencyMs:100,attempts:1,escalations:0,parentContextBytes:500,batonBytes:200,additionalContextRequests:0,inputTokens:null,outputTokens:null,monetaryCost:null,incorrectChanges:0,unnecessaryFilesTouched:0,evidence:[`verified:${task.id}`]}));
  const report=evaluateFrozenRoutingBenchmark({suite,observations:rows,generatedAt:'2026-09-01T23:00:00.000Z'});
  assert.equal(report.physicalMetrics.attempts,50);
  assert.equal(report.physicalMetrics.holdoutAttempts,10);
  assert.equal(report.physicalMetrics.verifiedSuccessRate,1);
  assert.equal(report.physicalMetrics.monetaryCost,null);
  assert.equal(report.gates.physicalPassed,true);
});

test('coordinator experiment compiles twelve bounded sealed child batons with separate accounting', () => {
  const experiment=buildCoordinatorBatonExperiment();
  assert.equal(experiment.strategyA.contractCount,1);
  assert.equal(experiment.strategyB.childContractCount,12);
  assert.ok(experiment.strategyB.totalBatonBytes>0);
  assert.equal(experiment.strategyB.children.every(child=>child.batonSha256.length===64),true);
  assert.equal(experiment.strategyB.children.every(child=>child.additionalContextRequests===null&&child.verification===null),true);
});
