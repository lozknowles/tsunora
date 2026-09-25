import fs from 'node:fs';
import path from 'node:path';
import {loadConfig} from '../src/control/config.js';
import {EnvironmentDiscoveryRuntime,LocalMachineDiscoveryAdapter,ConfiguredResourceDiscoveryAdapter,LocalRuntimeDiscoveryAdapter,CredentialDiscoveryAdapter,AgentResourceDiscoveryAdapter} from '../src/control/environment-discovery.js';
import {ReadinessProbeAdapter} from '../src/control/readiness-probes.js';
import {CapabilityAdapterRegistry,RegisteredCapabilityDiscoveryAdapter} from '../src/control/capability-adapter-registry.js';
const [configFile,output,registryFile]=process.argv.slice(2);
if(!configFile||!output||!fs.existsSync(configFile)) throw Error('Existing config and new output directory required');
if(fs.existsSync(output)) throw Error('Refuse to overwrite previous discovery evidence');
fs.mkdirSync(output,{recursive:true});
const config=loadConfig(configFile);
const custom=registryFile&&fs.existsSync(registryFile)?[new RegisteredCapabilityDiscoveryAdapter(new CapabilityAdapterRegistry(registryFile))]:[];
const runtime=new EnvironmentDiscoveryRuntime({file:path.join(output,'private-discovery.json'),config:()=>config,configurationRevision:()=> 'read-only-development-inventory',
  adapters:[new LocalMachineDiscoveryAdapter(),new ConfiguredResourceDiscoveryAdapter(),new LocalRuntimeDiscoveryAdapter(),new CredentialDiscoveryAdapter(),new AgentResourceDiscoveryAdapter(),new ReadinessProbeAdapter(),...custom]});
// No MobileEdge adapter, no device connection/pairing, no configuration proposals.
const scan=await runtime.discover({mode:'FULL_DISCOVERY',testing:'QUICK_TEST',includeRemote:true,includeMemory:false});
fs.writeFileSync(path.join(output,'native-scan.json'),JSON.stringify(scan,null,2)+'\n',{mode:0o600});
const inventory=scan.items.map(i=>({id:i.id,kind:i.kind,nodeId:i.nodeId,health:i.health,lifecycle:i.lifecycle,operationalState:i.operationalState,
  authentication:i.attributes.authenticationState??'UNKNOWN',capabilities:i.attributes.capabilities??null,
  status:i.attributes.status??null,installed:i.attributes.installed??null,available:i.attributes.available??null,
  provenance:i.provenance.map(p=>({adapter:p.adapter,method:p.method,authority:p.authority,observedAt:p.observedAt}))}));
fs.writeFileSync(path.join(output,'inventory.json'),JSON.stringify({scanId:scan.id,completedAt:scan.completedAt,status:scan.status,failures:scan.failures,inventory},null,2)+'\n');
console.log(JSON.stringify({scanId:scan.id,status:scan.status,failures:scan.failures,inventory},null,2));
