export function reconcileOwnedEntries(entries, {isAlive, terminate}) {
  const live = entries.filter(entry => Number.isInteger(entry.pid) && entry.pid > 0 && isAlive(entry.pid));
  const kept = [], seenSingletons = new Set();
  for (const entry of live) {
    const singleton = entry.singletonKey ?? entry.id;
    if (seenSingletons.has(singleton)) { terminate(entry.pid); continue; }
    seenSingletons.add(singleton);
    kept.push(entry);
  }
  return kept;
}
