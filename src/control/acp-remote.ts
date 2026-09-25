import {timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import https from 'node:https';
import {createRequire} from 'node:module';
import type {AddressInfo} from 'node:net';
import {Readable, type Duplex} from 'node:stream';
import {AcpServer} from '@agentclientprotocol/sdk/experimental/server';
import {createNodeWebSocketUpgradeHandler} from '@agentclientprotocol/sdk/experimental/node';
import type {AgentApp} from '@agentclientprotocol/sdk';

const require = createRequire(import.meta.url);
interface ClosableWebSocketServer {close(callback: (error?: Error) => void): void;}
const {WebSocketServer} = require('ws') as {WebSocketServer: new (options: Record<string, unknown>) => ClosableWebSocketServer};

export interface AcpRemoteConfig {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  token: string;
  allowedOrigins: string[];
  tls?: {certFile: string; keyFile: string};
}

export interface AcpRemoteServer {
  readonly url: string;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

export function acpRemoteConfig(environment: NodeJS.ProcessEnv = process.env): AcpRemoteConfig {
  const enabled = environment.AGENT_CONTROL_ACP_REMOTE_ENABLED === 'true';
  const host = environment.AGENT_CONTROL_ACP_REMOTE_HOST?.trim() || '127.0.0.1';
  const port = Number(environment.AGENT_CONTROL_ACP_REMOTE_PORT || 4311);
  const route = environment.AGENT_CONTROL_ACP_REMOTE_PATH?.trim() || '/acp';
  const tokenEnvironment = environment.AGENT_CONTROL_ACP_REMOTE_TOKEN_ENV?.trim() || '';
  if (!enabled) throw new Error('acp_remote_disabled');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('acp_remote_port_invalid');
  if (!/^\/[A-Za-z0-9/_-]*$/.test(route)) throw new Error('acp_remote_path_invalid');
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(tokenEnvironment)) throw new Error('acp_remote_token_env_invalid');
  const token = environment[tokenEnvironment]?.trim() || '';
  if (token.length < 24) throw new Error('acp_remote_authentication_required');
  const certFile = environment.AGENT_CONTROL_ACP_REMOTE_TLS_CERT_FILE?.trim(), keyFile = environment.AGENT_CONTROL_ACP_REMOTE_TLS_KEY_FILE?.trim();
  if (Boolean(certFile) !== Boolean(keyFile)) throw new Error('acp_remote_tls_pair_required');
  if (!isLoopback(host) && (!certFile || !keyFile)) throw new Error('acp_remote_non_loopback_requires_tls');
  return {enabled, host, port, path: route, token, allowedOrigins: (environment.AGENT_CONTROL_ACP_REMOTE_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean), ...(certFile && keyFile ? {tls: {certFile, keyFile}} : {})};
}

export async function startAcpRemoteServer(app: AgentApp, config: AcpRemoteConfig): Promise<AcpRemoteServer> {
  if (!config.enabled || config.token.length < 24) throw new Error('acp_remote_authentication_required');
  if (!isLoopback(config.host) && !config.tls) throw new Error('acp_remote_non_loopback_requires_tls');
  const acp = new AcpServer({agent: app});
  const webSockets = new WebSocketServer({noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false});
  const upgrade = createNodeWebSocketUpgradeHandler(acp, webSockets as unknown as Parameters<typeof createNodeWebSocketUpgradeHandler>[1]);
  const route = (request: IncomingMessage, response: ServerResponse) => {
    if (requestPath(request) !== config.path) return rejectHttp(response, 404, 'not_found');
    if (!allowed(request, config)) return rejectHttp(response, 401, 'authentication_required');
    void handleHttp(acp, request, response).catch(() => rejectHttp(response, 500, 'internal_error'));
  };
  const server = config.tls
    ? https.createServer({cert: fs.readFileSync(config.tls.certFile), key: fs.readFileSync(config.tls.keyFile)}, route)
    : http.createServer(route);
  server.on('upgrade', (request, socket, head) => {
    if (requestPath(request) !== config.path) return rejectUpgrade(socket, 404, 'Not Found');
    if (!allowed(request, config)) return rejectUpgrade(socket, 401, 'Unauthorized');
    upgrade(request, socket, head);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address() as AddressInfo;
  return {
    host: config.host,
    port: address.port,
    url: `${config.tls ? 'https' : 'http'}://${displayHost(config.host)}:${address.port}${config.path}`,
    close: async () => {
      await acp.close();
      await new Promise<void>((resolve, reject) => webSockets.close(error => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

function allowed(request: IncomingMessage, config: AcpRemoteConfig) {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
  if (origin && !config.allowedOrigins.includes(origin)) return false;
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice(7)), expected = Buffer.from(config.token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function handleHttp(acp: AcpServer, request: IncomingMessage, response: ServerResponse) {
  const body = ['POST','PUT','PATCH'].includes(request.method || '') ? await readBody(request, 1024 * 1024) : undefined;
  if (body !== undefined) {
    let message: unknown;
    try { message = JSON.parse(body); } catch { return rejectRpc(response, null, -32700, 'Parse error'); }
    if (!validJsonRpcEnvelope(message)) return rejectRpc(response, null, -32600, 'Invalid Request');
  }
  const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) if (Array.isArray(value)) for (const item of value) headers.append(name, item); else if (value !== undefined) headers.set(name, value);
  const protocol = (request.socket as typeof request.socket & {encrypted?: boolean}).encrypted ? 'https' : 'http', host = request.headers.host || 'agent-control.invalid';
  const result = await acp.handleRequest(new Request(`${protocol}://${host}${request.url || '/'}`, {method: request.method, headers, ...(body === undefined ? {} : {body})}));
  response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
  if (!result.body) return response.end();
  const source = Readable.fromWeb(result.body as unknown as Parameters<typeof Readable.fromWeb>[0]); source.on('error', error => response.destroy(error)); source.pipe(response);
}

function readBody(request: IncomingMessage, maximum: number) {
  return new Promise<string>((resolve, reject) => { let size = 0, body = ''; request.setEncoding('utf8'); request.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > maximum) { reject(new Error('request_body_too_large')); request.destroy(); } else body += chunk; }); request.on('end', () => resolve(body)); request.on('error', reject); });
}

function validJsonRpcEnvelope(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>; if (item.jsonrpc !== '2.0' || typeof item.method !== 'string') return false;
  return item.id === undefined || item.id === null || typeof item.id === 'string' || (typeof item.id === 'number' && Number.isFinite(item.id));
}

function requestPath(request: IncomingMessage) { try { return new URL(request.url || '/', 'http://agent-control.invalid').pathname; } catch { return ''; } }
function rejectHttp(response: ServerResponse, status: number, error: string) { response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); response.end(`${JSON.stringify({error})}\n`); }
function rejectRpc(response: ServerResponse, id: string | number | null, code: number, message: string) { response.writeHead(400, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); response.end(`${JSON.stringify({jsonrpc: '2.0', id, error: {code, message}})}\n`); }
function rejectUpgrade(socket: Duplex, status: number, reason: string) { socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); }
function isLoopback(host: string) { return ['127.0.0.1', '::1', 'localhost'].includes(host.toLowerCase()); }
function displayHost(host: string) { return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host; }
