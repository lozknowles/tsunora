import type {ContextStore, ProvenanceEdge, ProvenanceNode} from './context.js';

export interface OperatorProvenanceNode extends ProvenanceNode {
  url?: string;
  accessibility?: string;
}

export interface OperatorProvenanceView {
  decisionId: string;
  nodes: OperatorProvenanceNode[];
  edges: ProvenanceEdge[];
  mermaid: string;
}

export function buildOperatorProvenanceView(store: ContextStore, decisionId: string): OperatorProvenanceView {
  const trace = store.traceDecision(decisionId);
  const nodes = trace.nodes.map(node => {
    if (node.kind !== 'context_source') return node;
    const source = store.getSource(node.refId);
    return {...node, url: source?.url, accessibility: source?.accessibility};
  });
  return {decisionId, nodes, edges: trace.edges, mermaid: renderProvenanceMermaid(nodes, trace.edges)};
}

export function renderProvenanceMermaid(nodes: OperatorProvenanceNode[], edges: ProvenanceEdge[]): string {
  const ids = new Map(nodes.map((node, index) => [node.id, `n${index}`]));
  const lines = ['flowchart TD'];
  for (const node of nodes) {
    const id = ids.get(node.id)!;
    lines.push(`  ${id}["${escapeLabel(`${node.kind}: ${node.label}`)}"]`);
    if (node.url) lines.push(`  click ${id} "${escapeUrl(node.url)}" "Open read-only context"`);
  }
  for (const edge of edges) {
    const from = ids.get(edge.from), to = ids.get(edge.to);
    if (from && to) lines.push(`  ${from} -->|${escapeLabel(edge.relation)}| ${to}`);
  }
  return `${lines.join('\n')}\n`;
}

function escapeLabel(value: string): string { return value.replace(/["\n\r]/g, ' ').replace(/\|/g, '/'); }
function escapeUrl(value: string): string { return value.replace(/["\n\r]/g, ''); }
