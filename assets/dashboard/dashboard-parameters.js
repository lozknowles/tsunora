(function installDashboardParameters(root) {
  const drafts = new Map();

  function remember(jobId, form) {
    const dirty = {};
    for (const field of form?.querySelectorAll?.('[data-job-parameter][data-dirty="true"]') || []) {
      dirty[field.dataset.jobParameter] = field.type === 'checkbox' ? {checked: Boolean(field.checked)} : {value: field.value};
    }
    if (Object.keys(dirty).length) drafts.set(jobId, dirty); else drafts.delete(jobId);
    return dirty;
  }

  function restore(jobId, form) {
    const dirty = drafts.get(jobId) || {};
    for (const field of form?.querySelectorAll?.('[data-job-parameter]') || []) {
      const saved = dirty[field.dataset.jobParameter];
      if (!saved) continue;
      if (field.type === 'checkbox') field.checked = saved.checked;
      else field.value = saved.value;
      field.dataset.dirty = 'true';
    }
  }

  function bind(jobId, form) {
    restore(jobId, form);
    const changed = event => {
      const field = event.target.closest?.('[data-job-parameter]');
      if (!field) return;
      field.dataset.dirty = 'true';
      remember(jobId, form);
    };
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
  }

  function clear(jobId, form) {
    drafts.delete(jobId);
    for (const field of form?.querySelectorAll?.('[data-job-parameter]') || []) delete field.dataset.dirty;
  }

  function collect(definitions, form) {
    const parameters = {};
    for (const field of form.querySelectorAll('[data-job-parameter]')) {
      const name = field.dataset.jobParameter;
      const definition = definitions[name];
      if (!definition) continue;
      if (definition.type === 'boolean') { parameters[name] = Boolean(field.checked); continue; }
      const raw = field.value;
      if (raw === '' && definition.default === undefined && !definition.required) continue;
      if (definition.type === 'integer') {
        const value = Number(raw); if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`); parameters[name] = value;
      } else if (definition.type === 'number') {
        const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${name} must be a number`); parameters[name] = value;
      } else parameters[name] = raw;
    }
    return parameters;
  }
  root.AgentControlDashboardParameters = {collect, remember, restore, bind, clear};
})(window);
