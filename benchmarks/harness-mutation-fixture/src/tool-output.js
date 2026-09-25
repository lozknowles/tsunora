import {createHash} from 'node:crypto';

const MODEL_OUTPUT_LIMIT_BYTES = 32_768;

export function modelFacingToolResult(value, _config = {}) {
  const authoritative = JSON.stringify(value);
  const bytes = Buffer.byteLength(authoritative, 'utf8');
  const hash = createHash('sha256').update(authoritative).digest('hex');
  if (bytes <= MODEL_OUTPUT_LIMIT_BYTES) return {state: 'COMPLETE', output: authoritative, originalBytes: bytes, returnedBytes: bytes, authoritativeHash: hash};
  const prefix = Buffer.from(authoritative, 'utf8').subarray(0, MODEL_OUTPUT_LIMIT_BYTES - 160).toString('utf8');
  const output = JSON.stringify({state: 'COMPACTED', originalBytes: bytes, prefix, authoritativeHash: hash});
  return {state: 'COMPACTED', output, originalBytes: bytes, returnedBytes: Buffer.byteLength(output, 'utf8'), authoritativeHash: hash};
}
