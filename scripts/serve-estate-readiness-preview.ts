import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {AgentControlService} from '../src/control/application-service.js';
import {PtyRegistry} from '../src/control/pty.js';
import {startWebDashboard} from '../src/control/web-server.js';
import {loadConfig} from '../src/control/config.js';
import {EnvironmentDiscoveryRuntime,LocalMachineDiscoveryAdapter,ConfiguredResourceDiscoveryAdapter,LocalRuntimeDiscoveryAdapter,CredentialDiscoveryAdapter,AgentResourceDiscoveryAdapter} from '../src/control/environment-discovery.js';
import {ReadinessProbeAdapter} from '../src/control/readiness-probes.js';
import {JobCatalog} from '../src/control/job-catalog.js';
import {ActionRegistry,ArtifactStore,JobRuntime,ResourceLockManager,RunLedger,WorkerRegistry} from '../src/control/job-runtime.js';
import {operationalReadiness} from '../src/control/job-estate-readiness.js';
import {ExternalJobCatalogue,boundedGet} from './external-job-catalogue.mjs';
import {assessReadiness} from './capability-binding.mjs';

// Explicit isolated development preview; never wired into a production listener.
const [configFile,sourceFile,schemaUrl,schemaHash,discoveryDir,executionDir,output]=process.argv.slice(2);
if(!output||fs.existsSync(output))throw Error('Require config, pinned catalogue/schema, native discovery/run evidence and a NEW output directory');
fs.mkdirSync(output,{recursive:true});
const source=JSON.parse(fs.readFileSync(sourceFile,'utf8')),schema=await boundedGet(schemaUrl);
if(schema.sha256!==schemaHash)throw Error('schema_digest_mismatch');
const client=new ExternalJobCatalogue({jobSchema:JSON.parse(schema.body)});await client.refresh(source);const jobs=client.query();
const config=loadConfig(configFile),stateFile=path.join(output,'private-discovery.json');
fs.copyFileSync(path.join(discoveryDir,'private-discovery.json'),stateFile);
const discovery=new EnvironmentDiscoveryRuntime({file:stateFile,config:()=>config,configurationRevision:()=> 'isolated-estate-preview',adapters:[new LocalMachineDiscoveryAdapter(),new ConfiguredResourceDiscoveryAdapter(),new LocalRuntimeDiscoveryAdapter(),new CredentialDiscoveryAdapter(),new AgentResourceDiscoveryAdapter(),new ReadinessProbeAdapter()]});
const admissions=JSON.parse(fs.readFileSync(path.join(executionDir,'execution-admissions.json'),'utf8'));
const runtime=new JobRuntime(new JobCatalog(),new ActionRegistry(),new WorkerRegistry(),new RunLedger(path.join(executionDir,'ledger.json')),new ArtifactStore(path.join(executionDir,'artifacts')),new ResourceLockManager(path.join(output,'locks.json')),{approval:()=>false});
const service=new AgentControlService({version:1,paused:false,lastRestorePoint:null,lanes:[]},new PtyRegistry()).configureProjection({environmentDiscovery:discovery,jobRuntime:runtime,
  jobLibraryReadiness:(scan,now)=>jobs.map((job:any)=>operationalReadiness(assessReadiness(job,scan,{now}),scan,admissions,now))});
const token=randomBytes(32).toString('hex');fs.writeFileSync(path.join(output,'operator-token'),token,{mode:0o600});
const server=startWebDashboard(service,{host:'127.0.0.1',port:0,operatorToken:token,assetsDir:path.resolve('assets/dashboard')});
await once(server,'listening');
fs.writeFileSync(path.join(output,'connection.json'),JSON.stringify({url:`http://127.0.0.1:${(server.address() as AddressInfo).port}`,tokenFile:path.join(output,'operator-token')}));
console.log('Isolated loopback preview ready. No scheduler, model inference or production listener.');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
