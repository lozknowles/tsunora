(() => {
  "use strict";
  const rt = {
    projection: null,
    processProjection: null,
    estateProjection: null,
    comparison: null,
    parcels: [],
    parcelId: "",
    runId: "",
    focusIds: null,
    compareLeft: "",
    compareRight: "",
    surface: "process",
    search: "",
    filter: "ALL",
    mode: "map",
    selected: null,
    collapsed: new Set(),
    autoClustered: false,
    scale: 1,
    panX: 0,
    panY: 0,
    drag: null,
    timer: null,
    replayTimer: null,
    replayPlaying: false,
    active: false,
  };
  const $ = (id) => document.getElementById(id),
    safe = (value) =>
      String(value ?? "").replace(
        /[&<>'"]/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[c],
      ),
    icons = {
      request: "✦",
      poe: "◉",
      planner: "⌁",
      decision: "◆",
      "work-parcel": "▣",
      job: "▤",
      "parallel-lane": "⑂",
      worker: "●",
      "model-call": "✧",
      cache: "◫",
      memory: "◇",
      skill: "⚙",
      tool: "⌘",
      terminal: ">_",
      validation: "✓",
      retry: "↻",
      escalation: "↑",
      approval: "!",
      baton: "⇢",
      aggregation: "⋈",
      consensus: "∑",
      result: "◎",
      estate: "⌂",
      machine: "▰",
      device: "▯",
      gpu: "▥",
      storage: "▱",
      runtime: "◈",
      model: "✧",
      provider: "☁",
      endpoint: "◎",
      transport: "⇄",
      credential: "⌾",
      "mcp-server": "⌘",
    };
  const headers = () => ({ Authorization: `Bearer ${state.token}` });
  async function get(url) {
    if (state.operatorAuth !== "authenticated")
      throw new Error("Authenticate to inspect governed runtime evidence.");
    const response = await fetch(url, { headers: headers() });
    if (response.status === 401) authenticationExpired();
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
    return value;
  }
  async function loadParcels() {
    rt.parcels = await get("/api/parcels");
    const select = $("runtime-parcel"),
      prior = rt.parcelId;
    select.innerHTML = rt.parcels
      .map(
        (p) =>
          `<option value="${safe(p.id)}">${safe(p.objective.slice(0, 72))} · ${safe(p.status)}</option>`,
      )
      .join("");
    rt.parcelId = rt.parcels.some((p) => p.id === prior)
      ? prior
      : (rt.parcels.find((p) => !p.endedAt)?.id ?? rt.parcels[0]?.id ?? "");
    select.value = rt.parcelId;
    const completed = rt.parcels.filter((parcel) => parcel.endedAt),
      options = completed
        .map(
          (parcel) =>
            `<option value="${safe(parcel.id)}">${safe(parcel.objective.slice(0, 58))} · ${safe(parcel.status)}</option>`,
        )
        .join("");
    $("runtime-compare-left").innerHTML = options;
    $("runtime-compare-right").innerHTML = options;
    rt.compareRight = completed.some((parcel) => parcel.id === rt.compareRight)
      ? rt.compareRight
      : (completed.find((parcel) => parcel.id === rt.parcelId)?.id ??
        completed[0]?.id ??
        "");
    rt.compareLeft = completed.some((parcel) => parcel.id === rt.compareLeft)
      ? rt.compareLeft
      : (completed.find((parcel) => parcel.id !== rt.compareRight)?.id ??
        rt.compareRight);
    if (rt.compareLeft === rt.compareRight && completed.length > 1) {
      rt.compareRight =
        completed.find((parcel) => parcel.id === rt.parcelId)?.id ??
        completed[0].id;
      rt.compareLeft =
        completed.find((parcel) => parcel.id !== rt.compareRight)?.id ??
        rt.compareRight;
    }
    $("runtime-compare-left").value = rt.compareLeft;
    $("runtime-compare-right").value = rt.compareRight;
  }
  function replayAt() {
    if (rt.mode !== "replay" || !rt.projection?.range.startedAt) return "";
    const start = Date.parse(rt.projection.range.startedAt),
      end = Date.parse(rt.projection.range.endedAt || rt.projection.observedAt),
      ratio = Number($("runtime-replay").value) / 1000;
    return new Date(start + (end - start) * ratio).toISOString();
  }
  async function load() {
    if (!rt.active) return;
    try {
      if (rt.surface === "estate") {
        const previous = rt.projection;
        rt.projection = await get(new URL(location.href).searchParams.get('presentation')==='public'?'/api/estate-map?privacy=public':'/api/estate-map');
        rt.estateProjection = rt.projection;
        if (!previous || previous.parcelId !== rt.projection.parcelId) {
          rt.collapsed.clear();
          rt.autoClustered = false;
          if(!rt.projection.nodes.some(n=>n.id===rt.selected))rt.selected = null;
          if(!rt.selected)for(const node of rt.projection.nodes)if(node.detail?.nestedEnvironmentCount>0)rt.collapsed.add(node.id);
        }
        if (rt.projection.nodes.length > 30 && !rt.autoClustered) {
          for (const node of rt.projection.nodes)
            if (node.detail?.projectionGroup === true) rt.collapsed.add(node.id);
          rt.autoClustered = true;
        }
        render();
        return;
      }
      if(rt.runId) {rt.projection=await get(`/api/runtime-map?runId=${encodeURIComponent(rt.runId)}`);rt.processProjection=rt.projection;render();return;}
      await loadParcels();
      if (rt.mode === "compare") {
        await loadComparison();
        return;
      }
      if (!rt.parcelId) {
        empty("No Work Parcels have authoritative runtime records yet.");
        return;
      }
      const at = replayAt(),
        query = new URLSearchParams({
          parcelId: rt.parcelId,
          ...(at ? { at } : {}),
        }),
        previous = rt.projection;
      rt.projection = await get(`/api/runtime-map?${query}`);
      rt.processProjection = rt.projection;
      if (!previous || previous.parcelId !== rt.projection.parcelId) {
        rt.collapsed.clear();
        rt.autoClustered = false;
      }
      if (rt.projection.nodes.length > 30 && !rt.autoClustered) {
        for (const node of rt.projection.nodes)
          if (
            (node.type === "parallel-lane" || node.type === "job") &&
            rt.projection.nodes.some((child) => child.parentId === node.id)
          )
            rt.collapsed.add(node.id);
        rt.autoClustered = true;
      }
      render();
    } catch (error) {
      empty(error.message || String(error));
    }
  }
  async function loadComparison() {
    if (!rt.compareLeft || !rt.compareRight) {
      empty("Two completed Work Parcels are required for graphical comparison.");
      return;
    }
    const leftQuery = new URLSearchParams({ parcelId: rt.compareLeft }),
      rightQuery = new URLSearchParams({ parcelId: rt.compareRight }),
      compareQuery = new URLSearchParams({
        left: rt.compareLeft,
        right: rt.compareRight,
      }),
      [left, right, difference] = await Promise.all([
        get(`/api/runtime-map?${leftQuery}`),
        get(`/api/runtime-map?${rightQuery}`),
        get(`/api/runtime-map/compare?${compareQuery}`),
      ]);
    rt.comparison = { left, right, difference };
    rt.projection = right;
    rt.processProjection = right;
    render();
  }
  function empty(message) {
    $("runtime-map-health").className = "runtime-map-health disconnected";
    $("runtime-map-health").textContent = message;
    $("runtime-map-canvas").innerHTML =
      `<div class="runtime-map-empty">${safe(message)}</div>`;
  }
  function visibleNodes() {
    const all = rt.projection.nodes;
    return all.filter(
      (node) =>
        (!node.parentId || !ancestorCollapsed(node, all)) &&
        (rt.surface !== "estate" ||
          ((rt.filter === "ALL" ||
            node.type === rt.filter ||
            node.type === "estate") &&
            (!rt.search ||
              `${node.label} ${node.subtitle || ""} ${JSON.stringify(node.detail || {})}`
                .toLowerCase()
                .includes(rt.search.toLowerCase())))),
    );
  }
  function ancestorCollapsed(node, all) {
    let parent = node.parentId;
    while (parent) {
      if (rt.collapsed.has(parent)) return true;
      parent = all.find((n) => n.id === parent)?.parentId;
    }
    return false;
  }
  function layout(nodes, edges) {
    const byId = new Map(nodes.map((n) => [n.id, n])),
      depth = new Map(nodes.map((n) => [n.id, 0]));
    for (let i = 0; i < nodes.length; i++)
      for (const e of edges) {
        if (!byId.has(e.from) || !byId.has(e.to)) continue;
        depth.set(
          e.to,
          Math.max(depth.get(e.to) || 0, (depth.get(e.from) || 0) + 1),
        );
      }
    const columns = new Map();
    for (const n of nodes) {
      const d = Math.min(depth.get(n.id) || 0, 12),
        row = columns.get(d) || [];
      row.push(n);
      columns.set(d, row);
    }
    const positions = new Map(),
      ordered = [...columns.entries()].sort(([left], [right]) => left - right),
      maximumRows = rt.surface === "estate" ? 8 : Infinity;
    let horizontalColumn = 0,
      widestRow = 0;
    for (const [, row] of ordered) {
      const layerColumns = Math.max(1, Math.ceil(row.length / maximumRows));
      row.forEach((n, i) =>
        positions.set(n.id, {
          x: 36 + (horizontalColumn + Math.floor(i / maximumRows)) * (rt.surface === "estate" ? 210 : 244),
          y: 36 + (i % maximumRows) * 112,
        }),
      );
      horizontalColumn += layerColumns;
      widestRow = Math.max(widestRow, Math.min(row.length, maximumRows));
    }
    return {
      positions,
      width: Math.max(900, horizontalColumn * (rt.surface === "estate" ? 210 : 244) + 80),
      height: Math.max(520, widestRow * 112 + 80),
    };
  }
  function render() {
    const p = rt.projection,
      stale = p.freshness.state === "STALE";
    let physicalPicker=$("runtime-physical-picker");
    if(!physicalPicker){physicalPicker=document.createElement('nav');physicalPicker.id='runtime-physical-picker';physicalPicker.setAttribute('aria-label','Physical nodes');$("runtime-map-canvas").before(physicalPicker);}
    physicalPicker.hidden=rt.surface!=='estate';
    if(rt.surface==='estate')physicalPicker.innerHTML=p.nodes.filter(n=>['machine','device'].includes(n.type)).map(n=>`<button class="button secondary" data-obs-node="${safe(n.id)}">${safe(n.label)} · ${safe(n.detail.nestedEnvironmentSummary||n.state)}</button>`).join('');

    $("runtime-map-health").className =
      `runtime-map-health ${p.freshness.state.toLowerCase()}`;
    $("runtime-map-health").innerHTML =
      `<strong>${safe(rt.surface === "estate" ? "ESTATE" : p.mode)} · ${safe(p.freshness.state)}</strong><span>${safe(p.parcelId)} · authoritative ${safe(p.freshness.lastAuthoritativeAt ? new Date(p.freshness.lastAuthoritativeAt).toLocaleTimeString() : "unavailable")}</span>${stale ? `<b>${rt.surface === "estate" ? "Known resources are stale or not currently verified; discovery is not proof of availability." : "Dashboard data is stale; execution authority is unaffected."}</b>` : ""}`;
    $("runtime-map-summary").textContent =
      `${p.summary.running} active · ${p.summary.waiting} waiting/stale · ${p.summary.succeeded} healthy/succeeded · ${p.summary.degraded} degraded · ${p.summary.failed} failed · ${rt.surface === "estate" ? p.estateCounts?.resources?.total??0 : p.summary.nodes} ${rt.surface === "estate" ? "native resources" : "operations"}`;
    $("runtime-map-title").textContent =
      rt.surface === "estate" ? "Estate Map" : "Process Map";
    $("runtime-map-eyebrow").textContent =
      rt.surface === "estate"
        ? "Live governed resource topology"
        : "Authoritative governed execution";
    $("runtime-map-description").textContent =
      rt.surface === "estate"
        ? "WHAT CAN AGENT CONTROL SEE AND USE RIGHT NOW? Alive requires recent, resource-appropriate evidence."
        : "WHAT IS AGENT CONTROL DOING RIGHT NOW? Executive map at the top; engineering evidence at the bottom. WATCH is read-only.";
    $("runtime-parcel-field").hidden =
      rt.surface === "estate" || rt.mode === "compare";
    $("runtime-compare-controls").hidden =
      rt.surface === "estate" || rt.mode !== "compare";
    $("runtime-search-field").hidden = rt.surface !== "estate";
    $("runtime-filter-field").hidden = rt.surface !== "estate";
    if (rt.surface === "estate") {
      const filter = $("runtime-filter"),
        prior = rt.filter,
        types = [
          ...new Set(
            p.nodes
              .map((node) => node.type)
              .filter((type) => type !== "estate"),
          ),
        ].sort();
      filter.innerHTML = `<option value="ALL">All resources</option>${types.map((type) => `<option value="${safe(type)}">${safe(type.replaceAll("-", " "))}</option>`).join("")}`;
      filter.value = types.includes(prior) ? prior : "ALL";
      rt.filter = filter.value;
    }
    let picker=$('estate-job-picker');
    if(!picker){picker=document.createElement('select');picker.id='estate-job-picker';picker.setAttribute('aria-label','Explain job readiness');$('runtime-map-summary').before(picker);picker.addEventListener('change',()=>{if(!picker.value){rt.focusIds=null;rt.selected=null;render();return;}focusJob(rt.projection.nodes.find(n=>n.id===picker.value));});}
    picker.hidden=rt.surface!=='estate';
    if(rt.surface==='estate'){picker.innerHTML='<option value="">All estate resources · choose a job to explain readiness</option>'+p.nodes.filter(n=>n.id.startsWith('library-job:')).map(n=>`<option value="${safe(n.id)}">${safe(n.label)} · ${n.detail.operationalReady?'READY':safe(n.detail.technicalReadiness)}</option>`).join('');picker.value=rt.focusIds&&rt.selected?.startsWith('library-job:')?rt.selected:'';}
    const heartbeat = $("runtime-estate-heartbeat");
    heartbeat.hidden = rt.surface !== "estate";
    const processKpis = $("runtime-process-kpis");
    processKpis.hidden = rt.surface === "estate";
    if (rt.surface !== "estate") renderProcessKpis();
    if (rt.surface === "estate") {
      const c=p.estateCounts||{},cards=Object.entries(c).filter(([key])=>!['jobs','blockers'].includes(key)).map(([key,value])=>[key,typeof value==='object'?`${value.alive} / ${value.total}`:value]);
      if(c.jobs)cards.push(['jobs READY now',`${c.jobs.operationalReady} / ${c.jobs.total}`],['catalogue capable',c.jobs.catalogueCapable]);
      heartbeat.innerHTML=cards.map(([label,value])=>`<article><span>${safe(label)}</span><strong>${safe(value)}</strong></article>`).join('');
    }
    document.querySelector(".runtime-replay-control").hidden =
      rt.mode !== "replay";
    if (rt.mode === "replay")
      $("runtime-replay-time").textContent = new Date(
        p.replayAt,
      ).toLocaleTimeString();
    const stage = document.querySelector(".runtime-map-stage");
    stage.classList.toggle("compare-active", rt.mode === "compare");
    document.querySelector(".runtime-map-layout")?.classList.toggle("nested-estate-expanded",rt.surface==='estate'&&p.nodes.some(n=>n.detail?.nestedEnvironmentCount>0&&!rt.collapsed.has(n.id)));
    $("runtime-map-canvas").hidden = ["control", "compare"].includes(rt.mode);
    $("runtime-control-room").hidden = rt.mode !== "control";
    $("runtime-compare").hidden = rt.mode !== "compare";
    if (rt.mode === "control") {
      renderControl();
      return;
    }
    if (rt.mode === "compare") {
      renderCompare();
      return;
    }
    renderGraph();
    if (rt.selected) inspect(p.nodes.find((n) => n.id === rt.selected));
    else {
      $("runtime-breadcrumbs").textContent = rt.surface === "estate" ? "Estate Map" : "Process Map";
      $("runtime-inspector").innerHTML=rt.surface==="estate"?"<h2>Estate readiness</h2><p>Green: current and usable. Orange: alive with qualification or configuration gaps. Red: current expected failure. Grey: stale, offline or unverified.</p><p>Select a resource for evidence and job impact, or choose a job to inspect WHY READY / WHY NOT READY.</p>":"<p>Select an operation to inspect its recorded evidence.</p>";
    }
  }
  function renderProcessKpis() {
    const p = rt.projection,
      jobs = p.nodes.filter((node) => node.type === "job"),
      lanes = p.nodes.filter((node) => node.type === "parallel-lane"),
      roots = lanes.filter((node) => !node.detail.dependsOn?.length),
      active = roots.filter((node) => node.state === "RUNNING"),
      attention = p.nodes.find((node) =>
        ["FAILED", "BLOCKED", "DEGRADED"].includes(node.state),
      ),
      aggregation = p.nodes.find((node) => node.type === "aggregation"),
      latest = p.events.at(-1),
      cards = [
        ["Parallel work", `${active.length} / ${roots.length}`, `${lanes.length} total governed stages`, active.length ? "is-running" : ""],
        ["Completed", jobs.filter((node) => node.state === "SUCCEEDED").length, `${p.summary.waiting} operations waiting`, ""],
        ["Attention", attention ? attention.state : "CLEAR", attention?.label ?? "No failed or degraded operation", attention ? "is-degraded" : ""],
        ["Aggregation", aggregation?.state ?? "NOT REQUIRED", aggregation?.subtitle ?? "Single execution path", aggregation?.state === "RUNNING" ? "is-running" : ""],
        ["Latest transition", latest ? new Date(latest.at).toLocaleTimeString() : "NONE", latest?.summary ?? "No authoritative event yet", ""],
      ];
    $("runtime-process-kpis").innerHTML = cards
      .map(
        ([label, value, note, className]) =>
          `<article class="${safe(className)}"><span>${safe(label)}</span><strong>${safe(value)}</strong><small title="${safe(note)}">${safe(note)}</small></article>`,
      )
      .join("");
  }
  function causalEdges(p,ids) {
    const edges=p.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
    if(!rt.focusIds)return edges;
    // Reverse a containment arrow only in the focused view, retaining its real evidence.
    return edges.map(e=>{const child=p.nodes.find(n=>n.id===e.to);return child?.detail.deviceId===e.from&&child.type!=='transport'?{...e,from:e.to,to:e.from,label:'hosted on device'}:e;});
  }
  function focusJob(node) {
    const ids=new Set([node.id]);
    for(const e of rt.projection.edges)if(e.from===node.id)ids.add(e.to);
    for(const e of rt.projection.edges)if(ids.has(e.from)&&e.from.startsWith('library-capability:'))ids.add(e.to);
    for(const id of [...ids]) {const n=rt.projection.nodes.find(n=>n.id===id);if(n?.detail.deviceId)ids.add(n.detail.deviceId);}
    for(const n of rt.projection.nodes)if(n.type==='transport'&&ids.has(n.detail.deviceId))ids.add(n.id);
    rt.focusIds=ids;rt.filter='ALL';rt.search='';rt.collapsed.clear();rt.selected=node.id;render();
  }
  function renderGraph() {
    const process = rt.surface === "process";
    $("runtime-map-canvas").classList.toggle("process-readable", process);
    $("runtime-fit").hidden = process;
    if (process) { renderReadableProcess(); return; }
    const p = rt.projection,
      nodes = visibleNodes().filter(n=>rt.focusIds?rt.focusIds.has(n.id):rt.surface!=="estate"||!n.id.startsWith("library-")),
      ids = new Set(nodes.map((n) => n.id)),
      edges = causalEdges(p,ids),
      map = layout(nodes, edges),
      canvas = $("runtime-map-canvas"),
      viewWidth = map.width / rt.scale,
      viewHeight = map.height / rt.scale;
    canvas.innerHTML = `<svg class="runtime-map-world" viewBox="${-rt.panX} ${-rt.panY} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Governed execution topology">${edges
      .map((e) => {
        const a = map.positions.get(e.from),
          b = map.positions.get(e.to);
        if (!a || !b) return "";
        const x1 = a.x + 184,
          y1 = a.y + 34,
          x2 = b.x,
          y2 = b.y + 34,
          m = (x1 + x2) / 2;
        return `<path class="runtime-edge state-${safe(e.state)} kind-${safe(e.kind)} ${rt.selected === e.id ? "selected" : ""}" data-runtime-edge="${safe(e.id)}" d="M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}"><title>${safe(e.label || e.kind)}</title></path>`;
      })
      .join("")}${nodes
      .map((n) => {
        const pos = map.positions.get(n.id),
          children = p.nodes.filter((x) => x.parentId === n.id).length;
        return `<g class="runtime-graph-node type-${safe(n.type)} state-${safe(n.state)} estate-${safe(n.detail.colour||"")} ${rt.selected === n.id ? "selected" : ""}" transform="translate(${pos.x} ${pos.y})" data-runtime-node="${safe(n.id)}" role="button" tabindex="0" aria-label="${safe(n.label)}, ${safe(n.detail.nestedEnvironmentSummary||n.state)}"><rect width="184" height="76" rx="10"/><text class="runtime-node-icon" x="13" y="25">${safe(icons[n.type] || "◇")}</text><text class="runtime-node-label" x="42" y="22">${safe(short(n.label, 21))}</text><text class="runtime-node-subtitle" x="42" y="42">${safe(short(n.subtitle || n.type, 24))}</text><text class="runtime-node-status" x="13" y="64">${safe(n.detail.nestedEnvironmentSummary||n.detail.markers?.length&&n.detail.markers.join(" · ")||n.detail.availability||n.state)}</text>${children ? `<text class="runtime-node-collapse" x="150" y="64" data-runtime-collapse="${safe(n.id)}">${rt.collapsed.has(n.id) ? "+" : "−"} ${children}</text>` : ""}</g>`;
      })
      .join("")}</svg>`;
    canvas.querySelectorAll("[data-runtime-node]").forEach((button) =>
      button.addEventListener("click", (event) => {
        const collapse = event.target.closest("[data-runtime-collapse]");
        if (collapse) {
          event.stopPropagation();
          const id = collapse.dataset.runtimeCollapse;
          rt.collapsed.has(id) ? rt.collapsed.delete(id) : rt.collapsed.add(id);
          renderGraph();
          return;
        }
        rt.selected = button.dataset.runtimeNode;
        inspect(p.nodes.find((n) => n.id === rt.selected));
        renderGraph();
      }),
    );
    canvas.querySelectorAll("[data-runtime-edge]").forEach((path) =>
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        rt.selected = path.dataset.runtimeEdge;
        inspectEdge(p.edges.find((edge) => edge.id === rt.selected));
        renderGraph();
      }),
    );
  }
  function renderReadableProcess() {
    const p = rt.projection, canvas = $("runtime-map-canvas");
    // Names and directed relationships stay at reading size on every viewport.
    // Position is not execution order: only recorded edges establish a relation.
    const rank = {request:0, planner:1, "work-parcel":2, job:3, "parallel-lane":4, terminal:5, "model-call":6};
    const nodes = visibleNodes().slice().sort((a,b)=>(rank[a.type]??7)-(rank[b.type]??7) || a.id.localeCompare(b.id));
    const number = new Map(p.nodes.slice().sort((a,b)=>(rank[a.type]??7)-(rank[b.type]??7) || a.id.localeCompare(b.id)).map((n,i)=>[n.id,i+1]));
    const count = value => typeof value === "number" ? value.toLocaleString() : "Unknown";
    const active = document.activeElement?.dataset.runtimeNode;
    const markup = `<p class="process-map-help">Select a bubble for its evidence and live session. Numbered arrows name the recorded connections; card position does not imply execution order.</p><div class="process-bubbles">${nodes.map(n=>{
      const detail=n.detail||{}, t=detail.telemetry||detail.usage||(n.type==="model-call"?detail:null);
      const edges=p.edges.filter(e=>e.from===n.id || e.to===n.id);
      const relation=e=>{
        const outgoing=e.from===n.id, target=p.nodes.find(x=>x.id===(outgoing?e.to:e.from));
        return `<button type="button" class="process-relation" data-process-target="${safe(target?.id||"")}" data-process-edge="${safe(e.id)}"><span>${outgoing?"→":"←"} ${safe(e.label||e.kind)}</span><strong>${number.get(target?.id)||"?"}. ${safe(target?.label||"Unavailable node")}</strong></button>`;
      };
      return `<article class="process-bubble state-${safe(n.state)} ${rt.selected===n.id?"selected":""}"><button type="button" class="process-bubble-main" data-runtime-node="${safe(n.id)}" aria-pressed="${rt.selected===n.id}"><span class="process-bubble-heading"><b>${number.get(n.id)} · ${safe(n.type.replaceAll("-"," "))}</b><span>${safe(n.state)}</span></span><strong>${safe(n.label)}</strong><span>${safe(n.subtitle||detail.objective||n.type)}</span>${t?`<dl class="process-bubble-tokens"><div><dt>Input</dt><dd>${count(t.inputTokens)}</dd></div><div><dt>Cached input</dt><dd>${count(t.cachedInputTokens)}</dd></div><div><dt>Output</dt><dd>${count(t.outputTokens)}</dd></div></dl><small>Reported counters update when a call finishes.</small>`:""}${n.type==="terminal"?`<small>Session ${safe(detail.sessionId)} · ${n.state==="RUNNING"?"Select to watch live":"Select for transcript"}</small>`:""}</button><div class="process-connections" aria-label="Recorded connections">${edges.map(relation).join("")||"No recorded connections."}</div></article>`;
    }).join("")}</div>`;
    if(canvas.processMarkup===markup && canvas.querySelector('.process-bubbles'))return;
    canvas.processMarkup=markup;canvas.innerHTML=markup;
    canvas.querySelectorAll("[data-runtime-node]").forEach(button=>button.addEventListener("click",()=>{
      rt.selected=button.dataset.runtimeNode;renderReadableProcess();inspect(p.nodes.find(n=>n.id===rt.selected));
      if(matchMedia("(max-width: 1000px)").matches)$("runtime-inspector").scrollIntoView({block:"start",behavior:"instant"});
    }));
    canvas.querySelectorAll("[data-process-target]").forEach(button=>button.addEventListener("click",()=>{
      const node=p.nodes.find(n=>n.id===button.dataset.processTarget);if(!node)return;
      rt.selected=node.id;uncollapseAncestors(node,p);renderReadableProcess();inspect(node);
      canvas.querySelector(`[data-runtime-node="${CSS.escape(node.id)}"]`)?.scrollIntoView({block:"center",behavior:"instant"});
    }));
    if(active)canvas.querySelector(`[data-runtime-node="${CSS.escape(active)}"]`)?.focus({preventScroll:true});
  }
  function leaderNodes(projection) {
    const types = new Set([
      "request",
      "poe",
      "planner",
      "work-parcel",
      "parallel-lane",
      "aggregation",
      "result",
    ]);
    return projection.nodes.filter((node) => types.has(node.type));
  }
  function compareGraph(projection, side) {
    const nodes = leaderNodes(projection),
      ids = new Set(nodes.map((node) => node.id)),
      edges = projection.edges.filter(
        (edge) => ids.has(edge.from) && ids.has(edge.to),
      ),
      map = layout(nodes, edges);
    return `<div class="runtime-compare-viewport" data-runtime-compare-viewport="${safe(side)}"><svg class="runtime-map-world" width="${map.width}" height="${map.height}" viewBox="0 0 ${map.width} ${map.height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${safe(side)} authoritative process topology">${edges
      .map((edge) => {
        const a = map.positions.get(edge.from),
          b = map.positions.get(edge.to);
        if (!a || !b) return "";
        const x1 = a.x + 184,
          y1 = a.y + 34,
          x2 = b.x,
          y2 = b.y + 34,
          middle = (x1 + x2) / 2;
        return `<path class="runtime-edge state-${safe(edge.state)} kind-${safe(edge.kind)}" d="M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}"><title>${safe(edge.label || edge.kind)}</title></path>`;
      })
      .join("")}${nodes
      .map((node) => {
        const position = map.positions.get(node.id);
        return `<g class="runtime-graph-node type-${safe(node.type)} state-${safe(node.state)}" transform="translate(${position.x} ${position.y})"><rect width="184" height="76" rx="10"/><text class="runtime-node-icon" x="13" y="25">${safe(icons[node.type] || "◇")}</text><text class="runtime-node-label" x="42" y="22">${safe(short(node.label, 21))}</text><text class="runtime-node-subtitle" x="42" y="42">${safe(short(node.subtitle || node.type, 24))}</text><text class="runtime-node-status" x="13" y="64">${safe(node.state)}</text></g>`;
      })
      .join("")}</svg></div>`;
  }
  function signed(value, unit = "") {
    if (value === null || value === undefined) return "unavailable";
    return `${value > 0 ? "+" : ""}${Number(value).toLocaleString()}${unit}`;
  }
  function renderCompare() {
    const value = rt.comparison;
    if (!value) {
      $("runtime-compare").innerHTML =
        '<div class="runtime-map-empty">Select two completed Work Parcels.</div>';
      return;
    }
    const compactDifference = (values, prefix) => {
        const visible = values.slice(0, 6),
          remaining = Math.max(0, values.length - visible.length);
        return values.length
          ? `<code>${prefix} ${safe(visible.map((item) => short(item, 72)).join(`\n${prefix} `))}${remaining ? `\n… ${remaining} more authoritative difference${remaining === 1 ? "" : "s"}` : ""}</code>`
          : "";
      },
      { left, right, difference } = value,
      facetRows = Object.entries(difference.facets)
        .filter(([, facet]) => facet.added.length || facet.removed.length)
        .map(
          ([name, facet]) =>
            `<article><header><strong>${safe(name)}</strong><span>+${facet.added.length} / −${facet.removed.length}</span></header>${compactDifference(facet.added, "Candidate +")}${compactDifference(facet.removed, "Baseline −")}</article>`,
        )
        .join("");
    $("runtime-compare").innerHTML =
      `<section class="runtime-compare-summary"><article><span>Topology</span><strong>${signed(difference.deltas.nodes)} nodes · ${signed(difference.deltas.edges)} edges</strong></article><article><span>Duration</span><strong>${signed(difference.deltas.durationMs, " ms")}</strong></article><article><span>Model / cache / memory</span><strong>${signed(difference.deltas.modelCalls)} · ${signed(difference.deltas.cacheOperations)} · ${signed(difference.deltas.memoryOperations)}</strong></article><article><span>Batons / retries / failures</span><strong>${signed(difference.deltas.batons)} · ${signed(difference.deltas.retries)} · ${signed(difference.deltas.failures)}</strong></article><article><span>Tokens / cost</span><strong>${signed(difference.deltas.totalTokens)} · ${signed(difference.deltas.cost)}</strong></article></section><section class="runtime-compare-graphs"><article class="runtime-compare-card"><header><strong>BASELINE · ${safe(left.parcelId)}</strong><small>${left.summary.nodes} operations · ${safe(left.freshness.state)}</small></header>${compareGraph(left, "baseline")}</article><article class="runtime-compare-card"><header><strong>CANDIDATE · ${safe(right.parcelId)}</strong><small>${right.summary.nodes} operations · ${safe(right.freshness.state)}</small></header>${compareGraph(right, "candidate")}</article></section><section class="runtime-compare-differences"><h3>Evidence-identity differences</h3><p>${safe(difference.identity.note)}</p><div class="runtime-compare-facets">${facetRows || "<article><strong>No authoritative facet difference recorded.</strong></article>"}</div></section>`;
    const viewports = [
      ...$("runtime-compare").querySelectorAll(
        "[data-runtime-compare-viewport]",
      ),
    ];
    for (const viewport of viewports)
      viewport.addEventListener("scroll", () => {
        if (viewport.dataset.syncing === "true") return;
        const other = viewports.find((candidate) => candidate !== viewport);
        if (!other) return;
        const xMaximum = viewport.scrollWidth - viewport.clientWidth,
          yMaximum = viewport.scrollHeight - viewport.clientHeight;
        other.dataset.syncing = "true";
        other.scrollLeft = xMaximum
          ? (viewport.scrollLeft / xMaximum) *
            (other.scrollWidth - other.clientWidth)
          : 0;
        other.scrollTop = yMaximum
          ? (viewport.scrollTop / yMaximum) *
            (other.scrollHeight - other.clientHeight)
          : 0;
        requestAnimationFrame(() => delete other.dataset.syncing);
      });
  }
  function short(value, maximum) {
    const text = String(value ?? "");
    return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
  }
  function evidenceList(items) {
    return items?.length
      ? items
          .map(
            (e) =>
              `<li><b>${safe(e.kind)}</b> ${safe(e.id)}${e.sha256 ? `<code>${safe(e.sha256)}</code>` : ""}</li>`,
          )
          .join("")
      : "<li>No evidence reference reported.</li>";
  }
  function detailLabel(key){return key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');}
  function detailValue(value,depth=0){
    if(value===null||value===undefined)return 'Not reported';
    if(typeof value!=='object')return safe(value);
    if(depth>2)return `<details><summary>Full evidence</summary><pre>${safe(JSON.stringify(value,null,2))}</pre></details>`;
    if(Array.isArray(value))return value.length?`<ul>${value.map(item=>`<li>${detailValue(item,depth+1)}</li>`).join('')}</ul>`:'None recorded';
    return `<ul class="runtime-detail-values">${Object.entries(value).map(([key,item])=>`<li><strong>${safe(detailLabel(key))}:</strong> ${detailValue(item,depth+1)}</li>`).join('')}</ul>`;
  }
  function inspect(node) {
    if (!node) {
      rt.selected = null;
      $("runtime-breadcrumbs").textContent = "Runtime Map";
      return;
    }
    $("runtime-breadcrumbs").innerHTML =
      `<button data-runtime-back>Runtime Map</button> › ${safe(node.type)} › <strong>${safe(node.label)}</strong>`;
    const detail = Object.entries(node.detail || {})
        .map(
          ([k, v]) =>
            `<dt>${safe(detailLabel(k))}</dt><dd>${detailValue(v)}</dd>`,
        )
        .join(""),
      session = node.type === "terminal" ? node.detail.sessionId : null;
    const children = rt.projection.nodes.filter(
        (candidate) => candidate.parentId === node.id,
      ).length,
      resource = node.detail?.resourceIdentity || node.detail?.estateResourceIds?.length,
      parent = node.parentId
        ? rt.projection.nodes.find((candidate) => candidate.id === node.parentId)
        : null;
    $("runtime-inspector").innerHTML =
      `<header><span class="runtime-node-state state-${safe(node.state)}">${safe(icons[node.type] || "◇")} ${safe(node.state)}</span><h2>${safe(node.label)}</h2><p>${safe(node.subtitle || node.type)}</p></header><div class="runtime-inspector-actions">${children ? `<button class="button secondary" data-runtime-expand="${safe(node.id)}">${rt.collapsed.has(node.id) ? "Expand branch" : "Collapse branch"} · ${children}</button>` : ""}${parent ? `<button class="button secondary" data-runtime-parent="${safe(parent.id)}">Up to ${safe(parent.label)}</button>` : ""}${session ? `<button class="button" data-runtime-session="${safe(session)}">${node.state === "RUNNING" ? "Watch live session" : "Open recorded transcript"}</button>` : ""}${rt.surface === "process" && resource ? '<button class="button secondary" data-runtime-resource>View Estate resource</button>' : ""}${rt.surface === "estate" && rt.parcelId ? '<button class="button secondary" data-runtime-work>View current work</button>' : ""}</div><div id="estate-readiness-explanation"></div><dl>${detail}</dl><h3>Authoritative evidence</h3><ul class="runtime-evidence">${evidenceList(node.evidence)}</ul>`;
    const explanation=$("estate-readiness-explanation"),gaps=node.detail.blockers||[],runIds=node.detail.processRunIds||[];
    explanation.innerHTML=`${node.id.startsWith('library-job:')?`<h3>${node.detail.operationalReady?'WHY READY':'WHY NOT READY'}</h3><button class="button secondary" data-causal-focus>Show requirement chain</button>`:''}${gaps.length?`<ul>${gaps.map(g=>`<li><strong>${safe(g.code)}</strong> · ${safe(g.requirement)}<p>${safe(g.explanation)}</p><small>Proposed next action: ${safe(g.nextAction)}</small></li>`).join('')}</ul>`:''}${runIds.map(id=>`<button class="button secondary" data-process-run="${safe(id)}">Show in Process Map · ${safe(id)}</button>`).join('')}${(node.detail.jobLibrary?.jobsDependingOn||[]).map(id=>`<button class="button secondary" data-library-job="${safe(id)}">Why ${safe(id)}?</button>`).join('')}${(node.detail.estateResourceIds||[]).map(id=>`<button class="button secondary" data-estate-id="${safe(id)}">Show in Estate Map · ${safe(id)}</button>`).join('')}`;
    const usage=document.createElement('button');usage.className='button secondary';usage.textContent='Show usage';usage.onclick=()=>window.AgentControlUsage?.open(rt.surface==='estate'?'machine':'parcel',rt.surface==='estate'?(node.detail.estateResourceIds?.[0]||node.id):rt.parcelId);document.querySelector('.runtime-inspector-actions')?.append(usage);
    explanation.querySelectorAll('[data-library-job]').forEach(b=>b.addEventListener('click',()=>focusJob(rt.projection.nodes.find(n=>n.id===`library-job:${b.dataset.libraryJob}`))));
    explanation.querySelector('[data-causal-focus]')?.addEventListener('click',()=>{
      focusJob(node);
    });
    explanation.querySelectorAll('[data-process-run]').forEach(b=>b.addEventListener('click',async()=>{rt.runId=b.dataset.processRun;rt.surface='process';rt.mode='map';rt.focusIds=null;rt.selected=null;surfaceButtons();modeButtons();await load();}));
    explanation.querySelectorAll('[data-estate-id]').forEach(b=>b.addEventListener('click',()=>openEstate(b.dataset.estateId)));
    $("runtime-breadcrumbs")
      .querySelector("[data-runtime-back]")
      .addEventListener("click", () => {
        rt.selected = null;
        rt.focusIds=null;
        inspect(null);
        renderGraph();
      });
    $("runtime-inspector")
      .querySelector("[data-runtime-session]")
      ?.addEventListener("click", () => {
        const id = session,
          button = document.querySelector(
            `[data-live-shell-open="${CSS.escape(id)}"], [data-live-shell-transcript-open="${CSS.escape(id)}"]`,
          );
        if (button) button.click();
        else
          toast(
            "Execution Session is recorded but not currently projected in Live Shell.",
          );
      });
    $("runtime-inspector")
      .querySelector("[data-runtime-expand]")
      ?.addEventListener("click", () => {
        rt.collapsed.has(node.id)
          ? rt.collapsed.delete(node.id)
          : rt.collapsed.add(node.id);
        inspect(node);
        renderGraph();
      });
    $("runtime-inspector")
      .querySelector("[data-runtime-parent]")
      ?.addEventListener("click", (event) => {
        rt.selected = event.currentTarget.dataset.runtimeParent;
        inspect(rt.projection.nodes.find((item) => item.id === rt.selected));
        renderGraph();
      });
    $("runtime-inspector")
      .querySelector("[data-runtime-resource]")
      ?.addEventListener("click", () => viewEstateResource(node));
    $("runtime-inspector")
      .querySelector("[data-runtime-work]")
      ?.addEventListener("click", () => viewCurrentWork(node));
  }
  function exactResourceMatch(identity, estateNode) {
    const detail = estateNode.detail || {},
      sameNode = !identity.nodeId || detail.nodeId === identity.nodeId,
      configured = detail.configuredId;
    if (!sameNode) return false;
    if (identity.modelId && estateNode.type === "model")
      return configured === identity.modelId;
    if (identity.providerId && estateNode.type === "provider")
      return configured === identity.providerId;
    if (identity.workerId && estateNode.type === "worker")
      return configured === identity.workerId;
    return false;
  }
  function uncollapseAncestors(node, projection) {
    let parent = node?.parentId;
    while (parent) {
      rt.collapsed.delete(parent);
      parent = projection.nodes.find((candidate) => candidate.id === parent)
        ?.parentId;
    }
  }
  async function viewEstateResource(node) {
    if(node.detail.estateResourceIds?.length){await openEstate(node.detail.estateResourceIds[0]);return;}
    const identity = node.detail.resourceIdentity || {};
    rt.estateProjection = await get(new URL(location.href).searchParams.get('presentation')==='public'?'/api/estate-map?privacy=public':'/api/estate-map');
    const target =
      rt.estateProjection.nodes.find((candidate) =>
        exactResourceMatch(identity, candidate),
      ) ??
      rt.estateProjection.nodes.find(
        (candidate) =>
          ["machine", "device"].includes(candidate.type) &&
          identity.nodeId &&
          candidate.detail.nodeId === identity.nodeId,
      );
    if (!target) {
      toast("No exact Estate identity is present in the latest discovery record.");
      return;
    }
    rt.surface = "estate";
    rt.mode = "map";
    rt.projection = rt.estateProjection;
    rt.selected = target.id;
    uncollapseAncestors(target, rt.projection);
    surfaceButtons();
    modeButtons();
    render();
  }
  async function viewCurrentWork(node) {
    if (!rt.parcelId) {
      toast("No current Work Parcel is selected.");
      return;
    }
    const query = new URLSearchParams({ parcelId: rt.parcelId });
    rt.processProjection =
      rt.processProjection ?? (await get(`/api/runtime-map?${query}`));
    const identity = {
      nodeId: node.detail.nodeId,
      ...(node.detail.configuredId && node.type === "model"
        ? { modelId: node.detail.configuredId }
        : {}),
      ...(node.detail.configuredId && node.type === "provider"
        ? { providerId: node.detail.configuredId }
        : {}),
      ...(node.detail.configuredId && node.type === "worker"
        ? { workerId: node.detail.configuredId }
        : {}),
    };
    const candidates = rt.processProjection.nodes.filter((candidate) => {
      const resource = candidate.detail?.resourceIdentity;
      if (!resource) return false;
      if (identity.modelId && resource.modelId !== identity.modelId) return false;
      if (identity.providerId && resource.providerId !== identity.providerId)
        return false;
      if (identity.workerId && resource.workerId !== identity.workerId) return false;
      // A deterministic worker Run can authoritatively identify the globally
      // registered worker without asserting a node. Match that stable identity,
      // but fail closed whenever both projections assert different nodes.
      return (
        !identity.nodeId ||
        !resource.nodeId ||
        resource.nodeId === identity.nodeId
      );
    });
    const target =
      candidates.find((candidate) => candidate.state === "RUNNING") ??
      candidates[0];
    if (!target) {
      toast("No exact current Work Parcel resource identity matches this item.");
      return;
    }
    rt.surface = "process";
    rt.mode = "map";
    rt.projection = rt.processProjection;
    rt.selected = target.id;
    uncollapseAncestors(target, rt.projection);
    surfaceButtons();
    modeButtons();
    render();
  }
  function inspectEdge(edge) {
    if (!edge) return;
    const from = rt.projection.nodes.find((node) => node.id === edge.from),
      to = rt.projection.nodes.find((node) => node.id === edge.to);
    $("runtime-breadcrumbs").innerHTML =
      `<button data-runtime-back>${rt.surface === "estate" ? "Estate Map" : "Process Map"}</button> › connection › <strong>${safe(edge.label || edge.kind)}</strong>`;
    const connection =
      to?.type === "transport"
        ? Object.entries(to.detail || {})
            .map(
              ([key, value]) => `<dt>${safe(key)}</dt><dd>${safe(value)}</dd>`,
            )
            .join("")
        : "";
    $("runtime-inspector").innerHTML =
      `<header><span class="runtime-node-state state-${safe(edge.state)}">⇄ ${safe(edge.state)}</span><h2>${safe(edge.label || edge.kind)}</h2><p>${safe(from?.label || edge.from)} → ${safe(to?.label || edge.to)}</p></header><dl><dt>Relationship</dt><dd>${safe(edge.kind)}</dd><dt>Source</dt><dd>${safe(from?.label || edge.from)}</dd><dt>Destination</dt><dd>${safe(to?.label || edge.to)}</dd>${connection}</dl><h3>Authoritative evidence</h3><ul class="runtime-evidence">${evidenceList(edge.evidence)}</ul>`;
    $("runtime-breadcrumbs").querySelector("[data-runtime-back]").onclick =
      () => {
        rt.selected = null;
        inspect(null);
        renderGraph();
      };
  }
  function renderControl() {
    $("runtime-control-room").innerHTML = rt.projection.controlRoom.length
      ? rt.projection.controlRoom
          .map(
            (tile) =>
              `<button class="runtime-tile state-${safe(tile.state)}" data-runtime-tile="${safe(tile.id)}"><span>${safe(tile.state)}</span><span class="runtime-tile-elapsed">${safe(elapsed(tile.startedAt, tile.state))}</span><strong>${safe(tile.job)}</strong><small>${safe(tile.worker)} · ${safe(tile.model)}</small><p>${safe(tile.activity)}</p><pre>${safe(tile.latestSafeOutput || "No safe session output recorded.")}</pre></button>`,
          )
          .join("")
      : '<div class="runtime-map-empty">No jobs belong to this Work Parcel.</div>';
    $("runtime-control-room")
      .querySelectorAll("[data-runtime-tile]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          rt.mode = "map";
          modeButtons();
          rt.selected = b.dataset.runtimeTile;
          const target = rt.projection.nodes.find(
            (node) => node.id === rt.selected,
          );
          if (target) {
            rt.collapsed.delete(target.id);
            uncollapseAncestors(target, rt.projection);
          }
          render();
        }),
      );
  }
  function elapsed(startedAt, state) {
    if (!startedAt) return "not started";
    const node = rt.projection?.nodes.find(
        (candidate) => candidate.startedAt === startedAt,
      ),
      end = node?.endedAt ? Date.parse(node.endedAt) : Date.now(),
      seconds = Math.max(0, Math.round((end - Date.parse(startedAt)) / 1000));
    return `${state === "RUNNING" ? "live · " : ""}${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  }
  function modeButtons() {
    document
      .querySelectorAll("[data-runtime-mode]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.runtimeMode === rt.mode),
      );
  }
  function surfaceButtons() {
    document
      .querySelectorAll("[data-runtime-surface]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.runtimeSurface === rt.surface,
        ),
      );
    document
      .querySelectorAll(
        '[data-runtime-mode="control"], [data-runtime-mode="replay"], [data-runtime-mode="compare"]',
      )
      .forEach((button) => (button.hidden = rt.surface === "estate"));
  }
  function schedule() {
    clearTimeout(rt.timer);
    rt.timer = setTimeout(() => load(), 250);
  }
  function fit() {
    rt.scale = 1;
    rt.panX = 0;
    rt.panY = 0;
    renderGraph();
  }
  function stopReplay() {
    clearInterval(rt.replayTimer);
    rt.replayTimer = null;
    rt.replayPlaying = false;
    $("runtime-replay-play").textContent = "Play";
    $("runtime-replay-play").setAttribute("aria-pressed", "false");
  }
  function toggleReplay() {
    if (rt.replayPlaying) {
      stopReplay();
      return;
    }
    if (Number($("runtime-replay").value) >= 1000)
      $("runtime-replay").value = "0";
    rt.replayPlaying = true;
    $("runtime-replay-play").textContent = "Pause";
    $("runtime-replay-play").setAttribute("aria-pressed", "true");
    rt.replayTimer = setInterval(() => {
      const next = Math.min(
        1000,
        Number($("runtime-replay").value) + 35,
      );
      $("runtime-replay").value = String(next);
      schedule();
      if (next >= 1000) stopReplay();
    }, 700);
  }
  function activate() {
    rt.active = true;
    (rt.surface === "estate" ? load() : loadParcels().then(load)).catch(
      (error) => empty(error.message),
    );
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("runtime-parcel").addEventListener("change", (e) => {
      rt.observabilityOrigin=null;
      rt.parcelId = e.target.value;
      rt.selected = null;
      load();
    });
    document.querySelectorAll("[data-runtime-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        if (rt.mode === "replay" && b.dataset.runtimeMode !== "replay")
          stopReplay();
        rt.mode = b.dataset.runtimeMode;
        modeButtons();
        load();
      }),
    );
    document.querySelectorAll("[data-runtime-surface]").forEach((button) =>
      button.addEventListener("click", () => {
        rt.focusIds=null;rt.runId="";
      rt.surface = button.dataset.runtimeSurface;
        rt.mode = "map";
        rt.selected = null;
        rt.collapsed.clear();
        stopReplay();
        surfaceButtons();
        modeButtons();
        load();
      }),
    );
    $("runtime-search").addEventListener("input", (event) => {
      rt.search = event.target.value;
      renderGraph();
    });
    $("runtime-filter").addEventListener("change", (event) => {
      rt.filter = event.target.value;
      renderGraph();
    });
    $("runtime-replay").addEventListener("input", schedule);
    $("runtime-replay-play").addEventListener("click", toggleReplay);
    $("runtime-compare-left").addEventListener("change", (event) => {
      rt.compareLeft = event.target.value;
      load();
    });
    $("runtime-compare-right").addEventListener("change", (event) => {
      rt.compareRight = event.target.value;
      load();
    });
    $("runtime-fit").addEventListener("click", fit);
    const canvas = $("runtime-map-canvas");
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (rt.surface === "process") return;
        e.preventDefault();
        rt.scale = Math.max(
          0.35,
          Math.min(1.7, rt.scale + (e.deltaY < 0 ? 0.1 : -0.1)),
        );
        renderGraph();
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      if (rt.surface === "process") return;
      if (e.target.closest(".runtime-graph-node")) return;
      rt.drag = { x: e.clientX, y: e.clientY, px: rt.panX, py: rt.panY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!rt.drag) return;
      rt.panX = rt.drag.px + e.clientX - rt.drag.x;
      rt.panY = rt.drag.py + e.clientY - rt.drag.y;
      renderGraph();
    });
    canvas.addEventListener("pointerup", () => (rt.drag = null));
    document.addEventListener("agent-control:event-received", schedule);
    new MutationObserver(() => {
      if (rt.active) schedule();
    }).observe($("stream-state"), { childList: true, attributes: true });
  });
  async function openEstate(id) {
    rt.observabilityOrigin=null;
    rt.surface='estate';rt.mode='map';rt.focusIds=null;rt.search='';rt.filter='ALL';
    if($("runtime-map-workspace").hidden)document.querySelector('[data-view="runtime-map"]')?.click();rt.active=true;
    surfaceButtons();modeButtons();await load();await heartbeat();
    if(id&&rt.projection?.nodes.some(n=>n.id===id)){rt.selected=id;uncollapseAncestors(rt.projection.nodes.find(n=>n.id===id),rt.projection);render();}
  }
  async function heartbeat() {
    const button=$('estate-dashboard-heartbeat');if(!button)return;
    if(state.operatorAuth!=='authenticated'){button.textContent='Estate · authentication required';return;}
    try {const h=await get('/api/estate-heartbeat'),c=h.counts;
      button.textContent=`Estate · ${c.resources?.alive??0}/${c.resources?.total??0} alive · machines ${c.devices?.alive??0}/${c.devices?.total??0} · transports ${c.transports?.alive??0}/${c.transports?.total??0} · runtimes ${c.runtimes?.alive??0}/${c.runtimes?.total??0} · models ${c.models?.alive??0}/${c.models?.total??0} · agents ${c.agents?.alive??0}/${c.agents?.total??0} · ${c.jobs?.operationalReady??0}/${c.jobs?.total??0} jobs READY now · ${c.jobs?.catalogueCapable??0} catalogue capable · ${c.warnings??0} warnings`;
      button.title=`Observed ${h.observedAt}; scan ${h.scanId}. Click to inspect the Estate Map.`;
    }catch {button.textContent='Estate · current observations unavailable';}
  }
  $('estate-dashboard-heartbeat')?.addEventListener('click',()=>openEstate());
  // Cheap projection reads only. No discovery, model inference or admission renewal.
  setInterval(()=>{if(document.hidden)return;heartbeat();if(rt.active&&rt.surface==='estate')load();},5000);
  document.addEventListener('agent-control:authentication-changed',()=>{heartbeat();if(rt.active)load();});
  heartbeat();
  async function openProcess(parcelId,originNode=null){rt.runId='';rt.surface='process';rt.parcelId=parcelId;rt.mode='map';document.querySelector('[data-view="runtime-map"]')?.click();rt.active=true;rt.observabilityOrigin=originNode;surfaceButtons();modeButtons();await load();}
  async function openJob(runId,originNode=null){rt.runId=runId;rt.surface="process";rt.mode="map";document.querySelector('[data-view="runtime-map"]')?.click();rt.active=true;rt.observabilityOrigin=originNode;surfaceButtons();modeButtons();await load();}
  window.AgentControlRuntimeMap = { openJob, activate, schedule, openEstate, openProcess, selection:()=>({originNode:rt.observabilityOrigin??null,surface:rt.surface,parcelId:rt.parcelId,runId:rt.runId,node:rt.projection?.nodes.find(n=>n.id===rt.selected)}) };
})();
