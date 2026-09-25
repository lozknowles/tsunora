import assert from 'node:assert/strict';
import test from 'node:test';
import {cacheAwareExpertQualificationPlanner} from './cache-aware-expert-qualification.js';

const hash=(character:string)=>character.repeat(64);
const environment={AGENT_CONTROL_ENABLE_CACHE_EXPERT_QUALIFICATION:'true',AGENT_CONTROL_CACHE_EXPERT_WARM_MODEL:'warm',AGENT_CONTROL_CACHE_EXPERT_COLD_MODEL:'cold',AGENT_CONTROL_CACHE_EXPERT_MODEL_ROLE:'cache.follow-on',AGENT_CONTROL_CACHE_EXPERT_WARM_BACKEND_INSTANCE:'warm-pid-1',AGENT_CONTROL_CACHE_EXPERT_COLD_BACKEND_INSTANCE:'cold-pid-1',AGENT_CONTROL_CACHE_EXPERT_REPOSITORY_REF:'agent-control@test',AGENT_CONTROL_CACHE_EXPERT_REPOSITORY_SHA256:hash('a'),AGENT_CONTROL_CACHE_EXPERT_BRANCH_SHA256:hash('b'),AGENT_CONTROL_CACHE_EXPERT_TRANSPORT_SHA256:hash('c'),AGENT_CONTROL_CACHE_EXPERT_INSTRUCTION_SHA256:hash('d'),AGENT_CONTROL_CACHE_EXPERT_TOOL_SHA256:hash('e'),AGENT_CONTROL_CACHE_EXPERT_GOVERNANCE_SHA256:hash('f'),AGENT_CONTROL_CACHE_EXPERT_STABLE_DEPENDENCY_SHA256:hash('1'),AGENT_CONTROL_CACHE_EXPERT_CHANGED_DEPENDENCY_SHA256:hash('2')};

test('qualification planner is absent unless explicitly enabled',()=>assert.equal(cacheAwareExpertQualificationPlanner({}),undefined));
test('qualification planner emits normal A-E and restart Work Parcel route contracts',async()=>{
  const planner=cacheAwareExpertQualificationPlanner(environment)!;
  const main=await planner.plan('Run Agent Control 4.3 Cache-Aware Expert Delegation qualification');
  assert.deepEqual(main.stages.map(stage=>stage.id),['a-cold-population','b-compatible-follow-on','d-incompatible-control','e-context-invalidation']);
  assert.equal(main.stages[0].requestedRoute?.model,'warm');assert.equal(main.stages[1].requestedRoute?.modelRole,'cache.follow-on');assert.equal(main.stages[1].requestedRoute?.cacheScopeByModel?.warm.backendInstanceId,'warm-pid-1');assert.notEqual(main.stages[1].requestedRoute?.cacheContext?.dependencyContextSha256,main.stages[2].requestedRoute?.cacheContext?.dependencyContextSha256);
  const restart=await planner.plan('Run Agent Control 4.3 backend restart control');assert.equal(restart.stages[0].id,'f-backend-restart');assert.equal(restart.stages[0].requestedRoute?.cacheScopeByModel?.cold.backendInstanceId,'cold-pid-1');
});
