// Renderer-independent positions. Areas are a visual legend, never fabricated runtime entities.
export const AREAS=[['INCOMING',-25],['ROUTING',-16],['EXECUTION',-6],['REVIEW',4],['VERIFICATION',13],['EVIDENCE',22],['COMPLETE',31]];
export function positionFactory(entities){
  const lanes=entities.filter(e=>e.kind==='lane'),laneIds=lanes.map(e=>e.id),positions=new Map(),buckets=new Map();
  const laneZ=id=>{const i=laneIds.indexOf(id);return i<0?Math.max(0,lanes.length)*5: i*5;};
  const rows={worker:0,model:0,tool:0,skill:0,cache:0,evidence:0,containment:0,baton:0};
  for(const e of entities){
    let x=0,y=.8,z=0;
    if(e.kind==='lane'){x=-31;y=.1;z=laneZ(e.id);}
    else if(e.kind==='worker'){x=-14+(rows.worker++%8)*5;z=-7-Math.floor((rows.worker-1)/8)*5;y=1.7;}
    else if(e.kind==='model'){x=-18+(rows.model++%8)*6;z=-16-Math.floor((rows.model-1)/8)*5;y=2;}
    else if(e.kind==='tool'){x=-16+(rows.tool++%8)*4.5;z=-24-Math.floor((rows.tool-1)/8)*4;y=1;}
    else if(e.kind==='skill'){x=-27;z=-8+rows.skill++*3.5;y=1.2;}
    else if(e.kind==='cache'){x=-35;z=-6+rows.cache++*3.5;y=1.2;}
    else if(e.kind==='evidence'){x=24+(rows.evidence%4)*2.5;z=laneZ(null)+7+Math.floor(rows.evidence++/4)*3;y=1;}
    else if(e.kind==='baton'){x=5+(rows.baton%6)*2.2;z=laneZ(null)+7+Math.floor(rows.baton++/6)*3;y=1.1;}
    else if(e.kind==='containment'){x=42;z=rows.containment++*4;y=1.2;}
    else {z=laneZ(e.laneId);const s=e.state;
      x=/INBOX|SCHEDULED/.test(s)?-25:/QUEUED|READY|TRIAGED|PLANNING/.test(s)?-16:/VERIFYING|VALIDATING/.test(s)?13:/SUCCEEDED|COMPLETED/.test(s)?31:/FAILED|DEGRADED|CANCELLED|CLEANUP|BLOCK|WAIT|PAUS/.test(s)?4:-6;
      const key=`${x}:${z}`,n=buckets.get(key)||0;buckets.set(key,n+1);x+=(n%3)*2.1;z+=Math.floor(n/3)*1.8;y=.9;
    }
    if(/QUARANTINED|INSPECTED|RESET|REQUALIFIED/.test(e.state)){x=42;z=rows.containment++*4;}
    positions.set(e.id,{x,y,z});
  }
  // Current invocation routing moves a job along its real lane to the resource's
  // column. Historical/configured routes remain inspectable, not active motion.
  const activeBuckets=new Map();
  for(const e of entities.filter(e=>e.kind==='job'&&e.state==='RUNNING')){
    const step=e.detail?.steps?.find(s=>['RUNNING','DISPATCHED','VERIFYING'].includes(s.status));
    const station=e.detail?.modelAssignment==='CURRENT_INVOCATION'?entities.find(s=>s.kind==='model'&&s.modelId===e.modelId&&s.providerId===e.providerId):entities.find(s=>s.id===`worker:${e.workerId}`);
    const p=positions.get(e.id),resource=station&&positions.get(station.id);
    if(step?.verification?.required?.length&&e.detail?.modelAssignment!=='CURRENT_INVOCATION')p.x=13;
    else if(resource)p.x=resource.x;
    const key=`${p.x}:${p.z}`,n=activeBuckets.get(key)||0;activeBuckets.set(key,n+1);p.z+=n*1.8;
  }
  for(const e of entities.filter(e=>e.kind==='baton')){const destination=positions.get(`job:${e.detail.destinationRunId}`);if(destination)positions.set(e.id,{x:destination.x+1.8,y:destination.y+1.6,z:destination.z-1.5});}
  return{positions,lanes:lanes.map(e=>({id:e.id,label:e.label,z:laneZ(e.id)})),unassignedZ:laneZ(null)};
}
export function entityColour(e){const states={DISCOVERED:'#70a3bd',CONNECTING:'#73baf2',AVAILABLE:'#6bd6b2',DEGRADED:'#e8bd70',UNAUTHORISED:'#e8bd70',TIMED_OUT:'#ed6c74',INVALID_RESPONSE:'#fa8acc',CANCELLED:'#987f70',RECOVERED:'#80e4ca',EXPECTED:'#617a93',OBSERVED:'#70a3bd',IDENTIFIED:'#b8c3d4',VERIFIED:'#6bd6b2',CAPABILITY_VERIFIED:'#80e4ca',UNREACHABLE:'#ed6c74',STALE:'#987f70',CONFLICTED:'#fa8acc',BLOCKED:'#e8bd70',UNKNOWN:'#77828a',HISTORICALLY_OBSERVED:'#a999d2'};if(states[e.state])return states[e.state];return /FAIL|QUARANTIN|KILL|STOP|CANCEL|CLEANUP|CONFLICT|UNREACHABLE/.test(e.state)?'#ed6c74':/SUCCEED|COMPLET|PASS|QUALIFIED|VERIFIED/.test(e.state)?'#6bd6b2':/RUNNING|WORKING|ACTIVE|DISPATCH/.test(e.state)?'#73baf2':/VERIFY/.test(e.state)?'#bfadfa':/BLOCK|WAIT|PAUS|RETRY|RECOVER/.test(e.state)?'#e8bd70':'#829bb3';}
export function displayMetric(m){return m?.value===null||m?.value===undefined?'UNAVAILABLE':`${Number.isInteger(m.value)?m.value:m.value.toFixed(1)} ${m.unit}`;}
