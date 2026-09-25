import test from 'node:test';
import assert from 'node:assert/strict';
import {labourEconomics} from './labour-economics.js';
test('payroll attributes prior failure only to the worker that incurred it, without double counting',()=>{
 const workers=['a','b'].map(id=>({id,organisationId:'org',backendId:'native',modelConfiguration:{},rateCard:{metering:'cpu-ms'}})) as any;
 const attempts=[{id:'a1',workerId:'a',workOrderId:'o',organisationId:'org',calibration:false,outcome:'FAILED',rawExecutionCost:10,verificationCost:2,escalationCost:0,totalCost:12,latencyMs:5,execution:{resources:{cpuMs:10},tokens:null}},{id:'b1',workerId:'b',workOrderId:'o',organisationId:'org',calibration:false,outcome:'SUCCEEDED',rawExecutionCost:20,verificationCost:2,escalationCost:0,totalCost:22,latencyMs:8,execution:{resources:{cpuMs:20},tokens:null}}] as any;
 const outcomes=[{workOrderId:'o',organisationId:'org',state:'COMPLETED',attempts:['a1','b1'],retryCost:12}] as any;
 const p=labourEconomics(workers,[],attempts,outcomes,[]);
 assert.equal(p.payroll[0].retryAttributableCharges,12);assert.equal(p.payroll[1].retryAttributableCharges,0);
 assert.equal(p.payroll[1].retries,1);assert.equal(p.totalsByOrganisation[0].totalInternalCharges,34);
 assert.equal(p.totalsByOrganisation[0].externalMoney,null);assert.equal(p.totalsByOrganisation[0].energyJoules,null);
});
test('unmatched or blocked strategy outcomes never display a saving',()=>{
 const orders=['fixed','cheapest','broker'].map(strategy=>({id:strategy,organisationId:'org',comparison:{benchmarkHash:'a'.repeat(64),caseId:'one',strategy}})) as any;
 const outcomes=orders.map((o:any)=>({workOrderId:o.id,organisationId:'org',state:'BLOCKED',attempts:[],retryCost:0}));
 const p=labourEconomics([],orders,[],outcomes as any,[]);
 assert.equal(p.comparisons[0].classification,'INCONCLUSIVE_INCOMPLETE_OR_UNMATCHED');assert.deepEqual(p.comparisons[0].resourceDifferences,[]);assert.equal(p.comparisons[0].monetarySavings,null);
});
test('matching case labels cannot hide different inputs or verifier contracts',()=>{
 const orders=['fixed','cheapest','broker'].map(strategy=>({id:strategy,organisationId:'org',jobType:'bounded',input:{value:1},verification:{id:'exact',revision:'1'},comparison:{benchmarkHash:'b'.repeat(64),caseId:'one',strategy}})) as any;
 const attempts=orders.map((o:any)=>({id:o.id,workOrderId:o.id,workerId:'a',organisationId:'org',calibration:false,outcome:'SUCCEEDED',rawExecutionCost:10,verificationCost:1,escalationCost:0,totalCost:11,latencyMs:5,execution:{resources:{cpuMs:10},tokens:null}}));
 const outcomes=orders.map((o:any)=>({workOrderId:o.id,organisationId:'org',state:'COMPLETED',attempts:[o.id],retryCost:0}));
 assert.equal(labourEconomics([],orders,attempts as any,outcomes as any,[]).comparisons[0].classification,'MEASURED_RESOURCE_COMPARISON');
 orders[2].input={value:2};const p=labourEconomics([],orders,attempts as any,outcomes as any,[]);
 assert.equal(p.comparisons[0].classification,'INCONCLUSIVE_INCOMPLETE_OR_UNMATCHED');assert.deepEqual(p.comparisons[0].resourceDifferences,[]);
});
