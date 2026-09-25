import {
  PROTOCOL_VERSION,
  RequestError,
  agent,
  methods,
  type AgentApp,
  type AgentContext,
  type CloseSessionResponse,
  type InitializeResponse,
  type ListSessionsResponse,
  type LoadSessionResponse,
  type NewSessionResponse,
  type PromptResponse,
  type ResumeSessionResponse,
  type SessionNotification,
} from '@agentclientprotocol/sdk';
import {AcpAgentControlAdapter, type AcpExecutionPort, type AcpJsonRpcResponse} from './acp-adapter.js';
import {IdentityControlPlane} from './identity-control-plane.js';

export interface AcpRuntimeOptions {
  identities: IdentityControlPlane;
  execution: AcpExecutionPort;
  principalActorId: string;
  sessionFile?: string;
}

export interface AcpRuntime {
  readonly app: AgentApp;
  readonly adapter: AcpAgentControlAdapter;
}

/**
 * Builds the transport-neutral stable ACP v1 endpoint. The official SDK owns
 * framing, schema validation and JSON-RPC dispatch; the adapter owns mapping
 * into Agent Control identity, sessions and Work Parcels.
 */
export function createAcpRuntime(options: AcpRuntimeOptions): AcpRuntime {
  const clients = new Map<string, AgentContext>();
  const adapter = new AcpAgentControlAdapter(
    options.identities,
    options.execution,
    options.principalActorId,
    async notification => {
      const client = clients.get(notification.params.sessionId);
      if (client) await client.notify(methods.client.session.update, notification.params as SessionNotification);
    },
    undefined,
    options.sessionFile,
  );

  const invoke = async <T>(id: string | number | null, method: string, params: Record<string, unknown>): Promise<T> => {
    const response = await adapter.handle({jsonrpc: '2.0', id, method, params});
    return result<T>(response);
  };

  const app = agent({name: 'agent-control'})
    .onRequest(methods.agent.initialize, async context => {
      const response = await invoke<InitializeResponse>(context.requestId, methods.agent.initialize, context.params);
      return {...response, protocolVersion: PROTOCOL_VERSION};
    })
    .onRequest(methods.agent.session.new, context => invoke<NewSessionResponse>(context.requestId, methods.agent.session.new, context.params))
    .onRequest(methods.agent.session.load, async context => lifecycleResult<LoadSessionResponse>(await invoke<Record<string, unknown>>(context.requestId, methods.agent.session.load, context.params)))
    .onRequest(methods.agent.session.list, context => invoke<ListSessionsResponse>(context.requestId, methods.agent.session.list, context.params))
    .onRequest(methods.agent.session.resume, async context => lifecycleResult<ResumeSessionResponse>(await invoke<Record<string, unknown>>(context.requestId, methods.agent.session.resume, context.params)))
    .onRequest(methods.agent.session.close, async context => lifecycleResult<CloseSessionResponse>(await invoke<Record<string, unknown>>(context.requestId, methods.agent.session.close, context.params)))
    .onRequest(methods.agent.session.prompt, async context => {
      clients.set(context.params.sessionId, context.client);
      const cancel = () => { void adapter.handle({jsonrpc: '2.0', method: 'session/cancel', params: {sessionId: context.params.sessionId}}); };
      context.signal.addEventListener('abort', cancel, {once: true});
      try { return await invoke<PromptResponse>(context.requestId, methods.agent.session.prompt, context.params); }
      finally {
        context.signal.removeEventListener('abort', cancel);
        if (clients.get(context.params.sessionId) === context.client) clients.delete(context.params.sessionId);
      }
    })
    .onNotification(methods.agent.session.cancel, async context => {
      await adapter.handle({jsonrpc: '2.0', method: methods.agent.session.cancel, params: context.params});
    });

  return {app, adapter};
}

function result<T>(response: AcpJsonRpcResponse | null): T {
  if (!response) throw RequestError.internalError(undefined, 'Agent Control returned no response');
  if (response.error) throw new RequestError(response.error.code, response.error.message, response.error.data);
  return response.result as T;
}

function lifecycleResult<T extends {_meta?: unknown}>(value: Record<string, unknown>): T {
  return (value._meta === undefined ? {} : {_meta: value._meta}) as T;
}
