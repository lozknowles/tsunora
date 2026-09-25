import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveCpuBusy, type CpuCounterFrame} from './resource-telemetry.js';

const frame=(kind:CpuCounterFrame['kind'],at:string,counters:CpuCounterFrame['counters'],logicalOnline=2):CpuCounterFrame=>({kind,observedAt:at,logicalOnline,counters});

test('CPU counter telemetry keeps the first sample unavailable',()=>{const current=frame('sysfs-idle','2026-09-05T10:00:00Z',[{cpu:'cpu0',online:true,idle:10}]);const value=deriveCpuBusy(undefined,current,60_000);assert.equal(value.value,null);assert.equal(value.authority,'unavailable');assert.match(value.limitations[0],/first_sample/)});

test('sysfs idle counters derive busy-only telemetry and flag partial visibility',()=>{const before=frame('sysfs-idle','2026-09-05T10:00:00Z',[{cpu:'cpu0',online:true,idle:1_000_000}],2),after=frame('sysfs-idle','2026-09-05T10:00:01Z',[{cpu:'cpu0',online:true,idle:1_250_000}],2),value=deriveCpuBusy(before,after,60_000);assert.equal(value.value,75);assert.equal(value.authority,'derived');assert.equal(value.qualifiedForAdmission,false);assert.ok(value.limitations.includes('partial_cpu_visibility'));assert.ok(value.limitations.includes('derived_busy_only_no_user_system_breakdown'))});

test('offline CPUs are excluded from the busy interval',()=>{const before=frame('sysfs-idle','2026-09-05T10:00:00Z',[{cpu:'cpu0',online:true,idle:0},{cpu:'cpu1',online:false,idle:500}],1),after=frame('sysfs-idle','2026-09-05T10:00:01Z',[{cpu:'cpu0',online:true,idle:500_000},{cpu:'cpu1',online:false,idle:500}],1),value=deriveCpuBusy(before,after,60_000);assert.equal(value.value,50);assert.equal(value.limitations.includes('partial_cpu_visibility'),false)});

test('counter reset, invalid interval and stale sampling never become zero load',()=>{const initial=frame('sysfs-idle','2026-09-05T10:00:00Z',[{cpu:'cpu0',online:true,idle:1_000}],1);assert.equal(deriveCpuBusy(initial,frame('sysfs-idle','2026-09-05T10:00:01Z',[{cpu:'cpu0',online:true,idle:2}],1),60_000).value,null);assert.match(deriveCpuBusy(initial,frame('sysfs-idle','2026-09-05T10:00:00Z',[{cpu:'cpu0',online:true,idle:2_000}],1),60_000).limitations[0],/interval_invalid/);const stale=deriveCpuBusy(initial,frame('sysfs-idle','2026-09-05T10:02:00Z',[{cpu:'cpu0',online:true,idle:2_000}],1),60_000);assert.equal(stale.value,null);assert.equal(stale.freshness,'stale')});

test('procfs aggregate counters remain distinct from the sysfs derived fallback',()=>{const before=frame('procfs-times','2026-09-05T10:00:00Z',[{cpu:'aggregate',online:true,idle:600,total:1_000}]),after=frame('procfs-times','2026-09-05T10:00:01Z',[{cpu:'aggregate',online:true,idle:650,total:1_200}]),value=deriveCpuBusy(before,after,60_000);assert.equal(value.value,75);assert.equal(value.authority,'authoritative');assert.equal(value.source,'/proc/stat')});
