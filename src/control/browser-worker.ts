import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {Browser, BrowserContext, Download, Page} from 'playwright-core';

export type BrowserStep =
  | {action: 'navigate'; url: string; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'}
  | {action: 'wait'; selector?: string; state?: 'load' | 'domcontentloaded' | 'networkidle'; timeoutMs?: number}
  | {action: 'extractText'; selector?: string; name: string}
  | {action: 'query'; selector: string; name: string}
  | {action: 'click'; selector: string}
  | {action: 'enterText'; selector: string; text: string}
  | {action: 'submit'; selector: string}
  | {action: 'javascript'; expression: string; name: string}
  | {action: 'screenshot'; name: string; fullPage?: boolean}
  | {action: 'download'; selector: string; name: string};

export interface BrowserSessionRequest {steps: BrowserStep[]; timeoutMs?: number; allowJavascript?: boolean; allowDownloads?: boolean; authenticated?: boolean;}
export interface BrowserSessionResult {
  engine: string; finalUrl: string; title: string; interactions: number; startedAt: string; completedAt: string;
  values: Record<string, unknown>; screenshots: Array<{name: string; mediaType: 'image/png'; base64: string; sha256: string}>;
  downloads: Array<{name: string; suggestedFilename: string; bytes: number; sha256: string}>;
  usage: {inputTokens: null; outputTokens: null; monetaryCost: null};
}
export interface BrowserEngine {run(request: BrowserSessionRequest, signal?: AbortSignal): Promise<BrowserSessionResult>;}

type BrowserAddressResolver = (hostname: string) => Promise<string[]>;
export class BrowserDestinationPolicy {
  private readonly allowedPrivateHosts: Set<string>;
  constructor(allowedPrivateHosts: readonly string[] = [], private readonly resolve: BrowserAddressResolver = async hostname => (await lookup(hostname, {all: true, verbatim: true})).map(item => item.address)) {
    this.allowedPrivateHosts = new Set(allowedPrivateHosts.map(normalizeHost).filter(Boolean));
  }
  async assert(value: string, protocols: readonly string[] = ['http:', 'https:']) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('browser_url_not_allowed'); }
    if (!protocols.includes(url.protocol) || url.username || url.password) throw new Error('browser_url_not_allowed');
    const host = normalizeHost(url.hostname);
    if (!host) throw new Error('browser_url_not_allowed');
    if (this.allowedPrivateHosts.has(host)) return;
    if (isInternalName(host)) throw new Error(`browser_private_destination_not_authorised:${host}`);
    let addresses: string[];
    try { addresses = isIP(host) ? [host] : await this.resolve(host); } catch { throw new Error(`browser_destination_resolution_failed:${host}`); }
    if (!addresses.length || addresses.some(address => !isPublicAddress(address))) throw new Error(`browser_private_destination_not_authorised:${host}`);
  }
}

