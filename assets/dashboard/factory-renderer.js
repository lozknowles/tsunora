import {positionFactory,entityColour,AREAS} from './factory-layout.js';

export async function createFactoryRenderer(host,{onSelect,fallback=false,lowDetail=false,reducedMotion=false,spatialMode='FACTORY',layoutProvider=positionFactory}={}){
  const canvas=document.createElement('canvas');canvas.className='factory-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','Factory spatial view. Use the entity list for keyboard inspection.');host.replaceChildren(canvas);
  const ctx=canvas.getContext('2d',{alpha:false});let T,gl,scene,camera,world,grid,light;
  let entities=[],relations=[],layout=layoutProvider([]),objects=new Map(),hits=[],selected=null,mode='OVERVIEW',focus=null,caption='',badge='CONNECTING',at='',disposed=false,dirty=true,raf=0,lastPaint=0,transition=0;
  let yaw=.22,pitch=.88,distance=86,target={x:0,y:0,z:0},drag=null,draws=0,totalMs=0;
  if(!fallback)try{
    T=await import('./vendor/three.module.min.js');gl=new T.WebGLRenderer({antialias:!lowDetail,alpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});gl.setPixelRatio(1);gl.setClearColor('#09121d');
    scene=new T.Scene();scene.fog=new T.Fog('#09121d',100,220);camera=new T.PerspectiveCamera(43,1,.1,300);world=new T.Group();scene.add(world);
    scene.add(new T.AmbientLight('#a7c6ec',1.6));light=new T.DirectionalLight('#cfe1ff',2.4);light.position.set(0,40,15);scene.add(light);
    grid=new T.GridHelper(160,64,'#264358','#162a3b');scene.add(grid);
  }catch{fallback=true;gl?.dispose();gl=null;}
  const resize=()=>{const rect=host.getBoundingClientRect();canvas.width=Math.max(320,Math.round(rect.width));canvas.height=Math.max(460,Math.round(rect.height));if(gl){gl.setSize(canvas.width,canvas.height,false);camera.aspect=canvas.width/canvas.height;camera.updateProjectionMatrix();}dirty=true;};
  const ro=new ResizeObserver(resize);ro.observe(host);resize();
  function box(w,h,d,colour){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color:colour,roughness:.55,metalness:.4}));return mesh;}
  function model(e){const group=new T.Group(),colour=entityColour(e),station=['worker','model','host','runtime','endpoint'].includes(e.kind);
    const body=box(station?2.8:e.kind==='baton'?.65:1.55,station?e.kind==='model'?3.6:2.5:e.kind==='evidence'?1.4:.8,station?1.6:1.4,station?'#273e50':colour);group.add(body);
    const stripe=box(station?2.85:1.6,.1,station?1.7:1.5,colour);stripe.position.y=station?1.0:.4;group.add(stripe);
    if(station){const screen=box(1.7,.7,.06,colour);screen.position.set(0,.3,.84);group.add(screen);if(!lowDetail)for(let i=0;i<3;i++){const vent=box(1.8,.06,.08,'#102333');vent.position.set(0,-.3-i*.18,.85);group.add(vent);}}
    if(e.kind==='baton')group.rotation.z=Math.PI/4;
    if(['EXPECTED','UNKNOWN','HISTORICALLY_OBSERVED'].includes(e.state))group.traverse(o=>{if(o.material)o.material.wireframe=true;});group.userData.entityId=e.id;return group;
  }
  function disposeGroup(group){group.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});world.remove(group);}
  function rebuild(){if(!gl)return;let moved=false;const ids=new Set(entities.map(e=>e.id));for(const [id,obj] of objects)if(!ids.has(id)){disposeGroup(obj.group);objects.delete(id);}
    for(const e of entities){if(e.kind==='lane')continue;const p=layout.positions.get(e.id);let obj=objects.get(e.id);if(!obj){const group=model(e),source=e.kind==='baton'&&!reducedMotion?layout.positions.get(`job:${e.detail.sourceRunIds?.[0]}`):null,from=source?{x:source.x,y:source.y+1.6,z:source.z}:p;group.position.set(from.x,from.y,from.z);world.add(group);obj={group,from:{...from},to:p,state:e.state};objects.set(e.id,obj);}else{obj.from={x:obj.group.position.x,y:obj.group.position.y,z:obj.group.position.z};obj.to=p;if(obj.state!==e.state){const previous=obj.group;const group=model(e);group.position.copy(previous.position);disposeGroup(previous);world.add(group);obj.group=group;obj.state=e.state;}}}
    for(const obj of objects.values())if(Math.abs(obj.from.x-obj.to.x)+Math.abs(obj.from.z-obj.to.z)+Math.abs(obj.from.y-obj.to.y)>.001)moved=true;
    transition=reducedMotion||!moved?0:performance.now()+450;
  }
  function projected(p){if(!gl){const scale=Math.min(canvas.width/100,canvas.height/65);return{x:canvas.width/2+(p.x-target.x)*scale,y:canvas.height*.38+(p.z-target.z)*scale,visible:true};}const v=new T.Vector3(p.x,p.y,p.z).project(camera);return{x:(v.x+1)*canvas.width/2,y:(1-v.y)*canvas.height/2,visible:v.z>-1&&v.z<1};}
  function rectText(label,x,y,colour='#b1c5d8',width=130){ctx.font='10px ui-monospace, monospace';ctx.fillStyle='#0b1724eb';ctx.fillRect(x-width/2,y-10,width,20);ctx.strokeStyle='#304557';ctx.strokeRect(x-width/2,y-10,width,20);ctx.fillStyle=colour;ctx.textAlign='center';ctx.fillText(label.slice(0,25),x,y+3,width-8);}
  function paint(now){if(disposed)return;raf=requestAnimationFrame(paint);const moving=transition>now;if(!dirty&&!moving)return;if(now-lastPaint<(lowDetail?100:33))return;lastPaint=now;const started=performance.now();dirty=false;
    if(mode.startsWith('FOLLOW ')){const p=layout.positions.get(focus);if(p)target={x:p.x,y:0,z:p.z};distance=58;}
    else if(mode==='EVIDENCE'){target={x:24,y:0,z:layout.unassignedZ+7};distance=60;}
    else if(mode==='LANE'){const p=layout.positions.get(focus);if(p)target={x:0,y:0,z:p.z};distance=70;}
    if(gl){camera.position.set(target.x+Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,target.z+Math.cos(yaw)*Math.cos(pitch)*distance);camera.lookAt(target.x,0,target.z);
      for(const obj of objects.values()){const t=moving?(reducedMotion?1:1-Math.pow(Math.max(0,(transition-now)/450),2)):1;obj.group.position.set(obj.from.x+(obj.to.x-obj.from.x)*t,obj.from.y+(obj.to.y-obj.from.y)*t,obj.from.z+(obj.to.z-obj.from.z)*t);}gl.render(scene,camera);ctx.drawImage(gl.domElement,0,0);
    }else{ctx.fillStyle='#09121d';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#182e40';for(let x=0;x<canvas.width;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}for(let y=0;y<canvas.height;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}}
    if(spatialMode==='FACTORY'){for(const lane of [...layout.lanes,{label:'UNASSIGNED / NO LANE RECORDED',z:layout.unassignedZ}]){const start=projected({x:-29,y:.12,z:lane.z}),end=projected({x:35,y:.12,z:lane.z});ctx.strokeStyle='#304d62';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#7d9eac';ctx.setLineDash([3,10]);ctx.stroke();ctx.setLineDash([]);rectText(lane.label,start.x,start.y-14,'#8ca9bc',165);}
    for(const [name,x] of AREAS){const p=projected({x,y:.1,z:layout.unassignedZ+4});rectText(name,p.x,p.y,'#748da4',87);}
    for(const [name,x,z] of [['MODEL RESOURCES',0,-19],['WORKER CELLS',0,-10],['TOOL OPERATIONS',0,-26],['SKILL LIBRARY',-29,-12],['CONTEXT CACHE',-35,-8],['EVIDENCE WAREHOUSE',28,layout.unassignedZ+14],['QUARANTINE / CONTAINMENT',43,-4]]){const p=projected({x,y:0,z});rectText(name,p.x,p.y,'#9cb0bf',172);}
    }
    if(spatialMode==='ESTATE')for(const zone of layout.hostZones??[]){const corners=[[zone.minX,zone.minZ],[zone.maxX,zone.minZ],[zone.maxX,zone.maxZ],[zone.minX,zone.maxZ]].map(([x,z])=>projected({x,y:0,z}));ctx.fillStyle='#34506522';ctx.strokeStyle=entityColour({state:zone.state});ctx.lineWidth=1;ctx.setLineDash(['UNREACHABLE','TIMED_OUT','STALE','UNAUTHORISED'].includes(zone.state)?[5,5]:[]);ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);const label=projected({x:(zone.minX+zone.maxX)/2,y:0,z:zone.maxZ+2});rectText(`${zone.execution} · ${zone.label}`,label.x,label.y,entityColour({state:zone.state}),195);}
    for(const relation of relations){const a=layout.positions.get(relation.from),b=layout.positions.get(relation.to);if(!a||!b)continue;const p=projected(a),q=projected(b);ctx.strokeStyle=relation.kind==='handoff'?'#b7a3fbaa':relation.kind==='evidence'?'#64c8a688':'#5890ae55';ctx.lineWidth=relation.kind==='handoff'?2:1;ctx.setLineDash(relation.state&&!['VERIFIED','CAPABILITY_VERIFIED'].includes(relation.state)?[4,5]:[]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);}
    hits=[];const occupied=[];
    const ordered=[...entities].filter(e=>e.kind!=='lane').sort((a,b)=>(a.id===selected?-100:b.id===selected?100:0)||(['job','worker','model'].includes(a.kind)?-1:1));
    for(const e of ordered){const obj=objects.get(e.id),raw=layout.positions.get(e.id),p=projected(gl&&obj?obj.group.position:raw);if(!p.visible)continue;
      if(!gl){ctx.fillStyle=entityColour(e);ctx.fillRect(p.x-8,p.y-8,16,16);}
      const w=e.kind==='job'?150:125,h=e.kind==='job'?42:28,x=p.x-w/2,y=p.y-35;
      const collides=occupied.some(r=>x<r.x+r.w&&x+w>r.x&&y<r.y+r.h&&y+h>r.y);hits.push({id:e.id,x:p.x-14,y:p.y-16,w:28,h:32});
      if(collides&&e.id!==selected)continue;if(lowDetail&&occupied.length>35&&e.id!==selected)continue;occupied.push({x,y,w,h});hits.push({id:e.id,x,y,w,h});
      ctx.fillStyle=e.id===selected?'#1c354bee':'#0b1622ee';ctx.fillRect(x,y,w,h);ctx.strokeStyle=e.id===selected?'#dfedf6':entityColour(e);ctx.lineWidth=e.id===selected?2:1;ctx.strokeRect(x,y,w,h);ctx.textAlign='left';ctx.fillStyle='#e2edf6';ctx.font='11px ui-monospace, monospace';ctx.fillText(e.label.slice(0,23),x+7,y+13,w-12);ctx.font='9px ui-monospace, monospace';ctx.fillStyle=entityColour(e);ctx.fillText(e.state,x+7,y+25,w-12);
      if(e.kind==='job'){const m=e.metrics.cacheReusePercent;ctx.fillStyle='#9eb6ca';ctx.fillText(`CACHE ${m?.value==null?'UNAVAILABLE':m.value.toFixed(0)+'%'} · ${e.detail.priority||'UNKNOWN'}`,x+7,y+37,w-12);}
    }
    const gradient=ctx.createLinearGradient(0,0,0,95);gradient.addColorStop(0,'#09121df5');gradient.addColorStop(1,'#09121d00');ctx.fillStyle=gradient;ctx.fillRect(0,0,canvas.width,100);
    ctx.textAlign='left';ctx.fillStyle='#f3f6fb';ctx.font='600 16px system-ui';ctx.fillText(`AGENT CONTROL  /  ${spatialMode}`,24,30);ctx.fillStyle='#80a2b9';ctx.font='11px ui-monospace, monospace';ctx.fillText(`${badge}   ${at}   ${fallback?'2D':'3D'} / ${mode}`,24,52);
    const jobs=entities.filter(e=>e.kind==='job'),hosts=entities.filter(e=>e.kind==='host'),verifiedHosts=hosts.filter(e=>['VERIFIED','CAPABILITY_VERIFIED','AVAILABLE','RECOVERED'].includes(e.state));ctx.fillText(spatialMode==='ESTATE'?`${verifiedHosts.length} VERIFIED HOST${verifiedHosts.length===1?'':'S'} / ${hosts.length} HOST RECORDS   ${entities.length} OBJECTS   ${relations.length} LINKS`:`${jobs.length} RUNS   ${entities.filter(e=>e.kind==='worker').length} WORKERS   ${entities.filter(e=>e.kind==='model').length} MODELS   ${entities.filter(e=>e.kind==='evidence').length} EVIDENCE`,24,72);
    ctx.fillStyle='#09121dec';ctx.fillRect(0,canvas.height-51,canvas.width,51);ctx.fillStyle='#9ec6df';ctx.font='12px ui-monospace, monospace';ctx.fillText(caption||'Awaiting authoritative runtime observations',24,canvas.height-28,canvas.width-48);ctx.fillStyle='#708da3';ctx.font='10px ui-monospace, monospace';ctx.fillText('OBSERVED STATE · UNKNOWN ≠ ZERO · SELECT OBJECTS TO INSPECT THEIR SOURCE',24,canvas.height-11);
    draws++;totalMs+=performance.now()-started;
  }
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag||mode!=='MANUAL')return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;yaw+=dx*.006;pitch=Math.min(1.4,Math.max(.25,pitch+dy*.004));drag.x=e.clientX;drag.y=e.clientY;dirty=true;};
  canvas.onpointerup=e=>{if(!drag?.moved){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,hit=[...hits].reverse().find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);if(hit)onSelect?.(hit.id);}drag=null;};
  canvas.onwheel=e=>{if(mode!=='MANUAL')return;e.preventDefault();distance=Math.min(180,Math.max(25,distance+e.deltaY*.04));dirty=true;};
  canvas.onkeydown=e=>{if(mode!=='MANUAL')return;if(e.key==='ArrowLeft')yaw-=.1;else if(e.key==='ArrowRight')yaw+=.1;else if(e.key==='ArrowUp')pitch=Math.min(1.4,pitch+.1);else if(e.key==='ArrowDown')pitch=Math.max(.25,pitch-.1);else if(e.key==='+')distance=Math.max(25,distance-5);else if(e.key==='-')distance=Math.min(180,distance+5);else return;e.preventDefault();dirty=true;};
  raf=requestAnimationFrame(paint);
  return{canvas,fallback,update(projection,options={}){entities=projection.entities;relations=projection.relations;layout=layoutProvider(entities);at=projection.observedAt;caption=options.caption??caption;badge=options.badge??badge;rebuild();dirty=true;},select(id){selected=id;dirty=true;},camera(value,id){mode=value;focus=id;if(value==='OVERVIEW'||value==='ESTATE OVERVIEW'){target=layout.estateCenter??{x:2,y:0,z:Math.max(0,layout.unassignedZ/2-5)};distance=layout.estateDistance??Math.max(86,70+layout.unassignedZ);yaw=.22;pitch=.88;}dirty=true;},status(value){badge=value;dirty=true;},statistics(){return{frames:draws,meanDrawMs:draws?totalMs/draws:null,renderer:fallback?'2D':'WebGL',entities:entities.length};},dispose(){disposed=true;cancelAnimationFrame(raf);ro.disconnect();for(const o of objects.values())disposeGroup(o.group);objects.clear();grid?.geometry.dispose();grid?.material.dispose();gl?.dispose();gl?.forceContextLoss();canvas.remove();}};
}
