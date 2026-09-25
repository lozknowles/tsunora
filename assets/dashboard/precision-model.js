/* Presentation only. Canonical entities and evidence are never changed. */
export function hostStatus(entity, mode='LIVE') {
  const a=entity.detail?.attributes??{}, state=entity.state;
  const historical=mode==='REPLAY', stale=entity.detail?.stale===true||state==='STALE'||state==='HISTORICALLY_OBSERVED';
  const accepted=['AVAILABLE','VERIFIED','CAPABILITY_VERIFIED','RECOVERED'].includes(state)||state==='DEGRADED'&&a.identityScope==='SSH_INSTALLATION'&&Boolean(entity.detail?.lastSuccessfulDiscovery);
  const reach=stale?'Not current':accepted?(a.execution==='REMOTE'?'Responded':'Observed locally'):({CONNECTING:'Connecting',DISCOVERED:'Not contacted',EXPECTED:'Not contacted',UNREACHABLE:'Unreachable',TIMED_OUT:'Timed out',UNAUTHORISED:'Not authorised',INVALID_RESPONSE:'Invalid response',CANCELLED:'Cancelled',BLOCKED:'Blocked',CONFLICTED:'Identity conflict'}[state]??'Not verified');
  const limited=a.identityScope==='SSH_INSTALLATION';
  const identity=limited?'Installation only':a.physicalIdentityDigest||a.identityDigest&&a.identityScope? 'OS / firmware identity':'Not verified';
  return {reach,historical,stale,limited,accepted,identity,canonical:state,platform:a.platform??'Unknown',attention:limited||stale||!accepted};
}
export function estateLinks(projection, visibleIds) {
  const ids=new Set(visibleIds);
  return (projection.estate?.relationships??projection.relations??[]).filter(r=>ids.has(r.from)&&ids.has(r.to)&&r.from==='host:controller-local'&&r.to.startsWith('host:')&&r.basis==='VERIFIED'&&r.state==='VERIFIED');
}
export function mapEntities(projection, domain='ESTATE', includeRetained=false) {
  const rank=e=>({linux:0,windows:1,android:2}[e.detail?.attributes?.platform]??3);
  return projection.entities.filter(e=>domain==='ESTATE'?e.kind==='host'&&(includeRetained||hostStatus(e).accepted&&!hostStatus(e).stale):['job','worker','model','evidence'].includes(e.kind)).sort((a,b)=>(a.id==='host:controller-local'?-1:b.id==='host:controller-local'?1:0)||(domain==='ESTATE'?rank(a)-rank(b):0)||a.id.localeCompare(b.id));
}
export function estateSummary(projection,mode='LIVE') {
  const hosts=projection.entities.filter(e=>e.kind==='host'),s=hosts.map(h=>hostStatus(h,mode));
  const status=projection.estate?.recordedStatus??projection.estate?.status??'EMPTY';
  return {hosts:hosts.length,matched:s.filter(x=>x.accepted&&!x.limited&&!x.stale).length,limited:s.filter(x=>x.limited&&x.accepted&&!x.stale).length,stale:s.filter(x=>x.stale).length,responded:s.filter(x=>x.accepted&&!x.stale).length,unavailable:s.filter(x=>!x.accepted||x.stale).length,status};
}
