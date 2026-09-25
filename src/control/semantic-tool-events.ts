import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SEMANTIC_EVENT_TYPES = [
  'MODEL_RESPONSE_RECEIVED', 'TOOL_INTENT_DETECTED', 'TOOL_PARSE_STARTED', 'TOOL_PARSE_FAILED',
  'TOOL_SCHEMA_VALIDATION_STARTED', 'TOOL_SCHEMA_VALIDATION_FAILED',
  'TOOL_TRANSLATION_STARTED', 'TOOL_TRANSLATION_SUCCEEDED', 'TOOL_TRANSLATION_FAILED',
  'TOOL_SAFE_REPAIR_ATTEMPTED', 'TOOL_SAFE_REPAIR_ACCEPTED', 'TOOL_SAFE_REPAIR_REJECTED',
  'TOOL_DISPATCH_STARTED', 'TOOL_DISPATCH_SUCCEEDED', 'TOOL_DISPATCH_FAILED', 'TOOL_RESULT_RECORDED',
  'VERIFICATION_STARTED', 'VERIFICATION_PASSED', 'VERIFICATION_FAILED', 'JOB_TERMINATED',
] as const;
export type SemanticEventType = typeof SEMANTIC_EVENT_TYPES[number];
export interface SemanticToolEvent {
  schema: 'agent-control.semantic-tool-event/v1';
  eventId: string;
  at: string;
  type: SemanticEventType;
  runId: string;
  modelCallId: string | null;
  toolId: string | null;
  responseSha256: string | null;
  reasonCode: string | null;
  outcome: 'PASS' | 'FAIL' | 'UNKNOWN' | null;
}
export type SemanticEventInput = Omit<SemanticToolEvent, 'schema' | 'eventId' | 'at'>;

/** Research-only, allowlisted classifications; never records prompts, responses or arguments. */
export class SemanticEventLedger {
  private readonly fd: number;
  constructor(readonly file: string) {
    fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
    this.fd = fs.openSync(file, 'wx', 0o600);
  }
  record(input: SemanticEventInput): SemanticToolEvent {
    if (!SEMANTIC_EVENT_TYPES.includes(input.type)) throw new Error('semantic_event_type_invalid');
    if (!/^[a-zA-Z0-9:._-]{1,160}$/.test(input.runId)) throw new Error('semantic_event_run_id_invalid');
    if (input.modelCallId !== null && !/^[a-zA-Z0-9:._-]{1,160}$/.test(input.modelCallId)) throw new Error('semantic_event_call_id_invalid');
    if (input.toolId !== null && !/^[a-zA-Z0-9:._-]{1,160}$/.test(input.toolId)) throw new Error('semantic_event_tool_id_invalid');
    if (input.responseSha256 !== null && !/^[a-f0-9]{64}$/.test(input.responseSha256)) throw new Error('semantic_event_response_hash_invalid');
    if (input.reasonCode !== null && !/^[A-Z0-9_:-]{1,100}$/.test(input.reasonCode)) throw new Error('semantic_event_reason_invalid');
    const event: SemanticToolEvent = {schema: 'agent-control.semantic-tool-event/v1', eventId: randomUUID(), at: new Date().toISOString(), ...input};
    fs.writeSync(this.fd, JSON.stringify(event) + '\n');
    fs.fsyncSync(this.fd);
    return event;
  }
  close() { fs.closeSync(this.fd); }
}

export function responseDigest(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** Isolated fixture forensic capture; explicit grant and owner-only files. */
export class ResearchForensicResponseVault {
  constructor(readonly directory: string, readonly retentionUntil: string, grant: string | undefined) {
    if (grant !== 'ISOLATED_SYNTHETIC_FIXTURE') throw new Error('forensic_capture_permission_required');
    if (!/^\d{4}-\d{2}-\d{2}T/.test(retentionUntil)) throw new Error('forensic_retention_required');
    fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    fs.chmodSync(directory, 0o700);
  }
  record(modelCallId: string, raw: string) {
    const digest = responseDigest(raw);
    const safe = raw
      .replace(/-----BEGIN [\s\S]*?PRIVATE KEY-----[\s\S]*?-----END [\s\S]*?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED_CREDENTIAL]')
      .replace(/(bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
      .replace(/((?:password|api[_-]?key|secret|token)\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]');
    const record = {schema: 'agent-control.research-forensic-response/v1', modelCallId, rawSha256: digest,
      sanitizedSha256: responseDigest(safe), sanitizationChanged: safe !== raw, retainedUntil: this.retentionUntil,
      scope: 'ISOLATED_SYNTHETIC_FIXTURE', sanitizedResponse: safe};
    const file = path.join(this.directory, `${responseDigest(modelCallId)}.json`);
    fs.writeFileSync(file, JSON.stringify(record) + '\n', {encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true});
  }
}
