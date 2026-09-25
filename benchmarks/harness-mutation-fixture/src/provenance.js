import {stableUnique} from './utils.js';

export function mergeEvidence(...groups) {
  return stableUnique(groups.flat().filter(value => typeof value === 'string' && value.length > 0));
}

export function provenanceRecord(kind, evidenceIds) {
  return Object.freeze({kind, evidenceIds: mergeEvidence(evidenceIds)});
}
