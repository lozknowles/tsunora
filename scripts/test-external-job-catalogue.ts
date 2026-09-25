import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  boundedGet,
  sha256,
  ExternalJobCatalogue,
  assessLegacyReadiness as assessReadiness,
} from "./external-job-catalogue.mjs";
import {
  EnvironmentDiscoveryRuntime,
  LocalMachineDiscoveryAdapter,
} from "../src/control/environment-discovery.js";
import { emptyConfig } from "../src/control/config.js";
if (!process.argv[2] || !process.argv[3])
  throw Error(
    "Usage: test-external-job-catalogue.ts OUTPUT_DIRECTORY SAVED_DISCOVERY_PROJECTION",
  );
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: true });
const repository = "lozknowles/agent-control-jobs",
  release = "v0.1.0",
  revision = "0c72c8ca1cb897e100894babc2d1be437e4433f2";
const api = `https://api.github.com/repos/${repository}`,
  base = `https://raw.githubusercontent.com/${repository}/${revision}/`;
const transfers: any[] = [];
async function request(url: string) {
  const r = await boundedGet(url);
  transfers.push({
    url,
    bytes: r.bytes,
    advertisedBytes: r.advertisedBytes,
    contentEncoding: r.contentEncoding,
    sha256: r.sha256,
  });
  return r;
}
const tag = JSON.parse((await request(`${api}/git/ref/tags/${release}`)).body),
  rel = JSON.parse((await request(`${api}/releases/tags/${release}`)).body);
if (
  tag.object.type !== "commit" ||
  tag.object.sha !== revision ||
  rel.tag_name !== release ||
  rel.html_url !== `https://github.com/${repository}/releases/tag/${release}`
)
  throw Error("release_identity_mismatch");
const treeResponse = await request(`${api}/git/trees/${revision}?recursive=1`),
  tree = JSON.parse(treeResponse.body);
if (tree.truncated) throw Error("git_tree_truncated");
async function pinnedFile(p: string) {
  const got = await request(base + p);
  const e = tree.tree.find((v: any) => v.path === p);
  if (!e || e.type !== "blob" || e.mode !== "100644")
    throw Error("unexpected_git_entry");
  const hash = createHash("sha1")
    .update(Buffer.from(`blob ${got.body.length}\0`))
    .update(got.body)
    .digest("hex");
  if (hash !== e.sha) throw Error("git_blob_mismatch");
  return got;
}
const index = await pinnedFile("catalogue/index.json"),
  jobSchema = JSON.parse((await pinnedFile("spec/job.schema.json")).body),
  suiteSchema = JSON.parse((await pinnedFile("spec/suite.schema.json")).body),
  version = JSON.parse((await pinnedFile("catalogue/version.json")).body);
const source = {
  id: "agent-control-official",
  repository,
  release,
  revision,
  indexUrl: base + "catalogue/index.json",
  indexSha256: index.sha256,
  resourceBaseUrl: base,
};
const client = new ExternalJobCatalogue({ jobSchema });
const first = await client.refresh(source);
const second = await client.refresh(source);
const selected = [
  "gpu-inspection",
  "fix-failing-test",
  "technical-research",
  "document-collection-summary",
  "compare-models",
  "insufficient-permission",
  "checkpoint-resume",
  "inbox-triage",
];
const inspected = [];
for (const id of selected) {
  const got = await client.manifest(id);
  inspected.push({
    id,
    jobVersion: got.manifest.version,
    manifestSha256: got.pin.manifest.payload["job.yaml"],
    compositeSha256: got.pin.jobDigest,
    bytes: got.transfer,
    verified: true,
  });
}
const { default: Ajv } = await import("ajv");
const ajv = new Ajv({ strict: false }),
  validateSuite = ajv.compile(suiteSchema);
const suites = [];
for (const entry of tree.tree.filter((e: any) =>
  /^suites\/AC-QUAL-[A-Z-]+\.yaml$/.test(e.path),
)) {
  const file = await pinnedFile(entry.path),
    s = JSON.parse(file.body);
  if (
    !validateSuite(s) ||
    s.jobs.some((id: string) => !client.query().some((j: any) => j.id === id))
  )
    throw Error("invalid_suite");
  suites.push(s);
}
const estateFile = path.resolve(process.argv[3]);
const previousBytes = fs.readFileSync(estateFile),
  outer = JSON.parse(previousBytes.toString()),
  projection =
    typeof outer.body === "string"
      ? JSON.parse(outer.body)
      : (outer.body ?? outer);
