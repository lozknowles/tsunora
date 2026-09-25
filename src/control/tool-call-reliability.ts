import {createHash} from 'node:crypto';
import {Ajv, type ValidateFunction} from 'ajv';

export interface ToolContract {
  id: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallReliabilityRecord {
  schema: 'agent-control.tool-call-reliability/v1';
  rawSha256: string;
  normalizedSha256: string | null;
  toolId: string | null;
  firstPassValid: boolean;
  decision: 'DISPATCH' | 'REJECT';
  repair: 'NONE' | 'TRAILING_COMMA' | 'NATIVE_FUNCTION_ENVELOPE' | 'EMPTY_INPUT_DEFAULT';
  reason: string;
}

export interface ToolCallDecision {
  record: ToolCallReliabilityRecord;
  request?: {tool: string; input: unknown};
}

/** An opt-in, fail-closed decoder. It never invents a tool name or argument. */
export class ToolCallReliabilityGate {
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(contracts: ToolContract[]) {
    const ajv = new Ajv({strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false});
    for (const contract of contracts) {
      if (!contract.id || this.validators.has(contract.id)) throw new Error('tool_reliability_contract_invalid');
      this.validators.set(contract.id, ajv.compile(contract.inputSchema));
    }
  }

  evaluate(content: string, grantedIds?: ReadonlySet<string>): ToolCallDecision {
    const rawSha256 = sha(content);
    const record: ToolCallReliabilityRecord = {
      schema: 'agent-control.tool-call-reliability/v1', rawSha256, normalizedSha256: null,
      toolId: null, firstPassValid: false, decision: 'REJECT', repair: 'NONE', reason: 'UNCLASSIFIED',
    };
    if (Buffer.byteLength(content, 'utf8') > 131_072) return {record: {...record, reason: 'RESPONSE_TOO_LARGE'}};
    const normalized = content.trim().match(/^```json\s*([\s\S]*?)\s*```$/i)?.[1] ?? content.trim();
    if (hasDuplicateObjectKeys(normalized)) return {record: {...record, reason: 'AMBIGUOUS_DUPLICATE_KEY'}};
    let parsed: unknown;
    let repair: ToolCallReliabilityRecord['repair'] = 'NONE';
    try { parsed = JSON.parse(normalized); }
    catch {
      const stripped = stripTrailingCommas(normalized);
      if (stripped === normalized) return {record: {...record, reason: 'INVALID_JSON'}};
      try { parsed = JSON.parse(stripped); repair = 'TRAILING_COMMA'; }
      catch { return {record: {...record, reason: 'INVALID_JSON'}}; }
    }
    if (!plainObject(parsed)) return {record: {...record, reason: 'INVALID_ENVELOPE'}};
    let request: {tool: string; input: unknown};
    if (sameKeys(parsed, ['tool', 'input']) || sameKeys(parsed, ['tool'])) {
      if (typeof parsed.tool !== 'string' || !parsed.tool.trim()) return {record: {...record, reason: 'MISSING_TOOL'}};
      const inputPresent = Object.hasOwn(parsed, 'input');
      request = {tool: parsed.tool, input: inputPresent ? parsed.input : {}};
      if (!inputPresent) repair = 'EMPTY_INPUT_DEFAULT';
    } else if (repair === 'NONE' && sameKeys(parsed, ['name', 'arguments'])) {
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) return {record: {...record, reason: 'MISSING_TOOL'}};
      let args = parsed.arguments;
      if (typeof args === 'string') {
        if (hasDuplicateObjectKeys(args)) return {record: {...record, reason: 'AMBIGUOUS_DUPLICATE_KEY'}};
        try { args = JSON.parse(args); } catch { return {record: {...record, reason: 'INVALID_ARGUMENTS'}}; }
      }
      if (!plainObject(args)) return {record: {...record, reason: 'INVALID_ARGUMENTS'}};
      request = {tool: parsed.name, input: args};
      repair = 'NATIVE_FUNCTION_ENVELOPE';
    } else return {record: {...record, reason: 'AMBIGUOUS_ENVELOPE'}};

    const validator = this.validators.get(request.tool);
    if (!validator) return {record: {...record, toolId: request.tool, reason: 'TOOL_NOT_GRANTED'}};
    if (grantedIds && !grantedIds.has(request.tool)) return {record: {...record, toolId: request.tool, reason: 'TOOL_NOT_GRANTED'}};
    if (!validator(request.input)) return {record: {...record, toolId: request.tool, reason: 'SCHEMA_INVALID'}};
    const firstPassValid = repair === 'NONE';
    return {request, record: {...record, normalizedSha256: sha(JSON.stringify(request)), toolId: request.tool,
      firstPassValid, decision: 'DISPATCH', repair, reason: firstPassValid ? 'VALID' : 'SAFE_REPAIR'}};
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function sameKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every(key => keys.includes(key));
}
function sha(value: string) { return createHash('sha256').update(value).digest('hex'); }

/** Detect duplicate JSON object keys before JSON.parse silently keeps the last. */
export function hasDuplicateObjectKeys(value: string): boolean {
  const stack: Array<{kind: 'object' | 'array'; keys: Set<string>; expectsKey: boolean}> = [];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '{' || char === '[') { stack.push({kind: char === '{' ? 'object' : 'array', keys: new Set(), expectsKey: char === '{'}); continue; }
    if (char === '}' || char === ']') { stack.pop(); continue; }
    if (char === ',') { const current = stack.at(-1); if (current?.kind === 'object') current.expectsKey = true; continue; }
    if (char !== '"') continue;
    const start = index;
    index++;
    for (; index < value.length; index++) {
      if (value[index] === '\\') { index++; continue; }
      if (value[index] === '"') break;
    }
    if (index >= value.length) return false; // The JSON parser reports malformed strings.
    const current = stack.at(-1);
    if (current?.kind === 'object' && current.expectsKey) {
      let key: string;
      try { key = JSON.parse(value.slice(start, index + 1)) as string; } catch { return false; }
      if (current.keys.has(key)) return true;
      current.keys.add(key); current.expectsKey = false;
    }
  }
  return false;
}

/** Remove only commas immediately preceding a closing object/array delimiter, outside JSON strings. */
function stripTrailingCommas(value: string): string {
  let output = '', inString = false, escaped = false, changed = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; output += char; continue; }
    if (char === ',') {
      let next = index + 1;
      while (next < value.length && /\s/.test(value[next])) next++;
      if (value[next] === '}' || value[next] === ']') { changed = true; continue; }
    }
    output += char;
  }
  return changed ? output : value;
}
