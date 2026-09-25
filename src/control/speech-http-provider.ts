import type {CapabilityHealth, SpeechProvider, SpeechRecognitionProvider, VoiceIdentity, SpeechMetrics} from './social-voice-providers.js';
import {readBoundedResponse, validateAudio, validateVoice} from './social-voice-providers.js';

function metrics(value: unknown): SpeechMetrics {
  const m=value as SpeechMetrics;
  if(!m || ['provider','host','model'].some(key=>typeof (m as any)[key]!=='string'||!(m as any)[key]||(m as any)[key].length>256) || ['elapsedMs','audioSeconds','rtf','firstAudioMs'].some(key=>!Number.isFinite((m as any)[key])||(m as any)[key]<0) || (m.memoryBytes!==null&&(!Number.isFinite(m.memoryBytes)||m.memoryBytes<0))) throw new Error('speech_metrics_invalid');
  return m;
}

/** Optional private speech worker. No model package is imported into orchestration. */
export class PrivateSpeechProvider implements SpeechProvider, SpeechRecognitionProvider {
  constructor(readonly id: string, private readonly url: string, private readonly token: string, private readonly voice: VoiceIdentity, private readonly request: typeof fetch = fetch) {
    const endpoint = new URL(url);
    if (!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname) || endpoint.protocol!=='http:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || token.length<32) throw new Error('private_speech_configuration_invalid');
    validateVoice(voice);
  }
  capabilities() { return {synthesize:true, design:true, clone:false, streaming:false, transcribe:true, languages:['en']}; }
  async health(): Promise<CapabilityHealth> { try { await this.call('/health'); return {state:'ready',checkedAt:new Date().toISOString()}; } catch { return {state:'unavailable',checkedAt:new Date().toISOString(),reason:'speech_worker_unavailable'}; } }
  async voices() { return [structuredClone(this.voice)]; }
  private async call(route: string, body?: unknown, signal = AbortSignal.timeout(5000)): Promise<any> {
    const response=await this.request(this.url.replace(/\/$/,'')+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal,redirect:'error'});
    if(!response.ok)throw new Error('speech_worker_failed');
    const raw=await readBoundedResponse(response,16*1024*1024);return JSON.parse(raw.toString('utf8'));
  }
  async synthesize(input: {text:string;voice:VoiceIdentity;signal:AbortSignal}) {
    validateVoice(input.voice);
    if(JSON.stringify(input.voice)!==JSON.stringify(this.voice) || !input.text.trim() || input.text.length>1200)throw new Error('speech_request_not_approved');
    const result=await this.call('/synthesize',{text:input.text,voice:input.voice},input.signal), bytes=Buffer.from(result.audio,'base64'); validateAudio(bytes,result.mime);
    return {bytes,mime:result.mime as string,metrics:metrics(result.metrics)};
  }
  async transcribe(input: {bytes:Uint8Array;mime:string;signal:AbortSignal}) {
    validateAudio(input.bytes,input.mime);
    const result=await this.call('/transcribe',{audio:Buffer.from(input.bytes).toString('base64'),mime:input.mime},input.signal);
    if(typeof result.text!=='string'||result.text.length>2000)throw new Error('transcription_invalid');
    return {text:result.text.trim(),confidence:null,metrics:metrics(result.metrics)};
  }
}
