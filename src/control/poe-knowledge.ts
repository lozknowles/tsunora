import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertNoSensitiveMaterial,redactSensitiveValue} from './security-redaction.js';
import type {PoeEvidenceResult,PoeGroundedFact} from './poe.js';
export interface PoeKnowledgeSource {id:string;path:string;terms:string[];}
interface KnowledgeOptions {root:string;version:string;sources:PoeKnowledgeSource[];configuration:()=>unknown;live:(category:string,question?:string)=>unknown;revision?:()=>{commit:string;dirty:boolean};}
const hash=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const terms=(text:string)=>text.toLowerCase().match(/[a-z0-9]+/g)??[];
const queryStopWords=new Set('a an and are as at be can do for from how i in is it its of on or s that the their there these this to what when where which who with you your explain briefly highlighted area operator selected guided tour guide part time use authoritative only distinguish unavailable features keep spoken explanation two concise sentences'.split(' '));
function rankedPassages(text:string,query:Set<string>){
  const passages:string[]=[];
  for(const part of text.split(/\n(?=#{1,3} )|\n\n/).filter(Boolean)){
    // Keep a list with its introducing statement so relationships retain context.
    if(/^\s*[-*] /.test(part)&&passages.at(-1)?.trimEnd().endsWith(':'))passages[passages.length-1]+='\n\n'+part;
    else passages.push(part);
  }
  const rows=passages.map((text,index)=>({text,index,words:new Set(terms(text))}));
  const frequency=new Map([...query].map(word=>[word,rows.filter(row=>row.words.has(word)).length]));
  return rows.map(row=>({...row,score:[...query].reduce((sum,word)=>sum+(row.words.has(word)?Math.log(1+rows.length/(frequency.get(word)||1)):0),0)}))
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,2).sort((a,b)=>a.index-b.index);
}
export class PoeKnowledgeService {
  private entries:Array<PoeKnowledgeSource&{hash:string;text:string;available:boolean}>=[];
  private identity={version:'',commit:'unavailable',dirty:true,configurationHash:'',indexHash:'',observedAt:''};
  constructor(private readonly options:KnowledgeOptions){this.refresh();}
  private refresh(){
    let revision={commit:'unavailable',dirty:true};
    try{revision=this.options.revision?.()??{commit:execFileSync('git',['rev-parse','HEAD'],{cwd:this.options.root,encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:this.options.root,encoding:'utf8'}).trim())};}catch{/* no invented revision */}
    const configuration=redactSensitiveValue(this.options.configuration());assertNoSensitiveMaterial(JSON.stringify(configuration),'poe_knowledge_credentials_forbidden');
    this.entries=this.options.sources.map(source=>{
      const file=path.resolve(this.options.root,source.path),relative=path.relative(this.options.root,file);
      if(relative.startsWith('..')||path.isAbsolute(relative)||!source.path.startsWith('docs/')||!source.path.endsWith('.md'))throw new Error('poe_knowledge_source_not_approved');
      try{const actual=fs.realpathSync(file),actualRelative=path.relative(fs.realpathSync(this.options.root),actual);if(actualRelative.startsWith('..')||path.isAbsolute(actualRelative)||fs.statSync(actual).size>200000)throw new Error('source_not_approved');const text=fs.readFileSync(actual,'utf8');if(Buffer.byteLength(text)>200000)throw new Error('source_too_large');assertNoSensitiveMaterial(text,'poe_knowledge_credentials_forbidden');return {...source,hash:hash(text),text,available:true};}catch{return {...source,hash:'unavailable',text:'Source unavailable or excluded by the sensitive-material gate.',available:false};}
    });
    const configurationHash=hash(configuration), indexHash=hash({revision,configurationHash,sources:this.entries.map(({text,...entry})=>entry)});
    this.identity={version:this.options.version,...revision,configurationHash,indexHash,observedAt:new Date().toISOString()};
  }
  projection(){this.refresh();return {...this.identity,sources:this.entries.map(({text,...entry})=>entry)};}
  source(id:string){this.refresh();const source=this.entries.find(item=>item.id===id);if(!source)throw new Error('poe_knowledge_source_missing');return {...source,...this.identity};}
  enrich(question:string,evidence?:PoeEvidenceResult):PoeEvidenceResult{
    this.refresh();const at=new Date().toISOString(),facts:PoeGroundedFact[]=[];
    const fact=(label:string,value:unknown,refs:string[],kind:PoeGroundedFact['informationKind']='DOCUMENTATION'):PoeGroundedFact=>({label,value:typeof value==='string'?value:JSON.stringify(value),authority:kind==='UNAVAILABLE'?'UNAVAILABLE':'AGENT_CONTROL',observedAt:at,evidence:refs,informationKind:kind});
    if(/version|commit|running build/i.test(question))facts.push(fact('Running version',this.identity,['runtime:version'],'LIVE_OBSERVED'));
    const categories:[string,RegExp][]=[['usage',/spent|spend|cost|cheap|measurement coverage|sample coverage|power samples?|tokens?|cach|retr(?:y|ies)|electricity|energy|work ran locally|successful work per/i],['voice',/\b(?:voice|speech|omnivoice|microphone|whatsapp)\b/i],['regression',/regression|test suite|test progress|tests passed/i],['crew',/crew|who.*member/i],['models',/models?|providers?|reasoning|route|routing|credential/i],['lanes',/lanes?|machines?|systems?|available/i],['work',/running|waiting|blocked|completed|recent|parent|child|verification/i],['handoffs',/baton|handoff|hand.over|continuation/i]];
    for(const [category,pattern] of categories)if(pattern.test(question)){try{const value=redactSensitiveValue(this.options.live(category,question));assertNoSensitiveMaterial(JSON.stringify(value),'poe_knowledge_credentials_forbidden');const snapshotHash=hash(value);facts.push(fact(category==='voice'?'Configured Mallow voice':`Live ${category}`,value,[`runtime:${category}:sha256:${snapshotHash}`],category==='voice'?'CONFIGURED_CAPABILITY':'LIVE_OBSERVED'));}catch{facts.push(fact(`Live ${category}`,'Unavailable',[`runtime:${category}`],'UNAVAILABLE'));}}
    const tokens=new Set(terms(question).filter(word=>!queryStopWords.has(word)));
    const selected=this.entries.map(source=>({source,score:source.terms.reduce((n,term)=>n+(question.toLowerCase().includes(term.toLowerCase())?3:0),0)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.source.id.localeCompare(b.source.id)).slice(0,3);
    for(const {source} of selected){
      const chunks=rankedPassages(source.text,tokens);
      const text=chunks.map(item=>item.text).join('\n\n').slice(0,2800);
      facts.push(fact(`Documentation: ${source.id}`,{text,path:source.path,version:this.identity.version,commit:this.identity.commit,dirty:this.identity.dirty,sha256:source.hash,trust:'UNTRUSTED_REFERENCE_DATA',availability:source.available?'VERSIONED_SOURCE':'UNAVAILABLE'},[`/api/poe/knowledge/sources/${encodeURIComponent(source.id)}`],source.available?'DOCUMENTATION':'UNAVAILABLE'));
    }
    if(!evidence&&!facts.length)return {title:'Knowledge unavailable',summary:'No approved source matched that question. I cannot establish the answer from this running version.',facts:[fact('Availability','No matching approved source',['poe:knowledge'],'UNAVAILABLE')],related:[],unavailable:'No authoritative answer available.'};
    facts.push(fact('Knowledge provenance',this.identity,['poe:knowledge-index'],'CONFIGURED_CAPABILITY'));
    return {...(evidence??{title:'Agent Control knowledge',summary:'Documentation explains the design; live observations determine current availability. Where they differ, current observations take precedence.',facts:[],related:[]}),facts:[...(evidence?.facts??[]),...facts]};
  }
}
