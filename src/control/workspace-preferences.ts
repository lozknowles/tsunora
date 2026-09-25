import fs from 'node:fs';
import path from 'node:path';
import {parseWorkspaceId} from './navigable-workspace.js';
import {assertNoSensitiveMaterial,redactSensitiveValue} from './security-redaction.js';

interface WorkspacePreferenceSnapshot{schema:'agent-control.workspace-preferences/v1';operators:Record<string,{favourites:Array<{workspaceId:string;createdAt:string}>}>;}

export class WorkspacePreferenceStore{
  private snapshot:WorkspacePreferenceSnapshot={schema:'agent-control.workspace-preferences/v1',operators:{}};
  constructor(readonly file:string,private readonly clock=()=>new Date().toISOString()){
    if(fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file,'utf8')) as WorkspacePreferenceSnapshot;if(value.schema!==this.snapshot.schema)throw Error('workspace_preferences_snapshot_invalid');this.snapshot=value;}
  }
  list(actor:string){return{schema:this.snapshot.schema,actor,favourites:structuredClone(this.snapshot.operators[actor]?.favourites??[])};}
  set(actor:string,workspaceId:string,favourite:boolean){if(!actor.trim())throw Error('workspace_preferences_actor_required');parseWorkspaceId(workspaceId);const row=this.snapshot.operators[actor]??={favourites:[]};if(favourite&&!row.favourites.some(item=>item.workspaceId===workspaceId)){if(row.favourites.length>=64)throw Error('workspace_favourites_limit');row.favourites.push({workspaceId,createdAt:this.clock()});}if(!favourite)row.favourites=row.favourites.filter(item=>item.workspaceId!==workspaceId);this.persist();return this.list(actor);}
  private persist(){const safe=redactSensitiveValue(this.snapshot);assertNoSensitiveMaterial(JSON.stringify(safe),'workspace_preferences_secret_forbidden');fs.mkdirSync(path.dirname(this.file),{recursive:true});const temporary=`${this.file}.${process.pid}.tmp`;fs.writeFileSync(temporary,JSON.stringify(safe,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,this.file);}
}
