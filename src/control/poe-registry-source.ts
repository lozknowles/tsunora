import {assertNoSensitiveMaterial,redactSensitiveValue} from './security-redaction.js';

export interface RegistrySourceConfig {id:string; name:string; url:string;}
interface RegistryRecord {metadata:{id:string;name:string;version?:string}; [key:string]:unknown;}
export interface RegistryObservation {id:string;name:string;state:'OBSERVED'|'UNAVAILABLE';observedAt:string;source:string;jobs:RegistryRecord[];schedules:RegistryRecord[];limitation:string;}
/** Owner-configured read-only endpoints. Neither records nor model output may select a URL or HTTP method. */
export class PoeRegistrySource {
  private current:RegistryObservation;
  constructor(readonly config:RegistrySourceConfig,private readonly fetcher:typeof fetch=fetch){
    const url=new URL(config.url);
    if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('poe_registry_source_invalid');
    this.current={id:config.id,name:config.name,state:'UNAVAILABLE',observedAt:new Date().toISOString(),source:config.url,jobs:[],schedules:[],limitation:'No live observation yet.'};
  }
  snapshot(){return structuredClone(this.current);}
  async refresh(){
    try{
      const rows=await Promise.all(['jobs','schedules'].map(async kind=>{
        const response=await this.fetcher(new URL(`api/${kind}`,this.config.url.endsWith('/')?this.config.url:`${this.config.url}/`),{redirect:'error',signal:AbortSignal.timeout(4000)});
        if(!response.ok)throw new Error('registry_unavailable');
        const text=await response.text();if(text.length>2_000_000)throw new Error('registry_response_too_large');
        const data=JSON.parse(text);if(!Array.isArray(data)||data.length>2000)throw new Error('registry_response_invalid');
        const projected=data.map(item=>{
          if(!item?.metadata?.id||!item?.metadata?.name)throw new Error('registry_identity_invalid');
          const last=item.latestRun;
          return redactSensitiveValue({metadata:item.metadata,spec:item.spec,state:item.state??null,lastRun:last?{id:last.id,status:last.status,requestedAt:last.requestedAt,endedAt:last.endedAt,errors:last.errors}:null});
        });
        assertNoSensitiveMaterial(JSON.stringify(projected),'poe_registry_sensitive_material');return projected as RegistryRecord[];
      }));
      this.current={id:this.config.id,name:this.config.name,state:'OBSERVED',observedAt:new Date().toISOString(),source:this.config.url,jobs:rows[0]!,schedules:rows[1]!,limitation:'Read-only registry bridge. Remote execution is not enabled: this source has no qualified idempotent Work Parcel bridge or device/session preflight contract. Use its native governed dashboard.'};
    }catch{this.current={id:this.config.id,name:this.config.name,state:'UNAVAILABLE',observedAt:new Date().toISOString(),source:this.config.url,jobs:[],schedules:[],limitation:'The configured registry could not be observed. Prior records are not presented as current.'};}
    return this.snapshot();
  }
}
