import type {
  ContextReadRequest,
  ContextReadResult,
  ContextSource,
  ContextSourceReader,
  ContextSourceType,
} from './context.js';
export {redactSensitiveText} from './security-redaction.js';
import {redactSensitiveText} from './security-redaction.js';

export type ContextAccessMode = 'public_read_only' | 'approved_authenticated_read_only' | 'reference_only';

export interface ContextProviderCapability {
  id: string;
  provider: string;
  sourceTypes: ContextSourceType[];
  accessMode: ContextAccessMode;
  supportsSections: boolean;
  createsOrBroadensShares: false;
  maxTokens: number;
}

export interface VisibleContextSection {
  id: string;
  title: string;
  kind?: 'summary' | 'decision' | 'evidence' | 'experiment' | 'failure' | 'question' | 'conversation';
  text: string;
}

export interface VisibleContextDocument {
  sourceId: string;
  title: string;
  sections: VisibleContextSection[];
  retrievedAt: string;
}

export interface ContextReadPolicy {
  approvedCapabilityIds?: string[];
  allowAuthenticatedRead: boolean;
  redactSensitiveText: boolean;
  now?: () => Date;
}

export interface ContextReaderAdapter {
  capability: ContextProviderCapability;
  matches(source: ContextSource): boolean;
  fetchVisibleDocument(source: ContextSource): Promise<VisibleContextDocument>;
}

export type VisibleDocumentTransport = (source: ContextSource) => Promise<VisibleContextDocument>;

export interface OpenAiApiRequest {method: 'GET'; path: string; headers?: Record<string, string>}
export type OpenAiApiTransport = (request: OpenAiApiRequest) => Promise<unknown>;

const defaultPolicy: ContextReadPolicy = {
  allowAuthenticatedRead: false,
  redactSensitiveText: true,
};

export class ContextReaderRegistry implements ContextSourceReader {
  private readonly adapters: ContextReaderAdapter[] = [];

  constructor(readonly policy: ContextReadPolicy = defaultPolicy) {}

  register(adapter: ContextReaderAdapter): this {
    if (this.adapters.some(item => item.capability.id === adapter.capability.id)) throw new Error('context_reader_capability_exists');
    this.adapters.push(adapter);
    return this;
  }

  capabilities(source?: ContextSource): ContextProviderCapability[] {
    return this.adapters
      .filter(adapter => !source || adapter.matches(source))
      .map(adapter => ({...adapter.capability, sourceTypes: [...adapter.capability.sourceTypes]}));
  }

  discover(source: ContextSource): {supported: boolean; capabilities: ContextProviderCapability[]; reason?: string} {
    const capabilities = this.capabilities(source);
    if (capabilities.length === 0) return {supported: false, capabilities, reason: 'unsupported_provider_or_source_type'};
    const approved = capabilities.filter(item => !this.policy.approvedCapabilityIds || this.policy.approvedCapabilityIds.includes(item.id));
    if (approved.length === 0) return {supported: false, capabilities, reason: 'provider_capability_not_approved'};
    if (approved.every(item => item.accessMode === 'approved_authenticated_read_only') && !this.policy.allowAuthenticatedRead) {
      return {supported: false, capabilities: approved, reason: 'authenticated_read_not_approved'};
    }
    if (approved.every(item => item.accessMode === 'reference_only')) return {supported: false, capabilities: approved, reason: 'reference_only'};
    return {supported: true, capabilities: approved};
  }

  async read(source: ContextSource, maxTokens: number, request: ContextReadRequest = {}): Promise<ContextReadResult> {
    if (source.accessibility !== 'available') throw new Error(`source_${source.accessibility}`);
    if (source.retention?.expiresAt && new Date(source.retention.expiresAt) <= (this.policy.now?.() ?? new Date())) throw new Error('context_source_retention_expired');
    if (source.retention?.mode === 'reference_only') throw new Error('context_source_reference_only');
    const discovery = this.discover(source);
    if (!discovery.supported) throw new Error(discovery.reason);
    const adapter = this.adapters.find(item => discovery.capabilities.some(capability => capability.id === item.capability.id) && item.matches(source));
    if (!adapter) throw new Error('context_reader_missing');
    const effectiveLimit = Math.max(1, Math.min(Math.floor(maxTokens), adapter.capability.maxTokens));
    const document = await adapter.fetchVisibleDocument(source);
    if (document.sourceId !== source.id) throw new Error('context_document_identity_mismatch');
    const selected = selectRelevantSections(document.sections, request, effectiveLimit, this.policy.redactSensitiveText);
    return {
      sourceId: source.id,
      text: selected.map(section => `## ${section.title}\n${section.text}`).join('\n\n'),
      tokens: selected.reduce((sum, section) => sum + estimateTokens(section.title) + estimateTokens(section.text), 0),
      sections: selected.map(section => section.id),
    };
  }
}

