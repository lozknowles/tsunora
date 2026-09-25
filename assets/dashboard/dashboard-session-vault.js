(() => {
  const view = {
    projection: null,
    results: [],
    selected: null,
    section: "sessions",
  };
  const q = (selector) => document.querySelector(selector),
    escape = (value) =>
      String(value ?? "").replace(
        /[&<>\"']/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '\"': "&quot;",
            "'": "&#39;",
          })[char],
      );
  const auth = () =>
      state.token ? { Authorization: `Bearer ${state.token}` } : {},
    number = (value) => new Intl.NumberFormat().format(value ?? 0);
  async function request(url) {
    const response = await fetch(url, { headers: auth() });
    if (response.status === 401) {
      authenticationExpired();
      throw new Error("Operator authentication required");
    }
    if (!response.ok) throw new Error(`Session Vault ${response.status}`);
    return response.json();
  }
  async function load() {
    view.projection = await request("/api/session-vault");
    paint();
  }
  async function search(query) {
    const payload = await request(
      `/api/session-vault/search?q=${encodeURIComponent(query)}`,
    );
    view.results = payload.results;
    view.selected = view.results[0] ?? null;
    paint();
  }
  function paint() {
    const value = view.projection;
    if (!value) return;
    q("#vault-health").textContent = value.health.state;
    q("#vault-health").className =
      `status-pill ${value.health.state === "READY" ? "healthy" : "warning"}`;
    q("#vault-session-count").textContent = number(value.sessions);
    q("#vault-metrics").innerHTML = [
      ["Captured sessions", value.sessions],
      ["Immutable objects", value.objects],
      ["Preserved bytes", number(value.bytes)],
      ["Active continuation leases", value.activeLeases],
      ["Replication pending", value.replication.pending],
      ["Replication failures", value.replication.failures],
    ]
      .map(
        ([label, item]) =>
          `<article><span>${escape(label)}</span><strong>${escape(item)}</strong></article>`,
      )
      .join("");
    paintOperationalView(value);
    const rows = view.results.length
      ? view.results
      : value.recent.map((record) => ({
          sessionId: record.id,
          providerId: record.providerId,
          nodeId: record.nodeId,
          completeness: record.completeness,
          score: null,
          matches: record.events.slice(-3).map((event) => ({
            eventId: event.id,
            kind: event.kind,
            at: event.at,
            summary: event.summary,
            authority: event.authority,
          })),
          sourceObjectSha256: record.raw.objectSha256,
        }));
    q("#vault-session-list").hidden = view.section !== "sessions";
    q("#vault-search-form").hidden = ![
      "sessions",
      "decisions",
      "provenance",
    ].includes(view.section);
    q("#vault-session-list").innerHTML = rows.length
      ? rows
          .map(
            (item) =>
              `<button data-vault-session="${escape(item.sessionId)}" class="vault-session ${view.selected?.sessionId === item.sessionId ? "active" : ""}"><span><strong>${escape(item.providerId)} · ${escape(item.nodeId)}</strong><small>${escape(item.completeness)}${item.score === null ? "" : ` · relevance ${escape(item.score)}`}</small></span><code>${escape(item.sourceObjectSha256.slice(0, 16))}…</code><p>${escape(item.matches[0]?.summary ?? "Indexed provider-native evidence")}</p></button>`,
          )
          .join("")
      : '<p class="muted">No provider-native sessions have been captured.</p>';
    q("#vault-session-list")
      .querySelectorAll("[data-vault-session]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          view.selected = rows.find(
            (item) => item.sessionId === button.dataset.vaultSession,
          );
          paint();
        }),
      );
    paintDetail();
  }
  function paintOperationalView(value) {
    const target = q("#vault-operational-view"),
      labels = {
        sessions: ["Historical evidence", "Session Explorer"],
        decisions: ["Indexed explanations", "Decision Explorer"],
        provenance: ["Repository evidence", "Repository Provenance"],
        continuations: ["Governed cross-device work", "Continuations"],
        replication: ["Hash-preserving copies", "Replication Health"],
        policy: ["Privacy boundary", "Policy & Retention"],
      },
      label = labels[view.section];
    q("#vault-view-eyebrow").textContent = label[0];
    q("#vault-view-title").textContent = label[1];
    target.hidden = view.section === "sessions";
    if (view.section === "sessions") return;
    if (view.section === "decisions" || view.section === "provenance") {
      const kinds =
        view.section === "decisions"
          ? ["DECISION"]
          : ["COMMIT", "PATCH", "FILESYSTEM_WRITE", "BRANCH_CHANGED"];
      const events = value.recent.flatMap((record) =>
        record.events
          .filter((event) => kinds.includes(event.kind))
          .map((event) => ({ ...event, record })),
      );
      target.innerHTML = events.length
        ? events
            .map(
              ({ record, ...event }) =>
                `<article class="vault-operation"><header><strong>${escape(event.kind)}</strong><time>${escape(new Date(event.at).toLocaleString())}</time></header><p>${escape(event.summary)}</p><small>${escape(record.providerId)} @ ${escape(record.nodeId)} · ${escape(event.authority)}</small><code>sha256:${escape(record.raw.objectSha256.slice(0, 20))}…</code></article>`,
            )
            .join("")
        : '<p class="muted">No matching indexed provider-native events are available.</p>';
      return;
    }
    if (view.section === "continuations") {
      const continuations = value.recentContinuations ?? [],
        audit = value.leaseAudit ?? [];
      target.innerHTML = `<h3>Sealed continuations</h3>${continuations.length ? continuations.map((item) => `<article class="vault-operation"><header><strong>${escape(item.mode)} · ${escape(item.status)}</strong><span>${escape(item.nodeId)}</span></header><p>${escape(item.workParcelId)}</p><small>${escape(item.sourceSessionId)}</small><code>sha256:${escape(item.sha256)}</code></article>`).join("") : '<p class="muted">No continuations recorded.</p>'}<h3>Exclusive lease audit</h3>${audit.length ? audit.map((item) => `<article class="vault-operation ${item.action === "DENIED" ? "denied" : ""}"><header><strong>${escape(item.action)}</strong><time>${escape(new Date(item.at).toLocaleString())}</time></header><p>${escape(item.nodeId)} · ${escape(item.actorId)}</p><small>${escape(item.reason ?? "governed lease transition")}</small><code>sha256:${escape(item.sha256.slice(0, 24))}…</code></article>`).join("") : '<p class="muted">No lease events recorded.</p>'}`;
      return;
    }
    if (view.section === "replication") {
      target.innerHTML = `<div class="vault-health-grid"><article><span>Queue</span><strong>${number(value.replication.pending)}</strong></article><article><span>Failures</span><strong>${number(value.replication.failures)}</strong></article><article><span>Last success</span><strong>${escape(value.replication.lastSuccessAt ? new Date(value.replication.lastSuccessAt).toLocaleString() : "Not reported")}</strong></article><article><span>Integrity</span><strong>${value.integrityFailures ? "FAILED" : "VERIFIED"}</strong></article></div><p class="vault-explanation">Replication is incremental and content-addressed. A copied object retains its native SHA-256; retries never change the source evidence.</p>`;
      return;
    }
    const policies = value.recent.map((record) => record.policy),
      retention = [
        ...new Set(policies.map((item) => item.retentionDays ?? "indefinite")),
      ];
    target.innerHTML = `<div class="vault-health-grid"><article><span>Redacted indexes</span><strong>${number(policies.filter((item) => item.redactedIndex).length)} / ${number(policies.length)}</strong></article><article><span>Local-only</span><strong>${number(policies.filter((item) => item.localOnly).length)}</strong></article><article><span>Metadata-only</span><strong>${number(policies.filter((item) => item.metadataOnly).length)}</strong></article><article><span>Retention</span><strong>${escape(retention.join(", "))}</strong></article></div><p class="vault-explanation"><strong>Provider-native evidence remains authoritative.</strong> Normal views use redacted indexes. Your Memories receives only approved and independently validated knowledge with links back to immutable evidence. Obsidian is an optional existing Markdown backend, not a dependency.</p>`;
  }
  function paintDetail() {
    const item = view.selected;
    if (!item) {
      q("#vault-detail").innerHTML =
        '<p class="muted">Select a captured session or search result.</p>';
      return;
    }
    q("#vault-detail").innerHTML =
      `<dl><dt>Session</dt><dd>${escape(item.sessionId)}</dd><dt>Provider / node</dt><dd>${escape(item.providerId)} @ ${escape(item.nodeId)}</dd><dt>Completeness</dt><dd>${escape(item.completeness)}</dd><dt>Native evidence SHA-256</dt><dd><code>${escape(item.sourceObjectSha256)}</code></dd></dl><h3>Matched provenance</h3>${item.matches.map((event) => `<article class="vault-event"><header><strong>${escape(event.kind)}</strong><time>${escape(new Date(event.at).toLocaleString())}</time></header><p>${escape(event.summary)}</p><small>${escape(event.authority)} · ${escape(event.eventId)}</small></article>`).join("") || '<p class="muted">No matching normalized events.</p>'}`;
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-vault-view]").forEach((button) =>
      button.addEventListener("click", () => {
        view.section = button.dataset.vaultView;
        document
          .querySelectorAll("[data-vault-view]")
          .forEach((item) => item.classList.toggle("active", item === button));
        paint();
      }),
    );
    q('[data-view="vault"]')?.addEventListener("click", () =>
      load().catch(showError),
    );
    q("#vault-search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      search(q("#vault-search").value).catch(showError);
    });
    setInterval(() => {
      if (!q("#vault-workspace")?.hidden) load().catch(showError);
    }, 5000);
  });
})();
