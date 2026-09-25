(() => {
  "use strict";
  const e = (value) =>
    String(value ?? "").replace(
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
  async function request(url, options = {}) {
    if (state.operatorAuth !== "authenticated")
      throw new Error("Operator authentication required");
    const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${state.token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
      }),
      body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }
  function render(value) {
    const current = value.current,
      host = document.querySelector("#installation-state");
    if (!current) {
      host.textContent = "No installation inspection recorded.";
      return;
    }
    host.innerHTML = `<strong>${e(current.state)}</strong><small>${e(current.mode)} · ${e(current.role)} · repository ${e(current.repository.integrity)} · ${current.prerequisites.filter((item) => item.available).length}/${current.prerequisites.length} required tools available</small><p>${e(current.nextAction)}</p>`;
  }
  async function load() {
    render(await request("/api/installation"));
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#installation-inspect").onclick = async () => {
      try {
        const value = await request("/api/installation/inspect", {
          method: "POST",
          body: JSON.stringify({
            mode: document.querySelector("#installation-mode").value,
            role: document.querySelector("#installation-role").value,
          }),
        });
        render({ current: value });
        toast("Read-only installation inspection complete");
      } catch (error) {
        showError(error);
      }
    };
    document
      .querySelector('[data-view="configuration"]')
      .addEventListener("click", () => load().catch(showError));
  });
})();
