import type {PhoneComputerTaskRuntime} from './phone-computer-task.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';

export type ChatGptComputerTool = 'start_computer_task'|'get_task_status'|'get_latest_screenshot'|'approve_action'|'reject_action'|'cancel_task'|'get_task_evidence';
export interface ToolDefinition {name:ChatGptComputerTool;description:string;inputSchema:Record<string,unknown>;annotations:{readOnlyHint:boolean;destructiveHint:boolean;idempotentHint:boolean;openWorldHint:boolean};}

export const chatGptComputerTools:ToolDefinition[]=[
  tool('start_computer_task','Start a bounded governed computer-use task.',false,false,false),
  tool('get_task_status','Read current governed task status.',true,false,true),
  tool('get_latest_screenshot','Read the latest protected screenshot for an authorised task.',true,false,true),
  tool('approve_action','Approve the exact pending consequential action.',false,true,false),
  tool('reject_action','Reject the exact pending consequential action.',false,false,false),
  tool('cancel_task','Persist cancellation and stop task-owned execution.',false,true,false),
  tool('get_task_evidence','Read the authorised durable evidence record.',true,false,true),
];

export class ChatGptComputerMcpAdapter {
  constructor(readonly runtime:PhoneComputerTaskRuntime,readonly actorId:string,readonly targetWorkerId:string){}
  async call(name:ChatGptComputerTool,input:Record<string,unknown>){
    switch(name){
      case'start_computer_task':return this.runtime.create({actorId:this.actorId,request:text(input.request,'request'),targetWorkerId:typeof input.targetWorkerId==='string'?input.targetWorkerId:this.targetWorkerId});
      case'get_task_status':return this.runtime.status(text(input.taskId,'taskId'));
      case'get_latest_screenshot':return this.runtime.latestScreenshot(text(input.taskId,'taskId'));
      case'approve_action':return this.runtime.approve(text(input.taskId,'taskId'),text(input.approvalId,'approvalId'),this.actorId);
      case'reject_action':return this.runtime.reject(text(input.taskId,'taskId'),text(input.approvalId,'approvalId'),this.actorId);
      case'cancel_task':return this.runtime.cancel(text(input.taskId,'taskId'),this.actorId);
      case'get_task_evidence':return this.runtime.evidence(text(input.taskId,'taskId'));
      default:throw new Error('computer_task_tool_not_found');
    }
  }
}

/** Official MCP SDK adapter. Authentication and per-user actor selection stay
 * at the HTTP/tunnel boundary; every tool call below reaches the same governed
 * runtime rather than the phone endpoint or browser worker directly. */
export function createChatGptComputerMcpServer(adapter:ChatGptComputerMcpAdapter){
  const server=new McpServer({name:'Agent Control governed computer use',version:'4.10.0'});
  server.registerTool('start_computer_task',{description:'Start a bounded governed computer-use task.',inputSchema:{request:z.string().min(1).max(32_768),targetWorkerId:z.string().min(1).max(240).optional()},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},async input=>result(await adapter.call('start_computer_task',input)));
  server.registerTool('get_task_status',{description:'Read current governed task status.',inputSchema:{taskId:z.string().min(1).max(240)},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async input=>result(await adapter.call('get_task_status',input)));
  server.registerTool('get_latest_screenshot',{description:'Read the latest protected screenshot for an authorised task.',inputSchema:{taskId:z.string().min(1).max(240)},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async input=>result(await adapter.call('get_latest_screenshot',input)));
  server.registerTool('approve_action',{description:'Approve the exact pending consequential action.',inputSchema:{taskId:z.string().min(1).max(240),approvalId:z.string().min(1).max(240)},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}},async input=>result(await adapter.call('approve_action',input)));
  server.registerTool('reject_action',{description:'Reject the exact pending consequential action.',inputSchema:{taskId:z.string().min(1).max(240),approvalId:z.string().min(1).max(240)},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},async input=>result(await adapter.call('reject_action',input)));
  server.registerTool('cancel_task',{description:'Persist cancellation and stop task-owned execution.',inputSchema:{taskId:z.string().min(1).max(240)},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}},async input=>result(await adapter.call('cancel_task',input)));
  server.registerTool('get_task_evidence',{description:'Read the authorised durable evidence record.',inputSchema:{taskId:z.string().min(1).max(240)},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async input=>result(await adapter.call('get_task_evidence',input)));
  return server;
}
function result(value:unknown){return{content:[{type:'text' as const,text:JSON.stringify(value)}],structuredContent:(value&&typeof value==='object'?value:{value}) as Record<string,unknown>};}
function tool(name:ChatGptComputerTool,description:string,readOnlyHint:boolean,destructiveHint:boolean,idempotentHint:boolean):ToolDefinition{return{name,description,inputSchema:{type:'object',additionalProperties:false},annotations:{readOnlyHint,destructiveHint,idempotentHint,openWorldHint:false}};}
function text(value:unknown,name:string){if(typeof value!=='string'||!value.trim()||value.length>32_768)throw new Error(`computer_task_${name}_invalid`);return value;}