export class PlaywrightBrowserEngine implements BrowserEngine {
  constructor(private readonly options: {executablePath?: string; headless?: boolean; maximumSteps?: number; maximumDownloadBytes?: number; allowedPrivateHosts?: string[]; destinationPolicy?: BrowserDestinationPolicy} = {}) {}
  async run(request: BrowserSessionRequest, signal?: AbortSignal): Promise<BrowserSessionResult> {
    if (!Array.isArray(request.steps) || !request.steps.length || request.steps.length > (this.options.maximumSteps ?? 32)) throw new Error('browser_steps_invalid');
    if (request.authenticated) throw new Error('browser_authenticated_session_unavailable');
    const timeoutMs = Math.min(Math.max(request.timeoutMs ?? 30_000, 1_000), 120_000), startedAt = new Date().toISOString();
    const {chromium} = await import('playwright-core');
    let browser: Browser | undefined, context: BrowserContext | undefined, page: Page | undefined;
    const values: Record<string, unknown> = {}, screenshots: BrowserSessionResult['screenshots'] = [], downloads: BrowserSessionResult['downloads'] = [];
    const abort = () => void browser?.close();
    if (signal?.aborted) throw new Error('browser_cancelled'); signal?.addEventListener('abort', abort, {once: true});
    try {
      browser = await chromium.launch({headless: this.options.headless ?? true, executablePath: this.options.executablePath});
      const policy = this.options.destinationPolicy ?? new BrowserDestinationPolicy(this.options.allowedPrivateHosts), policyFailure: {error?: Error} = {};
      context = await browser.newContext({acceptDownloads: Boolean(request.allowDownloads), serviceWorkers: 'block'});
      await context.route('**/*', async route => {
        try { await policy.assert(route.request().url()); await route.continue(); }
        catch (error) { policyFailure.error = error instanceof Error ? error : new Error(String(error)); await route.abort('blockedbyclient'); }
      });
      await context.routeWebSocket(/.*/, async route => {
        try { await policy.assert(route.url(), ['ws:', 'wss:']); route.connectToServer(); }
        catch (error) { policyFailure.error = error instanceof Error ? error : new Error(String(error)); await route.close({code: 1008, reason: 'destination not authorised'}); }
      });
      page = await context.newPage(); page.setDefaultTimeout(timeoutMs);
      for (const step of request.steps) {
        if (signal?.aborted) throw new Error('browser_cancelled');
        if (policyFailure.error) throw policyFailure.error;
        if (step.action === 'navigate') { await policy.assert(step.url); try{await page.goto(step.url, {waitUntil: step.waitUntil ?? 'domcontentloaded', timeout: timeoutMs});}catch(error){if(policyFailure.error)throw policyFailure.error;throw error;} await policy.assert(page.url()); }
        else if (step.action === 'wait') { if (step.selector) await page.locator(step.selector).waitFor({timeout: Math.min(step.timeoutMs ?? timeoutMs, timeoutMs)}); else await page.waitForLoadState(step.state ?? 'domcontentloaded', {timeout: Math.min(step.timeoutMs ?? timeoutMs, timeoutMs)}); }
        else if (step.action === 'extractText') values[step.name] = (await page.locator(step.selector ?? 'body').innerText()).slice(0, 200_000);
        else if (step.action === 'query') values[step.name] = await page.locator(step.selector).allInnerTexts();
        else if (step.action === 'click') await page.locator(step.selector).click();
        else if (step.action === 'enterText') await page.locator(step.selector).fill(step.text);
        else if (step.action === 'submit') await page.locator(step.selector).press('Enter');
        else if (step.action === 'javascript') { if (!request.allowJavascript) throw new Error('browser_javascript_not_authorised'); values[step.name] = await page.evaluate(source => (0, eval)(source), step.expression); }
        else if (step.action === 'screenshot') { const bytes = await page.screenshot({type: 'png', fullPage: step.fullPage ?? false}); screenshots.push({name: step.name, mediaType: 'image/png', base64: bytes.toString('base64'), sha256: sha(bytes)}); }
        else if (step.action === 'download') { if (!request.allowDownloads) throw new Error('browser_download_not_authorised'); const downloadPromise = page.waitForEvent('download'); await page.locator(step.selector).click(); downloads.push(await downloadRecord(step.name, await downloadPromise, this.options.maximumDownloadBytes ?? 10_000_000)); }
        if (policyFailure.error) throw policyFailure.error;
      }
      return {engine: 'Chromium/Playwright', finalUrl: page.url(), title: await page.title(), interactions: request.steps.length, startedAt, completedAt: new Date().toISOString(), values, screenshots, downloads, usage: {inputTokens: null, outputTokens: null, monetaryCost: null}};
    } catch (error) { if (signal?.aborted) throw new Error('browser_cancelled'); throw error; }
    finally { signal?.removeEventListener('abort', abort); await context?.close().catch(() => {}); await browser?.close().catch(() => {}); }
  }
}

function normalizeHost(value: string) { return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); }
function isInternalName(host: string) { return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa'); }
function isPublicAddress(value: string) {
  const address = normalizeHost(value).split('%')[0]!;
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168 || a === 100 && b! >= 64 && b! <= 127 || a === 198 && (b === 18 || b === 19) || a! >= 224);
  }
  if (isIP(address) === 6) {
    if (address.startsWith('::ffff:')) return isPublicAddress(address.slice(7));
    const first = parseInt(address.split(':')[0] || '0', 16);
    return address !== '::' && address !== '::1' && (first & 0xfe00) !== 0xfc00 && (first & 0xffc0) !== 0xfe80 && (first & 0xff00) !== 0xff00 && !address.startsWith('2001:db8');
  }
  return false;
}
function sha(value: Buffer) { return createHash('sha256').update(value).digest('hex'); }
async function downloadRecord(name: string, download: Download, limit: number) { const stream = await download.createReadStream(); const chunks: Buffer[] = []; let bytes = 0; for await (const chunk of stream) { const item = Buffer.from(chunk); bytes += item.length; if (bytes > limit) throw new Error('browser_download_too_large'); chunks.push(item); } const content = Buffer.concat(chunks); return {name, suggestedFilename: download.suggestedFilename(), bytes, sha256: sha(content)}; }
