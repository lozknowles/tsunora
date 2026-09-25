import {createHash} from 'node:crypto';
import fs from 'node:fs';
import type {ToolCallReliabilityRecord} from './tool-call-reliability.js';

export interface ToolReliabilityAuditEntry extends ToolCallReliabilityRecord {
  recipeId: string;
  turn: number;
}

/** Experimental append-only hash chain. Only response/argument hashes, never raw content. */
export class ToolReliabilityAuditLedger {
  private readonly fd: number;
  private previousSha256 = '0'.repeat(64);
  private sequence = 0;

  constructor(file: string) {
    this.fd = fs.openSync(file, 'wx', 0o600);
  }

  record = (entry: ToolReliabilityAuditEntry): void => {
    const body = {schema: 'agent-control.tool-repair-audit/v1' as const,
      sequence: ++this.sequence, previousSha256: this.previousSha256, observedAt: new Date().toISOString(), record: entry};
    const entrySha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const line = JSON.stringify({...body, entrySha256}) + '\n';
    const written = fs.writeSync(this.fd, line);
    if (written !== Buffer.byteLength(line, 'utf8')) throw new Error('tool_reliability_audit_short_write');
    fs.fsyncSync(this.fd);
    this.previousSha256 = entrySha256;
  };

  close(): void { fs.closeSync(this.fd); }
}
