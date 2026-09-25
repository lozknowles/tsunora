import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import type {AgentControlService} from './application-service.js';
import type {SocialVoiceCoordinator} from './social-voice.js';
import type {SocialIdentity} from './social-voice-providers.js';
import {readBoundedResponse, validateAudio} from './social-voice-providers.js';
import {messagingReport, parseMessagingCommand, proposeMessagingCommand, terminalMessagingRun, validateMessagingRun, type MessagingCommand} from './messaging-commands.js';
import {savedMessagingMilestones,savedMessagingReport,validateSavedMessagingRun,type MessagingObservedRun} from './messaging-saved-jobs.js';
import {governedRequestOrigin} from './request-origin.js';

export const OPENWA_COMMIT = '1bfebfe57232bcb20ddd0975560d3f4bc994fb36';
const templateSchema = z.object({kind:z.enum(['legacy','saved']).optional(),name: z.string().regex(/^[a-z0-9-]+$/), jobId: z.string().min(1), definitionHash: z.string().regex(/^[a-f0-9]{64}$/), parameters: z.record(z.string(), z.unknown()), arguments: z.record(z.string(), z.array(z.union([z.string(), z.number(), z.boolean()])).min(1)), maxActive: z.number().int().min(1).max(10), maxRunsPerHour: z.number().int().min(1).max(60)}).strict();
export const openwaConfigSchema = z.object({gatewayUrl: z.url(), sessionId: z.string().uuid(), expectedPhone: z.string().regex(/^\+[1-9][0-9]{7,14}$/), accountLabel: z.string().max(80), dashboardUrl: z.url(), apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/), webhookSecretEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/), templates: z.array(templateSchema), progressSeconds: z.number().int().min(30).max(3600).default(60)}).strict();
export type OpenWAConfig = z.infer<typeof openwaConfigSchema>;
type Row = Record<string, any>;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const jid = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{5,25}@(c\.us|s\.whatsapp\.net|lid)$/.test(value);
const help = 'Send one command per message:\nhelp · jobs · run <template>\nstatus job 1 · cancel job 1 · report job 1\nwatch job 1 · unwatch job 1\nUse the job number shown in your reply. No internal ID needed. Optional approved arguments use JSON. Pause/resume unsupported; approvals use the authenticated dashboard.';

/** One adapter per isolated controller/state directory; SQLite persists command and delivery state.
 * The existing runtime persists request keys, closing the two-store enqueue crash window.
 */