export function openAiSharedThreadAdapter(transport: VisibleDocumentTransport): ContextReaderAdapter {
  return adapter({
    id: 'openai_shared_thread_public_v1', provider: 'openai', sourceTypes: ['openai_shared_thread'],
    accessMode: 'public_read_only', supportsSections: true, createsOrBroadensShares: false, maxTokens: 32_000,
  }, source => {
    if (source.type !== 'openai_shared_thread' || !source.url) return false;
    const url = new URL(source.url);
    return ['chatgpt.com', 'chat.openai.com'].includes(url.hostname) && url.pathname.startsWith('/share/');
  }, transport);
}

/** Official OpenAI API binding. This reads ChatKit thread items only; it never creates or changes a thread. */
export function openAiChatKitThreadAdapter(transport: OpenAiApiTransport): ContextReaderAdapter {
  return adapter({
    id: 'openai_chatkit_thread_api_v1', provider: 'openai', sourceTypes: ['openai_chatkit_thread'],
    accessMode: 'approved_authenticated_read_only', supportsSections: true, createsOrBroadensShares: false, maxTokens: 64_000,
  }, source => {
    if (source.type !== 'openai_chatkit_thread' || !source.url) return false;
    try {
      const url = new URL(source.url);
      return url.protocol === 'https:' && url.hostname === 'api.openai.com' && /^\/v1\/chatkit\/threads\/[^/]+$/.test(url.pathname);
    } catch { return false; }
  }, async source => {
    const threadId = new URL(source.url!).pathname.split('/').pop()!;
    const thread = asRecord(await transport({method: 'GET', path: `/v1/chatkit/threads/${encodeURIComponent(threadId)}`}));
    if (thread.id !== threadId || thread.object !== 'chatkit.thread') throw new Error('context_provider_identity_mismatch');
    const sections: VisibleContextSection[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const suffix = after ? `&after=${encodeURIComponent(after)}` : '';
      const payload = await transport({method: 'GET', path: `/v1/chatkit/threads/${encodeURIComponent(threadId)}/items?limit=100&order=asc${suffix}`});
      const data = asRecord(payload);
      const items = Array.isArray(data.data) ? data.data : [];
      for (const item of items) {
        const record = asRecord(item);
        const itemId = typeof record.id === 'string' ? record.id : `item-${sections.length + 1}`;
        const itemThreadId = typeof record.thread_id === 'string' ? record.thread_id : threadId;
        if (itemThreadId !== threadId) throw new Error('context_provider_identity_mismatch');
        const role = typeof record.type === 'string' ? record.type.replace(/_/g, ' ') : 'thread item';
        const text = extractChatKitText(record.content);
        if (text) sections.push({id: itemId, title: role, kind: 'conversation', text});
      }
      if (data.has_more !== true || items.length === 0) break;
      const last = asRecord(items[items.length - 1]);
      if (typeof last.id !== 'string') throw new Error('context_provider_pagination_cursor_missing');
      after = last.id;
    }
    const title = typeof thread.title === 'string' && thread.title ? thread.title : `OpenAI ChatKit thread ${threadId}`;
    return {sourceId: source.id, title, sections, retrievedAt: new Date().toISOString()};
  });
}

export async function discoverOpenAiChatKitThreadId(transport: OpenAiApiTransport): Promise<string | undefined> {
  const payload = asRecord(await transport({method: 'GET', path: '/v1/chatkit/threads?limit=1&order=desc'}));
  const first = Array.isArray(payload.data) ? asRecord(payload.data[0]) : {};
  if (typeof first.id === 'undefined') return undefined;
  if (typeof first.id !== 'string' || !/^cthr_[A-Za-z0-9_-]+$/.test(first.id) || first.object !== 'chatkit.thread') {
    throw new Error('context_provider_identity_mismatch');
  }
  return first.id;
}

