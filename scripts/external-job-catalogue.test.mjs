import test from "node:test";
import assert from "node:assert/strict";
import {
  ExternalJobCatalogue,
  validateCatalogue,
  boundedGet,
  sha256,
  assessLegacyReadiness as assessReadiness,
  checkedPath,
} from "./external-job-catalogue.mjs";
const schema = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string", minLength: 1 } },
};
function fixture() {
  const manifest = {
    spec_version: "1.0.0",
    id: "inspect-machine",
    name: "Inspect machine",
    version: "1.0.0",
    description: "Inspect this machine.",
    category: "operations",
    capabilities: ["host.inspect"],
    connectors: [],
    credentials: [],
    files: ["prompt.md"],
    tags: ["operations"],
    common_job: true,
    permissions: [{ kind: "read-only", scope: "target" }],
    provenance: [{ type: "qualification", reference: "synthetic" }],
    evidence: { max_age_seconds: 300 },
    approval: { required: false },
    models: { required: [] },
    resources: [{ id: "host", required: true, count: 1 }],
    platforms: ["linux"],
    qualification: { status: "NOT_YET_QUALIFIED" },
  };
  const payload = {
    "job.yaml": sha256(JSON.stringify(manifest)),
    "prompt.md": sha256("Inspect this machine."),
  };
  return {
    schema_version: "1.0.0",
    library_version: "0.1.0",
    jobs: [
      {
        ...manifest,
        path: "jobs/operations/inspect-machine",
        payload,
        sha256: sha256(
          Object.keys(payload)
            .sort()
            .map((k) => `${k}\0${payload[k]}`)
            .join("\n"),
        ),
      },
    ],
  };
}
const source = (data) => ({
  id: "example",
  repository: "operator/example",
  release: "v0.1.0",
  revision: "immutable-revision",
  resourceBaseUrl: "https://catalogue.example/pin/",
  indexUrl: "https://catalogue.example/pin/catalogue.json",
  indexSha256: sha256(JSON.stringify(data)),
});
const transport = (data) => async () => new Response(JSON.stringify(data));
test("valid external catalogue can be queried and pinned without authority", async () => {
  const data = fixture(),
    c = new ExternalJobCatalogue({
      transport: transport(data),
      jobSchema: schema,
    });
  const r = await c.refresh(source(data));
  assert.equal(r.authorityGranted, false);
  assert.equal(
    c.query({
      category: "operations",
      capability: "host.inspect",
      common: true,
    }).length,
    1,
  );
  assert.equal(c.pin("inspect-machine").execution, "NOT_STARTED");
  assert.equal((await c.refresh(source(data))).refreshState, "UNCHANGED");
});
test("invalid schema, unsupported version, duplicate identity and digest mismatch are rejected", async () => {
  const data = fixture();
  assert.throws(
    () => validateCatalogue({ ...data, schema_version: "2.0.0" }, schema),
    /unsupported_catalogue/,
  );
  assert.throws(
    () =>
      validateCatalogue(
        { ...data, jobs: [...data.jobs, ...data.jobs] },
        schema,
      ),
    /duplicate/,
  );
  const bad = fixture();
  delete bad.jobs[0].name;
  assert.throws(() => validateCatalogue(bad, schema), /schema_invalid/);
  const digest = fixture();
  digest.jobs[0].sha256 = "0".repeat(64);
  assert.throws(() => validateCatalogue(digest, schema), /job_digest/);
  const c = new ExternalJobCatalogue({
    transport: transport(data),
    jobSchema: schema,
  });
  await assert.rejects(
    c.refresh({ ...source(data), indexSha256: "a".repeat(64) }),
    /catalogue_digest/,
  );
});
test("retrieval failure preserves inspection cache, disables new pins and does not alter existing pins", async () => {
  const data = fixture(),
    c = new ExternalJobCatalogue({
      transport: transport(data),
      jobSchema: schema,
    });
  await c.refresh(source(data));
  const pin = c.pin("inspect-machine");
  c.transport = async () => {
    throw Error("unreachable");
  };
  await assert.rejects(c.refresh(source(data)), /unreachable/);
  assert.equal(c.snapshot().stale, true);
  assert.equal(c.query().length, 1);
  assert.throws(() => c.pin("inspect-machine"), /no_new_pin/);
  assert.equal(pin.authorised, false);
  assert.equal(pin.jobDigest, data.jobs[0].sha256);
});
test("version changes require review; changed same-version payloads are refused; removal does not mutate pins", async () => {
  const old = fixture(),
    c = new ExternalJobCatalogue({
      transport: transport(old),
      jobSchema: schema,
    });
  await c.refresh(source(old));
  const pinned = c.pin("inspect-machine");
  const updated = fixture();
  updated.jobs[0].payload["prompt.md"] = sha256("changed");
  const rehash = (j) =>
    (j.sha256 = sha256(
      Object.keys(j.payload)
        .sort()
        .map((k) => `${k}\0${j.payload[k]}`)
        .join("\n"),
    ));
  rehash(updated.jobs[0]);
  c.transport = transport(updated);
  await assert.rejects(c.refresh(source(updated)), /immutable_job_version/);
  updated.jobs[0].version = "1.1.0";
  updated.library_version = "0.2.0";
  c.transport = transport(updated);
  const r = await c.refresh({ ...source(updated), release: "v0.2.0" });
  assert.deepEqual(r.changes.changed, ["inspect-machine"]);
  assert.equal(pinned.jobVersion, "1.0.0");
  const removed = { ...updated, jobs: [] };
  c.transport = transport(removed);
  const deletion = await c.refresh(source(removed));
  assert.deepEqual(deletion.changes.removed, ["inspect-machine"]);
  assert.equal(pinned.manifest.id, "inspect-machine");
});
test("malformed bodies, HTTP errors, oversized input and unsafe source paths fail closed", async () => {
  await assert.rejects(
    boundedGet("https://catalogue.example/a", {
      transport: async () => new Response("bad", { status: 503 }),
    }),
    /http_503/,
  );
  await assert.rejects(
    boundedGet("https://catalogue.example/a", {
      transport: async () => new Response("123456"),
      maxBytes: 3,
    }),
    /too_large/,
  );
  for (const p of ["../x", "a/../x", "/x", "a%2fb", "x\\y"])
    assert.throws(() => checkedPath(p));
  const c = new ExternalJobCatalogue({
    transport: async () => new Response("{"),
    jobSchema: schema,
  });
  await assert.rejects(
    c.refresh({ ...source(fixture()), indexSha256: sha256("{") }),
  );
});
test("manifest retrieval verifies bytes against the catalogue independently", async () => {
  const data = fixture(),
    c = new ExternalJobCatalogue({
      transport: transport(data),
      jobSchema: schema,
    });
  await c.refresh(source(data));
  c.transport = async () => new Response("{}");
  await assert.rejects(c.manifest("inspect-machine"), /manifest_digest/);
  const { path, payload, sha256: hash, ...manifest } = data.jobs[0];
  c.transport = transport(manifest);
  assert.equal((await c.manifest("inspect-machine")).manifest.id, manifest.id);
});
test("native discovery requires fresh qualified bindings and never grants authority", () => {
  const now = new Date("2026-09-13T00:00:00Z"),
    job = fixture().jobs[0],
    item = {
      id: "host",
      kind: "MACHINE",
      health: "HEALTHY",
      lifecycle: "QUALIFIED",
      operationalState: "QUALIFIED",
      fingerprint: "observation",
      attributes: { platform: "linux" },
      provenance: [
        { authority: "AUTHORITATIVE", observedAt: now.toISOString() },
      ],
    },
    scan = {
      schema: "agent-control.environment-discovery/v1",
      status: "COMPLETED",
      completedAt: now.toISOString(),
      items: [item],
    },
    bindings = {
      capabilities: { "host.inspect": "host" },
      resources: { host: ["host"] },
      configuredJobs: [job.id],
    };
  const good = assessReadiness(job, scan, { now, bindings });
  assert.equal(good.primaryState, "APPROVAL_REQUIRED");
  assert.equal(good.matched.length, 1);
  assert.equal(good.authorityGranted, false);
  const unqualified = structuredClone(scan);
  unqualified.items[0].lifecycle = "DISCOVERED";
  assert.equal(
    assessReadiness(job, unqualified, { now, bindings }).primaryState,
    "UNSUPPORTED",
  );
  scan.completedAt = "2020-01-01";
  assert.equal(
    assessReadiness(job, scan, { now, bindings }).primaryState,
    "BLOCKED",
  );
});
