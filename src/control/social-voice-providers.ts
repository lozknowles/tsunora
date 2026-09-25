/** Replaceable edges. Provider output never conveys operator authority. */
export interface CapabilityHealth {state: 'ready' | 'unavailable' | 'degraded'; checkedAt: string; reason?: string;}
export interface SocialIdentity {channel: string; account: string; sender: string; conversation: string;}
export interface SocialMessage {id: string; identity: SocialIdentity; receivedAt: number; kind: 'text' | 'audio'; text?: string; mediaId?: string;}
export interface SocialReceipt {state: 'queued' | 'submitted' | 'delivered' | 'uncertain'; id: string;}
export interface SocialChannelProvider {
  readonly id: string;
  capabilities(): {text: boolean; audio: boolean; artifacts: boolean; approvals: boolean};
  health(): Promise<CapabilityHealth>;
  receive(message: unknown): SocialMessage; // normalization only; authentication remains at the ingress boundary
  send(identity: SocialIdentity, text: string, key: string): Promise<SocialReceipt>;
  sendStatus(identity: SocialIdentity, text: string, key: string): Promise<SocialReceipt>;
  sendApprovalRequest(identity: SocialIdentity, text: string, key: string): Promise<SocialReceipt>;
  sendArtifact(identity: SocialIdentity, audio: Uint8Array, mime: string, key: string): Promise<SocialReceipt>;
  downloadAudio(identity: SocialIdentity, messageId: string): Promise<{bytes: Uint8Array; mime: string}>;
}
export interface VoiceIdentity {id: string; kind: 'designed' | 'cloned' | 'generic'; provider: string; modelRevision: string; instruction?: string; referenceSha256?: string; consent?: {basis: 'synthetic-reference' | 'explicit-speaker-consent'; recordedAt: string}; seed: number;}
export interface SpeechMetrics {provider: string; host: string; model: string; elapsedMs: number; audioSeconds: number; rtf: number; firstAudioMs: number; memoryBytes: number | null;}
export interface SpeechProvider {
  readonly id: string;
  capabilities(): {synthesize: boolean; design: boolean; clone: boolean; streaming: boolean};
  health(): Promise<CapabilityHealth>;
  voices(): Promise<VoiceIdentity[]>;
  synthesize(input: {text: string; voice: VoiceIdentity; signal: AbortSignal}): Promise<{bytes: Uint8Array; mime: string; metrics: SpeechMetrics}>;
}
export interface SpeechRecognitionProvider {
  readonly id: string;
  capabilities(): {transcribe: boolean; languages: string[]};
  health(): Promise<CapabilityHealth>;
  transcribe(input: {bytes: Uint8Array; mime: string; signal: AbortSignal}): Promise<{text: string; confidence: number | null; metrics: SpeechMetrics}>;
}
export function validateVoice(voice: VoiceIdentity) {
  if (!voice.id || !voice.provider || !voice.modelRevision || !Number.isInteger(voice.seed)) throw new Error('voice_provenance_required');
  if (voice.kind === 'cloned' && (!voice.referenceSha256?.match(/^[a-f0-9]{64}$/) || !voice.consent?.recordedAt)) throw new Error('voice_clone_consent_required');
  if (voice.kind === 'designed' && !voice.instruction?.trim()) throw new Error('voice_design_instruction_required');
}
export function validateAudio(bytes: Uint8Array, mime: string) {
  if (!/^audio\/(wav|x-wav|ogg|mpeg|mp4|webm)(;.*)?$/.test(mime) || bytes.length < 12 || bytes.length > 8 * 1024 * 1024) throw new Error('audio_format_or_size_rejected');
  const magic = Buffer.from(bytes.subarray(0, 12));
  if (!(magic.subarray(0,4).toString() === 'RIFF' && magic.subarray(8,12).toString() === 'WAVE') && magic.subarray(0,4).toString() !== 'OggS' && magic.subarray(4,8).toString() !== 'ftyp' && magic.subarray(0,3).toString() !== 'ID3' && !(magic[0]===0xff && (magic[1]! & 0xe0)===0xe0) && magic.readUInt32BE(0)!==0x1a45dfa3) throw new Error('audio_signature_rejected');
}
export async function readBoundedResponse(response:Response,limit:number) {
  if(Number(response.headers.get('content-length'))>limit)throw new Error('provider_response_too_large');
  const reader=response.body?.getReader();if(!reader)throw new Error('provider_response_empty');const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('provider_response_too_large');parts.push(value);}}catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  return Buffer.concat(parts);
}
