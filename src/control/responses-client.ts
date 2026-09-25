import type {ProviderDefinition} from './providers.js';
export interface ResponsesProof {ok: boolean; text: string; status: number; latencyMs: number; raw?: unknown;}
function extractText(body: any) { if (typeof body?.output_text === 'string') return body.output_text; for (const item of body?.output ?? []) for (const content of item?.content ?? []) if (typeof content?.text === 'string') return content.text; return ''; }

export async function proveResponsesProvider(provider: ProviderDefinition, prompt = 'Reply exactly: AGENT-CONTROL-PROVIDER-OK', timeoutMs = 30000): Promise<ResponsesProof> {
  if (!provider.baseUrl || provider.wireApi !== 'responses') throw new Error('provider is not a Responses endpoint');
  if (!provider.qualificationModel) throw new Error('provider qualification model is not configured');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs), start = Date.now();
  try {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/responses`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({model: provider.qualificationModel, input: prompt, stream: false}), signal: controller.signal});
    let body: unknown; try { body = await response.json(); } catch { body = await response.text(); }
    const text = extractText(body), expected = prompt.replace(/^Reply exactly:\s*/, '');
    return {ok: response.ok && text.includes(expected), text, status: response.status, latencyMs: Date.now() - start, raw: body};
  } finally { clearTimeout(timer); }
}
