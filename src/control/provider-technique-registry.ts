import fs from 'node:fs';

export type TechniqueClassification='CORE'|'OPTIONAL'|'PROVIDER_SPECIFIC';
export interface ProviderTechnique {id:string;origin:string;genericPrinciple:string;agentControlImplementation:string;providerDependencies:string[];classification:TechniqueClassification;benchmarkEvidence:string[];status:'ADOPTED'|'EVALUATING'|'REJECTED';}
export interface ProviderTechniqueRegistry {schema:'agent-control.provider-techniques/v1';techniques:ProviderTechnique[];}

export function loadProviderTechniqueRegistry(file:string):ProviderTechniqueRegistry {
  const value=JSON.parse(fs.readFileSync(file,'utf8')) as ProviderTechniqueRegistry;
  if(value.schema!=='agent-control.provider-techniques/v1'||!Array.isArray(value.techniques))throw new Error('provider_technique_registry_invalid');
  const ids=new Set<string>();for(const item of value.techniques){if(!item.id?.trim()||ids.has(item.id)||!item.origin?.trim()||!item.genericPrinciple?.trim()||!item.agentControlImplementation?.trim()||!Array.isArray(item.providerDependencies)||!['CORE','OPTIONAL','PROVIDER_SPECIFIC'].includes(item.classification)||!Array.isArray(item.benchmarkEvidence)||!['ADOPTED','EVALUATING','REJECTED'].includes(item.status))throw new Error('provider_technique_registry_entry_invalid');ids.add(item.id);}return structuredClone(value);
}
