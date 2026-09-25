/** Pure, bounded display/replay functions. No runtime calls. */
export function hostHardware(projection,hostId){
 const host=projection.entities.find(e=>e.id===hostId),attrs=host?.detail?.attributes??{};
 const members=projection.entities.filter(e=>e.laneId===hostId||e.detail?.hostId===hostId),cpu=members.find(e=>e.kind==='cpu'),gpus=members.filter(e=>e.kind==='gpu'),c=cpu?.detail?.attributes??{};
 const stale=host&&(host.detail?.stale===true||['UNREACHABLE','TIMED_OUT','UNAUTHORISED','INVALID_RESPONSE','CANCELLED','STALE','CONNECTING'].includes(host.state));
 const state=e=>stale||e?.state==='STALE'?'STALE':e?.state??'UNKNOWN';
 const count=c.logicalCpus??attrs.cpuCount,model=c.model??attrs.cpuModel,memory=c.memoryBytes??attrs.memoryBytes;
 const gib=n=>`${(n/1024**3).toFixed(1)} GiB`;
 const rows=[{label:'CPU',value:count?`${model&&model!=='UNKNOWN'?model:'Model unknown'} · ${count} logical CPUs`:'Unknown',state:count?state(cpu??host):'UNKNOWN',entityId:cpu?.id},
 {label:'Memory',value:memory?gib(memory):'Unknown',state:memory?state(cpu??host):'UNKNOWN',entityId:cpu?.id}];
 if(gpus.length)for(const gpu of gpus){const a=gpu.detail?.attributes??{};rows.push({label:a.inventorySource==='WINDOWS_CIM'?'GPU':'NVIDIA GPU',value:`${a.model??gpu.label}${a.memoryMiB?` · ${(a.memoryMiB/1024).toFixed(1)} GiB VRAM`:''}`,state:state(gpu),entityId:gpu.id});}
 else rows.push({label:attrs.platform==='android'||attrs.gpuInventorySource==='WINDOWS_CIM'?'GPU':'NVIDIA GPU',value:attrs.gpuInventoryStatus==='OBSERVED'?'None reported by NVIDIA driver':'Unknown · inventory unavailable',state:attrs.gpuInventoryStatus==='OBSERVED'?state(host):'UNKNOWN'});
 return rows;
}
export function positionEstate(entities){
 const positions=new Map(),hosts=entities.filter(e=>e.kind==='host'),groups=new Map();
 for(const e of entities){const host=e.laneId||e.detail?.hostId||e.id;if(!groups.has(host))groups.set(host,[]);groups.get(host).push(e);}
 const hostIds=[...new Set([...hosts.map(e=>e.id),...groups.keys()])].sort();
 const columns=Math.max(1,Math.ceil(Math.sqrt(hostIds.length)));const rows=new Map();for(const e of entities){const group=hostIds.indexOf(e.kind==='host'?e.id:e.laneId||e.detail?.hostId||e.id),gx=(group%columns)*58,gz=Math.floor(group/columns)*60;const key=`${group}:${e.kind}`,i=rows.get(key)||0;rows.set(key,i+1);const column={host:0,cpu:-16,gpu:-16,storage:-25,repository:-25,worker:16,runtime:0,endpoint:0,model:19,service:-4,skill:28,capability:28,unknown:28}[e.kind]??0;const z={host:-15,cpu:-5,gpu:9,storage:13,repository:21,worker:-5,runtime:2,endpoint:8,model:10,service:23,skill:20,capability:27,unknown:30}[e.kind]??0;positions.set(e.id,{x:gx+column+(e.kind==='service'?i%5*5:i%2*5),y:e.kind==='host'?2:1,z:gz+z+Math.floor(i/(e.kind==='service'?5:2))*5});}
 const points=[...positions.values()],xs=points.map(p=>p.x),zs=points.map(p=>p.z),minX=Math.min(0,...xs),maxX=Math.max(0,...xs),minZ=Math.min(0,...zs),maxZ=Math.max(0,...zs),span=Math.max(60,maxX-minX,maxZ-minZ),scale=Math.min(1,100/span),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;for(const p of points){p.x=(p.x-cx)*scale;p.z=(p.z-cz)*scale;}const hostZones=hosts.map(host=>{const members=entities.filter(e=>e.id===host.id||e.laneId===host.id||e.detail?.hostId===host.id).map(e=>positions.get(e.id));return{id:host.id,label:host.label,state:host.state,execution:host.detail?.attributes?.execution??'LOCAL',minX:Math.min(...members.map(p=>p.x))-4,maxX:Math.max(...members.map(p=>p.x))+4,minZ:Math.min(...members.map(p=>p.z))-4,maxZ:Math.max(...members.map(p=>p.z))+4};});return{positions,hostZones,lanes:[],unassignedZ:0,estateCenter:{x:0,y:0,z:0},estateDistance:Math.max(100,span*scale*1.2+30)};
}
export function filterEstate(projection,{query='',host='',kind='',collapsed=false,limit=160,selected=null}={}){
 const q=query.toLowerCase();let all=projection.entities.filter(e=>(!host||e.id===host||e.laneId===host)&&(!kind||e.kind===kind)&&(!q||`${e.label} ${e.id} ${e.state}`.toLowerCase().includes(q))&&(!collapsed||q||kind||e.id===selected||!['service','skill'].includes(e.kind)));
 all=all.sort((a,b)=>(a.id===selected?-1:b.id===selected?1:0)||(a.kind==='host'?-1:b.kind==='host'?1:0)||a.id.localeCompare(b.id));const entities=all.slice(0,limit),ids=new Set(entities.map(e=>e.id));return{...projection,entities,relations:projection.relations.filter(r=>ids.has(r.from)&&ids.has(r.to)),displayCoverage:{matched:all.length,shown:entities.length,total:projection.entities.length,limit}};
}
export function replayEstate(record,index){
 if(record?.schema!=='agent-control.estate-replay/v1'||!Array.isArray(record.events)||record.events.length>50000)throw Error('Invalid estate replay');
 const entities=new Map(),relationships=new Map(),events=record.events.slice(0,index+1);for(const e of events){if(e.entity)entities.set(e.entity.id,e.entity);if(e.relationship)relationships.set(e.relationship.id,e.relationship);}
 return{schema:'agent-control.factory/v1',domain:'ESTATE',observedAt:events.at(-1)?.at??record.snapshot.startedAt,authority:'READ_ONLY_RUNTIME_PROJECTION',estate:{snapshotId:record.snapshot.id,status:'REPLAY',recordedStatus:index>=record.events.length-1?record.snapshot.status:'RUNNING',runId:record.snapshot.runId,relationships:[...relationships.values()],diff:[]},entities:[...entities.values()].map(e=>({id:e.id,sourceId:e.id,kind:e.kind,label:e.label,state:e.state,laneId:e.hostId,runId:record.snapshot.runId,at:e.lastSeen,metrics:{},links:[],detail:{...e,howDoWeKnow:e.evidence}})),relations:[...relationships.values()].map(r=>({...r,sourceId:r.id,label:r.kind,kind:'evidence'})),events:events.slice(-100).map(e=>({id:e.id,at:e.at,kind:e.type,entityId:e.entity?.id??null,caption:e.caption,sourceId:e.id})),coverage:{omittedEntities:0,limits:{entities:10000,runs:1,invocations:0},limitations:['Recorded evidence only. Playback never reruns discovery or workloads.']}};
}
