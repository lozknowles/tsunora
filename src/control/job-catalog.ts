import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parse as parseYaml} from 'yaml';
import type {JobDefinition, ParameterDefinition, ScheduleDefinition} from './job-types.js';

const schemaDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/schemas');
const jobSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'job-v1.schema.json'), 'utf8'));
const scheduleSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'schedule-v1.schema.json'), 'utf8'));
type SchemaError = {instancePath: string; message?: string};
type SchemaValidator<T> = ((value: unknown) => value is T) & {errors?: SchemaError[] | null};
const Ajv2020 = createRequire(import.meta.url)('ajv/dist/2020') as new (options: Record<string, unknown>) => {compile<T>(schema: unknown): SchemaValidator<T>};
const ajv = new Ajv2020({allErrors: true, strict: true});
const validateJobSchema = ajv.compile<JobDefinition>(jobSchema);
const validateScheduleSchema = ajv.compile<ScheduleDefinition>(scheduleSchema);

export class JobManifestError extends Error {constructor(readonly issues: string[]) {super(issues.join('; ')); this.name = 'JobManifestError';}}
export interface CatalogSnapshot {version: 1; jobs: JobDefinition[]; schedules: ScheduleDefinition[];}

function parseDocument(text: string, file: string): unknown {
  try { return /\.json$/i.test(file) ? JSON.parse(text) : parseYaml(text); }
  catch (error) { throw new JobManifestError([`manifest_parse_failed:${path.basename(file)}:${error instanceof Error ? error.message : String(error)}`]); }
}
function validationIssues(errors: SchemaError[] | null | undefined) { return (errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`); }
function rejectSecretMaterial(value: unknown, trail = 'manifest') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (trail.endsWith('.parameters')) { rejectSecretMaterial(child, `${trail}.${key}`); continue; }
    if (/token|password|credential|api.?key|secret/i.test(key) && key !== 'secretRef') throw new JobManifestError([`secret_material_forbidden:${trail}.${key}`]);
    rejectSecretMaterial(child, `${trail}.${key}`);
  }
}
function assertDependencies(job: JobDefinition) {
  const ids = new Set(job.spec.steps.map(step => step.id));
  if (ids.size !== job.spec.steps.length) throw new JobManifestError(['duplicate_step_id']);
  for (const step of job.spec.steps) for (const dependency of step.dependsOn ?? []) if (!ids.has(dependency)) throw new JobManifestError([`invalid_dependency:${step.id}:${dependency}`]);
  const visiting = new Set<string>(), visited = new Set<string>();
  const byId = new Map(job.spec.steps.map(step => [step.id, step]));
  const walk = (id: string) => { if (visiting.has(id)) throw new JobManifestError([`circular_dependency:${id}`]); if (visited.has(id)) return; visiting.add(id); for (const dependency of byId.get(id)?.dependsOn ?? []) walk(dependency); visiting.delete(id); visited.add(id); };
  for (const id of ids) walk(id);
}

export function validateJobManifest(raw: unknown, knownActions?: Set<string>): JobDefinition {
  rejectSecretMaterial(raw);
  if (!validateJobSchema(raw)) throw new JobManifestError(validationIssues(validateJobSchema.errors));
  const job = structuredClone(raw);
  assertDependencies(job);
  if (knownActions) for (const step of job.spec.steps) if (!knownActions.has(step.action)) throw new JobManifestError([`invalid_action:${step.action}`]);
  validateParameterDefinitions(job.spec.parameters ?? {});
  return job;
}
export function validateScheduleManifest(raw: unknown): ScheduleDefinition {
  rejectSecretMaterial(raw);
  if (!validateScheduleSchema(raw)) throw new JobManifestError(validationIssues(validateScheduleSchema.errors));
  try { new Intl.DateTimeFormat('en-GB', {timeZone: raw.spec.timezone}).format(new Date()); } catch { throw new JobManifestError([`invalid_timezone:${raw.spec.timezone}`]); }
  parseCron(raw.spec.cron);
  return structuredClone(raw);
}
function validateParameterDefinitions(parameters: Record<string, ParameterDefinition>) {
  for (const [name, definition] of Object.entries(parameters)) if (definition.default !== undefined) validateOneParameter(name, definition, definition.default);
}
function validateOneParameter(name: string, definition: ParameterDefinition, value: unknown) {
  const validType = definition.type === 'integer' ? Number.isInteger(value) : definition.type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === definition.type;
  if (!validType) throw new JobManifestError([`invalid_parameter_type:${name}`]);
  if (typeof value === 'number' && (definition.minimum !== undefined && value < definition.minimum || definition.maximum !== undefined && value > definition.maximum)) throw new JobManifestError([`parameter_out_of_range:${name}`]);
  if (definition.enum && !definition.enum.some(candidate => Object.is(candidate, value))) throw new JobManifestError([`parameter_not_allowed:${name}`]);
  if (definition.secretRef && (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{1,127}$/.test(value))) throw new JobManifestError([`invalid_secret_reference:${name}`]);
}
export function effectiveParameters(job: JobDefinition, supplied: Record<string, unknown> = {}) {
  const definitions = job.spec.parameters ?? {}, unknown = Object.keys(supplied).filter(name => !definitions[name]);
  if (unknown.length) throw new JobManifestError(unknown.map(name => `unknown_parameter:${name}`));
  const output: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    const value = supplied[name] ?? definition.default;
    if (value === undefined) { if (definition.required) throw new JobManifestError([`required_parameter_missing:${name}`]); continue; }
    validateOneParameter(name, definition, value); output[name] = value;
  }
  return output;
}

export class JobCatalog {
  private readonly jobs = new Map<string, JobDefinition>();
  private readonly schedules = new Map<string, ScheduleDefinition>();
  constructor(readonly knownActions?: Set<string>) {}
  addJob(raw: unknown) { const job = validateJobManifest(raw, this.knownActions); const key = `${job.metadata.id}@${job.metadata.version}`; if (this.jobs.has(key)) throw new JobManifestError([`duplicate_job:${key}`]); this.jobs.set(key, job); return job; }
  addSchedule(raw: unknown) { const schedule = validateScheduleManifest(raw); if (this.schedules.has(schedule.metadata.id)) throw new JobManifestError([`duplicate_schedule:${schedule.metadata.id}`]); if (!this.jobs.has(schedule.spec.job)) throw new JobManifestError([`schedule_job_missing:${schedule.spec.job}`]); this.schedules.set(schedule.metadata.id, schedule); return schedule; }
  job(reference: string) { return this.jobs.get(reference); }
  schedule(id: string) { return this.schedules.get(id); }
  listJobs() { return [...this.jobs.values()].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)); }
  listSchedules() { return [...this.schedules.values()].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)); }
  snapshot(): CatalogSnapshot { return {version: 1, jobs: this.listJobs(), schedules: this.listSchedules()}; }
  loadDirectory(directory: string) {
    if (!fs.existsSync(directory)) return this;
    const documents = fs.readdirSync(directory).filter(file => /\.(?:ya?ml|json)$/i.test(file)).sort().map(file => ({file: path.join(directory, file), raw: parseDocument(fs.readFileSync(path.join(directory, file), 'utf8'), file)}));
    for (const document of documents.filter(item => (item.raw as {kind?: string})?.kind === 'Job')) this.addJob(document.raw);
    for (const document of documents.filter(item => (item.raw as {kind?: string})?.kind === 'Schedule')) this.addSchedule(document.raw);
    const unsupported = documents.filter(item => !['Job', 'Schedule'].includes((item.raw as {kind?: string})?.kind ?? ''));
    if (unsupported.length) throw new JobManifestError(unsupported.map(item => `unsupported_manifest_kind:${path.basename(item.file)}`));
    return this;
  }
}

function fieldValues(field: string, min: number, max: number) {
  if (field === '*') return new Set(Array.from({length: max - min + 1}, (_, index) => index + min));
  const values = field.split(',').map(value => Number(value));
  if (values.some(value => !Number.isInteger(value) || value < min || value > max)) throw new JobManifestError([`invalid_cron_field:${field}`]);
  return new Set(values);
}
export function parseCron(expression: string) { const fields = expression.trim().split(/\s+/); if (fields.length !== 5) throw new JobManifestError(['invalid_cron']); return {minutes: fieldValues(fields[0], 0, 59), hours: fieldValues(fields[1], 0, 23), days: fieldValues(fields[2], 1, 31), months: fieldValues(fields[3], 1, 12), weekdays: fieldValues(fields[4], 0, 6)}; }
export function nextCronOccurrence(expression: string, timeZone: string, after: Date) {
  const cron = parseCron(expression), formatter = new Intl.DateTimeFormat('en-GB', {timeZone, minute: '2-digit', hour: '2-digit', day: '2-digit', month: '2-digit', weekday: 'short', hourCycle: 'h23'}), weekday = new Map([['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]]);
  let candidate = new Date(Math.floor(after.getTime() / 60000) * 60000 + 60000);
  for (let count = 0; count < 60 * 24 * 400; count++, candidate = new Date(candidate.getTime() + 60000)) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    if (cron.minutes.has(Number(parts.minute)) && cron.hours.has(Number(parts.hour)) && cron.days.has(Number(parts.day)) && cron.months.has(Number(parts.month)) && cron.weekdays.has(weekday.get(parts.weekday) ?? -1)) return candidate;
  }
  throw new Error('cron_next_occurrence_not_found');
}