export class OpenWAAdapter {
  social?: SocialVoiceCoordinator;
  readonly db: DatabaseSync;
  readonly config: OpenWAConfig;
  private enabled = true;
  private busy = false;
  private stopped = false;
  private health = {state: 'unchecked', phone: null as string | null, checkedAt: 0};
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private readonly apiKey: string;
  private readonly secret: string;
  constructor(readonly service: AgentControlService, config: OpenWAConfig, file: string, private readonly request: typeof fetch = fetch, private readonly clock = Date.now) {
    this.config = openwaConfigSchema.parse(config);
    const gateway = new URL(config.gatewayUrl);
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(gateway.hostname) || gateway.username || gateway.password || gateway.search || gateway.hash) throw new Error('openwa_gateway_must_be_loopback');
    const dashboard = new URL(config.dashboardUrl);
    if (!['http:', 'https:'].includes(dashboard.protocol) || dashboard.username || dashboard.password || dashboard.search || dashboard.hash) throw new Error('openwa_dashboard_url_invalid');
    this.apiKey = process.env[config.apiKeyEnv] ?? ''; this.secret = process.env[config.webhookSecretEnv] ?? '';
    if (this.apiKey.length < 16 || this.secret.length < 32) throw new Error('openwa_secrets_missing_or_short');
    fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
    this.db = new DatabaseSync(file); fs.chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operators (sender TEXT PRIMARY KEY, grants TEXT NOT NULL, active INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS pairing (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, sender TEXT);
      CREATE TABLE IF NOT EXISTS commands (key TEXT PRIMARY KEY, at INTEGER NOT NULL, sender TEXT NOT NULL, verb TEXT NOT NULL, state TEXT NOT NULL, runId TEXT, code TEXT);
      CREATE TABLE IF NOT EXISTS job_numbers (sender TEXT NOT NULL, number INTEGER NOT NULL, runId TEXT NOT NULL, PRIMARY KEY(sender,number), UNIQUE(sender,runId));
      CREATE TABLE IF NOT EXISTS watches (sender TEXT NOT NULL, runId TEXT NOT NULL, fingerprint TEXT, notified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(sender,runId));
      CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, dedupe TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, runId TEXT, body TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL, remoteId TEXT, code TEXT);`);
    this.enabled = this.db.prepare("SELECT value FROM settings WHERE key='enabled'").get()?.value !== 'false';
    if (!(this.db.prepare('PRAGMA table_info(watches)').all() as Row[]).some(column=>column.name==='runStatus')) this.db.exec('ALTER TABLE watches ADD COLUMN runStatus TEXT');
    const scope=digest(`${this.config.sessionId}:${this.config.expectedPhone}`), previousScope=this.db.prepare("SELECT value FROM settings WHERE key='identityScope'").get()?.value;
    if(previousScope && previousScope!==scope){this.db.close();throw new Error('openwa_identity_changed_new_enrolment_required');}
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES ('identityScope',?)").run(scope);
    this.db.exec('BEGIN IMMEDIATE');
    try { for(const row of this.db.prepare("SELECT sender,runId FROM commands WHERE verb='run' AND runId IS NOT NULL ORDER BY at,key").all() as Row[])this.jobNumber(row.sender,row.runId);this.db.exec('COMMIT'); } catch(error){this.db.exec('ROLLBACK');throw error;}
    // An interrupted HTTP send might already have reached WhatsApp. Never silently resend it.
    this.db.exec("UPDATE outbox SET state='uncertain',code='restart_during_send' WHERE state='sending'");
  }
  start() {
    this.unsubscribe = this.service.events.subscribe(event => { if (event.type.startsWith('job.') || event.type.startsWith('token.')) { try { this.reconcile(); } catch { /* isolated adapter; next tick retries */ } } });
    this.timer = setInterval(() => void this.tick().catch(() => {}), 1000); this.timer.unref();
    void this.tick().catch(() => {});
  }
  close() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.unsubscribe?.(); if (!this.busy) this.db.close(); }
  status() {
    return {enabled: this.enabled, gatewayCommit: OPENWA_COMMIT, health: this.health, accountLabel: this.config.accountLabel,
      templates: this.config.templates.map(({name, jobId, arguments: args, maxActive, maxRunsPerHour}) => ({name, jobId, arguments: args, maxActive, maxRunsPerHour})),
      operators: this.db.prepare('SELECT sender,grants,active,progress FROM operators').all(),
      pairing: this.db.prepare('SELECT hash,sender,expires FROM pairing WHERE expires>?').all(this.clock()),
      commands: this.db.prepare('SELECT at,sender,verb,state,runId,code,(SELECT number FROM job_numbers n WHERE n.sender=commands.sender AND n.runId=commands.runId) AS jobNumber FROM commands ORDER BY at DESC LIMIT 50').all(),
      deliveries: this.db.prepare('SELECT id,sender,runId,kind,state,attempts,remoteId,code,(SELECT number FROM job_numbers n WHERE n.sender=outbox.sender AND n.runId=outbox.runId) AS jobNumber FROM outbox ORDER BY id DESC LIMIT 50').all()};
  }
  setEnabled(value: boolean) { this.enabled = value; this.db.prepare("INSERT OR REPLACE INTO settings VALUES ('enabled',?)").run(String(value)); }
  beginPairing() {
    this.requireConnected();
    this.db.exec('DELETE FROM pairing');
    const code = randomBytes(16).toString('hex'), expires = this.clock() + 300000;
    this.db.prepare('INSERT INTO pairing(hash,expires) VALUES (?,?)').run(digest(code), expires);
    return {command: `pair ${code}`, expires, instruction: 'Send this from your separate human WhatsApp account in a direct chat with the dedicated gateway account, then confirm the observed sender here.'};
  }
  confirmPairing(hash: string, grants: string[]) {
    this.requireConnected();
    const pairing = this.db.prepare('SELECT * FROM pairing WHERE hash=? AND expires>?').get(hash, this.clock()) as Row | undefined;
    if (!pairing || !jid(pairing.sender)) throw new Error('pairing_not_observed_or_expired');
    if (!Array.isArray(grants) || grants.some(name => !this.config.templates.some(t => t.name === name))) throw new Error('invalid_template_grants');
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.prepare('DELETE FROM settings WHERE key=?').run(`socialApproval:${digest(pairing.sender)}`); this.db.prepare('INSERT OR REPLACE INTO operators(sender,grants,active) VALUES (?,?,1)').run(pairing.sender, JSON.stringify(grants)); this.db.prepare('DELETE FROM pairing WHERE hash=?').run(hash); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return {sender: pairing.sender, enrolled: true};
  }
  revoke(sender: string) {
    this.db.prepare('DELETE FROM settings WHERE key=?').run(`socialApproval:${digest(sender)}`);
    this.db.prepare('UPDATE operators SET active=0 WHERE sender=?').run(sender);
    this.db.prepare('DELETE FROM watches WHERE sender=?').run(sender);
    this.db.prepare("UPDATE outbox SET state='suppressed',body='' WHERE sender=? AND state IN ('queued','retry','failed','uncertain')").run(sender);
  }
  preferences(sender: string, progress: boolean) { this.db.prepare('UPDATE operators SET progress=? WHERE sender=? AND active=1').run(Number(progress), sender); }
  retry(id: number, acknowledgeUncertain = false) {
    const row = this.db.prepare('SELECT * FROM outbox WHERE id=?').get(id) as Row | undefined;
    if (!row || !['failed', 'uncertain'].includes(row.state) || !this.operator(row.sender) || (row.state === 'uncertain' && !acknowledgeUncertain)) throw new Error('delivery_retry_denied_or_duplicate_risk_not_acknowledged');
    this.db.prepare("UPDATE outbox SET state='retry',attempts=0,due=? WHERE id=?").run(this.clock(), id);
  }
  private operator(sender: string) { return this.db.prepare('SELECT * FROM operators WHERE sender=? AND active=1').get(sender) as Row | undefined; }
  private allRuns():MessagingObservedRun[] { return [...this.service.runs(),...(this.config.templates.some(t=>t.kind==='saved')?this.service.parameterizedRuns():[])]; }
  private run(id:string):MessagingObservedRun { return id.startsWith('run-')?this.service.run(id):this.service.parameterizedRun(id); }
  private report(run:MessagingObservedRun,sender:string) { const report='steps' in run?messagingReport(this.service,run,this.config.dashboardUrl,this.clock()):savedMessagingReport(run,this.config.dashboardUrl,this.clock());return report.replace(`${run.id}:`,`Job ${this.jobNumber(sender,run.id)}:`); }
  private jobNumber(sender:string,runId:string):number {
    const existing=this.db.prepare('SELECT number FROM job_numbers WHERE sender=? AND runId=?').get(sender,runId);
    if(existing)return Number(existing.number);
    this.db.prepare('INSERT INTO job_numbers(sender,number,runId) SELECT ?,COALESCE(MAX(number),0)+1,? FROM job_numbers WHERE sender=?').run(sender,runId,sender);
    return Number(this.db.prepare('SELECT number FROM job_numbers WHERE sender=? AND runId=?').get(sender,runId)!.number);
  }
  private resolveReference(sender:string,reference:string):string {
    if(!reference.startsWith('job:'))return reference;
    const row=this.db.prepare('SELECT runId FROM job_numbers WHERE sender=? AND number=?').get(sender,Number(reference.slice(4)));
    if(!row)throw new Error('job_number_not_found_send_jobs');
    return String(row.runId);
  }
  private requireConnected() { if (!this.enabled || this.health.state !== 'connected_verified' || this.clock() - this.health.checkedAt > 45000) throw new Error('gateway_not_verified_connected'); }
  private owns(sender: string, runId: string) { return Boolean(this.db.prepare("SELECT key FROM commands WHERE sender=? AND runId=? AND verb='run'").get(sender, runId)); }
  private queue(dedupe: string, sender: string, body: string, kind = 'reply', runId?: string) {
    // Only generated summaries go into this queue, never upstream bodies, errors or credentials.
    this.db.prepare('INSERT OR IGNORE INTO outbox(dedupe,sender,runId,body,kind,due) VALUES (?,?,?,?,?,?)').run(dedupe, sender, runId ?? null, kind==='voice'?body:body.slice(0,3500), kind, this.clock());
  }
  receive(raw: Buffer, headers: Record<string, string | string[] | undefined>): {ignored?:boolean;rejected?:boolean;duplicate?:boolean;runId?:string|null;pairingObserved?:boolean;accepted?:boolean} {
    if (!this.enabled) throw new Error('integration_disabled');
    if (raw.length > 65536) throw new Error('webhook_too_large');
    const expected = `sha256=${createHmac('sha256', this.secret).update(raw).digest('hex')}`, supplied = headers['x-openwa-signature'];
    if (typeof supplied !== 'string' || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error('invalid_signature');
    let event: any; try { event = JSON.parse(raw.toString('utf8')); } catch { throw new Error('invalid_envelope'); }
    if (!event || typeof event.idempotencyKey!=='string' || !event.idempotencyKey || event.idempotencyKey.length>512 || typeof event.deliveryId!=='string' || !event.deliveryId || event.deliveryId.length>256 || event.sessionId !== this.config.sessionId || event.event !== headers['x-openwa-event'] || event.idempotencyKey !== headers['x-openwa-idempotency-key'] || event.deliveryId !== headers['x-openwa-delivery-id']) throw new Error('invalid_envelope');
    if (event.event === 'message.ack' || event.event === 'message.failed') {
      const id = event.data?.id, state = event.data?.status;
      if (typeof id === 'string' && ['delivered','read','failed'].includes(state)) {
        this.db.prepare("UPDATE outbox SET state=?,body=CASE WHEN ? IN ('delivered','read') THEN '' ELSE body END,code='gateway_delivery_event' WHERE remoteId=? AND (state='submitted' OR (state='delivered' AND ?='read'))").run(state,state,id,state);
      }
      return {ignored: true};
    }
    if (event.event !== 'message.received') return {ignored: true};
    const data = event.data;
    if(this.social && data && data.fromMe===false && data.isGroup===false && data.isForwarded===false && !data.quotedMessage && !data.isStatusBroadcast && jid(data.from) && data.chatId===data.from && typeof data.id==='string' && data.id.length<=256 && ((['audio','voice','ptt'].includes(data.type)) || (data.type==='text' && !data.media && typeof data.body==='string' && this.social.accepts(data.body)))) {
      this.requireConnected();
      if(!this.operator(data.from))return {rejected:true};
      if(!Number.isFinite(Date.parse(event.timestamp))||Math.abs(this.clock()-Date.parse(event.timestamp))>300000||typeof data.timestamp!=='number')throw new Error('stale_event');
      return this.social.accept({id:data.id,identity:{channel:'openwa',account:this.config.sessionId,sender:data.from,conversation:data.from},receivedAt:data.timestamp*1000,kind:data.type==='text'?'text':'audio',...(data.type==='text'?{text:data.body}:{mediaId:data.id})});
    }
    // Pinned gateway forwarding patch is mandatory; absent provenance fails closed.
    if (!data || data.fromMe !== false || data.isGroup !== false || data.isForwarded !== false || data.quotedMessage || data.media || data.type !== 'text' || data.isStatusBroadcast || !jid(data.from) || data.chatId !== data.from || typeof data.id !== 'string' || !data.id || data.id.length > 256 || typeof data.body !== 'string') return {ignored: true};
    const key = digest(`${this.config.sessionId}:${data.id}`), previous = this.db.prepare('SELECT * FROM commands WHERE key=?').get(key) as Row | undefined;
    if (previous && previous.state !== 'processing') return {duplicate: true, runId: previous.runId};
    const at = Date.parse(event.timestamp);
    if (!Number.isFinite(at) || Math.abs(this.clock() - at) > 300000 || typeof data.timestamp !== 'number' || Math.abs(this.clock() - data.timestamp * 1000) > 300000) throw new Error('stale_event');
    this.requireConnected();
    if (data.body.startsWith('pair ')) {
      const code = data.body.slice(5);
      if (/^[a-f0-9]{32}$/.test(code)) this.db.prepare('UPDATE pairing SET sender=? WHERE hash=? AND expires>? AND sender IS NULL').run(data.from, digest(code), this.clock());
      this.db.prepare("INSERT OR IGNORE INTO commands VALUES (?,?,?,'pair','observed',NULL,NULL)").run(key, this.clock(), data.from);
      return {pairingObserved: true};
    }
    const operator = this.operator(data.from);
    if (!operator) { this.db.prepare("INSERT OR IGNORE INTO commands VALUES (?,?,?,'unknown','rejected',NULL,'sender_not_enrolled')").run(key, this.clock(), data.from); return {rejected: true}; }
    let command: MessagingCommand;
    try { command = parseMessagingCommand(data.body); } catch {
      let proposal = proposeMessagingCommand(data.body);
      if (proposal) { try {
        const parsed = parseMessagingCommand(proposal);
        if (parsed.verb === 'run') { const template=this.config.templates.find(t=>t.name===parsed.template); if(!template || !JSON.parse(operator.grants).includes(template.name))throw new Error('denied');if(template.kind==='saved')validateSavedMessagingRun(this.service,template,parsed.arguments,this.clock());else validateMessagingRun(this.service,template,parsed.arguments,this.clock()); }
        if ('runId' in parsed && !this.owns(data.from,this.resolveReference(data.from,parsed.runId)))throw new Error('denied');
      } catch { proposal=undefined; } }
      this.db.prepare("INSERT OR IGNORE INTO commands VALUES (?,?,?,'proposal','rejected',NULL,'explicit_command_required')").run(key, this.clock(), data.from);
      this.queue(key,data.from,proposal?`Proposed command (not executed):\n${proposal}\nSend that exact command in a new message to proceed. Permissions and budgets will be checked again.`:help);
      return {rejected:true};
    }
    this.db.prepare("INSERT OR IGNORE INTO commands VALUES (?,?,?,?,'processing',NULL,NULL)").run(key, this.clock(), data.from, command.verb);
    try {
      let runId: string | undefined, reply: string;
      if (command.verb === 'help') reply = `${help}\nApproved templates: ${JSON.parse(operator.grants).join(', ') || 'none'}`;
      else if (command.verb === 'jobs') reply = (this.db.prepare("SELECT DISTINCT runId FROM commands WHERE sender=? AND verb='run' AND runId IS NOT NULL ORDER BY at DESC LIMIT 10").all(data.from) as Row[]).map(row => `Job ${this.jobNumber(data.from,row.runId)}: ${this.run(row.runId).status}`).join('\n') || 'No jobs started by this operator.';
      else if (command.verb === 'run') {
        const template = this.config.templates.find(t => t.name === command.template);
        if (!template || !JSON.parse(operator.grants).includes(template.name)) throw new Error('template_permission_denied');
        const actor = `messaging:${digest(data.from).slice(0,24)}`;
        // Reconcile a runtime commit that preceded an adapter crash before checking new-run budgets.
        const existing = this.allRuns().find(run => run.trigger.id === key && run.trigger.actor === actor);
        let run=existing;
        if(!run){if(template.kind==='saved'){validateSavedMessagingRun(this.service,template,command.arguments,this.clock());const origin=governedRequestOrigin({channel:'openwa',modality:'text',receivedAt:new Date(data.timestamp*1000).toISOString(),authentication:'enrolled-direct-sender',actorId:actor,authority:[`template:${template.name}`],messageReference:key,identityReference:digest(data.from),request:data.body});const created=this.service.runSavedJob(template.jobId,actor,key,origin);run=this.service.parameterizedRun(created.id);}else run=this.service.createJobRun(template.jobId,validateMessagingRun(this.service,template,command.arguments,this.clock()),actor,key);}
        runId = run.id; this.db.prepare('UPDATE commands SET runId=? WHERE key=?').run(runId, key);
        this.db.prepare('INSERT OR IGNORE INTO watches(sender,runId) VALUES (?,?)').run(data.from, runId);
        reply = `Job ${this.jobNumber(data.from,run.id)} accepted: ${command.template}.\nStatus: ${run.status}\nTo cancel: cancel job ${this.jobNumber(data.from,run.id)}\n${this.config.dashboardUrl.replace(/\/$/,'')}/?messagingRun=${encodeURIComponent(run.id)}`;
      } else {
        runId = this.resolveReference(data.from,command.runId);
        if (!this.owns(data.from, runId)) throw new Error('job_permission_denied');
        let run = this.run(runId);
        const alreadyTerminal=terminalMessagingRun(run);
        if (command.verb === 'cancel' && !alreadyTerminal) { if('steps' in run)this.service.cancelJobRun(runId,`messaging:${digest(data.from).slice(0,24)}`);else this.service.cancelParameterizedRun(runId,`messaging:${digest(data.from).slice(0,24)}`);run=this.run(runId); }
        if (command.verb === 'watch') this.db.prepare('INSERT OR IGNORE INTO watches(sender,runId) VALUES (?,?)').run(data.from, runId);
        if (command.verb === 'unwatch') { this.db.prepare('DELETE FROM watches WHERE sender=? AND runId=?').run(data.from, runId); this.db.prepare("UPDATE outbox SET state='suppressed',body='' WHERE sender=? AND runId=? AND kind!='reply' AND state IN ('queued','retry')").run(data.from,runId); }
        reply = `${command.verb === 'cancel' ? (run.status === 'CANCELLED' ? 'Cancellation confirmed.\n' : alreadyTerminal ? `Job already finished (${run.status}); nothing to cancel.\n` : `Cancellation requested; runtime ${run.status}. Cleanup is not confirmed.\n`) : command.verb === 'watch' || command.verb === 'unwatch' ? `${command.verb} confirmed.\n` : ''}${this.report(run,data.from)}`;
      }
      this.db.exec('BEGIN IMMEDIATE');
      try { this.queue(key, data.from, reply, 'reply', runId); this.db.prepare("UPDATE commands SET state='accepted',runId=? WHERE key=?").run(runId ?? null, key); this.db.exec('COMMIT'); } catch(error) { this.db.exec('ROLLBACK'); throw error; }
      return {accepted: true, runId};
    } catch (error) {
      const committed = this.allRuns().find(run=>run.trigger.id===key && run.trigger.actor===`messaging:${digest(data.from).slice(0,24)}`);
      if (committed) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
        this.db.prepare("UPDATE commands SET state='accepted',runId=? WHERE key=?").run(committed.id,key);
        this.db.prepare('INSERT OR IGNORE INTO watches(sender,runId) VALUES (?,?)').run(data.from,committed.id);
        this.queue(key,data.from,`Job ${this.jobNumber(data.from,committed.id)} accepted; recovered committed job.\n${this.report(committed,data.from)}`,'reply',committed.id);
        this.db.exec('COMMIT');
        } catch(failure) { this.db.exec('ROLLBACK'); throw failure; }
        return {accepted:true,runId:committed.id};
      }
      const allowed = ['job_number_not_found_send_jobs','template_permission_denied','job_permission_denied','argument_not_approved','parameter_not_approved','template_definition_changed_reapprove_dashboard','active_job_budget_exceeded','hourly_job_budget_exceeded','template_replacement_denied'];
      const code = error instanceof Error && allowed.includes(error.message) ? error.message : 'command_failed_check_dashboard';
      this.db.prepare("UPDATE commands SET state='rejected',code=? WHERE key=?").run(code,key);
      this.queue(key, data.from, `Request not accepted: ${code}. Use the authenticated dashboard.`); return {rejected: true};
    }
  }
  reconcile() {
    if (!this.enabled || this.stopped) return;
    for (const watch of this.db.prepare('SELECT watches.*,operators.progress FROM watches JOIN operators USING(sender) WHERE operators.active=1').all() as Row[]) {
      const run = this.run(watch.runId), terminal = terminalMessagingRun(run);
      if(!('steps' in run))for(const milestone of savedMessagingMilestones(run))this.queue(`milestone:${watch.sender}:${milestone.id}`,watch.sender,`${milestone.text.replace(run.id,`Job ${this.jobNumber(watch.sender,run.id)}`)}\n${this.config.dashboardUrl}/?messagingRun=${run.id}`,'handoff',run.id);
      const fingerprint = digest(JSON.stringify([run.status, 'steps' in run?run.steps.map(s => [s.id,s.status]):run.transitions,'steps' in run?run.trigger.modelRoute:run.modelRoute]));
      if (watch.fingerprint === fingerprint) continue;
      const lifecycle = watch.runStatus!==run.status && ['QUEUED','RUNNING','CANCELLING','CLEANUP_UNCERTAIN','WAITING','AUTHENTICATION_BLOCKED','DISCONNECTED','RECONNECTING'].includes(run.status);
      if (!terminal && !lifecycle && watch.fingerprint && (!watch.progress || this.clock() - watch.notified < this.config.progressSeconds * 1000)) continue;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        if (terminal) this.db.prepare("UPDATE outbox SET state='suppressed',body='' WHERE sender=? AND runId=? AND kind='progress' AND state IN ('queued','retry')").run(watch.sender,run.id);
        this.queue(`watch:${watch.sender}:${run.id}:${fingerprint}`,watch.sender,this.report(run,watch.sender),terminal?'terminal':lifecycle?'lifecycle':'progress',run.id);
        this.db.prepare('UPDATE watches SET fingerprint=?,notified=?,runStatus=? WHERE sender=? AND runId=?').run(fingerprint,this.clock(),run.status,watch.sender,run.id);
        this.db.exec('COMMIT');
      } catch(error) {this.db.exec('ROLLBACK');throw error;}
    }
  }
  private async gateway(route: string, init: RequestInit = {}) {
    const response = await this.request(`${this.config.gatewayUrl.replace(/\/$/,'')}/sessions/${encodeURIComponent(this.config.sessionId)}${route}`,{...init,headers:{'X-API-Key':this.apiKey,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`gateway_http_${response.status}`);
    const result = await response.json(); return result.data ?? result;
  }
  async checkHealth() {
    try { const session = await this.gateway(''); const phone = typeof session.phone === 'string' ? `+${session.phone.replace(/\D/g,'')}` : null;
      this.health = {state: session.status === 'ready' && phone === this.config.expectedPhone ? 'connected_verified' : phone && phone !== this.config.expectedPhone ? 'account_mismatch' : String(session.status ?? 'unknown'),phone,checkedAt:this.clock()};
    } catch { this.health = {state:'disconnected',phone:null,checkedAt:this.clock()}; }
    return this.health;
  }
  async qr() { if (!this.enabled) throw new Error('integration_disabled'); return this.gateway('/qr'); }
  socialPrincipal(identity:SocialIdentity) {
    if(identity.channel!=='openwa'||identity.account!==this.config.sessionId||identity.sender!==identity.conversation)return undefined;
    const operator=this.operator(identity.sender);return operator?{actor:`messaging:${digest(identity.sender).slice(0,24)}`,templates:JSON.parse(operator.grants) as string[],approve:this.db.prepare('SELECT value FROM settings WHERE key=?').get(`socialApproval:${digest(identity.sender)}`)?.value==='true'}:undefined;
  }
  grantSocialApproval(sender:string,enabled:boolean){if(!this.operator(sender))throw new Error('operator_not_enrolled');this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(`socialApproval:${digest(sender)}`,String(enabled));return {granted:enabled};}
  queueSocial(identity:SocialIdentity,text:string,key:string,audio?:{bytes:Uint8Array;mime:string}) {
    if(!this.socialPrincipal(identity))throw new Error('social_identity_denied');
    if(audio)validateAudio(audio.bytes,audio.mime);else if(text.length>4096)throw new Error('social_text_too_large');
    this.queue(`social:${key}`,identity.sender,audio?JSON.stringify({base64:Buffer.from(audio.bytes).toString('base64'),mimetype:audio.mime}):text,audio?'voice':'social');
    return {id:key,state:'queued' as const};
  }
  async socialAudio(identity:SocialIdentity,messageId:string) {
    if(!this.socialPrincipal(identity)||messageId.length>256)throw new Error('social_identity_denied');
    const url=`${this.config.gatewayUrl.replace(/\/$/,'')}/sessions/${this.config.sessionId}/messages/${encodeURIComponent(identity.conversation)}/${encodeURIComponent(messageId)}/media`;
    const response=await this.request(url,{headers:{'X-API-Key':this.apiKey},signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok||Number(response.headers.get('content-length'))>8*1024*1024)throw new Error('social_audio_unavailable');
    const bytes=await readBoundedResponse(response,8*1024*1024),mime=response.headers.get('content-type')??'';validateAudio(bytes,mime);return {bytes,mime};
  }
  async reconnectSession() { if(!this.enabled)throw new Error('integration_disabled'); await this.gateway('/start',{method:'POST',body:'{}'}); return this.checkHealth(); }
  async tick() {
    if (this.busy || !this.enabled || this.stopped) return;
    this.busy = true;
    try {
      if (this.clock() - this.health.checkedAt > 15000) await this.checkHealth();
      this.reconcile();
      if (this.health.state !== 'connected_verified' || !this.enabled || this.stopped) return;
      const row = this.db.prepare("SELECT o.* FROM outbox o JOIN operators p ON p.sender=o.sender AND p.active=1 WHERE o.state IN ('queued','retry') AND o.due<=? AND NOT EXISTS(SELECT 1 FROM outbox older WHERE older.sender=o.sender AND older.id<o.id AND older.state IN ('queued','retry','sending')) ORDER BY o.id LIMIT 1").get(this.clock()) as Row | undefined;
      if (!row) return;
      if (row.kind === 'progress' && row.runId && terminalMessagingRun(this.run(row.runId))) { this.db.prepare("UPDATE outbox SET state='suppressed',body='' WHERE id=?").run(row.id); return; }
      this.db.prepare("UPDATE outbox SET state='sending',attempts=attempts+1 WHERE id=?").run(row.id);
      try { const result = await this.gateway(row.kind==='voice'?'/messages/send-audio':'/messages/send-text',{method:'POST',body:JSON.stringify(row.kind==='voice'?{chatId:row.sender,...JSON.parse(row.body),ptt:true}:{chatId:row.sender,text:row.body,linkPreview:false})});
        const remoteId = result.id ?? result.messageId;
        this.db.prepare("UPDATE outbox SET state=?,remoteId=?,code=? WHERE id=?").run(typeof remoteId==='string'?'submitted':'uncertain',typeof remoteId==='string'?remoteId:null,typeof remoteId==='string'?'gateway_accepted_delivery_unconfirmed':'response_without_message_id',row.id);
      } catch(error) {
        const safeRetry = error instanceof Error && error.message === 'gateway_http_429';
        this.db.prepare('UPDATE outbox SET state=?,due=?,code=? WHERE id=?').run(safeRetry ? row.attempts+1>=5?'failed':'retry':'uncertain',this.clock()+Math.min(300000,5000*2**row.attempts),safeRetry?'rate_limited':'send_result_uncertain',row.id);
      }
    } finally { this.busy = false; if (this.stopped) this.db.close(); }
  }
}
