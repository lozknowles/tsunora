/* Presentation only. The immutable Run ID is authoritative; colour is derived. */
(() => {
  'use strict';
  const paletteSize = 12;
  function hash(value) {
    let result = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(value)) {
      result ^= byte;
      result = Math.imul(result, 0x01000193) >>> 0;
    }
    return result;
  }
  function identity(kind, id) {
    if (typeof id !== 'string' || !id.trim()) return null;
    const key = `${kind}:${id}`;
    return {key, kind, id, slot: hash(key) % paletteSize};
  }
  function run(id) { return identity('run', id); }
  function conversation(id) { return identity('conversation', id); }
  function eventRunId(event, entities = []) {
    if (typeof event?.runId === 'string' && event.runId) return event.runId;
    if (typeof event?.entityId !== 'string') return null;
    if (event.entityId.startsWith('job:')) return event.entityId.slice(4);
    return entities.find(item => item.id === event.entityId)?.runId || null;
  }
  function filterEvents(events, runId, entities = []) {
    return runId ? events.filter(event => eventRunId(event, entities) === runId) : [...events];
  }
  function videoBindings(frames) {
    const runs = new Map();
    for (const frame of frames) {
      const entities=frame.projection?.entities || [];
      for (const item of entities) if (item.kind === 'job' && item.runId) runs.set(item.runId, {runId: item.runId, slot: run(item.runId).slot});
      for (const event of frame.projection?.events || []) {
        const runId=eventRunId(event,entities);
        if(runId)runs.set(runId,{runId,slot:run(runId).slot});
      }
    }
    return [...runs.values()];
  }
  function apply(element, entry) {
    if (!element || !entry) return element;
    element.classList.add('job-identity');
    element.dataset.identityKey = entry.key;
    element.dataset.identitySlot = String(entry.slot);
    element.style.setProperty('--job-identity', `var(--ac-identity-${entry.slot})`);
    return element;
  }
  function badge(id, label = id) {
    const entry = run(id);
    if (!entry) return null;
    const node = document.createElement('span');
    node.className = 'job-identity-badge';
    node.textContent = label;
    node.title = `Job Run ${id}`;
    apply(node, entry);
    return node;
  }
  window.AgentControlIdentity = Object.freeze({hash, run, conversation, eventRunId, filterEvents, videoBindings, apply, badge, paletteSize});
})();