export function openAiChatKitHttpTransport(apiKey: string, fetchImpl: typeof fetch = fetch): OpenAiApiTransport {
  if (!apiKey || /\s/.test(apiKey)) throw new Error('openai_api_key_missing_or_invalid');
  return async request => {
    if (request.method !== 'GET' || !/^\/v1\/chatkit\/threads(?:\?|\/[^/?]+(?:\/items)?(?:\?|$))/.test(request.path)) {
      throw new Error('openai_transport_request_not_allowed');
    }
    const response = await fetchImpl(`https://api.openai.com${request.path}`, {
      method: 'GET',
      headers: {Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'OpenAI-Beta': 'chatkit_beta=v1'},
    });
    if (!response.ok) throw new Error(`openai_provider_http_${response.status}`);
    return await response.json();
  };
}

export function chatGptWorkThreadAdapter(transport: VisibleDocumentTransport): ContextReaderAdapter {
  return adapter({
    id: 'chatgpt_work_thread_approved_v1', provider: 'openai', sourceTypes: ['chatgpt_work_thread'],
    accessMode: 'approved_authenticated_read_only', supportsSections: true, createsOrBroadensShares: false, maxTokens: 64_000,
  }, source => source.type === 'chatgpt_work_thread', transport);
}

export function codexThreadAdapter(transport: VisibleDocumentTransport): ContextReaderAdapter {
  return adapter({
    id: 'codex_thread_approved_v1', provider: 'openai', sourceTypes: ['codex_thread'],
    accessMode: 'approved_authenticated_read_only', supportsSections: true, createsOrBroadensShares: false, maxTokens: 64_000,
  }, source => source.type === 'codex_thread', transport);
}

export function referenceOnlyAdapter(provider: string, sourceTypes: ContextSourceType[]): ContextReaderAdapter {
  return adapter({
    id: `${provider}_reference_only_v1`, provider, sourceTypes,
    accessMode: 'reference_only', supportsSections: false, createsOrBroadensShares: false, maxTokens: 1,
  }, source => sourceTypes.includes(source.type), async source => ({sourceId: source.id, title: source.description, sections: [], retrievedAt: new Date().toISOString()}));
}

export function selectRelevantSections(
  sections: VisibleContextSection[],
  request: ContextReadRequest,
  maxTokens: number,
  redact = true,
): VisibleContextSection[] {
  const terms = new Set(tokenize([request.query, ...(request.sectionHints ?? [])].filter(Boolean).join(' ')));
  const ranked = sections.map((section, index) => ({
    section,
    index,
    score: sectionScore(section, terms),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: VisibleContextSection[] = [];
  let used = 0;
  for (const candidate of ranked) {
    const title = redact ? redactSensitiveText(candidate.section.title) : candidate.section.title;
    let text = redact ? redactSensitiveText(candidate.section.text) : candidate.section.text;
    const titleTokens = estimateTokens(title);
    const remaining = maxTokens - used - titleTokens;
    if (remaining <= 0) break;
    if (estimateTokens(text) > remaining) text = truncateToTokens(text, remaining);
    if (!text) continue;
    selected.push({...candidate.section, title, text});
    used += titleTokens + estimateTokens(text);
    if (used >= maxTokens) break;
  }
  return selected;
}

function adapter(capability: ContextProviderCapability, matches: ContextReaderAdapter['matches'], fetchVisibleDocument: VisibleDocumentTransport): ContextReaderAdapter {
  return {capability, matches, fetchVisibleDocument};
}

function asRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function extractChatKitText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(part => {
    const item = asRecord(part);
    return typeof item.text === 'string' ? item.text : '';
  }).filter(Boolean).join('\n').trim();
}

function sectionScore(section: VisibleContextSection, terms: Set<string>): number {
  const kindWeight: Record<NonNullable<VisibleContextSection['kind']>, number> = {
    evidence: 30, experiment: 25, failure: 22, decision: 20, question: 15, summary: 12, conversation: 0,
  };
  const title = tokenize(section.title), body = tokenize(section.text);
  let score = section.kind ? kindWeight[section.kind] : 0;
  for (const term of terms) score += title.filter(item => item === term).length * 8 + body.filter(item => item === term).length;
  return score;
}

function tokenize(value: string): string[] { return value.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []; }
function estimateTokens(value: string): number { return Math.ceil(value.length / 4); }
function truncateToTokens(value: string, tokens: number): string { return value.slice(0, Math.max(0, tokens * 4)).trimEnd(); }
