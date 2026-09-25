import {CapabilityResolver} from '../src/control/capabilities.js';
import {loadConfig} from '../src/control/config.js';
import {fetchNodeResource, runNodeJob} from '../src/control/node-client.js';
import {Trace} from '../src/control/telemetry.js';

const {config, file} = loadConfig();
const configured = config.resources.find(resource => resource.platform === 'android' && resource.android);
if (!configured?.healthUrl || !configured.android) throw new Error(`android_resource_not_configured:${file}`);
const token = process.env[configured.android.credentialEnv];
if (!token) throw new Error(`credential_environment_missing:${configured.android.credentialEnv}`);
const baseUrl = configured.healthUrl.replace(/\/health$/, '');
const trace = new Trace();
const total = trace.span('task.time_to_accepted_result', {resource: configured.id});
const resource = await fetchNodeResource({baseUrl, token, trace, resource: configured.id});
const request = {requires: [{id: 'platform.android'}, {id: 'device.physical'}, {id: 'harness.codex'}, {id: 'observe.android.logcat'}]};
const resolutionSpan = trace.span('resolver.resolve');
const resolution = new CapabilityResolver().resolve(request, [resource]);
resolutionSpan.end(!resolution.missing.length, {selected: resolution.resources.map(item => item.id).join(','), missing: resolution.missing.length});
if (resolution.missing.length) {
  total.end(false);
  throw new Error(`ANDROID-RESOLUTION-FAIL missing=${resolution.missing.join(',')}`);
}
const jobSpan = trace.span('tool.android.observe.logs', {resource: configured.id});
const job = await runNodeJob<Record<string, unknown>>({baseUrl, token, trace, resource: configured.id}, 'android.observe.logs', {lines: 5});
jobSpan.end(job.status === 'completed');
if (job.status !== 'completed' || job.resource !== configured.id) {
  total.end(false);
  throw new Error('ANDROID-JOB-FAIL');
}
total.end(true, {attempts: 1, retries: 0, handoffs: 0, toolCalls: 1});
console.log(JSON.stringify({marker: 'AGENT-CONTROL-ANDROID-RESOLUTION-PASS', traceId: trace.id, request, resolution: {resources: resolution.resources.map(item => item.id), satisfied: resolution.satisfied, missing: resolution.missing}, job: {status: job.status, resource: job.resource}}, null, 2));
