import fs from 'node:fs';
import path from 'node:path';
import { ExternalJobCatalogue, boundedGet } from './external-job-catalogue.mjs';
import { assessReadiness, deriveCapabilities } from './capability-binding.mjs';
import { EnvironmentDiscoveryRuntime, LocalMachineDiscoveryAdapter } from '../src/control/environment-discovery.js';
import { ReadinessProbeAdapter } from '../src/control/readiness-probes.js';
import { emptyConfig } from '../src/control/config.js';

// Explicit invocation performs bounded local read-only discovery. Imports never probe.
const [sourceFile, schemaUrl, schemaSha256, outputDirectory] = process.argv.slice(2);
if (!sourceFile || !schemaUrl || !/^[a-f0-9]{64}$/.test(schemaSha256 ?? '') || !outputDirectory)
  throw Error('Usage: assess-external-job-library.ts SOURCE_JSON SCHEMA_URL SCHEMA_SHA256 OUTPUT_DIRECTORY');
const source = JSON.parse(fs.readFileSync(sourceFile,'utf8'));
const schema = await boundedGet(schemaUrl);
if (schema.sha256 !== schemaSha256) throw Error('pinned_schema_digest_mismatch');
const client = new ExternalJobCatalogue({jobSchema:JSON.parse(schema.body)});
await client.refresh(source);
const jobs = client.query();
const manifests = [];
// Bound remote work; no clone, no payload scripts and no prompts executed.
for (let n=0;n<jobs.length;n+=5) {
  const batch = await Promise.all(jobs.slice(n,n+5).map(async (job:any)=>{
    const got=await client.manifest(job.id);
    return {id:job.id,sha256:job.payload['job.yaml'],bytes:got.transfer,verified:true};
  }));
  manifests.push(...batch);
}
const output=path.resolve(outputDirectory);
fs.mkdirSync(output,{recursive:true});
const runtime = new EnvironmentDiscoveryRuntime({file:path.join(output,'private-native-discovery.json'),
  config:()=>emptyConfig(),configurationRevision:()=> 'readiness-only',environment:{},
  adapters:[new LocalMachineDiscoveryAdapter(),new ReadinessProbeAdapter()]});
const scan=await runtime.discover({mode:'QUICK_RESCAN',testing:'SKIP_TESTING',includeRemote:false,includeMemory:false});
const now=new Date();
const results=jobs.map((j:any)=>assessReadiness(j,scan,{now}));
const counts=(values:string[])=>Object.fromEntries([...new Set(values)].map(k=>[k,values.filter(v=>v===k).length]));
const report={schema:'agent-control.library-readiness-report/v1',source,assessedAt:now.toISOString(),manifests,
  inspection:{jobs:jobs.length,approvalDeclared:jobs.filter((j:any)=>j.approval.required).length,
    targetResources:jobs.filter((j:any)=>j.resources.some((r:any)=>r.required)).length,
    connectorJobs:jobs.filter((j:any)=>j.connectors.length).map((j:any)=>({id:j.id,connectors:j.connectors})),
    credentialJobs:jobs.filter((j:any)=>j.credentials.length).map((j:any)=>({id:j.id,credentials:j.credentials})),
    manifests:jobs.map((j:any)=>({id:j.id,capabilities:j.capabilities,resources:j.resources,models:j.models,inputs:j.inputs,approval:j.approval,permissions:j.permissions,risk:j.risk,mutationLevel:j.mutation_level}))},
  estate:{scanId:scan.id,status:scan.status,completedAt:scan.completedAt,items:scan.items.map(i=>({id:i.id,nodeId:i.nodeId,kind:i.kind,health:i.health,lifecycle:i.lifecycle,fingerprint:i.fingerprint}))},
  capabilityEvidence:deriveCapabilities(scan,{now}),
  technicalReadiness:counts(results.map((r:any)=>r.primaryState)),authority:counts(results.map((r:any)=>r.authority.state)),
  overlappingGaps:counts(results.flatMap((r:any)=>[...new Set(r.reasons.map((x:any)=>x.state))]) as string[]),
  qualification:counts(results.map((r:any)=>r.qualification)),results,
  boundaries:{canonicalJobsExecuted:0,qualificationChanges:0,productionDeployments:0,mobileProbes:0,remoteDiscovery:false},
  limitations:['Declared v0.1.0 capability requirements only; supplied scenarios are not live integrations.',
    'Report assembly evidence proves serialization and provenance attachment, not reasoning accuracy or business-task success.',
    'Execution adapter admission, input validation, scoped authority, cost and result freshness remain launch gates.',
    'Only the available local development controller was freshly scanned; multi-machine behavior is fixture-tested.']};
fs.writeFileSync(path.join(output,'readiness-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({inspection:{jobs:jobs.length,approvalDeclared:report.inspection.approvalDeclared,targetResources:report.inspection.targetResources},
  estate:report.estate,technicalReadiness:report.technicalReadiness,authority:report.authority,overlappingGaps:report.overlappingGaps,qualification:report.qualification},null,2));
