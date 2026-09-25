import fs from 'node:fs';
import path from 'node:path';
import {assertNoSensitiveMaterial, redactSensitiveValue} from './security-redaction.js';
import {nextCronOccurrence, parseCron} from './job-catalog.js';
import type {JobParameterSchema, ParameterizedJobDefinition, ParameterizedJobRun, SavedJob} from './parameterized-job-types.js';

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const PARAMETER = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const GIT_REF = /^(?!-)(?!.*(?:\.\.|@\{|\\|\s|[~^:?*\[]))[A-Za-z0-9._/-]+$/;
const SECRET_NAME = /(?:^|[-_.])(token|password|secret|api[-_.]?key|credential)(?:$|[-_.])/i;
function clone<T>(value: T): T { return structuredClone(value); }
function atomic(file: string, value: unknown) { fs.mkdirSync(path.dirname(file), {recursive: true}); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(redactSensitiveValue(value), null, 2)}\n`, {mode: 0o600,flush:true}); fs.renameSync(temporary, file); if(process.platform!=='win32'){const fd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}} }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

export class ParameterizedJobError extends Error { constructor(readonly code: string, detail?: string) { super(detail ? `${code}:${detail}` : code); this.name = 'ParameterizedJobError'; } }

export function validateParameterizedDefinition(value: ParameterizedJobDefinition) {
  if (value.schema !== 'agent-control.job-definition/v1' || !ID.test(value.id) || !Number.isSafeInteger(value.version) || value.version < 1) throw new ParameterizedJobError('job_definition_invalid');
  if (!value.displayName.trim() || !value.description.trim() || !value.routing.modelRole.trim()) throw new ParameterizedJobError('job_definition_invalid');
  if (value.permissions.repository !== 'read-only') throw new ParameterizedJobError('job_definition_write_authority_forbidden');
  if (value.budgets.timeoutMinutes < 1 || value.budgets.maximumRetries < 0 || !validRecoveryBudget(value.budgets)) throw new ParameterizedJobError('job_budget_invalid');
  if (!value.template.instruction.trim() || value.template.version < 1) throw new ParameterizedJobError('job_template_invalid');
  for (const [name, schema] of Object.entries(value.parameters)) {
    if (!PARAMETER.test(name) || !schema.description.trim() || SECRET_NAME.test(name)) throw new ParameterizedJobError('job_parameter_schema_invalid', name);
    if (schema.type === 'enum' && (!schema.values?.length || schema.values.some(item => !['string', 'number', 'boolean'].includes(typeof item)))) throw new ParameterizedJobError('job_parameter_enum_invalid', name);
    if (schema.default !== undefined) validateParameter(name, schema, schema.default);
  }
  return clone(value);
}

export function resolveParameters(definition: ParameterizedJobDefinition, supplied: Record<string, unknown>) {
  for (const name of Object.keys(supplied)) if (!definition.parameters[name]) throw new ParameterizedJobError('unknown_parameter', name);
  const result: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(definition.parameters)) {
    const value = supplied[name] ?? schema.default;
    if (value === undefined) { if (schema.required) throw new ParameterizedJobError('required_parameter_missing', name); continue; }
    validateParameter(name, schema, value); result[name] = clone(value);
  }
  return result;
}

function validateParameter(name: string, schema: JobParameterSchema, value: unknown) {
  if (SECRET_NAME.test(name)) throw new ParameterizedJobError('secret_parameter_forbidden', name);
  if (schema.type === 'integer' || schema.type === 'duration') {
    if (!Number.isSafeInteger(value)) throw new ParameterizedJobError('invalid_parameter_type', name);
    const number = Number(value); if (schema.minimum !== undefined && number < schema.minimum || schema.maximum !== undefined && number > schema.maximum) throw new ParameterizedJobError('parameter_out_of_range', name);
  } else if (schema.type === 'boolean') { if (typeof value !== 'boolean') throw new ParameterizedJobError('invalid_parameter_type', name); }
  else if (schema.type === 'enum') { if (!schema.values?.some(candidate => Object.is(candidate, value))) throw new ParameterizedJobError('parameter_not_allowed', name); }
  else if (typeof value !== 'string' || !value.trim()) throw new ParameterizedJobError('invalid_parameter_type', name);
  if (schema.type === 'path') { if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) === path.parse(value).root || value.includes('\0')) throw new ParameterizedJobError('invalid_absolute_path', name); }
  if (schema.type === 'repository') { if (typeof value !== 'string' || !repositoryReference(value)) throw new ParameterizedJobError('invalid_repository_reference', name); }
  if (schema.type === 'git-ref' && (typeof value !== 'string' || !GIT_REF.test(value))) throw new ParameterizedJobError('invalid_git_ref', name);
  if ((schema.type === 'node' || schema.type === 'model-role') && (typeof value !== 'string' || !ID.test(value))) throw new ParameterizedJobError('invalid_identifier_parameter', name);
}
function repositoryReference(value: string) { if (value.includes('\0')) return false; if (path.isAbsolute(value) || path.win32.isAbsolute(value)) { const flavor = path.win32.isAbsolute(value) ? path.win32 : path; return flavor.normalize(value) !== flavor.parse(value).root; } try { const parsed = new URL(value); return ['https:', 'git:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash; } catch { return false; } }

export class ParameterizedJobRegistry {
  private readonly definitions = new Map<string, ParameterizedJobDefinition>();
  register(raw: ParameterizedJobDefinition) { const definition = validateParameterizedDefinition(raw), key = `${definition.id}@${definition.version}`; const existing = this.definitions.get(key); if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) throw new ParameterizedJobError('incompatible_definition_update', key); this.definitions.set(key, definition); return clone(definition); }
  get(id: string, version?: number) { const value = version === undefined ? this.list(id).at(-1) : this.definitions.get(`${id}@${version}`); if (!value) throw new ParameterizedJobError('unknown_definition', version ? `${id}@${version}` : id); return clone(value); }
  list(id?: string) { return [...this.definitions.values()].filter(item => !id || item.id === id).sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version).map(clone); }
  resolve(saved: SavedJob) { if (saved.definition.follow === 'pinned') return this.get(saved.definition.id, saved.definition.version); const versions = this.list(saved.definition.id).filter(item => item.version === saved.definition.version || item.compatibleWith?.includes(saved.definition.version)); if (!versions.length) throw new ParameterizedJobError('incompatible_definition_update', saved.definition.id); return versions.at(-1)!; }
}

interface SavedState {version: 1; jobs: SavedJob[];}
export class SavedJobStore {
  private readonly jobs = new Map<string, SavedJob>();
  constructor(readonly file: string, private readonly registry: ParameterizedJobRegistry, private readonly clock: () => Date = () => new Date()) { if (fs.existsSync(file)) { const state = JSON.parse(fs.readFileSync(file, 'utf8')) as SavedState; if (state.version !== 1 || !Array.isArray(state.jobs)) throw new ParameterizedJobError('saved_job_state_invalid'); for (const job of state.jobs) this.jobs.set(job.id, this.validate(job)); } }
  create(input: Omit<SavedJob, 'schema' | 'revision' | 'createdAt' | 'updatedAt'>) { if (this.jobs.has(input.id)) throw new ParameterizedJobError('saved_job_exists', input.id); const at = this.clock().toISOString(), job = this.validate({...input, schema: 'agent-control.saved-job/v1', revision: 1, createdAt: at, updatedAt: at}); this.jobs.set(job.id, job); this.save(); return clone(job); }
  update(id: string, revision: number, changes: Partial<Omit<SavedJob, 'schema' | 'id' | 'revision' | 'createdAt'>>) { const current = this.must(id); if (current.revision !== revision) throw new ParameterizedJobError('saved_job_revision_conflict', id); const next = this.validate({...current, ...changes, id, schema: current.schema, revision: revision + 1, createdAt: current.createdAt, updatedAt: this.clock().toISOString()}); this.jobs.set(id, next); this.save(); return clone(next); }
  setEnabled(id: string, enabled: boolean, revision: number) { return this.update(id, revision, {enabled}); }
  get(id: string) { return clone(this.must(id)); }
  list() { return [...this.jobs.values()].sort((a, b) => a.name.localeCompare(b.name)).map(clone); }
  export(id: string) { const value = this.get(id); return {schema: value.schema, id: value.id, name: value.name, definition: value.definition, parameters: value.parameters, routing: value.routing, contextProfile: value.contextProfile, budgets: value.budgets, schedule: value.schedule, concurrency: value.concurrency, executionMode: value.executionMode ?? 'LIVE', enabled: value.enabled}; }
  private must(id: string) { const value = this.jobs.get(id); if (!value) throw new ParameterizedJobError('saved_job_missing', id); return value; }
  private validate(value: SavedJob) { assertNoSensitiveMaterial(JSON.stringify(value), 'saved_job_credential_material_forbidden'); if (value.schema !== 'agent-control.saved-job/v1' || !ID.test(value.id) || !value.name.trim() || value.revision < 1) throw new ParameterizedJobError('saved_job_invalid'); const definition = this.registry.resolve(value); resolveParameters(definition, value.parameters); if (!['THIN', 'STANDARD', 'DEEP'].includes(value.contextProfile) || !['forbid-overlap', 'queue', 'allow'].includes(value.concurrency) || (value.executionMode !== undefined && !['LIVE','CONTROLLED_FAULT_INJECTION','SIMULATED'].includes(value.executionMode))) throw new ParameterizedJobError('saved_job_policy_invalid'); if (value.routing?.model && value.routing.modelRole) throw new ParameterizedJobError('saved_job_route_ambiguous'); if (value.routing?.accountProfile !== undefined && !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value.routing.accountProfile)) throw new ParameterizedJobError('saved_job_account_profile_invalid'); if (value.routing?.purpose !== undefined && !['EXECUTION','QUALIFICATION'].includes(value.routing.purpose)) throw new ParameterizedJobError('saved_job_route_purpose_invalid'); validateBudgetOverrides(value.budgets); if (value.schedule) validateSchedule(value.schedule); return clone(value); }
  private save() { atomic(this.file, {version: 1, jobs: this.list()}); }
}

function validateSchedule(schedule: SavedJob['schedule']) { if (!schedule) return; try { new Intl.DateTimeFormat('en-GB', {timeZone: schedule.timezone}).format(new Date()); } catch { throw new ParameterizedJobError('invalid_timezone'); } if (schedule.kind === 'cron') parseCron(schedule.cron); else if (!Number.isFinite(Date.parse(schedule.at))) throw new ParameterizedJobError('invalid_once_schedule'); }
function validateBudgetOverrides(budgets: SavedJob['budgets']) { if (!budgets) return; if (budgets.timeoutMinutes !== undefined && (!Number.isFinite(budgets.timeoutMinutes) || budgets.timeoutMinutes <= 0) || budgets.maxCost !== undefined && (!Number.isFinite(budgets.maxCost) || budgets.maxCost < 0) || budgets.maximumRetries !== undefined && (!Number.isSafeInteger(budgets.maximumRetries) || budgets.maximumRetries < 0) || budgets.maximumInputTokens !== undefined && (!Number.isSafeInteger(budgets.maximumInputTokens) || budgets.maximumInputTokens < 1) || budgets.maximumOutputTokens !== undefined && (!Number.isSafeInteger(budgets.maximumOutputTokens) || budgets.maximumOutputTokens < 1) || !validRecoveryBudget(budgets)) throw new ParameterizedJobError('saved_job_budget_invalid'); }
function validRecoveryBudget(budgets: Partial<import('./parameterized-job-types.js').JobBudgetPolicy>) { return (budgets.retryBackoffSeconds === undefined || Number.isFinite(budgets.retryBackoffSeconds) && budgets.retryBackoffSeconds >= 0) && (budgets.retryBackoffMultiplier === undefined || Number.isFinite(budgets.retryBackoffMultiplier) && budgets.retryBackoffMultiplier >= 1) && (budgets.retryMaximumBackoffSeconds === undefined || Number.isFinite(budgets.retryMaximumBackoffSeconds) && budgets.retryMaximumBackoffSeconds >= 0); }

interface RunState {version: 1; runs: ParameterizedJobRun[];}
export class ParameterizedRunStore {
  private readonly listeners=new Set<(run:ParameterizedJobRun)=>void>();
  subscribe(listener:(run:ParameterizedJobRun)=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private notify(run:ParameterizedJobRun){for(const listener of this.listeners){try{listener(clone(run));}catch{/* Optional observers cannot impair runtime. */}}}
  private readonly runs = new Map<string, ParameterizedJobRun>();
  constructor(readonly file: string) { if (!fs.existsSync(file)) return; const state = JSON.parse(fs.readFileSync(file, 'utf8')) as RunState; if (state.version !== 1 || !Array.isArray(state.runs)) throw new ParameterizedJobError('job_run_state_invalid'); for (const run of state.runs) this.runs.set(run.id, redactSensitiveValue(run)); }
  add(run: ParameterizedJobRun) { if ([...this.runs.values()].some(item => item.occurrenceId === run.occurrenceId)) throw new ParameterizedJobError('duplicate_schedule_occurrence', run.occurrenceId); const safe=clone(redactSensitiveValue(run)); this.runs.set(run.id, safe); this.save();this.notify(safe); return this.get(run.id)!; }
  update(run: ParameterizedJobRun) { const previous = this.runs.get(run.id); if (!previous) throw new ParameterizedJobError('job_run_missing', run.id); if (previous.immutable) throw new ParameterizedJobError('historical_run_immutable', run.id); const safe=clone(redactSensitiveValue(run)); this.runs.set(run.id, safe); this.save();this.notify(safe); return this.get(run.id)!; }
  occurrence(id: string) { return this.list().find(run => run.occurrenceId === id); }
  get(id: string) { const value = this.runs.get(id); return value ? clone(value) : undefined; }
  list(savedJobId?: string) { return [...this.runs.values()].filter(run => !savedJobId || run.savedJobId === savedJobId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map(clone); }
  private save() { atomic(this.file, {version: 1, runs: this.list()}); }
}

export function nextSavedJobOccurrence(job: SavedJob, after: Date) { if (!job.schedule?.enabled) return undefined; if (job.schedule.kind === 'once') { const at = new Date(job.schedule.at); return at > after ? at : undefined; } return nextCronOccurrence(job.schedule.cron, job.schedule.timezone, after); }
