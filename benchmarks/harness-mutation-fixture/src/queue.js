export class WorkQueue {
  #items = [];

  enqueue(item) {
    if (!item || typeof item.id !== 'string' || !item.id) throw new Error('work_item_invalid');
    if (this.#items.some(existing => existing.id === item.id && existing.state === 'QUEUED')) throw new Error('duplicate_work_id');
    this.#items.push({...item, state: item.state ?? 'QUEUED'});
  }

  lease(id) {
    const item = this.#items.find(candidate => candidate.id === id);
    if (!item || item.state !== 'QUEUED') throw new Error('work_not_available');
    item.state = 'LEASED';
    return {...item};
  }

  list() {
    return this.#items.map(item => ({...item}));
  }
}
