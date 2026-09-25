import {mergeEvidence} from './provenance.js';

export function deriveContextPacket({id, sources, parent}) {
  if (!id || !Array.isArray(sources)) throw new Error('context_packet_invalid');
  return Object.freeze({
    id,
    sourceIds: sources.map(source => source.id),
    provenanceIds: mergeEvidence(sources.flatMap(source => source.provenanceIds ?? [])),
    parentId: parent?.id ?? null,
    derived: true,
  });
}
