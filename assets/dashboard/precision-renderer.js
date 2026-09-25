import {hostStatus,estateLinks,mapEntities} from './precision-model.js';

/* A readable 2D map plus native focusable controls; shares the existing recorder. */
export async function createFactoryRenderer(host,{onSelect,lowDetail=false,spatialMode='FACTORY'}={}) {
  const canvas=document.createElement('canvas');canvas.className='factory-canvas';canvas.setAttribute('aria-hidden','true');
  const controls=document.createElement('div');controls.className='precision-map-buttons';controls.setAttribute('aria-label',spatialMode==='ESTATE'?'Selectable hosts':'Selectable runtime objects');
  host.replaceChildren(canvas,controls);const ctx=canvas.getContext('2d',{alpha:false});
  let projection={entities:[],relations:[]},selected=null,caption='',badge='',disposed=false,raf=0,focus=null,layout=[],dirty=true,draws=0,drawMs=[],lastPaint=0;
  let viewportHeight=340,viewportWidth=320;
  const buttons=new Map();const resize=()=>{viewportWidth=Math.max(280,host.clientWidth);viewportHeight=Math.max(340,host.clientHeight);dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const mode=()=>badge.startsWith('REPLAY')?'REPLAY':badge.startsWith('PAUSED')?'PAUSED':'LIVE';
  function text(value,x,y,size=14,colour='#405772',weight=400){ctx.fillStyle=colour;ctx.font=`${weight} ${size}px system-ui`;ctx.textAlign='left';ctx.fillText(value,x,y);}
  function icon(x,y,type,colour){ctx.save();ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,type==='phone'?18:28,24,3);ctx.stroke();ctx.beginPath();if(type==='computer'){ctx.moveTo(x-4,y+28);ctx.lineTo(x+32,y+28);}else if(type==='job'){ctx.moveTo(x+10,y+6);ctx.lineTo(x+20,y+12);ctx.lineTo(x+10,y+18);ctx.closePath();}else if(type==='evidence'){for(let i=7;i<21;i+=6){ctx.moveTo(x+6,y+i);ctx.lineTo(x+22,y+i);}}else if(type!=='phone'){ctx.arc(x+14,y+12,6,0,Math.PI*2);}ctx.stroke();ctx.restore();}
  function paint(now){if(disposed)return;raf=requestAnimationFrame(paint);if(!dirty||now-lastPaint<(lowDetail?100:16))return;lastPaint=now;dirty=false;const started=performance.now();const w=viewportWidth;if(canvas.width!==w)canvas.width=w;
    layout=[];
    let items=mapEntities(projection,spatialMode,window.AgentControlPrecision?.includeRetained);const omitted=Math.max(0,items.length-(lowDetail?20:80));items=items.slice(0,lowDetail?20:80);
    const controller=items.find(e=>e.id==='host:controller-local'),remotes=items.filter(e=>e!==controller),compact=w<640;
    const columns=compact?1:spatialMode==='ESTATE'?Math.max(2,Math.floor(w/260)):Math.max(2,Math.floor(w/270));
    const tree=spatialMode==='ESTATE'&&controller&&!compact&&items.length<=6;
    const flow=spatialMode==='FACTORY'&&!compact,jobs=items.filter(e=>e.kind==='job'),evidence=items.filter(e=>e.kind==='evidence'),other=items.filter(e=>!['job','evidence'].includes(e.kind));
    const jobRow=new Map(jobs.map((e,i)=>[e.runId,i])),usedRows=new Set();
    const evidenceRows=evidence.map(e=>{let row=jobRow.get(e.runId)??0;while(usedRows.has(row))row++;usedRows.add(row);return {e,row};});
    const flowRows=Math.max(jobs.length,other.length,...evidenceRows.map(r=>r.row+1));
    const h=focus||tree?Math.max(viewportHeight,tree?remotes.length*86+40:340):Math.max(viewportHeight,(flow?flowRows:Math.ceil(items.length/columns))*108+60);
    if(canvas.height!==h)canvas.height=h;canvas.style.height=`${h}px`;controls.style.height=`${h}px`;
    ctx.fillStyle='#f7faff';ctx.fillRect(0,0,w,h);
    if(spatialMode==='ESTATE'&&controller&&!compact&&items.length<=6){
      const rh=Math.min(90,(h-70)/Math.max(1,remotes.length)-12),gap=12,total=remotes.length*(rh+gap)-gap,start=Math.max(22,(h-42-total)/2);
      layout.push({e:controller,x:24,y:(h-42)/2-58,w:Math.min(218,w*.3),h:116});
      remotes.forEach((e,i)=>layout.push({e,x:w*.55,y:start+i*(rh+gap),w:w*.45-24,h:rh}));
    }else if(flow){
      const cw=(w-96)/3;
      other.forEach((e,i)=>layout.push({e,x:24,y:24+i*108,w:cw,h:96}));
      jobs.forEach((e,i)=>layout.push({e,x:48+cw,y:24+i*108,w:cw,h:96}));
      evidenceRows.forEach(({e,row})=>layout.push({e,x:72+cw*2,y:24+row*108,w:cw,h:96}));
    }else{
      const gap=16,cw=(w-48-gap*(columns-1))/columns,rh=96;
      items.forEach((e,i)=>layout.push({e,x:24+(i%columns)*(cw+gap),y:24+Math.floor(i/columns)*(rh+12),w:cw,h:rh}));
    }
    if(focus&&layout.some(r=>r.e.id===focus)){const r=layout.find(r=>r.e.id===focus);layout=[{...r,x:Math.max(24,(w-390)/2),y:Math.max(24,(h-200)/2),w:Math.min(390,w-48),h:160}];}
    const edges=spatialMode==='ESTATE'?estateLinks(projection,layout.map(r=>r.e.id)):(projection.relations??[]).filter(r=>layout.some(a=>a.e.id===r.from)&&layout.some(a=>a.e.id===r.to));
    if(window.AgentControlPrecision?.relationships!==false&&!compact)for(const edge of edges){if(items.length>(flow?30:6)&&edge.from!==selected&&edge.to!==selected)continue;const a=layout.find(r=>r.e.id===edge.from),b=layout.find(r=>r.e.id===edge.to);if(!a||!b)continue;const mid=(a.x+a.w+b.x)/2,y=b.y+b.h/2;ctx.strokeStyle='#1266bb';ctx.lineWidth=2;ctx.setLineDash(edge.state==='VERIFIED'?[]:[5,4]);ctx.beginPath();ctx.moveTo(a.x+a.w,a.y+a.h/2);ctx.lineTo(mid,a.y+a.h/2);ctx.lineTo(mid,y);ctx.lineTo(b.x-8,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#1266bb';ctx.beginPath();ctx.moveTo(b.x,y);ctx.lineTo(b.x-8,y-5);ctx.lineTo(b.x-8,y+5);ctx.fill();}
    const current=new Set(layout.map(r=>r.e.id));for(const[id,b]of buttons)if(!current.has(id)){b.remove();buttons.delete(id);}
    for(const r of layout){const {e,x,y,w:cw,h:ch}=r,s=hostStatus(e,mode()),name=window.AgentControlPrecision?.label(e)??e.label,chosen=e.id===selected;
      ctx.fillStyle=chosen?'#eaf4ff':'#ffffff';ctx.strokeStyle=chosen?'#006bc7':'#718ba5';ctx.lineWidth=chosen?2.5:1;ctx.beginPath();ctx.roundRect(x,y,cw,ch,7);ctx.fill();ctx.stroke();
      const identity=spatialMode==='FACTORY'&&e.runId?window.AgentControlIdentity?.run(e.runId):null;
      if(identity){const colour=getComputedStyle(document.documentElement).getPropertyValue(`--ac-identity-${identity.slot}`).trim();ctx.fillStyle=colour;ctx.fillRect(x+2,y+8,4,ch-16);}
      icon(x+16,y+20,e.kind==='host'?(s.platform==='android'?'phone':'computer'):e.kind,chosen?'#07508e':'#365b81');const tx=x+61;
      ctx.font='650 15px system-ui';let title=name;while(title.length>1&&ctx.measureText(title).width>cw-86)title=title.slice(0,-1);if(title!==name)title=title.slice(0,-1)+'…';
      text(title,tx,y+26,15,'#142e4d',650);text(e.kind==='host'?(e.id==='host:controller-local'?'Local controller · '+s.platform:s.platform+' · '+s.reach):identity?`${e.kind.toUpperCase()} · ◇ ${e.runId.slice(0,18)}`:e.kind,tx,y+46,11);
      text(e.kind==='host'?s.identity:e.state,tx,y+66,11,s.limited?'#805009':'#49617a');
      if(e.kind==='host'&&s.attention){text('!',x+cw-20,y+24,17,'#8b5300',750);}
      let b=buttons.get(e.id);if(!b){b=document.createElement('button');b.type='button';b.className='precision-map-node';b.dataset.entityId=e.id;b.onclick=()=>onSelect?.(e.id);controls.append(b);buttons.set(e.id,b);}
      b.style.cssText=`left:${x}px;top:${y}px;width:${cw}px;height:${ch}px`;b.setAttribute('aria-label',`${name}, ${e.kind==='host'?s.reach+', '+s.identity:e.state}`);b.setAttribute('aria-pressed',String(chosen));b.title=`${name} · ${e.state}`;
    }
    if(!layout.length){text(spatialMode==='ESTATE'?'No current hosts found.':'No recorded runtime objects.',24,h/2,14);text('Open evidence for retained observations.',24,h/2+24,12);}
    const footer=omitted?`${omitted} more objects · use Inventory to inspect every record`:spatialMode==='ESTATE'?'Lines show evidenced discovery execution, not network traffic.':'Only recorded entities and relationships are shown.';
    ctx.fillStyle='#f7faff';ctx.fillRect(0,h-35,w,35);text(footer,20,h-14,11);
    canvas.dataset.privacySafe=String(Boolean(window.AgentControlPrecision?.publicMode));draws++;drawMs.push(performance.now()-started);if(drawMs.length>600)drawMs.shift();
  }
  const presentation=()=>{dirty=true;};document.addEventListener('precision:presentation',presentation);raf=requestAnimationFrame(paint);
  return {canvas,fallback:true,update(p,options={}){projection=p;caption=options.caption??caption;badge=options.badge??badge;dirty=true;},select(id){selected=id;dirty=true;},camera(value,id){focus=value==='FOCUS SELECTED'?id:null;dirty=true;},status(value){badge=value;dirty=true;},statistics(){const sorted=[...drawMs].sort((a,b)=>a-b);return {frames:draws,meanDrawMs:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:null,p95DrawMs:sorted[Math.floor(sorted.length*.95)]??null,renderer:'Precision 2D',entities:projection.entities.length};},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('precision:presentation',presentation);buttons.clear();canvas.remove();controls.remove();}};
}
