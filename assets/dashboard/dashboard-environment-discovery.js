(() => {
  const discovery = {
    projection: null,
    adapters: null,
    selected: null,
    filter: "ALL",
    busy: false,
  };
  const e = (value) =>
    window.esc
      ? window.esc(value)
      : String(value ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
  const request = async (url, options = {}) => {
    if (state.operatorAuth !== "authenticated") {
      openOperator();
      throw new Error("Operator authentication required");
    }
    const response = await fetch(url, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${state.token}`,
          ...options.headers,
        },
      }),
      body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      authenticationExpired();
      throw new Error("Operator authentication required");
    }
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  };
  const current = () => discovery.projection?.latest ?? null;
  function metric(label, value, detail) {
    return `<article class="environment-metric"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(detail)}</small></article>`;
  }
  function render() {
    renderProgress();
    const scan = current(),
      items = scan?.items ?? [];
    document.querySelector("#environment-summary").innerHTML = scan
      ? [
          metric(
            "Machines",
            scan.summary.machines,
            `${scan.summary.gpus} accelerator(s)`,
          ),
          metric(
            "Local models",
            scan.summary.localModels,
            "Discovery is not qualification",
          ),
          metric(
            "Providers",
            scan.summary.providers,
            `${scan.summary.healthy} healthy item(s)`,
          ),
          metric(
            "Agents & tools",
            `${scan.summary.agents} / ${scan.summary.tools}`,
            "Configured runtime capabilities",
          ),
          metric(
            "Needs attention",
            scan.summary.needsQualification,
            `${scan.summary.unavailable} unavailable`,
          ),
          metric("New since last scan", scan.summary.new, scan.status),
        ].join("")
      : metric("No scan", "—", "Start a governed discovery");
    renderCapabilityAdapters();
    const kinds = ["ALL", ...new Set(items.map((item) => item.kind))];
    document.querySelector("#environment-filters").innerHTML = kinds
      .map(
        (kind) =>
          `<button type="button" class="environment-filter ${discovery.filter === kind ? "active" : ""}" data-environment-filter="${e(kind)}">${e(kind.replaceAll("_", " "))}</button>`,
      )
      .join("");
    document.querySelectorAll("[data-environment-filter]").forEach(
      (button) =>
        (button.onclick = () => {
          discovery.filter = button.dataset.environmentFilter;
          render();
        }),
    );
    const visible = items.filter(
      (item) => discovery.filter === "ALL" || item.kind === discovery.filter,
    );
    document.querySelector("#environment-item-count").textContent = String(
      visible.length,
    );
    document.querySelector("#environment-items").innerHTML = visible.length
      ? visible
          .map(
            (item) =>
              `<button type="button" class="environment-card ${discovery.selected === item.id ? "active" : ""}" data-environment-item="${e(item.id)}"><header><strong>${e(item.label)}</strong><span class="environment-tag ${e(item.health)}">${e(item.health.replaceAll("_", " "))}</span></header><small>${e(item.kind)} · ${e(item.nodeId)}</small><div class="environment-card-meta"><span class="environment-tag ${e(item.lifecycle)}">${e(item.lifecycle)}</span><span class="environment-tag ${e(item.change)}">${e(item.change)}</span></div>${item.attention ? `<small class="environment-danger">${e(item.attention)}</small>` : ""}</button>`,
          )
          .join("")
      : '<div class="compact-empty">No resources match this filter.</div>';
    document.querySelectorAll("[data-environment-item]").forEach(
      (button) =>
        (button.onclick = () => {
          discovery.selected = button.dataset.environmentItem;
          render();
        }),
    );
    renderDetail(items.find((item) => item.id === discovery.selected));
    renderChanges(scan);
    renderRecommendations(scan);
    renderHistory();
  }
  function renderDetail(item) {
    const node = document.querySelector("#environment-detail");
    if (!item) {
      node.innerHTML =
        '<div class="empty-state"><div class="empty-icon">◇</div><h2>Select a resource</h2><p>Inspect health, qualification, provenance, and related configured systems.</p></div>';
      return;
    }
    const attrs = Object.entries(item.attributes)
        .map(
          ([key, value]) =>
            `<dt>${e(key.replace(/([A-Z])/g, " $1"))}</dt><dd>${e(value === null ? "unavailable" : value)}</dd>`,
        )
        .join(""),
      provenance = item.provenance
        .map(
          (value) =>
            `<div class="environment-row"><strong>${e(value.adapter)} · ${e(value.authority)}</strong><small>${e(value.method)} · ${e(new Date(value.observedAt).toLocaleString())}</small></div>`,
        )
        .join("");
    node.innerHTML = `<span class="eyebrow">${e(item.kind)} · ${e(item.nodeId)}</span><h2>${e(item.label)}</h2><div class="environment-card-meta"><span class="environment-tag ${e(item.health)}">${e(item.health)}</span><span class="environment-tag ${e(item.lifecycle)}">${e(item.lifecycle)}</span><span class="environment-tag ${e(item.change)}">${e(item.change)}</span></div><dl>${attrs}</dl><div class="environment-provenance"><h3>Provenance</h3>${provenance}</div><div class="environment-link-row">${item.kind === "MACHINE" ? '<button class="button secondary" data-environment-link="systems">Open Systems</button>' : ""}${item.kind === "MODEL" || item.kind === "PROVIDER" ? '<button class="button secondary" data-environment-link="models">Open Models</button>' : ""}${item.kind === "ROUTE" ? '<button class="button secondary" data-environment-link="runtime-map">Open Runtime Map</button>' : ""}</div>`;
    node
      .querySelectorAll("[data-environment-link]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            document
              .querySelector(`[data-view="${button.dataset.environmentLink}"]`)
              ?.click()),
      );
  }
  function renderChanges(scan) {
    const changed = (scan?.items ?? []).filter(
      (item) => item.change !== "UNCHANGED",
    );
    document.querySelector("#environment-changes").innerHTML = changed.length
      ? changed
          .map(
            (item) =>
              `<button type="button" class="environment-row" data-change-item="${e(item.id)}"><strong>${e(item.change)} · ${e(item.label)}</strong><small>${e(item.health)}${item.attention ? ` · ${e(item.attention)}` : ""}</small></button>`,
          )
          .join("")
      : '<div class="compact-empty">No changes in the current scan.</div>';
    document.querySelectorAll("[data-change-item]").forEach(
      (button) =>
        (button.onclick = () => {
          discovery.selected = button.dataset.changeItem;
          render();
        }),
    );
  }
  function renderRecommendations(scan) {
    const rows = scan?.recommendations ?? [];
    document.querySelector("#environment-recommendations").innerHTML =
      rows.length
        ? rows
            .map(
              (item) =>
                `<label class="environment-row environment-recommendation"><input type="checkbox" data-environment-recommendation="${e(item.id)}" ${item.operation ? "" : "disabled"}><span><strong>${e(item.summary)}</strong><small>${e(item.reason)}${item.operation ? "" : " · Informational only"}</small></span></label>`,
            )
            .join("")
        : '<div class="compact-empty">No qualified recommendation is available. Discovery never promotes an unqualified route.</div>';
    document
      .querySelectorAll("[data-environment-recommendation]")
      .forEach((input) => (input.onchange = () => updateProposalButton()));
    updateProposalButton();
    renderProposal();
  }
  function updateProposalButton() {
    const selected = [
      ...document.querySelectorAll("[data-environment-recommendation]:checked"),
    ];
    document.querySelector("#environment-create-proposal").disabled =
      !current() || !selected.length || discovery.busy;
  }
  function renderProposal() {
    const proposals = discovery.projection?.proposals ?? [],
      proposal = proposals.at(-1),
      host = document.querySelector(
        "#environment-recommendations",
      ).parentElement;
    host.querySelector(".environment-proposal-state")?.remove();
    if (!proposal) return;
    const actions =
      proposal.state === "DRAFT"
        ? '<button class="button secondary" data-proposal-action="save">Save draft</button><button class="button danger" data-proposal-action="cancel">Cancel</button>'
        : proposal.state === "SAVED"
          ? '<button class="button" data-proposal-action="approve">Approve & create Work Parcel</button><button class="button danger" data-proposal-action="cancel">Cancel</button>'
          : proposal.state === "APPROVED"
            ? '<button class="button" data-proposal-action="apply">Apply approved configuration</button>'
            : "";
    const panel = document.createElement("div");
    panel.className = "environment-proposal-state";
    panel.innerHTML = `<strong>${e(proposal.state)} proposal</strong><small>${e(proposal.id)} · ${proposal.operations.length} operation(s)${proposal.workParcelId ? ` · Work Parcel ${e(proposal.workParcelId)}` : ""}</small><div class="environment-link-row">${actions}</div>`;
    host.append(panel);
    panel
      .querySelectorAll("[data-proposal-action]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            mutateProposal(proposal, button.dataset.proposalAction)),
      );
  }
  async function mutateProposal(proposal, action) {
    setBusy(true);
    try {
      await request(
        `/api/environment-discovery/proposals/${encodeURIComponent(proposal.id)}/${action}`,
        { method: "POST", body: JSON.stringify({ sha256: proposal.sha256 }) },
      );
      await load();
      toast(`Discovery proposal ${action} accepted`);
    } catch(error){status.textContent=`Discovery could not finish: ${error.message}. Review the last confirmed observations.`;throw error;} finally {
      clearInterval(poll);setBusy(false);
    }
  }
  function renderHistory() {
    const scans = [...(discovery.projection?.scans ?? [])].reverse();
    document.querySelector("#environment-history").innerHTML = scans.length
      ? scans
          .map(
            (scan) =>
              `<button type="button" class="environment-row" data-history-scan="${e(scan.id)}"><strong>${e(scan.mode.replaceAll("_", " "))} · ${e(scan.status)}</strong><small>${e(new Date(scan.completedAt).toLocaleString())} · ${scan.items.length} item(s) · ${scan.failures.length} adapter failure(s)</small></button>`,
          )
          .join("")
      : '<div class="compact-empty">No discovery history.</div>';
    document.querySelectorAll("[data-history-scan]").forEach(
      (button) =>
        (button.onclick = () => {
          const scan = discovery.projection.scans.find(
            (value) => value.id === button.dataset.historyScan,
          );
          if (scan) {
            discovery.projection = { ...discovery.projection, latest: scan };
            discovery.selected = null;
            render();
          }
        }),
    );
  }
  function renderCapabilityAdapters() {
    const host = document.querySelector("#capability-adapters");
    if (!host) return;
    const rows = discovery.adapters?.records ?? [],
      next = {
        DRAFT: "review",
        REVIEWED: "validate",
        VALIDATED: "test",
        TESTED: "approve",
        APPROVED: "enable",
        ENABLED: "disable",
        DISABLED: "enable",
      };
    host.innerHTML = rows.length
      ? rows
          .map(
            (record) =>
              `<article class="environment-row"><strong>${e(record.definition.label)} · ${e(record.state)}</strong><small>${e(record.definition.resourceClasses.join(", "))} · ${e(record.binding.nodeId)} · ${e(record.trust)}</small><div class="capability-actions">${next[record.state] ? `<button class="button secondary" data-capability-action="${e(next[record.state])}" data-capability-id="${e(record.id)}" data-capability-hash="${e(record.sha256)}">${e(next[record.state].replaceAll("_", " "))}</button>` : ""}${!["REJECTED", "ENABLED"].includes(record.state) ? `<button class="button danger" data-capability-action="reject" data-capability-id="${e(record.id)}" data-capability-hash="${e(record.sha256)}">Reject</button>` : ""}</div></article>`,
          )
          .join("")
      : '<div class="compact-empty">No user-added capabilities.</div>';
    host.querySelectorAll("[data-capability-action]").forEach(
      (button) =>
        (button.onclick = () => mutateCapability(button).catch(showError)),
    );
  }
  async function mutateCapability(button) {
    setBusy(true);
    try {
      await request(
        `/api/capability-adapters/${encodeURIComponent(button.dataset.capabilityId)}/${button.dataset.capabilityAction}`,
        {method: "POST", body: JSON.stringify({sha256: button.dataset.capabilityHash})},
      );
      await load();
      toast("Capability registry updated");
    } finally { setBusy(false); }
  }
  function setBusy(value) {
    discovery.busy = value;
    document
      .querySelector("#environment-workspace")
      .classList.toggle("environment-loading", value);
    updateProposalButton();
  }
  function renderProgress() {
    const progress=discovery.projection?.progress,host=document.querySelector('#environment-live-progress');
    if(!host)return;host.hidden=!progress;if(!progress)return;
    host.replaceChildren();const heading=document.createElement('h2');heading.textContent=progress.state==='RUNNING'?'Discovery in progress':`Discovery ${progress.state.toLowerCase()}`;host.append(heading);
    const labels={'local-machine':'This computer','configured-resources':'Configured machines','mobile-edge':'Configured mobile resources','local-runtime':'Local runtimes and models','credentials':'Credential status only','agent-resources':'Agents and tools'};
    for(const stage of progress.adapters){const row=document.createElement('p');row.textContent=`${labels[stage.id]??stage.id.replaceAll('-',' ')} — ${stage.state.toLowerCase()}${stage.state==='COMPLETE'?` · ${stage.found} observations`:''}`;host.append(row);}
    if(progress.state==='RUNNING'){const count=document.createElement('p');count.textContent=`${progress.items.length} observations so far. Availability checks and the final inventory are still in progress.`;host.append(count);}
  }
  async function load() {
    [discovery.projection, discovery.adapters] = await Promise.all([
      request(new URL(location.href).searchParams.get('presentation')==='public'?'/api/environment-discovery?privacy=public':'/api/environment-discovery'),
      new URL(location.href).searchParams.get('presentation')==='public'?Promise.resolve({records:[]}):request("/api/capability-adapters"),
    ]);
    render();
    if(!discovery.busy)document.querySelector('#environment-scan-status').textContent=current()?`Last discovery ${current().status.toLowerCase()}. Inspect resources or run another scan.`:'Ready to discover this computer. Remote machines are checked only when you include them.';
  }
  async function scan(event) {
    event.preventDefault();
    setBusy(true);
    const status = document.querySelector("#environment-scan-status");
    status.textContent = "Discovery running through bounded adapters…";
    const poll=setInterval(()=>request(new URL(location.href).searchParams.get('presentation')==='public'?'/api/environment-discovery?privacy=public':'/api/environment-discovery').then(value=>{discovery.projection=value;renderProgress();}).catch(()=>{}),400);
    try {
      const result = await request("/api/environment-discovery/scans", {
        method: "POST",
        body: JSON.stringify({
          mode: document.querySelector("#environment-mode").value,
          testing: document.querySelector("#environment-testing").value,
          includeRemote: document.querySelector("#environment-remote").checked,
          includeMemory: document.querySelector("#environment-memory").checked,
        }),
      });
      await load();
      discovery.selected = result.items[0]?.id ?? null;
      status.textContent = `${result.status}: ${result.items.length} item(s), ${result.failures.length} contained adapter failure(s). No configuration was activated.`;
      render();
    } finally {
      clearInterval(poll);
      setBusy(false);
    }
  }
  async function createProposal() {
    const ids = [
      ...document.querySelectorAll("[data-environment-recommendation]:checked"),
    ].map((input) => input.dataset.environmentRecommendation);
    if (!ids.length) return;
    setBusy(true);
    try {
      await request("/api/environment-discovery/proposals", {
        method: "POST",
        body: JSON.stringify({ scanId: current().id, recommendationIds: ids }),
      });
      await load();
      toast("Draft configuration proposal created");
    } finally {
      setBusy(false);
    }
  }
  function activate() {
    if (state.operatorAuth !== "authenticated") {
      openOperator();
      return;
    }
    load().catch(showError);
  }
  async function addCapability(event) {
    event.preventDefault();
    const detection = document.querySelector("#capability-detection").value,
      body = {
        id: document.querySelector("#capability-id").value,
        label: document.querySelector("#capability-label").value,
        type: document.querySelector("#capability-type").value,
        detection,
        nodeId: document.querySelector("#capability-node").value,
        ...(detection === "EXECUTABLE"
          ? {
              executable: document.querySelector("#capability-executable")
                .value,
            }
          : {}),
        ...(detection === "ENDPOINT"
          ? { endpoint: document.querySelector("#capability-endpoint").value }
          : {}),
      };
    await request("/api/capability-adapters", {
      method: "POST",
      body: JSON.stringify(body),
    });
    event.target.reset();
    document.querySelector("#capability-node").value = "controller";
    await load();
    toast("Capability added for review; it is not enabled");
  }
  function updateCapabilityFields() {
    const value = document.querySelector("#capability-detection").value;
    document.querySelector("#capability-executable-field").hidden =
      value !== "EXECUTABLE";
    document.querySelector("#capability-endpoint-field").hidden =
      value !== "ENDPOINT";
  }
  document.addEventListener("DOMContentLoaded", () => {
    document
      .querySelector("#environment-scan-form")
      .addEventListener("submit", (event) => scan(event).catch(showError));
    document
      .querySelector("#environment-create-proposal")
      .addEventListener("click", () => createProposal().catch(showError));
    document
      .querySelector("#capability-adapter-form")
      .addEventListener("submit", (event) =>
        addCapability(event).catch(showError),
      );
    document
      .querySelector("#capability-detection")
      .addEventListener("change", updateCapabilityFields);
    updateCapabilityFields();
  });
  window.AgentControlEnvironmentDiscovery = { activate, render };
})();