const saved = projection.latest ?? projection;
// Read-only local observations through native 4.5 discovery; no configured remote/mobile adapters.
const native = new EnvironmentDiscoveryRuntime({
  file: path.join(output, "private-native-discovery.json"),
  config: () => emptyConfig(),
  configurationRevision: () => "read-only-catalogue-test",
  adapters: [new LocalMachineDiscoveryAdapter()],
  environment: {},
});
const fresh = await native.discover({
  mode: "QUICK_RESCAN",
  testing: "SKIP_TESTING",
  includeRemote: false,
  includeMemory: false,
});
const assess = (scan: any) => {
  const results = client.query().map((j: any) => assessReadiness(j, scan));
  const states = [
    "READY",
    "CONFIGURATION_REQUIRED",
    "CONNECTOR_REQUIRED",
    "CREDENTIAL_REQUIRED",
    "APPROVAL_REQUIRED",
    "UNSUPPORTED",
    "BLOCKED",
  ];
  return {
    scanId: scan.id,
    completedAt: scan.completedAt,
    itemCount: scan.items.length,
    primaryCounts: Object.fromEntries(
      states.map((s) => [
        s,
        results.filter((r: any) => r.primaryState === s).length,
      ]),
    ),
    overlappingReasonCounts: Object.fromEntries(
      states.map((s) => [
        s,
        results.filter((r: any) => r.reasons.some((v: any) => v.state === s))
          .length,
      ]),
    ),
    representatives: results.filter((r: any) => selected.includes(r.id)),
  };
};
const report = {
  result: "PASS WITH LIMITATIONS",
  checkedAt: new Date().toISOString(),
  source,
  versions: version,
  sourceChecks: {
    tagMatches: true,
    gitBlobIndex: true,
    allCompositeDigests: true,
    representativeManifests: inspected.length,
    schemasVerified: true,
  },
  jobs: first.catalogue.jobs.length,
  suites: suites.length,
  transfer: {
    catalogueDiscoveryBytes: index.bytes,
    catalogueEncodedBodyBytes: index.advertisedBytes,
    catalogueContentEncoding: index.contentEncoding,
    catalogueGzipEstimateBytes: gzipSync(index.body).length,
    initialIdentityAndSchemaAndSuitesBytes: transfers.reduce(
      (s, r) => s + r.bytes,
      0,
    ),
    representativeManifestBytes: inspected.reduce((s, r) => s + r.bytes, 0),
    note: "DiscoveryBytes and subtotals are decoded HTTP body bytes. EncodedBodyBytes is the server Content-Length for the gzip response; excludes HTTP/TLS overhead. GzipEstimateBytes is a local estimate, not a device measurement.",
  },
  queries: {
    list: client.query().map((j: any) => j.id),
    searchGpu: client.query({ search: "gpu" }).map((j: any) => j.id),
    operations: client.query({ category: "operations" }).map((j: any) => j.id),
    modelCapability: client
      .query({ capability: "model.invoke" })
      .map((j: any) => j.id),
    common: client.query({ common: true }).map((j: any) => j.id),
    categories: [...new Set(client.query().map((j: any) => j.category))],
    tags: [...new Set(client.query().flatMap((j: any) => j.tags))],
    provenance: client
      .query()
      .filter((j: any) => selected.includes(j.id))
      .map((j: any) => ({
        id: j.id,
        provenance: j.provenance,
        permissions: j.permissions,
        requirements: {
          capabilities: j.capabilities,
          connectors: j.connectors,
          credentials: j.credentials,
          resources: j.resources,
        },
      })),
    suite: suites.find((s) => s.id === "AC-QUAL-CORE"),
  },
  inspected,
  unchangedRefresh: second.refreshState,
  savedEstate: { sourceSha256: sha256(previousBytes), ...assess(saved) },
  freshLocalEstate: assess(fresh),
  authorityGranted: false,
  jobsExecuted: 0,
  canonicalQualificationChanged: false,
  motoTouched: false,
  limitations: [
    "Read-only consumer module; dashboard integration is proposed, not installed",
    "No qualified capability-name bindings or library job adapters configured",
    "Saved estate is stale and fresh scan is local-only, not whole-estate rediscovery",
    "Library v0.1.0 inbox job declares no email connector: live email readiness cannot be inferred",
    "Catalogue includes full manifest metadata; no compact summary asset or suite index is published",
    "No downloaded job code, prompts or validators executed",
  ],
};
fs.writeFileSync(
  path.join(output, "access-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(output, "transfer-log.json"),
  JSON.stringify(transfers, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(output, "source.json"),
  JSON.stringify(source, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      result: report.result,
      jobs: report.jobs,
      suites: report.suites,
      transfer: report.transfer,
      saved: report.savedEstate.primaryCounts,
      fresh: report.freshLocalEstate.primaryCounts,
      overlapping: report.freshLocalEstate.overlappingReasonCounts,
      output,
    },
    null,
    2,
  ),
);
