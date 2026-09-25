import type { Baton, HardContract, LaneState } from './state.js';
import type {ExecutionRecipe} from './control/adaptive-harness.js';
import type {ToolInvocationGateway} from './control/harness-dispatch.js';

export interface AgentStartContext {
  contract: HardContract;
  baton: Baton;
  sharedContext: string;
  /** The adapter may inspect the recipe but cannot mutate its authority snapshot. */
  recipe: ExecutionRecipe;
  /** The only supported path for model-originated tool invocation. */
  tools: ToolInvocationGateway;
}
export interface AgentEvent { type: 'text'|'tool'|'status'|'baton'; text: string; batonPatch?: Partial<Baton>; }
export interface AgentHandle { id: string; stop(): Promise<void>; }
export interface AgentAdapter {
  readonly id: string;
  start(lane: LaneState, context: AgentStartContext, onEvent: (event: AgentEvent)=>void): Promise<AgentHandle>;
}

// Deliberately boring adapter used until a recipe-backed runtime is configured.
// The adapter remains below the harness and receives no scheduler or authority service.
export class NullAdapter implements AgentAdapter {
  readonly id='null';
  async start(lane:LaneState,_context:AgentStartContext,onEvent:(event:AgentEvent)=>void):Promise<AgentHandle>{
    onEvent({type:'status',text:`Lane ${lane.id}: no agent adapter configured`});
    return {id:`null-${lane.id}`,async stop(){}};
  }
}
