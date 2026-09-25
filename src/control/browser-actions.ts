import {ActionFailure, ActionRegistry} from './job-runtime.js';
import {PlaywrightBrowserEngine, type BrowserEngine, type BrowserSessionRequest} from './browser-worker.js';

export function registerBrowserActions(registry = new ActionRegistry(), engine: BrowserEngine = new PlaywrightBrowserEngine({
  executablePath: process.env.AGENT_CONTROL_CHROMIUM_EXECUTABLE,
  allowedPrivateHosts: (process.env.AGENT_CONTROL_BROWSER_ALLOWED_PRIVATE_HOSTS ?? '').split(',').map(item => item.trim()).filter(Boolean),
})) {
  registry.registerConsequentialControl('browser.session@1.0.0', async context => {
    let request: BrowserSessionRequest;
    try { request = JSON.parse(String(context.parameters.sessionJson ?? '')) as BrowserSessionRequest; } catch { throw new ActionFailure('browser_session_json_invalid', 'configuration'); }
    try {
      const result = await engine.run(request, context.signal);
      return {artifacts: [{name: 'browser-result', value: result}], evidence: [`browser_engine:${result.engine}`, `browser_interactions:${result.interactions}`, ...result.screenshots.map(item => `screenshot_sha256:${item.sha256}`)], verification: ['browser-session-completed'], detail: `${result.engine} completed ${result.interactions} interactions; tokens and monetary cost unavailable`};
    } catch (error) { const message = error instanceof Error ? error.message : String(error); throw new ActionFailure(message, /authorised|allowed/.test(message) ? 'policy_rejection' : /cancelled/.test(message) ? 'execution' : 'execution'); }
  }, ['EXTERNAL_COMMUNICATION', 'CREDENTIAL_USE']);
  return registry;
}
